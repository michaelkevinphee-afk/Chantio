'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  HEURE_CHANTIER,
  HEURE_DEMI,
  HEURES_DEMI_JOURNEE,
  adresseComplete,
  aDesImmeubles,
  aujourdhui,
  clientVide,
  conditionsParDefaut,
  mentionsFacture,
  numeroIntervention,
  payeurTexte,
  tvaParDefaut,
  type Client,
  type ClientDocument,
  type ConditionsDocument,
  type LigneDocument,
  type TypeIntervention,
  type Urgence,
} from '@chantio/shared';
import { enregistrerDocument, facturerDevis } from '@/app/(bureau)/devis/actions';
import { lireHistoriqueDevis } from '@/lib/devis';
import { envoyerInvitations, invitationsActives } from '@/lib/invitations';
import { contexteBureau } from '@/lib/session';
import { adresseRetour, PARAMS_FICHE, PARAMS_NOUVELLE } from './adresse';
import { messageRenvoi, PREFIXE_RENVOI } from './filtres';

type Bureau = Awaited<ReturnType<typeof contexteBureau>>;
type Resultat = { erreur: string | null };

const texte = (d: FormData, cle: string) => {
  const v = String(d.get(cle) ?? '').trim();
  return v === '' ? null : v;
};

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}(:\d{2})?$/;
const URGENCES: Urgence[] = ['normale', 'urgente', 'astreinte'];
const TYPES: TypeIntervention[] = ['depannage', 'entretien', 'installation', 'mise_en_service', 'sav', 'visite_technique', 'chantier'];

/** Après une erreur dans le volet : on y revient, l'erreur s'affiche en bulle. */
function erreurFiche(id: string, erreur: string): never {
  redirect(adresseRetour(`/interventions?fiche=${encodeURIComponent(id)}`, { erreur }));
}

// ---------------------------------------------------------------------------
// Création (fenêtre « Nouvelle intervention »)
// ---------------------------------------------------------------------------

/**
 * Crée l'intervention depuis la fenêtre. En cas de problème, renvoie le message (la fenêtre reste ouverte,
 * rien n'est perdu) ; sinon, ouvre le volet de la nouvelle intervention sur la page d'où l'on vient
 * (`retour`), qui annonce « Intervention DEP-… créée ».
 */
