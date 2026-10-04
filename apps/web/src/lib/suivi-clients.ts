import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentSuivi, InterventionSuivi, ResultatFiche } from '@chantio/shared';

// Données de « Mes clients » : interventions et devis/factures encore ouverts,
// rangés par client, pour calculer ce qu'il reste à faire.

const SELECT_INTERVENTIONS =
  'id, client_id, motif, type, statut, urgence, date_prevue, cree_le, devis_id, site:sites(adresse), occupant:occupants(nom), affectations(membre:membres(prenom)), fiches(resultat, fin)';
const SELECT_DOCUMENTS =
  'id, client_id, genre, type_facture, numero, statut, objet, date_document, echeance, envoye_le, signe_le, paye_le, total_ht, net_a_payer, devis_id, conditions';

type LigneIntervention = Omit<InterventionSuivi, 'adresse' | 'occupant' | 'techniciens' | 'fiche'> & {
  client_id: string;
  site: { adresse: string } | null;
  occupant: { nom: string } | null;
  affectations: { membre: { prenom: string } | null }[] | null;
  fiches: { resultat: ResultatFiche | null; fin: string | null }[] | null;
};
type LigneDocument = Omit<DocumentSuivi, 'total_ht' | 'net_a_payer'> & { client_id: string | null; total_ht: number | string; net_a_payer: number | string };

function versIntervention(l: LigneIntervention): InterventionSuivi {
  // La dernière fiche envoyée compte (une fiche renvoyée en crée une nouvelle).
  const fiche = [...(l.fiches ?? [])].sort((a, b) => (b.fin ?? '').localeCompare(a.fin ?? ''))[0] ?? null;
  return {
    id: l.id,
    motif: l.motif,
    type: l.type,
    statut: l.statut,
    urgence: l.urgence,
    date_prevue: l.date_prevue,
    cree_le: l.cree_le,
    devis_id: l.devis_id,
    adresse: l.site?.adresse ?? null,
    occupant: l.occupant?.nom ?? null,
    techniciens: (l.affectations ?? []).map((a) => a.membre?.prenom).filter((p): p is string => !!p),
    fiche: fiche ? { resultat: fiche.resultat, fin: fiche.fin } : null,
  };
}

function versDocument(l: LigneDocument): DocumentSuivi {
  return { ...l, total_ht: Number(l.total_ht) || 0, net_a_payer: Number(l.net_a_payer) || 0, conditions: l.conditions ?? null };
}

function ranger<T>(lignes: (T & { client_id: string | null })[], vers: (l: T & { client_id: string | null }) => unknown) {
  const parClient = new Map<string, ReturnType<typeof vers>[]>();
  for (const l of lignes) {
    if (!l.client_id) continue;
    parClient.set(l.client_id, [...(parClient.get(l.client_id) ?? []), vers(l)]);
  }
  return parClient;
}

/**
 * Tout ce qui sert au suivi des clients. Sans `clientId` (liste) : seulement
 * ce qui est encore ouvert ; avec (fiche) : tout son historique.
 */
export async function chargerSuivi(supabase: SupabaseClient, clientId?: string) {
  let interventions = supabase.from('interventions').select(SELECT_INTERVENTIONS);
  let documents = supabase.from('documents').select(SELECT_DOCUMENTS).neq('statut', 'annule');
  if (clientId) {
    interventions = interventions.eq('client_id', clientId);
    documents = documents.eq('client_id', clientId);
  } else {
    const ilYa = new Date(Date.now() - 120 * 86_400_000).toISOString();
    interventions = interventions.or(`statut.neq.facturee,cree_le.gte.${ilYa}`);
    // Les factures payées d'un devis servent à savoir s'il est déjà réalisé.
    documents = documents.or('statut.in.(brouillon,envoye,signe,a_encaisser),and(statut.eq.payee,devis_id.not.is.null)');
  }
  const [{ data: i }, { data: d }] = await Promise.all([interventions.limit(3000), documents.limit(3000)]);
  return {
    interventions: ranger((i ?? []) as unknown as LigneIntervention[], versIntervention) as Map<string, InterventionSuivi[]>,
    documents: ranger((d ?? []) as unknown as LigneDocument[], versDocument) as Map<string, DocumentSuivi[]>,
  };
}
