import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ajouterJours,
  etatContrat,
  jjmmaaaaBac,
  limitePreavis,
  periodeEnCours,
  visitesAPlanifier,
  visitesAVenir,
  LIBELLE_TYPE_CLIENT,
  type Contrat,
  type InterventionContrat,
  type StatutDocument,
  type TypeClient,
} from '@chantio/shared';

// Contrats d'entretien lus avec leur client, leur adresse, leurs visites et
// leur devis de renouvellement ; puis ce qu'on en affiche aujourd'hui.

const SELECT_CONTRAT =
  '*, client:clients(id, nom), site:sites(id, adresse, code_postal, ville), interventions(id, reference, date_prevue, souhaitee_le, statut), renouvellement:documents!renouvellement_id(id, numero, statut, total_ht)';

export type ContratLu = Contrat & {
  client: { id: string; nom: string } | null;
  site: { id: string; adresse: string; code_postal: string | null; ville: string | null } | null;
  interventions: InterventionContrat[];
  renouvellement: { id: string; numero: string | null; statut: StatutDocument; total_ht: number } | null;
};

function normaliser(c: ContratLu): ContratLu {
  return {
    ...c,
    montant_ht: Number(c.montant_ht) || 0,
    fournitures_visite: Number(c.fournitures_visite) || 0,
    heures_visite: Number(c.heures_visite) || 0,
    interventions: c.interventions ?? [],
    renouvellement: c.renouvellement ? { ...c.renouvellement, total_ht: Number(c.renouvellement.total_ht) || 0 } : null,
  };
}

/** Les contrats de l'entreprise (ou d'un client), par client puis par numéro. */
export async function chargerContrats(supabase: SupabaseClient, clientId?: string): Promise<ContratLu[]> {
  let requete = supabase.from('contrats').select(SELECT_CONTRAT).order('reference');
  if (clientId) requete = requete.eq('client_id', clientId);
  const { data } = await requete.limit(2000);
  return ((data ?? []) as unknown as ContratLu[])
    .map(normaliser)
    .sort((a, b) => (a.client?.nom ?? '').localeCompare(b.client?.nom ?? '') || (a.reference ?? '').localeCompare(b.reference ?? ''));
}

export async function chargerContrat(supabase: SupabaseClient, id: string): Promise<ContratLu | null> {
  const { data } = await supabase.from('contrats').select(SELECT_CONTRAT).eq('id', id).maybeSingle();
  return data ? normaliser(data as unknown as ContratLu) : null;
}

/** État, période en cours, date limite de préavis et visites des douze prochains mois. */
export function suivreContrat(c: ContratLu, jour: string) {
  const periode = periodeEnCours(c, jour);
  const visites = visitesAVenir(c, c.interventions, jour);
  return {
    etat: etatContrat(c, c.renouvellement, jour),
    periode,
    limite: limitePreavis(periode.fin, c.preavis_mois),
    visites,
    aPlanifier: visitesAPlanifier(visites),
  };
}

// ---------- Immeubles et contrats (/clients/immeubles) ----------
// Un « bâtiment » du bac : l'immeuble d'un syndic ou d'un bailleur, l'adresse d'un autre client
// qui a un contrat ou des équipements suivis, ou le client lui-même pour un contrat sans adresse.

export type EquipementLu = {
  id: string;
  categorie: string;
  marque: string | null;
  modele: string | null;
  dernier_passage: string | null;
  prochain_passage: string | null;
  obligation: string | null;
};
export type SiteBatiment = {
  id: string;
  adresse: string;
  code_postal: string | null;
  ville: string | null;
  acces: string | null;
  gardien: string | null;
  copropriete: string | null;
  occupants: { id: string; nom: string; lot: string | null; telephone: string | null }[];
  equipements: EquipementLu[];
};
export type ClientBatiments = {
  id: string;
  nom: string;
  type: TypeClient;
  contact: string | null;
  telephone: string | null;
  mobile: string | null;
  contacts_client: { nom: string; fonction: string | null }[] | null;
  sites: SiteBatiment[];
};
/** Sélection des clients pour construireBatiments. */
export const SELECT_CLIENTS_BATIMENTS =
  'id, nom, type, contact, telephone, mobile, contacts_client(nom, fonction), sites(id, adresse, code_postal, ville, acces, gardien, copropriete, occupants(id, nom, lot, telephone), equipements(id, categorie, marque, modele, dernier_passage, prochain_passage, obligation))';

export interface Batiment {
  /** Id du site, ou « client:<id> » pour les contrats d'un client sans adresse. */
  cle: string;
  site: SiteBatiment | null;
  client: ClientBatiments;
  /** Adresse de l'immeuble, ou nom du client. */
  nom: string;
  /** « 75016 Paris · Copropriété » */
  description: string;
  /** Immeuble d'un syndic ou d'un bailleur (qui paie, accès, occupants). */
  immeuble: boolean;
  contrats: ContratLu[];
}