export async function creerIntervention(_: Resultat | null, d: FormData): Promise<Resultat> {
  const { supabase, entreprise, membre } = await contexteBureau();
  const devis = texte(d, 'devis');

  // 1. Le donneur d'ordre : existant, ou nouveau.
  let clientId = texte(d, 'client_id');
  let typeClient: string | null = null;
  if (!clientId) return { erreur: 'Choisissez le donneur d’ordre.' };
  if (clientId === 'nouveau') {
    const nom = texte(d, 'client_nom');
    if (!nom) return { erreur: 'Indiquez le nom du client.' };
    typeClient = texte(d, 'client_type') ?? 'particulier';
    const { data, error } = await supabase
      .from('clients')
      .insert({ entreprise_id: entreprise.id, nom, telephone: texte(d, 'client_telephone'), type: typeClient })
      .select('id')
      .single();
    if (error || !data) return { erreur: 'Le client n’a pas pu être créé.' };
    clientId = data.id as string;
  } else {
    const { data } = await supabase.from('clients').select('type').eq('id', clientId).maybeSingle();
    if (!data) return { erreur: 'Ce client est introuvable.' };
    typeClient = data.type as string;
  }

  // 2. L'adresse d'intervention : une adresse déjà connue du client (l'immeuble d'un syndic),
  //    sinon la nouvelle adresse saisie (on réutilise un site identique s'il existe).
  let siteId: string | null = null;
  const siteChoisi = texte(d, 'site_id');
  if (siteChoisi && siteChoisi !== 'autre') {
    const { data } = await supabase.from('sites').select('id').eq('id', siteChoisi).eq('client_id', clientId).maybeSingle();
    if (!data) return { erreur: 'Cette adresse n’est pas celle de ce client.' };
    siteId = data.id as string;
  } else {
    const adresse = texte(d, 'adresse');
    if (!adresse) return { erreur: 'Indiquez l’adresse de l’intervention.' };
    const { data: siteExistant } = await supabase.from('sites').select('id').eq('client_id', clientId).ilike('adresse', adresse).limit(1).maybeSingle();
    siteId = (siteExistant?.id as string | undefined) ?? null;
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
      if (error || !data) return { erreur: 'L’adresse n’a pas pu être enregistrée.' };
      siteId = data.id as string;
    }
  }

  // L'occupant à appeler, dans un immeuble : déjà connu, ou nouveau.
  let occupantId = aDesImmeubles((typeClient ?? 'particulier') as Client['type']) ? texte(d, 'occupant_id') : null;
  if (occupantId === 'nouveau') {
    const nom = texte(d, 'occupant_nom');
    if (!nom) return { erreur: 'Indiquez le nom de l’occupant.' };
    const { data, error } = await supabase
      .from('occupants')
      .insert({ entreprise_id: entreprise.id, site_id: siteId, nom, lot: texte(d, 'occupant_lot'), telephone: texte(d, 'occupant_telephone') })
      .select('id')
      .single();
    if (error || !data) return { erreur: 'L’occupant n’a pas pu être enregistré.' };
    occupantId = data.id as string;
  }

  // Le contrat d'entretien choisi doit être celui du client.
  let contratId = texte(d, 'contrat_id');
  if (contratId) {
    const { data } = await supabase.from('contrats').select('id').eq('id', contratId).eq('client_id', clientId).maybeSingle();
    contratId = (data?.id as string | undefined) ?? null;
  }

  // 3. L'intervention, puis le ou les techniciens.
  // Sans motif, comme le bac : « À préciser » (il se complète ensuite dans le volet).
  const motif = texte(d, 'motif') ?? 'À préciser';
  const type = TYPES.includes(texte(d, 'type') as TypeIntervention) ? (texte(d, 'type') as TypeIntervention) : 'depannage';
  const chantier = type === 'chantier';
  const date = texte(d, 'date_prevue');
  const datePrevue = date && JOUR.test(date) ? date : null;
  const moment = texte(d, 'moment') === '1' ? 1 : 0;
  const heureSaisie = texte(d, 'heure_prevue');
  // Sans heure, le moment choisi donne 08:30 ou 14:00 (08:00 ou 13:30 pour un chantier), comme le bac.
  const heurePrevue = datePrevue ? (heureSaisie && HEURE.test(heureSaisie) ? heureSaisie : chantier ? HEURE_CHANTIER[moment] : HEURE_DEMI[moment]) : null;
  const fin = texte(d, 'date_fin');
  const dateFin = chantier && datePrevue && fin && JOUR.test(fin) && fin > datePrevue ? fin : null;
  const duree = Number(String(d.get('duree_prevue') ?? '').replace(',', '.'));
  // Un chantier d'une journée occupe la journée entière au planning.
  const dureePrevue = chantier ? (datePrevue && !dateFin ? HEURES_DEMI_JOURNEE * 2 : null) : duree > 0 && duree <= 24 ? Math.round(duree * 100) / 100 : 1;
  const urgence = URGENCES.includes(texte(d, 'urgence') as Urgence) ? (texte(d, 'urgence') as Urgence) : 'normale';

  const { data: intervention, error } = await supabase
    .from('interventions')
    .insert({
      entreprise_id: entreprise.id,
      client_id: clientId,
      site_id: siteId,
      type,
      urgence,
      motif: motif.slice(0, 300),
      description: texte(d, 'description')?.slice(0, 4000) ?? null,
      date_prevue: datePrevue,
      heure_prevue: heurePrevue,
      date_fin: dateFin,
      duree_prevue: dureePrevue,
      occupant_id: occupantId,
      ordre_service: texte(d, 'ordre_service')?.slice(0, 60) ?? null,
      devis_id: devis,
      contrat_id: contratId,
      cree_par: membre.id,
    })
    .select('id')
    .single();
  if (error || !intervention) return { erreur: 'L’intervention n’a pas pu être créée.' };

  await affecter(supabase, intervention.id as string, d.getAll('techniciens').map(String), entreprise.id);
  revalidatePath('/', 'layout');
  const effacer = Object.fromEntries([...PARAMS_NOUVELLE, ...PARAMS_FICHE].map((p) => [p, null]));
  redirect(adresseRetour(d.get('retour'), { ...effacer, fiche: intervention.id as string, cree: '1' }));
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

// ---------------------------------------------------------------------------
// Volet : chaque changement s'enregistre seul
// ---------------------------------------------------------------------------

export type ChampsModifiables = {
  motif?: string;
  urgence?: Urgence;
  /** Mot du bureau pour le technicien. */
  description?: string | null;
  occupant_id?: string | null;
  ordre_service?: string | null;
};

