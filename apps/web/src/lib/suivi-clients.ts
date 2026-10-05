import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aujourdhui,
  contratPourSuivi,
  nomCourt,
  SANS_CLIENT,
  type ContratSuivi,
  type DocumentSuivi,
  type FicheSuivi,
  type InterventionFiche,
  type InterventionSuivi,
  type ResultatFiche,
} from '@chantio/shared';
import { etatAffiche } from '@/app/(bureau)/interventions/filtres';
import { chargerContrats, type ContratLu } from './contrats';

// Données de « Mes clients » et de l'Accueil : interventions, devis/factures et
// contrats rangés par client, pour calculer ce qu'il reste à faire (chosesAFaire).

const SELECT_INTERVENTIONS =
  'id, client_id, motif, type, statut, urgence, date_prevue, date_fin, souhaitee_le, cree_le, devis_id, description, site:sites(adresse), occupant:occupants(nom), ' +
  'affectations(membre:membres(prenom, nom)), fiches(resultat, fin, envoyee_le, cree_le, reserves, a_prevoir:valeurs->>a_prevoir, auteur:membres(prenom, nom))';
const SELECT_DOCUMENTS =
  'id, client_id, genre, type_facture, numero, statut, objet, date_document, echeance, envoye_le, finalise_le, signe_le, paye_le, total_ht, net_a_payer, devis_id, facture_id, conditions, facture:facture_id(numero)';

type Personne = { prenom: string; nom: string | null } | null;
type LigneFiche = {
  resultat: ResultatFiche | null;
  fin: string | null;
  envoyee_le: string | null;
  cree_le: string;
  reserves: string | null;
  a_prevoir: string | null;
  auteur: Personne;
};
type LigneIntervention = Omit<InterventionSuivi, 'adresse' | 'occupant' | 'techniciens' | 'fiche'> & {
  client_id: string;
  /** Mot du bureau ; une fiche renvoyée au technicien y porte le motif du renvoi (« À reprendre »). */
  description?: string | null;
  site: { adresse: string } | null;
  occupant: { nom: string } | null;
  affectations: { membre: Personne }[] | null;
  fiches: LigneFiche[] | null;
};
type LigneDocument = Omit<DocumentSuivi, 'total_ht' | 'net_a_payer' | 'facture_numero'> & {
  client_id: string | null;
  total_ht: number | string;
  net_a_payer: number | string;
  facture: { numero: string | null } | null;
};

const court = (p: Personne) => (p ? nomCourt(p.prenom, p.nom) : null);

function versIntervention(l: LigneIntervention): InterventionSuivi {
  // La dernière fiche envoyée compte (une fiche renvoyée en crée une nouvelle).
  const quand = (f: LigneFiche) => f.envoyee_le ?? f.fin ?? f.cree_le ?? '';
  const f = [...(l.fiches ?? [])].sort((a, b) => quand(b).localeCompare(quand(a)))[0] ?? null;
  const fiche: FicheSuivi | null = f
    ? { resultat: f.resultat, fin: f.fin, envoyee_le: f.envoyee_le, auteur: court(f.auteur), reste: f.a_prevoir?.trim() || f.reserves?.trim() || null }
    : null;
  return {
    id: l.id,
    motif: l.motif,
    type: l.type,
    // Une fiche renvoyée par le bureau repasse « à planifier » en base : on l'affiche « À reprendre », comme le bac.
    statut: etatAffiche({ statut: l.statut, description: l.description ?? null, fiches: l.fiches }),
    urgence: l.urgence,
    date_prevue: l.date_prevue,
    date_fin: l.date_fin ?? null,
    souhaitee_le: l.souhaitee_le ?? null,
    cree_le: l.cree_le,
    devis_id: l.devis_id,
    adresse: l.site?.adresse ?? null,
    occupant: l.occupant?.nom ?? null,
    techniciens: (l.affectations ?? []).map((a) => court(a.membre)).filter((p): p is string => !!p),
    fiche,
  };
}

function versDocument({ facture, ...l }: LigneDocument): DocumentSuivi {
  return {
    ...l,
    total_ht: Number(l.total_ht) || 0,
    net_a_payer: Number(l.net_a_payer) || 0,
    facture_numero: facture?.numero ?? null,
    conditions: l.conditions ?? null,
  };
}

/** Range les lignes par client ; celles sans client vont sous `sansClient` (sinon elles sont laissées de côté). */
function ranger<L extends { client_id: string | null }, T>(lignes: L[], vers: (l: L) => T, sansClient?: string): Map<string, T[]> {
  const parClient = new Map<string, T[]>();
  for (const l of lignes) {
    const cle = l.client_id ?? sansClient;
    if (!cle) continue;
    const liste = parClient.get(cle);
    if (liste) liste.push(vers(l));
    else parClient.set(cle, [vers(l)]);
  }
  return parClient;
}

