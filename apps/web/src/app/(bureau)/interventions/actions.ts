'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { TypeIntervention, Urgence } from '@chantio/shared';
import { envoyerInvitations, invitationsActives } from '@/lib/invitations';
import { contexteBureau } from '@/lib/session';

type Bureau = Awaited<ReturnType<typeof contexteBureau>>;

const texte = (d: FormData, cle: string) => {
  const v = String(d.get(cle) ?? '').trim();
  return v === '' ? null : v;
};

function retour(chemin: string, erreur: string): never {
  redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}erreur=${encodeURIComponent(erreur)}`);
}

export async function creerIntervention(d: FormData) {
  const { supabase, entreprise, membre } = await contexteBureau();
  // Une erreur ramène sur la fiche, pré-remplie à nouveau si elle venait d'un devis.
  const devis = texte(d, 'devis');
  const page = devis ? `/interventions/nouvelle?devis=${encodeURIComponent(devis)}` : '/interventions/nouvelle';

  // 1. Le client : existant, ou nouveau.
  let clientId = texte(d, 'client_id');
  if (!clientId || clientId === 'nouveau') {
    const nom = texte(d, 'client_nom');
    if (!nom) retour(page, 'Indiquez le nom du client.');
    const { data, error } = await supabase
      .from('clients')
      .insert({
        entreprise_id: entreprise.id,
        nom,
        telephone: texte(d, 'client_telephone'),
        type: texte(d, 'client_type') ?? 'particulier',
      })
      .select('id')
      .single();
    if (error || !data) retour(page, 'Le client n’a pas pu être créé.');
    clientId = data.id as string;
  }

  // 2. L'adresse d'intervention : une adresse déjà connue du client (l'immeuble d'un syndic),
  //    sinon la nouvelle adresse saisie (on réutilise un site identique s'il existe).
  let siteId: string | undefined;
  const siteChoisi = texte(d, 'site_id');
  if (siteChoisi && siteChoisi !== 'autre') {
    const { data } = await supabase.from('sites').select('id').eq('id', siteChoisi).eq('client_id', clientId).maybeSingle();
    if (!data) retour(page, 'Cette adresse n’est pas celle de ce client.');
    siteId = data.id as string;
  } else {
    const adresse = texte(d, 'adresse');
    if (!adresse) retour(page, 'Indiquez l’adresse de l’intervention.');
    const { data: siteExistant } = await supabase
      .from('sites')
      .select('id')
      .eq('client_id', clientId)
      .ilike('adresse', adresse)
      .limit(1)
      .maybeSingle();
    siteId = siteExistant?.id as string | undefined;
    if (!siteId) {
      const { data, error } = await supabase
        .from('sites')
        .insert({
          entreprise_id: entreprise.id,
          client_id: clientId,
          adresse,
          code_postal: texte(d, 'code_postal'),
          ville: texte(d, 'ville'),
          acces: texte(d, 'acces'),
        })
        .select('id')
        .single();
      if (error || !data) retour(page, 'L’adresse n’a pas pu être enregistrée.');
      siteId = data.id as string;
    }
  }

  // L'occupant à appeler, dans un immeuble : déjà connu, ou nouveau.
  let occupantId = texte(d, 'occupant_id');
  if (occupantId === 'nouveau') {
    const nom = texte(d, 'occupant_nom');
    if (!nom) retour(page, 'Indiquez le nom de l’occupant.');
    const { data, error } = await supabase
      .from('occupants')
      .insert({ entreprise_id: entreprise.id, site_id: siteId, nom, lot: texte(d, 'occupant_lot'), telephone: texte(d, 'occupant_telephone') })
      .select('id')
      .single();
    if (error || !data) retour(page, 'L’occupant n’a pas pu être enregistré.');
    occupantId = data.id as string;
  }

  // 3. L'intervention, puis le ou les techniciens.
  const motif = texte(d, 'motif');
  if (!motif) retour(page, 'Indiquez le motif de l’intervention.');
  const { data: intervention, error } = await supabase
    .from('interventions')
    .insert({
      entreprise_id: entreprise.id,
      client_id: clientId,
      site_id: siteId,
      type: (texte(d, 'type') ?? 'depannage') as TypeIntervention,
      urgence: (texte(d, 'urgence') ?? 'normale') as Urgence,
      motif,
      description: texte(d, 'description'),
      date_prevue: texte(d, 'date_prevue'),
      heure_prevue: texte(d, 'heure_prevue'),
      occupant_id: occupantId,
      ordre_service: texte(d, 'ordre_service'),
      devis_id: devis,
      cree_par: membre.id,
    })
    .select('id')
    .single();
  if (error || !intervention) retour(page, 'L’intervention n’a pas pu être créée.');

  await affecter(supabase, intervention.id as string, d.getAll('techniciens').map(String), entreprise.id);
  revalidatePath('/', 'layout');
  redirect(`/interventions/${intervention.id}`);
}

async function affecter(supabase: Bureau['supabase'], interventionId: string, membres: string[], entrepriseId: string) {
  const { error } = await supabase.from('affectations').delete().eq('intervention_id', interventionId);
  if (error) return error;
  if (!membres.length) return null;
  const { error: e2 } = await supabase
    .from('affectations')
    .insert(membres.map((m) => ({ intervention_id: interventionId, membre_id: m, entreprise_id: entrepriseId })));
  return e2;
}

type Personne = { id: string; prenom: string; nom: string | null; email: string | null };

export type Planning = { date_prevue: string | null; heure_prevue: string | null; techniciens: string[] };

// Appelée depuis la page (sans rechargement) : renvoie l'erreur éventuelle au lieu de rediriger,
// pour que l'écran confirme tout de suite « Enregistré » ou explique le problème.
export async function planifier(
  interventionId: string,
  p: Planning,
): Promise<{ erreur: string | null; invites?: string[] }> {
  const { supabase, entreprise } = await contexteBureau();
  // L'état d'avant, pour ne prévenir que les personnes concernées par le changement.
  const { data: avant } = await supabase
    .from('interventions')
    .select('date_prevue, heure_prevue, affectations(membre:membres(id, prenom, nom, email))')
    .eq('id', interventionId)
    .maybeSingle<{ date_prevue: string | null; heure_prevue: string | null; affectations: { membre: Personne | null }[] }>();

  const date_prevue = p.date_prevue || null;
  const heure_prevue = p.heure_prevue || null;
  const { error } = await supabase.from('interventions').update({ date_prevue, heure_prevue }).eq('id', interventionId);
  const eAffect = error ? null : await affecter(supabase, interventionId, p.techniciens, entreprise.id);
  revalidatePath('/', 'layout');
  if (error) return { erreur: 'La date n’a pas pu être modifiée.' };
  if (eAffect) return { erreur: 'Le technicien n’a pas pu être changé.' };

  // Invitations d'agenda : aux nouveaux, à tous si la date ou l'heure change, annulation aux retirés.
  if (!invitationsActives) return { erreur: null };
  const anciens = (avant?.affectations ?? []).flatMap((a) => (a.membre ? [a.membre] : []));
  const { data: nouveaux } = p.techniciens.length
    ? await supabase.from('membres').select('id, prenom, nom, email').in('id', p.techniciens)
    : { data: [] as Personne[] };
  const horaireChange = avant?.date_prevue !== date_prevue || (avant?.heure_prevue?.slice(0, 5) ?? null) !== (heure_prevue?.slice(0, 5) ?? null);
  const dejaPrevenus = new Set(anciens.map((m) => m.id));
  const aPrevenir = (nouveaux ?? []).filter((m) => horaireChange || !dejaPrevenus.has(m.id));
  const gardes = new Set(p.techniciens);
  const retires = date_prevue ? anciens.filter((m) => !gardes.has(m.id)) : anciens;
  if (!aPrevenir.length && !retires.length) return { erreur: null };
  const invites = await envoyerInvitations(supabase, interventionId, retires, date_prevue ? aPrevenir : []).catch(() => []);
  return { erreur: null, invites };
}

/** Occupant à appeler et n° d'ordre de service du syndic, souvent connus après l'appel. */
export async function modifierOccupant(id: string, d: FormData) {
  const { supabase } = await contexteBureau();
  const { error } = await supabase
    .from('interventions')
    .update({ occupant_id: texte(d, 'occupant_id'), ordre_service: texte(d, 'ordre_service') })
    .eq('id', id);
  if (error) retour(`/interventions/${id}`, 'L’occupant n’a pas pu être enregistré.');
  revalidatePath('/', 'layout');
}

// Changements d'état : passent par les fonctions de la base, qui vérifient les droits.
async function transition(fonction: string, interventionId: string, extra: Record<string, unknown> = {}) {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.rpc(fonction, { p_intervention: interventionId, ...extra });
  if (error) retour(`/interventions/${interventionId}`, error.message);
  revalidatePath('/', 'layout');
}

export async function valider(id: string) {
  await transition('valider_intervention', id);
}
export async function renvoyer(id: string) {
  await transition('renvoyer_intervention', id);
}
export async function facturer(id: string) {
  await transition('marquer_facturee', id, { p_facturee: true });
}
export async function annulerFacturation(id: string) {
  await transition('marquer_facturee', id, { p_facturee: false });
}

export async function supprimer(id: string) {
  const { supabase } = await contexteBureau();
  const { error, count } = await supabase.from('interventions').delete({ count: 'exact' }).eq('id', id);
  if (error || !count) retour(`/interventions/${id}`, 'Suppression impossible (réservée au dirigeant, avant validation).');
  revalidatePath('/', 'layout');
  redirect('/interventions');
}