/** Demande, occupant, ordre de service, mot du bureau : enregistrés dès qu'on les change (sans rechargement). */
export async function modifierIntervention(id: string, champs: ChampsModifiables): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const maj: Record<string, unknown> = {};
  if (champs.motif !== undefined) {
    const motif = String(champs.motif).trim();
    if (!motif) return { erreur: 'Le motif ne peut pas être vide.' };
    maj.motif = motif.slice(0, 300);
  }
  if (champs.urgence !== undefined) {
    if (!URGENCES.includes(champs.urgence)) return { erreur: 'Urgence inconnue.' };
    maj.urgence = champs.urgence;
  }
  if (champs.description !== undefined) maj.description = String(champs.description ?? '').trim().slice(0, 4000) || null;
  if (champs.occupant_id !== undefined) maj.occupant_id = champs.occupant_id || null;
  if (champs.ordre_service !== undefined) maj.ordre_service = String(champs.ordre_service ?? '').trim().slice(0, 60) || null;
  if (!Object.keys(maj).length) return { erreur: null };
  const { error } = await supabase.from('interventions').update(maj).eq('id', id);
  revalidatePath('/', 'layout');
  if (error) return { erreur: 'occupant_id' in maj ? 'L’occupant n’a pas pu être enregistré.' : 'La modification n’a pas pu être enregistrée.' };
  return { erreur: null };
}

type Personne = { id: string; prenom: string; nom: string | null; email: string | null };

export type Planning = {
  date_prevue: string | null;
  heure_prevue: string | null;
  techniciens: string[];
  /** Dernier jour d'un chantier sur plusieurs jours ; absent = inchangé. */
  date_fin?: string | null;
  fin_midi?: boolean;
  /** Durée prévue en heures ; absent = inchangée. */
  duree_prevue?: number | null;
};

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
    .select('date_prevue, heure_prevue, date_fin, affectations(membre:membres(id, prenom, nom, email))')
    .eq('id', interventionId)
    .maybeSingle<{ date_prevue: string | null; heure_prevue: string | null; date_fin: string | null; affectations: { membre: Personne | null }[] }>();

  const date_prevue = p.date_prevue || null;
  const heure_prevue = p.heure_prevue || null;
  const champs: Record<string, unknown> = { date_prevue, heure_prevue };
  // Sans date, plus de dernier jour ; un dernier jour avant le premier est ignoré.
  if (p.date_fin !== undefined || !date_prevue) {
    champs.date_fin = date_prevue && p.date_fin && JOUR.test(p.date_fin) && p.date_fin > date_prevue ? p.date_fin : null;
    champs.fin_midi = !!champs.date_fin && !!p.fin_midi;
  }
  if (p.duree_prevue !== undefined) {
    const d = Number(p.duree_prevue);
    champs.duree_prevue = p.duree_prevue !== null && d > 0 && d <= 24 ? Math.round(d * 100) / 100 : null;
  }
  const { error } = await supabase.from('interventions').update(champs).eq('id', interventionId);
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
  const horaireChange =
    avant?.date_prevue !== date_prevue ||
    (avant?.heure_prevue?.slice(0, 5) ?? null) !== (heure_prevue?.slice(0, 5) ?? null) ||
    ('date_fin' in champs && (avant?.date_fin ?? null) !== champs.date_fin);
  const dejaPrevenus = new Set(anciens.map((m) => m.id));
  const aPrevenir = (nouveaux ?? []).filter((m) => horaireChange || !dejaPrevenus.has(m.id));
  const gardes = new Set(p.techniciens);
  const retires = date_prevue ? anciens.filter((m) => !gardes.has(m.id)) : anciens;
  if (!aPrevenir.length && !retires.length) return { erreur: null };
  const invites = await envoyerInvitations(supabase, interventionId, retires, date_prevue ? aPrevenir : []).catch(() => []);
  return { erreur: null, invites };
}

// ---------------------------------------------------------------------------
// Changements d'état : passent par les fonctions de la base, qui vérifient les droits.
// ---------------------------------------------------------------------------

async function transition(fonction: string, interventionId: string, extra: Record<string, unknown> = {}): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.rpc(fonction, { p_intervention: interventionId, ...extra });
  revalidatePath('/', 'layout');
  return { erreur: error ? error.message : null };
}

export async function valider(id: string) {
  return transition('valider_intervention', id);
}

/**
 * « Renvoyer au technicien » : le message du bureau passe en tête du mot du bureau (« À reprendre : … »),
 * que le technicien lit sur son téléphone, puis la fiche lui revient.
 */
