import type { SupabaseClient } from '@supabase/supabase-js';
import {
  etatContrat,
  limitePreavis,
  periodeEnCours,
  visitesAPlanifier,
  visitesAVenir,
  type Contrat,
  type InterventionContrat,
  type StatutDocument,
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