/** Contrats rangés par client, vus par les choses à faire (état du jour, visites à placer). */
export function contratsParClient(contrats: ContratLu[], jour: string = aujourdhui()): Map<string, ContratSuivi[]> {
  return ranger(contrats, (c) => contratPourSuivi(c, jour));
}

/**
 * Tout ce qui sert au suivi des clients, rangé par client :
 * `chosesAFaire(c, interventions.get(id) ?? [], documents.get(id) ?? [], jour, contrats.get(id) ?? [])`.
 * Sans `clientId` (liste, Accueil) : seulement ce qui est encore ouvert ; avec (fiche) : tout son historique.
 * `contrats` : contrats déjà lus par la page (chargerContrats), pour ne pas les relire.
 * `tout` : sans `clientId`, tout l'historique de tous les clients (liste « Mes clients » : mêmes choses à faire que la fiche).
 */
export async function chargerSuivi(supabase: SupabaseClient, clientId?: string, contrats?: ContratLu[], options: { tout?: boolean } = {}) {
  let interventions = supabase.from('interventions').select(SELECT_INTERVENTIONS);
  let documents = supabase.from('documents').select(SELECT_DOCUMENTS).neq('statut', 'annule');
  if (clientId) {
    interventions = interventions.eq('client_id', clientId);
    documents = documents.eq('client_id', clientId);
  } else if (!options.tout) {
    const ilYa = new Date(Date.now() - 120 * 86_400_000).toISOString();
    // Les interventions liées à un devis servent à savoir s'il est déjà prévu.
    interventions = interventions.or(`statut.neq.facturee,cree_le.gte.${ilYa},devis_id.not.is.null`);
    // Les factures payées d'un devis ou d'une intervention servent à savoir s'ils sont déjà facturés,
    // les avoirs à déduire ce qui reste à payer.
    documents = documents.or(
      'statut.in.(brouillon,envoye,signe,a_encaisser),and(statut.eq.payee,devis_id.not.is.null),and(statut.eq.payee,facture_id.not.is.null),and(statut.eq.payee,conditions->>intervention_id.not.is.null)',
    );
  }
  const [{ data: i }, { data: d }, lus] = await Promise.all([interventions.limit(3000), documents.limit(3000), contrats ?? chargerContrats(supabase, clientId)]);
  return {
    interventions: ranger((i ?? []) as unknown as LigneIntervention[], versIntervention),
    // Sans `clientId`, les devis et factures sans client sont rangés sous SANS_CLIENT (lignes « Sans client » de l'Accueil).
    documents: ranger((d ?? []) as unknown as LigneDocument[], versDocument, clientId ? undefined : SANS_CLIENT),
    contrats: contratsParClient(lus),
  };
}

// ---------- Fiche client (/clients/[id]) ----------

const SELECT_INTERVENTIONS_FICHE =
  'id, client_id, reference, numero, motif, type, statut, urgence, date_prevue, date_fin, heure_prevue, souhaitee_le, cree_le, devis_id, description, site_id, ordre_service, ' +
  'site:sites(adresse), occupant:occupants(nom), affectations(membre:membres(prenom, nom)), ' +
  'fiches(resultat, debut, fin, envoyee_le, cree_le, reserves, a_prevoir:valeurs->>a_prevoir, auteur:membres(prenom, nom))';

type LigneInterventionFiche = LigneIntervention & {
  reference: string | null;
  numero: number | null;
  heure_prevue: string | null;
  site_id: string | null;
  ordre_service: string | null;
  fiches: (LigneFiche & { debut: string | null })[] | null;
};

/**
 * Tout l'historique d'un client pour sa fiche : interventions (avec numéro, heure, immeuble, ordre de service,
 * arrivée sur place), devis et factures (sauf annulés). Les contrats : contratsParClient(chargerContrats(…, id)).
 */
export async function chargerFiche(supabase: SupabaseClient, clientId: string) {
  const [{ data: i }, { data: d }] = await Promise.all([
    supabase.from('interventions').select(SELECT_INTERVENTIONS_FICHE).eq('client_id', clientId).limit(3000),
    supabase.from('documents').select(SELECT_DOCUMENTS).eq('client_id', clientId).neq('statut', 'annule').limit(3000),
  ]);
  const interventions = ((i ?? []) as unknown as LigneInterventionFiche[]).map((l): InterventionFiche => {
    const base = versIntervention(l);
    const quand = (f: LigneFiche) => f.envoyee_le ?? f.fin ?? f.cree_le ?? '';
    const derniere = [...(l.fiches ?? [])].sort((a, b) => quand(b).localeCompare(quand(a)))[0];
    return {
      ...base,
      fiche: base.fiche ? { ...base.fiche, debut: derniere?.debut ?? null } : null,
      reference: l.reference,
      numero: l.numero,
      heure_prevue: l.heure_prevue,
      ordre_service: l.ordre_service,
      site_id: l.site_id,
    };
  });
  return {
    interventions,
    documents: ((d ?? []) as unknown as LigneDocument[]).map(versDocument),
  };
}
