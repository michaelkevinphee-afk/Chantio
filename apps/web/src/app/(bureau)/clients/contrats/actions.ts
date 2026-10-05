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
import type { EtatFenetre } from '../actions';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;
const nombre = (d: FormData, cle: string, defaut: number) => {
  const v = Number(String(d.get(cle) ?? '').replace(/\s/g, '').replace(',', '.'));
  return String(d.get(cle) ?? '').trim() !== '' && Number.isFinite(v) ? v : defaut;
};
const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const jjmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Retour vers la page d'où vient le bouton (fiche client, fiche d'immeuble, Accueil « / »), sinon la fiche du bâtiment du contrat. */
const retourDe = (d: FormData | undefined, defaut: string) => {
  const r = d ? texte(d, 'retour') : null;
  return r && (r.startsWith('/clients') || r === '/') ? r : defaut;
};
const avec = (url: string, params: Record<string, string>) => `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
/** Page du bâtiment d'un contrat dans « Immeubles et contrats » (l'immeuble, ou le client pour un contrat sans adresse). */
const pageBatiment = (c: { client_id: string; site_id: string | null }, params: Record<string, string> = {}) =>
  `/clients/immeubles?${new URLSearchParams(c.site_id ? { site: c.site_id, ...params } : { client: c.client_id, ...params })}`;

/**
 * Crée ou modifie un contrat (fenetreContrat du bac) ; le numéro CT est donné par la base.
 * Bâtiment : « s:<site> » (un immeuble ou une adresse), « c:<client> » (le client, sans adresse),
 * ou un nouveau bâtiment (« Le bâtiment n’est pas dans la liste » : client + nom → nouvelle adresse du client).
 */
export async function enregistrerContrat(id: string | null, _: EtatFenetre, d: FormData): Promise<EtatFenetre> {
  const { supabase, entreprise } = await contexteBureau();
  const objet = texte(d, 'objet');
  const debut = texte(d, 'debut') ?? '';
  const fin = texte(d, 'fin') ?? '';
  const derniere = texte(d, 'derniere_visite');
  const nomBatiment = texte(d, 'batiment_nom');
  let clientId: string | null = null;
  let siteId: string | null = null;
  if (nomBatiment) {
    clientId = texte(d, 'batiment_client');
    if (!clientId) return { erreur: 'Choisissez le client du bâtiment' };
  } else {
    const b = texte(d, 'batiment') ?? '';
    if (b.startsWith('s:')) {
      const { data: s } = await supabase.from('sites').select('id, client_id').eq('id', b.slice(2)).maybeSingle();
      if (s) {
        siteId = s.id as string;
        clientId = s.client_id as string;
      }
    } else if (b.startsWith('c:')) clientId = b.slice(2);
  }
  if (!clientId) return { erreur: 'Choisissez ou ajoutez un bâtiment' };
  if (!objet || !ISO.test(debut) || !ISO.test(fin) || fin <= debut) return { erreur: 'Objet, début et fin (après le début) sont obligatoires' };

  if (nomBatiment) {
    const { data: s, error } = await supabase
      .from('sites')
      .insert({ entreprise_id: entreprise.id, client_id: clientId, adresse: nomBatiment.slice(0, 200) })
      .select('id')
      .single();
    if (error || !s) {
      console.error('Bâtiment non créé', error);
      return { erreur: 'Le bâtiment n’a pas pu être ajouté. Réessayez.' };
    }
    siteId = s.id as string;
  }

  const champs = {
    client_id: clientId,
    site_id: siteId,
    objet: objet.slice(0, 200),
    debut,
    fin,
    preavis_mois: borne(Math.round(nombre(d, 'preavis_mois', 3)), 0, 24),
    tacite: d.get('tacite') === 'on',
    montant_ht: borne(Math.round(nombre(d, 'montant_ht', 0) * 100) / 100, 0, 10_000_000),
    visites_par_an: borne(Math.round(nombre(d, 'visites_par_an', 1)), 1, 52),
    fournitures_visite: borne(Math.round(nombre(d, 'fournitures_visite', 0) * 100) / 100, 0, 1_000_000),
    heures_visite: borne(Math.round(nombre(d, 'heures_visite', 1) * 100) / 100, 0, 1000) || 1,
    // Sans dernière visite, le calendrier part du début du contrat (comme le bac).
    derniere_visite: derniere && ISO.test(derniere) ? derniere : debut,
    notes: texte(d, 'notes'),
  };
  const { data, error } = id
    ? await supabase.from('contrats').update(champs).eq('id', id).select('id, reference').single()
    : await supabase.from('contrats').insert({ ...champs, entreprise_id: entreprise.id }).select('id, reference').single();
  if (error || !data) {
    console.error('Contrat non enregistré', error);
    return { erreur: /pas celle du client/.test(error?.message ?? '') ? 'Cette adresse n’est pas celle du client.' : 'Le contrat n’a pas pu être enregistré. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: id ? 'Contrat enregistré' : `Contrat ${data.reference ?? ''} créé`.replace('  ', ' '), aller: pageBatiment(champs, { contrat: data.id as string }) };
}

/** Supprime un contrat (les interventions déjà créées restent). */
export async function supprimerContrat(id: string): Promise<EtatFenetre> {
  const { supabase } = await contexteBureau();
  const { data: c } = await supabase.from('contrats').select('client_id, site_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('contrats').delete().eq('id', id);
  if (error) {
    console.error('Contrat non supprimé', error);
    return { erreur: 'Le contrat n’a pas pu être supprimé. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: 'Contrat supprimé', aller: c ? pageBatiment(c as { client_id: string; site_id: string | null }) : '/clients/immeubles' };
}

/**
 * Crée une intervention « à planifier » pour chaque visite des douze prochains
 * mois qui n'en a pas encore, avec sa date souhaitée : elles attendent dans
 * « À planifier » du planning. Retour sur la page d'où vient le bouton (champ « retour »),
 * avec le nombre de visites créées et leurs numéros pour la bulle.
 */
export async function planifierVisites(id: string, d?: FormData) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c) redirect(retourDe(d, '/clients/immeubles'));
  const retour = retourDe(d, pageBatiment(c, { contrat: c.id }));
  const { aPlanifier } = suivreContrat(c, aujourdhui());
  if (!aPlanifier.length) redirect(avec(retour, { visites: 'deja' }));

  // Dans un immeuble, la visite se fait aux parties communes si elles existent.
  const { data: occupants } = c.site_id ? await supabase.from('occupants').select('id, nom').eq('site_id', c.site_id) : { data: [] };
  const communes = (occupants ?? []).find((o) => /parties communes/i.test(o.nom as string));
  const duree = c.heures_visite > 0 && c.heures_visite <= 24 ? c.heures_visite : null;

  const { data: creees, error } = await supabase
    .from('interventions')
    .insert(
      aPlanifier.map((v, n) => ({
        entreprise_id: entreprise.id,
        client_id: c.client_id,
        site_id: c.site_id,
        occupant_id: communes?.id ?? null,
        type: 'entretien',
        motif: `Visite ${n + 1}/${aPlanifier.length} · ${c.objet}`,
        description: `Visite du contrat ${c.reference ?? ''} (souhaitée le ${jjmmaaaa(v.date)}).`.replace('  ', ' '),
        contrat_id: c.id,
        souhaitee_le: v.date,
        duree_prevue: duree,
        cree_par: membre.id,
      })),
    )
    .select('reference, numero');
  if (error) console.error('Visites non créées', error);
  revalidatePath('/', 'layout');
  const nums = ((creees ?? []) as { reference: string | null; numero: number | null }[])
    .sort((x, y) => (x.numero ?? 0) - (y.numero ?? 0))
    .map((x) => x.reference ?? String(x.numero ?? ''));
  redirect(avec(retour, error ? { visites: '0' } : { visites: String(aPlanifier.length), de: nums[0] ?? '', a: nums[nums.length - 1] ?? '' }));
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
 * au prix calculé avec les réglages de l'entreprise, et l'ouvre. `retour` (champ caché) : la page d'où l'on vient,
 * où ramène la croix de l'éditeur ; ?renouvellement=<numéro du contrat> fait dire la bulle du bac
 * (« Proposition de renouvellement préparée pour CT-… », voir AnnonceRenouvellement).
 */
export async function preparerRenouvellement(id: string, d?: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c) redirect('/clients/immeubles');
  if (c.renouvellement && !['refuse', 'annule'].includes(c.renouvellement.statut)) redirect(`/devis/${c.renouvellement.id}`);

  const { data: k } = await supabase.from('clients').select('*').eq('id', c.client_id).single();
  if (!k) redirect(pageBatiment(c, { contrat: c.id }));
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
    // Le devis sait de quel contrat il est le renouvellement (il ne compte pas comme « travaux signés »).
    contrat_id: c.id,
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
    redirect(pageBatiment(c, { contrat: c.id, erreur: 'Le devis de renouvellement n’a pas pu être préparé. Réessayez.' }));
  }
  await supabase.from('contrats').update({ renouvellement_id: res.id }).eq('id', c.id);
  revalidatePath('/clients', 'layout');
  const retour = retourDe(d, '');
  redirect(`/devis/${res.id}?${new URLSearchParams({ renouvellement: c.reference ?? 'le contrat', ...(retour ? { retour } : {}) })}`);
}

/**
 * Le devis de renouvellement est signé : le contrat repart pour la même durée
 * au montant du devis, et peut être renouvelé à nouveau l'an prochain.
 */
export async function reporterRenouvellement(id: string) {
  const { supabase } = await contexteBureau();
  const c = await chargerContrat(supabase, id);
  if (!c) redirect('/clients/immeubles');
  if (c.renouvellement?.statut !== 'signe') redirect(pageBatiment(c, { contrat: c.id }));
  const { periode } = suivreContrat(c, aujourdhui());
  const debut = ajouterJours(periode.fin, 1);
  const mois = Math.max(1, Math.round((Date.parse(debut) - Date.parse(periode.debut)) / (30.44 * 86_400_000)));
  await supabase
    .from('contrats')
    .update({ debut, fin: ajouterJours(ajouterMois(debut, mois), -1), montant_ht: c.renouvellement.total_ht, renouvellement_id: null })
    .eq('id', c.id);
  revalidatePath('/clients', 'layout');
  redirect(pageBatiment(c, { contrat: c.id }));
}
