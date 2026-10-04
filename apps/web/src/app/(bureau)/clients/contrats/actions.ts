'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  adresseComplete,
  ajouterJours,
  ajouterMois,
  appliquerPrix,
  aujourdhui,
  clientVide,
  conditionsParDefaut,
  lignesRenouvellement,
  reglagesPrix,
  tvaParDefaut,
  type Client,
  type ClientDocument,
} from '@chantio/shared';
import { chargerContrat, suivreContrat } from '@/lib/contrats';
import { contexteBureau } from '@/lib/session';
import { enregistrerDocument } from '../../devis/actions';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;
const nombre = (d: FormData, cle: string, defaut: number) => {
  const v = Number(String(d.get(cle) ?? '').replace(/\s/g, '').replace(',', '.'));
  return String(d.get(cle) ?? '').trim() !== '' && Number.isFinite(v) ? v : defaut;
};
const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const jjmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Retour vers la page d'où vient le formulaire (contrats ou fiche client). */
const chemin = (d: FormData) => {
  const r = texte(d, 'retour');
  return r && r.startsWith('/clients') ? r : '/clients/contrats';
};
const avec = (url: string, params: Record<string, string>) => `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;

export type EtatFormulaireContrat = { erreur?: string } | undefined;

/** Crée ou modifie un contrat ; le numéro CT est donné par la base. */
export async function enregistrerContrat(id: string | null, _: EtatFormulaireContrat, d: FormData): Promise<EtatFormulaireContrat> {
  const { supabase, entreprise } = await contexteBureau();
  const clientId = texte(d, 'client_id');
  const objet = texte(d, 'objet');
  const debut = texte(d, 'debut') ?? '';
  const fin = texte(d, 'fin') ?? '';
  const derniere = texte(d, 'derniere_visite');
  if (!clientId) return { erreur: 'Choisissez le client.' };
  if (!objet) return { erreur: 'Indiquez l’objet du contrat, par exemple « Entretien chaudière gaz ».' };
  if (!ISO.test(debut) || !ISO.test(fin) || fin <= debut) return { erreur: 'Indiquez le début et la fin du contrat (la fin après le début).' };

  const champs = {
    client_id: clientId,
    site_id: texte(d, 'site_id'),
    objet: objet.slice(0, 200),
    debut,
    fin,
    preavis_mois: borne(Math.round(nombre(d, 'preavis_mois', 3)), 0, 24),
    tacite: d.get('tacite') === 'on',
    montant_ht: borne(Math.round(nombre(d, 'montant_ht', 0) * 100) / 100, 0, 10_000_000),
    visites_par_an: borne(Math.round(nombre(d, 'visites_par_an', 1)), 1, 52),
    fournitures_visite: borne(Math.round(nombre(d, 'fournitures_visite', 0) * 100) / 100, 0, 1_000_000),
    heures_visite: borne(Math.round(nombre(d, 'heures_visite', 1) * 100) / 100, 0, 1000),
    derniere_visite: derniere && ISO.test(derniere) ? derniere : null,
    notes: texte(d, 'notes'),
  };
  const { data, error } = id
    ? await supabase.from('contrats').update(champs).eq('id', id).select('id').single()
    : await supabase.from('contrats').insert({ ...champs, entreprise_id: entreprise.id }).select('id').single();
  if (error || !data) {
    console.error('Contrat non enregistré', error);
    return { erreur: /pas celle du client/.test(error?.message ?? '') ? 'Cette adresse n’est pas celle du client.' : 'Le contrat n’a pas pu être enregistré. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  redirect(avec(chemin(d), { enregistre: data.id as string }));
}

export async function supprimerContrat(id: string) {
  const { supabase } = await contexteBureau();
  await supabase.from('contrats').delete().eq('id', id);
  revalidatePath('/clients', 'layout');
  redirect('/clients/contrats');
}

/**
 * Crée une intervention « à planifier » pour chaque visite des douze prochains
 * mois qui n'en a pas encore, avec sa date souhaitée : elles attendent dans
 * « À planifier » du planning.
 */
export async function planifierVisites(id: string) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c) return;
  const { aPlanifier } = suivreContrat(c, aujourdhui());
  if (!aPlanifier.length) return;

  // Dans un immeuble, la visite se fait aux parties communes si elles existent.
  const { data: occupants } = c.site_id ? await supabase.from('occupants').select('id, nom').eq('site_id', c.site_id) : { data: [] };
  const communes = (occupants ?? []).find((o) => /parties communes/i.test(o.nom as string));
  const duree = c.heures_visite > 0 && c.heures_visite <= 24 ? c.heures_visite : null;

  const { error } = await supabase.from('interventions').insert(
    aPlanifier.map((v) => ({
      entreprise_id: entreprise.id,
      client_id: c.client_id,
      site_id: c.site_id,
      occupant_id: communes?.id ?? null,
      type: 'entretien',
      motif: `${c.objet} · visite de ${new Date(`${v.date}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
      contrat_id: c.id,
      souhaitee_le: v.date,
      duree_prevue: duree,
      cree_par: membre.id,
    })),
  );
  if (error) console.error('Visites non créées', error);
  revalidatePath('/', 'layout');
  redirect(avec('/clients/contrats', { visites: String(error ? 0 : aPlanifier.length), ref: c.reference ?? '' }));
}

/** Le client tel qu'il figurera sur le devis, depuis sa fiche et l'adresse entretenue. */
function versClientDocument(k: Client, site: ContratSite | null): ClientDocument {
  const base = clientVide();
  const chantier = adresseComplete(site);
  const adresse = k.adresse_facturation || chantier;
  const lieu = { adresse, identique: adresse === chantier || !chantier, adresseChantier: adresse === chantier ? '' : chantier };
  const tel = k.mobile ?? k.telephone ?? '';
  if (k.type === 'particulier') {
    const m = k.nom.match(/^(Mme et M\.|Mme|M\.)\s+(.*)$/);
    return { ...base, ...lieu, type: 'particulier', civ: m?.[1] ?? k.civilite ?? base.civ, nom: m?.[2] ?? k.nom, tel, email: k.email ?? '' };
  }
  return {
    ...base,
    ...lieu,
    type: 'pro',
    raison: k.nom,
    siret: k.siret ?? k.siren ?? '',
    tvaIntra: k.tva_intracom ?? '',
    forme: k.forme_juridique ?? '',
    naf: k.activite ?? '',
    contact: k.contact ?? '',
    tel,
    email: k.email ?? '',
  };
}
type ContratSite = { adresse: string; code_postal: string | null; ville: string | null };

/**
 * Prépare le devis de renouvellement (visites, attestation, dépannages inclus)
 * au prix calculé avec les réglages de l'entreprise, et l'ouvre.
 */
export async function preparerRenouvellement(id: string) {
  const { supabase, entreprise } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c) return;
  if (c.renouvellement && !['refuse', 'annule'].includes(c.renouvellement.statut)) redirect(`/devis/${c.renouvellement.id}`);

  const { data: k } = await supabase.from('clients').select('*').eq('id', c.client_id).single();
  if (!k) return;
  const { periode } = suivreContrat(c, aujourdhui());
  const debut = ajouterJours(periode.fin, 1);
  const mois = Math.max(1, Math.round((Date.parse(ajouterJours(periode.fin, 1)) - Date.parse(periode.debut)) / (30.44 * 86_400_000)));
  const client = versClientDocument(k as Client, c.site);
  const rp = reglagesPrix(entreprise.facturation);
  const conditions = {
    ...conditionsParDefaut(entreprise.facturation ?? {}),
    debut: `le ${jjmmaaaa(debut)}`,
    duree: `${mois} mois`,
    echeancier: 'fin' as const,
    decennale: false,
    dechets: false,
  };
  const res = await enregistrerDocument({
    genre: 'devis',
    type_facture: null,
    client_id: c.client_id,
    client,
    objet: `Renouvellement du contrat ${c.reference ?? ''} · ${c.objet} · ${debut.slice(0, 4)}`,
    date_document: aujourdhui(),
    conditions,
    remise: 0,
    pourcentage: 30,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: null,
    lignes: appliquerPrix(lignesRenouvellement(c, tvaParDefaut(client)), rp.coefficient, rp),
  });
  if (!res.ok) {
    console.error('Renouvellement non préparé', res.erreur);
    redirect(avec('/clients/contrats', { erreur: 'Le devis de renouvellement n’a pas pu être préparé. Réessayez.' }));
  }
  await supabase.from('contrats').update({ renouvellement_id: res.id }).eq('id', c.id);
  revalidatePath('/clients', 'layout');
  redirect(`/devis/${res.id}`);
}

/**
 * Le devis de renouvellement est signé : le contrat repart pour la même durée
 * au montant du devis, et peut être renouvelé à nouveau l'an prochain.
 */
export async function reporterRenouvellement(id: string) {
  const { supabase } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c || c.renouvellement?.statut !== 'signe') return;
  const { periode } = suivreContrat(c, aujourdhui());
  const debut = ajouterJours(periode.fin, 1);
  const mois = Math.max(1, Math.round((Date.parse(debut) - Date.parse(periode.debut)) / (30.44 * 86_400_000)));
  await supabase
    .from('contrats')
    .update({ debut, fin: ajouterJours(ajouterMois(debut, mois), -1), montant_ht: c.renouvellement.total_ht, renouvellement_id: null })
    .eq('id', c.id);
  revalidatePath('/clients', 'layout');
  redirect(avec('/clients/contrats', { enregistre: c.id }));
}
