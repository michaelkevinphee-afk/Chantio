import 'server-only';
import {
  annuleeParAvoirs,
  avoirsSurFacture,
  completerClient,
  familleIntervention,
  finValidite,
  LIBELLE_PARCOURS,
  libelleDocument,
  nomClient,
  parcoursDocument,
  partDejaFacturee,
  sansAccents,
  type ClientDocument,
  type ConditionsDocument,
  type Parcours,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import type { supabaseServeur } from '@/lib/supabase/server';
import { TYPE_FACTURE_COURT, type GenreListe, type LigneVente } from './liste-regles';

type Supa = Awaited<ReturnType<typeof supabaseServeur>>;

type DocLu = {
  id: string;
  genre: GenreListe;
  type_facture: TypeFacture | null;
  numero: string | null;
  statut: StatutDocument;
  client_id: string | null;
  client: Record<string, unknown> | null;
  objet: string | null;
  date_document: string;
  echeance: string | null;
  conditions: Partial<ConditionsDocument> | null;
  devis_id: string | null;
  facture_id: string | null;
  total_ht: number | string;
  total_ttc: number | string;
  cree_le: string;
  fiche: { nom: string } | null;
};

const SELECT =
  'id, genre, type_facture, numero, statut, client_id, client, objet, date_document, echeance, conditions, devis_id, facture_id, total_ht, total_ttc, cree_le, fiche:clients(nom)';

/**
 * Les lignes de « Mes devis » ou « Mes factures » : statut, type, client, numéro, dates, montants HT et TTC
 * (négatifs pour un avoir), « facturé 30 % » d'un devis signé, factures à encaisser et en retard (avoirs déduits).
 * Tout est lu en une fois (les 3 000 plus récents) : recherche, filtres et tri se font ensuite dans le navigateur.
 */
export async function lireListeDocuments(supabase: Supa, genre: GenreListe, aujourdhui: string): Promise<LigneVente[]> {
  const devis = genre === 'devis';
  // Pour les devis, les factures servent à calculer la part facturée ; pour les factures, les avoirs sont des factures.
  const docsReq = supabase.from('documents').select(SELECT).order('date_document', { ascending: false }).order('cree_le', { ascending: false }).limit(3000);
  const [{ data }, { data: contrats }, { data: interventions }, { data: titres }] = await Promise.all([
    devis ? docsReq : docsReq.eq('genre', 'facture'),
    devis ? supabase.from('contrats').select('renouvellement_id').not('renouvellement_id', 'is', null) : Promise.resolve({ data: [] }),
    devis ? supabase.from('interventions').select('id, type, devis_id').not('devis_id', 'is', null).limit(5000) : Promise.resolve({ data: [] }),
    // Un devis avec des lots est un devis de chantier (parcoursDocument).
    devis ? supabase.from('lignes_document').select('document_id').eq('titre', true).limit(10000) : Promise.resolve({ data: [] }),
  ]);
  const docs = ((data ?? []) as unknown as DocLu[]).map((d) => ({ ...d, total_ht: Number(d.total_ht) || 0, total_ttc: Number(d.total_ttc) || 0 }));
  const factures = docs.filter((d) => d.genre === 'facture');
  const avoirs = factures
    .filter((d) => d.type_facture === 'avoir')
    .map((a) => ({ facture_id: a.facture_id, numero: a.numero, total_ttc: a.total_ttc }));
  const facturesDe = new Map<string, typeof factures>();
  for (const f of factures) if (f.devis_id) facturesDe.set(f.devis_id, [...(facturesDe.get(f.devis_id) ?? []), f]);

  const renouvellements = new Set(((contrats ?? []) as { renouvellement_id: string }[]).map((c) => c.renouvellement_id));
  const typeIntervention = new Map<string, string>();
  for (const i of (interventions ?? []) as { id: string; type: string; devis_id: string }[]) typeIntervention.set(i.devis_id, i.type);
  // Interventions d'où viennent des devis (conditions.intervention_id) : lues seulement si besoin.
  const liees = devis
    ? [...new Set(docs.flatMap((d) => (d.genre === 'devis' && d.conditions?.intervention_id ? [d.conditions.intervention_id] : [])))]
    : [];
  const typeParId = new Map<string, string>();
  if (liees.length) {
    const { data: li } = await supabase.from('interventions').select('id, type').in('id', liees.slice(0, 500));
    for (const i of (li ?? []) as { id: string; type: string }[]) typeParId.set(i.id, i.type);
  }
  const avecLots = new Set(((titres ?? []) as { document_id: string }[]).map((t) => t.document_id));

  const indice = (d: DocLu): Parcours | null => {
    if (renouvellements.has(d.id) || /^Renouvellement du contrat/i.test(d.objet ?? '')) return 'contrat';
    const t = typeIntervention.get(d.id) ?? (d.conditions?.intervention_id ? typeParId.get(d.conditions.intervention_id) : undefined);
    if (!t) return null;
    const f = familleIntervention(t);
    return f === 'entretien' ? 'contrat' : f === 'chantier' ? 'chantier' : null;
  };

  return docs
    .filter((d) => d.genre === genre)
    .map((d): LigneVente => {
      const c = d.conditions ?? {};
      const facture = d.genre === 'facture';
      const avoir = facture && d.type_facture === 'avoir';
      const ao = !facture && !!c.ao;
      const brouillon = d.statut === 'brouillon';
      const signe = avoir ? -1 : 1;
      const ht = signe * Math.abs(d.total_ht);
      const ttc = signe * Math.abs(d.total_ttc);

      // À encaisser : facture émise (hors avoir) dont il reste quelque chose à payer après ses avoirs.
      const couvert = facture && !avoir ? avoirsSurFacture(d.id, avoirs) : 0;
      const aEncaisser = facture && !avoir && d.statut === 'a_encaisser' && Math.abs(d.total_ttc) - couvert > 0.005;
      const enRetard = aEncaisser && !!d.echeance && d.echeance < aujourdhui;
      const annulee =
        facture && !avoir && (d.statut === 'annule' || ((d.statut === 'a_encaisser' || d.statut === 'payee') && annuleeParAvoirs(d.total_ttc, couvert)));

      // Échéance (echeanceDoc du bac).
      let echeance: string | null = null;
      if (brouillon) echeance = ao ? c.aoLimite || null : null;
      else if (facture) echeance = avoir ? null : d.echeance;
      else if (d.statut === 'envoye' && d.date_document) echeance = finValidite(d.date_document, c.validite);
      const echeanceDepassee = !!echeance && (enRetard || (!facture && echeance < aujourdhui));

      const type: Parcours | TypeFacture = facture
        ? (d.type_facture ?? 'totale')
        : parcoursDocument({ conditions: c, lignes: avecLots.has(d.id) ? [{ titre: true, designation: '', quantite: 0, unite: 'u', prix_unitaire: 0, tva: 10 }] : [] }, indice(d));

      const facturePct =
        !facture && d.statut === 'signe'
          ? partDejaFacturee(
              Math.abs(d.total_ht),
              (facturesDe.get(d.id) ?? []).map((f) => ({ id: f.id, type_facture: f.type_facture, statut: f.statut, total_ht: f.total_ht, total_ttc: f.total_ttc })),
              avoirs,
            )
          : null;

      // Nom de la fiche client ; sans fiche, celui écrit sur le document (« — » s'il n'y a qu'une civilité).
      const k = completerClient(d.client as Partial<ClientDocument> | null);
      const nomDoc = (k.type === 'pro' ? k.raison : k.nom || k.prenom) ? nomClient(k) : '';
      const client = d.fiche?.nom || nomDoc || '—';
      const typeLibelle = facture ? TYPE_FACTURE_COURT[type as TypeFacture] : LIBELLE_PARCOURS[type as Parcours];

      return {
        id: d.id,
        genre: d.genre,
        statut: d.statut,
        type,
        ao,
        clientId: d.client_id,
        client,
        objet: d.objet ?? '',
        numero: d.numero,
        date: d.date_document,
        emission: brouillon ? null : d.date_document,
        echeance,
        echeanceDepassee,
        aEncaisser,
        enRetard,
        annuleeParAvoir: annulee,
        avoir,
        ht,
        ttc,
        facturePct: facturePct === null ? null : Math.min(100, facturePct),
        cherche: sansAccents(
          [d.numero, d.objet, client, nomDoc && nomDoc !== client ? nomDoc : '', libelleDocument({ genre: d.genre, type_facture: d.type_facture }), typeLibelle, ao ? 'Appel d’offres' : '', c.ordreService, c.aoConsultation]
            .filter(Boolean)
            .join(' '),
        ),
        creeLe: d.cree_le,
      };
    });
}

/** Clients pour la fenêtre « Nouveau devis » : immeubles (syndics, bailleurs) et leurs occupants. */
export interface ClientFenetre {
  id: string;
  nom: string;
  type: string;
  sites: { id: string; nom: string; occupants: string[] }[];
}

export async function lireClientsFenetre(supabase: Supa): Promise<ClientFenetre[]> {
  const { data } = await supabase.from('clients').select('id, nom, type, sites(id, adresse, ville, occupants(nom))').order('nom').limit(2000);
  type Lu = { id: string; nom: string; type: string; sites: { id: string; adresse: string; ville: string | null; occupants: { nom: string }[] | null }[] | null };
  return ((data ?? []) as unknown as Lu[]).map((k) => ({
    id: k.id,
    nom: k.nom,
    type: k.type,
    sites: (k.sites ?? [])
      .map((s) => ({ id: s.id, nom: s.adresse, occupants: (s.occupants ?? []).map((o) => o.nom).sort((a, b) => a.localeCompare(b, 'fr')) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  }));
}
