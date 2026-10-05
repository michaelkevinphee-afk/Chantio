import type { DocumentChiffres } from '@chantio/shared';

// Documents lus par l'écran Chiffres (Le point et Mon année) : les colonnes utiles, et seulement
// les clés de conditions (jsonb) qui servent au classement par type.

export const SELECT_DOCUMENTS =
  'id, genre, type_facture, numero, statut, objet, date_document, echeance, envoye_le, finalise_le, signe_le, paye_le, total_ht, net_a_payer, devis_id, facture_id, parcours:conditions->>parcours, intervention_id:conditions->>intervention_id, contrat_id:conditions->>contrat_id, ao:conditions->ao';
export type DocumentLu = Omit<DocumentChiffres, 'conditions'> & { parcours: string | null; intervention_id: string | null; contrat_id: string | null; ao: unknown };

export function versDocument(d: DocumentLu): DocumentChiffres {
  const { parcours, intervention_id, contrat_id, ao, ...reste } = d;
  return {
    ...reste,
    total_ht: Number(d.total_ht) || 0,
    net_a_payer: Number(d.net_a_payer) || 0,
    conditions: { parcours, intervention_id: intervention_id ?? undefined, contrat_id: contrat_id ?? undefined, ao: ao === true },
  };
}