export async function renvoyer(id: string, message?: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { data: avant } = await supabase.from('interventions').select('description').eq('id', id).maybeSingle();
  const r = await transition('renvoyer_intervention', id);
  if (r.erreur) return r;
  const t = String(message ?? '').trim().replace(/\s+/g, ' ').slice(0, 500) || 'Fiche à compléter.';
  const ancien = (avant?.description as string | null) ?? '';
  // Un renvoi précédent est remplacé ; le reste du mot du bureau est gardé.
  const reste = messageRenvoi(ancien) ? ancien.split('\n').slice(1).join('\n') : ancien;
  const description = `${PREFIXE_RENVOI}${t}${reste.trim() ? `\n${reste}` : ''}`.slice(0, 4000);
  const { error } = await supabase.from('interventions').update({ description }).eq('id', id);
  revalidatePath('/', 'layout');
  return { erreur: error ? 'La fiche est renvoyée, mais le message n’a pas pu être enregistré.' : null };
}

export async function facturer(id: string) {
  return transition('marquer_facturee', id, { p_facturee: true });
}
export async function annulerFacturation(id: string) {
  return transition('marquer_facturee', id, { p_facturee: false });
}

/** Supprime l'intervention (dirigeant, avant validation) et revient à `retour` sans le volet ; sinon renvoie l'erreur. */
export async function supprimer(id: string, retour?: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error, count } = await supabase.from('interventions').delete({ count: 'exact' }).eq('id', id);
  if (error || !count) return { erreur: 'Suppression impossible (réservée au dirigeant, avant validation).' };
  revalidatePath('/', 'layout');
  redirect(adresseRetour(retour, Object.fromEntries(PARAMS_FICHE.map((p) => [p, null]))));
}

// ---------------------------------------------------------------------------
// Devis et facture depuis une intervention (contrat n° 3 entre zones)
// ---------------------------------------------------------------------------

type InterventionADocument = {
  id: string;
  reference: string | null;
  numero: number;
  type: TypeIntervention;
  motif: string;
  ordre_service: string | null;
  devis_id: string | null;
  duree_prevue: number | null;
  client_id: string;
  client: Client | null;
  site: { adresse: string; code_postal: string | null; ville: string | null; copropriete: string | null } | null;
  occupant: { nom: string } | null;
  fiches: {
    resultat: string | null;
    envoyee_le: string | null;
    duree_minutes: number | null;
    valeurs: { travaux?: string; a_prevoir?: string } | null;
    cree_le: string;
    fournitures: { designation: string; reference: string | null; quantite: number; unite: string | null }[];
  }[];
};

type Article = { id: string; designation: string; reference: string | null; unite: string; prix_vente: number; prix_achat: number; categorie: string; utilisations: number };

async function lireInterventionADocument(supabase: Bureau['supabase'], id: string) {
  const { data } = await supabase
    .from('interventions')
    .select(
      'id, reference, numero, type, motif, ordre_service, devis_id, duree_prevue, client_id, client:clients(*), site:sites(adresse, code_postal, ville, copropriete), occupant:occupants(nom), fiches(resultat, envoyee_le, duree_minutes, valeurs, cree_le, fournitures(designation, reference, quantite, unite))',
    )
    .eq('id', id)
    .maybeSingle();
  return data as InterventionADocument | null;
}

/** Le client tel qu'il figurera sur le document : pour un syndic, la copropriété représentée par le syndic. */
function clientDuDocument(i: InterventionADocument): ClientDocument {
  const base = clientVide();
  const k = i.client;
  if (!k) return base;
  const chantier = adresseComplete(i.site);
  const adresse = k.adresse_facturation || chantier;
  const lieu = { adresse, identique: adresse === chantier || !chantier, adresseChantier: adresse === chantier ? '' : chantier };
  const tel = k.mobile ?? k.telephone ?? '';
  const bdc = i.ordre_service ?? '';
  if (k.type === 'particulier') {
    const m = k.nom.match(/^(Mme et M\.|Mme|M\.)\s+(.*)$/);
    return { ...base, ...lieu, bdc, type: 'particulier', civ: m?.[1] ?? k.civilite ?? base.civ, nom: m?.[2] ?? k.nom, tel, email: k.email ?? '' };
  }
  return {
    ...base,
    ...lieu,
    bdc,
    type: 'pro',
    raison: aDesImmeubles(k.type) ? payeurTexte(k, i.site) : k.nom,
    siret: k.siret ?? k.siren ?? '',
    tvaIntra: k.tva_intracom ?? '',
    forme: k.forme_juridique ?? '',
    naf: k.activite ?? '',
    contact: k.contact ?? '',
    tel,
    email: k.email ?? '',
  };
}