/** Adresse de la page d'un bâtiment (avec un contrat mis en avant, ou d'autres paramètres). */
export function lienBatiment(b: Pick<Batiment, 'site' | 'client'>, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(b.site ? { site: b.site.id, ...params } : { client: b.client.id, ...params });
  return `/clients/immeubles?${q}`;
}

export function construireBatiments(clients: ClientBatiments[], contrats: ContratLu[]): Batiment[] {
  const out: Batiment[] = [];
  for (const k of clients) {
    const imms = k.type === 'syndic' || k.type === 'bailleur';
    const cts = contrats.filter((c) => c.client_id === k.id);
    for (const s of k.sites ?? []) {
      const ici = cts.filter((c) => c.site_id === s.id);
      if (!imms && !ici.length && !(s.equipements ?? []).length) continue;
      out.push({
        cle: s.id,
        site: { ...s, occupants: s.occupants ?? [], equipements: s.equipements ?? [] },
        client: k,
        nom: s.adresse,
        description: [[s.code_postal, s.ville].filter(Boolean).join(' '), k.type === 'syndic' ? 'Copropriété' : k.type === 'bailleur' ? 'Résidence' : LIBELLE_TYPE_CLIENT[k.type]]
          .filter(Boolean)
          .join(' · '),
        immeuble: imms,
        contrats: ici,
      });
    }
    const sansSite = cts.filter((c) => !c.site_id || !(k.sites ?? []).some((s) => s.id === c.site_id));
    if (sansSite.length)
      out.push({ cle: `client:${k.id}`, site: null, client: k, nom: k.nom, description: LIBELLE_TYPE_CLIENT[k.type], immeuble: false, contrats: sansSite });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom));
}

/**
 * L'état d'un contrat avec les mots du bac (etatContrat du bac) : « Reconduit automatiquement »,
 * « Envoyer la proposition avant le … (dans 41 j) », « Préavis à partir du … ».
 * `rang` : du plus inquiétant (0, rouge) au plus tranquille (3) ; `alerte` : la phrase s'écrit en rouge.
 */
export interface EtatBac {
  ton: 'rouge' | 'violet' | 'vert';
  etiquette: string;
  detail: string;
  rang: number;
  alerte: boolean;
}
const ecartJours = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function etatBac(c: ContratLu, jour: string): EtatBac {
  const periode = periodeEnCours(c, jour);
  const limite = limitePreavis(periode.fin, c.preavis_mois);
  const dv = c.renouvellement;
  if (dv?.statut === 'signe')
    return { ton: 'vert', etiquette: 'Renouvellement signé', detail: `Devis ${dv.numero ?? ''} signé : reportez les nouvelles dates sur le contrat`, rang: 2, alerte: false };
  if (dv && dv.statut !== 'refuse' && dv.statut !== 'annule')
    return {
      ton: 'vert',
      etiquette: 'Renouvellement proposé',
      detail: dv.numero ? `Devis ${dv.numero} envoyé, en attente de signature` : 'Proposition en brouillon, à finaliser',
      rang: 2,
      alerte: false,
    };
  if (periode.fin < jour) return { ton: 'rouge', etiquette: 'Terminé', detail: `Fin le ${jjmmaaaaBac(periode.fin)}`, rang: 0, alerte: true };
  const j = ecartJours(jour, limite);
  if (j < 0)
    return c.tacite
      ? { ton: 'vert', etiquette: 'Reconduit automatiquement', detail: `Reconduction tacite au ${jjmmaaaaBac(ajouterJours(periode.fin, 1))}`, rang: 3, alerte: false }
      : { ton: 'rouge', etiquette: 'Préavis dépassé', detail: `Sans renouvellement signé, le contrat s’arrête le ${jjmmaaaaBac(periode.fin)}`, rang: 0, alerte: true };
  if (j <= 90) return { ton: 'violet', etiquette: 'À renouveler', detail: `Envoyer la proposition avant le ${jjmmaaaaBac(limite)} (dans ${j} j)`, rang: 1, alerte: true };
  return { ton: 'vert', etiquette: 'Actif', detail: `Préavis à partir du ${jjmmaaaaBac(limite)}`, rang: 3, alerte: false };
}

/** L'état le plus inquiétant des contrats d'un bâtiment (pireEtat du bac). */
export function pireEtat(b: Batiment, jour: string): EtatBac | null {
  return b.contrats.map((c) => etatBac(c, jour)).sort((x, y) => x.rang - y.rang)[0] ?? null;
}
