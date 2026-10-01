'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { TypeIntervention, Urgence } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';

const texte = (d: FormData, cle: string) => {
  const v = String(d.get(cle) ?? '').trim();
  return v === '' ? null : v;
};

function retour(chemin: string, erreur: string): never {
  redirect(`${chemin}?erreur=${encodeURIComponent(erreur)}`);
}

export async function creerIntervention(d: FormData) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const page = '/interventions/nouvelle';

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

  // 2. L'adresse d'intervention : on réutilise un site identique s'il existe.
  const adresse = texte(d, 'adresse');
  if (!adresse) retour(page, 'Indiquez l’adresse de l’intervention.');
  const { data: siteExistant } = await supabase
    .from('sites')
    .select('id')
    .eq('client_id', clientId)
    .ilike('adresse', adresse)
    .limit(1)
    .maybeSingle();
  let siteId = siteExistant?.id as string | undefined;
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
      cree_par: membre.id,
    })
    .select('id')
    .single();
  if (error || !intervention) retour(page, 'L’intervention n’a pas pu être créée.');

  await affecter(intervention.id as string, d.getAll('techniciens').map(String), entreprise.id);
  revalidatePath('/', 'layout');
  redirect(`/interventions/${intervention.id}`);
}

async function affecter(interventionId: string, membres: string[], entrepriseId: string) {
  const { supabase } = await contexteBureau();
  await supabase.from('affectations').delete().eq('intervention_id', interventionId);
  if (membres.length) {
    await supabase
      .from('affectations')
      .insert(membres.map((m) => ({ intervention_id: interventionId, membre_id: m, entreprise_id: entrepriseId })));
  }
}

export async function planifier(interventionId: string, d: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const { error } = await supabase
    .from('interventions')
    .update({ date_prevue: texte(d, 'date_prevue'), heure_prevue: texte(d, 'heure_prevue') })
    .eq('id', interventionId);
  if (error) retour(`/interventions/${interventionId}`, 'La date n’a pas pu être modifiée.');
  await affecter(interventionId, d.getAll('techniciens').map(String), entreprise.id);
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