const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Déplacement et main d'œuvre de dépannage : réglages de l'entreprise, sinon les articles du catalogue. */
function lignesDepannage(
  articles: Article[],
  reglages: Record<string, unknown>,
  heures: number,
  tva: number,
): LigneDocument[] {
  const parUsage = (a: Article, b: Article) => b.utilisations - a.utilisations;
  const deplacement = articles.filter((a) => a.categorie === 'Déplacements').sort(parUsage)[0];
  const mainOeuvre = articles
    .filter((a) => a.categorie === 'Main-d’œuvre' && a.unite === 'h' && !/apprenti/i.test(a.designation))
    .sort((a, b) => Number(/plomb/i.test(b.designation)) - Number(/plomb/i.test(a.designation)) || parUsage(a, b))[0];
  const prixReglage = (cle: string) => {
    const n = Number(reglages[cle]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return [
    {
      designation: deplacement?.designation ?? 'Déplacement Paris intra-muros',
      quantite: 1,
      unite: 'forfait',
      prix_unitaire: prixReglage('deplacement') ?? Number(deplacement?.prix_vente ?? 0),
      tva,
      article_id: deplacement?.id ?? null,
    },
    {
      designation: mainOeuvre?.designation ?? 'Main d’œuvre dépannage',
      quantite: heures,
      unite: 'h',
      prix_unitaire: prixReglage('taux_depannage') ?? Number(mainOeuvre?.prix_vente ?? 0),
      tva,
      article_id: mainOeuvre?.id ?? null,
    },
  ];
}

const avecIntervention = (c: ConditionsDocument, id: string) => ({ ...c, intervention_id: id }) as ConditionsDocument;

/**
 * « Créer la facture » : avec un devis signé, la facture de ce devis (solde s'il est déjà en partie facturé) ;
 * sinon une facture préparée depuis la fiche : déplacement + main d'œuvre (durée de la fiche) + pièces notées,
 * aux prix du catalogue. Le brouillon est relié à l'intervention (conditions.intervention_id) et s'ouvre.
 */
export async function facturerIntervention(id: string) {
  const { supabase, entreprise } = await contexteBureau();
  const i = await lireInterventionADocument(supabase, id);
  if (!i) erreurFiche(id, 'Intervention introuvable.');

  // Une facture déjà préparée depuis l'intervention et pas encore validée : on la rouvre plutôt que d'en faire une deuxième.
  const { data: brouillon } = await supabase
    .from('documents')
    .select('id')
    .eq('genre', 'facture')
    .eq('statut', 'brouillon')
    .filter('conditions->>intervention_id', 'eq', id)
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (brouillon) redirect(`/devis/${brouillon.id}`);

  // Devis signé : celui d'où vient l'intervention, sinon un devis préparé depuis elle.
  const { data: devisLies } = await supabase
    .from('documents')
    .select('id, statut')
    .eq('genre', 'devis')
    .eq('statut', 'signe')
    .or(`id.eq.${i.devis_id ?? '00000000-0000-0000-0000-000000000000'},conditions->>intervention_id.eq.${id}`);
  const signe = (devisLies ?? [])[0] as { id: string } | undefined;
  let docId: string | null = null;
  if (signe) {
    const h = await lireHistoriqueDevis(supabase, signe.id);
    const res = await facturerDevis(signe.id, (h?.dejaPct ?? 0) > 0 ? 'solde' : 'totale');
    if (!res.ok) erreurFiche(id, res.erreur);
    const { data: f } = await supabase.from('documents').select('conditions').eq('id', res.id).maybeSingle();
    await supabase
      .from('documents')
      .update({ conditions: { ...((f?.conditions as object) ?? {}), intervention_id: id } })
      .eq('id', res.id);
    docId = res.id;
  } else {
    const { data: catalogue } = await supabase.from('articles').select('id, designation, reference, unite, prix_vente, prix_achat, categorie, utilisations').eq('actif', true);
    const articles = (catalogue ?? []) as Article[];
    const client = clientDuDocument(i);
    const tva = tvaParDefaut(client);
    const fiches = [...i.fiches].sort((a, b) => a.cree_le.localeCompare(b.cree_le));
    const envoyees = fiches.filter((f) => f.envoyee_le);
    const minutes = envoyees.reduce((t, f) => t + (f.duree_minutes ?? 0), 0);
    const heures = minutes ? Math.max(0.25, Math.round((minutes / 60) * 4) / 4) : Number(i.duree_prevue) || 1;
    const lignes: LigneDocument[] = [];
    if (i.client && aDesImmeubles(i.client.type)) {
      const m = mentionsFacture({ reference: numeroIntervention(i), adresse: adresseComplete(i.site), occupant: i.occupant?.nom, ordre_service: i.ordre_service });
      lignes.push({ titre: true, designation: m.charAt(0).toUpperCase() + m.slice(1), quantite: 0, unite: 'u', prix_unitaire: 0, tva });
    }
    const chantier = ['installation', 'mise_en_service', 'visite_technique', 'chantier'].includes(i.type);
    if (!chantier) lignes.push(...lignesDepannage(articles, (entreprise.facturation ?? {}) as Record<string, unknown>, heures, tva));
    for (const p of envoyees.flatMap((f) => f.fournitures)) {
      const a =
        (p.reference?.trim() && articles.find((x) => x.reference && sansAccent(x.reference) === sansAccent(p.reference!))) ||
        articles.find((x) => sansAccent(x.designation) === sansAccent(p.designation));
      lignes.push({
        designation: p.designation,
        quantite: Number(p.quantite) || 1,
        unite: a?.unite ?? p.unite ?? 'u',
        prix_unitaire: Number(a?.prix_vente ?? 0),
        tva,
        achat: a ? Number(a.prix_achat) || null : null,
        article_id: a?.id ?? null,
        reference: p.reference ?? null,
      });
    }
    const travaux = envoyees.map((f) => f.valeurs?.travaux?.trim()).filter(Boolean).at(-1);
    const res = await enregistrerDocument({
      genre: 'facture',
      type_facture: 'totale',
      client_id: i.client_id,
      client,
      objet: `${i.motif}${travaux ? ` · ${travaux}` : ''}`.slice(0, 300),
      date_document: aujourdhui(),
      conditions: avecIntervention(conditionsParDefaut(entreprise.facturation ?? {}), id),
      remise: 0,
      pourcentage: 30,
      avancement: 0,
      avancement_precedent: 0,
      coefficient: null,
      lignes,
    });
    if (!res.ok) erreurFiche(id, res.erreur);
    docId = res.id;
  }
  revalidatePath('/', 'layout');
  redirect(`/devis/${docId}`);
}

/**
 * « Créer un devis » / « Créer le devis » : un devis rattaché à l'intervention (client, objet = ce qu'il reste
 * à faire ou le motif, lignes Déplacement + Main d'œuvre, ou « Lot 1 · Travaux » pour un chantier), qui s'ouvre.
 */
export async function devisDepuisIntervention(id: string) {
  const { supabase, entreprise } = await contexteBureau();
  const i = await lireInterventionADocument(supabase, id);
  if (!i) erreurFiche(id, 'Intervention introuvable.');
  const client = clientDuDocument(i);
  const tva = tvaParDefaut(client);
  const chantier = ['installation', 'mise_en_service', 'visite_technique', 'chantier'].includes(i.type);
  let lignes: LigneDocument[];
  if (chantier) lignes = [{ titre: true, designation: 'Lot 1 · Travaux', quantite: 0, unite: 'u', prix_unitaire: 0, tva }];
  else {
    const { data: catalogue } = await supabase.from('articles').select('id, designation, reference, unite, prix_vente, prix_achat, categorie, utilisations').eq('actif', true);
    lignes = lignesDepannage((catalogue ?? []) as Article[], (entreprise.facturation ?? {}) as Record<string, unknown>, 1, tva);
  }
  const derniere = [...i.fiches].sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
  const reste = derniere?.valeurs?.a_prevoir?.trim();
  const res = await enregistrerDocument({
    genre: 'devis',
    type_facture: null,
    client_id: i.client_id,
    client,
    objet: (reste || i.motif).slice(0, 300),
    date_document: aujourdhui(),
    conditions: avecIntervention(conditionsParDefaut(entreprise.facturation ?? {}), id),
    remise: 0,
    pourcentage: 30,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: null,
    lignes,
  });
  if (!res.ok) erreurFiche(id, res.erreur);
  revalidatePath('/', 'layout');
  redirect(`/devis/${res.id}`);
}
