import 'server-only';
import {
  aujourdhui,
  budgetVide,
  devisChantierEnAttente,
  productionAnnee,
  resteAExecuter,
  type BudgetPilotage,
  type InterventionLiee,
  type LiensFactures,
  type MoisImporte,
  type ProductionAnnee,
} from '@chantio/shared';
import type { contexteBureau } from '@/lib/session';
import { SELECT_DOCUMENTS, versDocument, type DocumentLu } from '../documents';

/** Ce qu'il faut à « Mon année » : le budget, la production des deux années, le reste à exécuter. */
export interface DonneesMonAnnee {
  annee: number;
  /** Mois en cours (0 à 11). */
  moisCourant: number;
  budget: BudgetPilotage;
  /** Un budget a déjà été enregistré pour l'année. */
  budgetSaisi: boolean;
  production: ProductionAnnee;
  /** Mois importés de l'année et de la précédente, tels qu'enregistrés. */
  importee: MoisImporte[];
  /** Reste à exécuter : devis signés de Chantio + carnet hors Chantio. */
  reste: number;
  /** Dont ce que les devis signés de Chantio laissent à facturer. */
  resteChantio: number;
  devisEnAttente: number;
  /** Au moins une facture émise dans Chantio sur les deux années. */
  facturesChantio: boolean;
}

const nombre = (v: unknown) => (v == null ? null : Number(v));

/** Une ligne de la table budgets, nombres convertis (numeric arrive en texte). */
export function lireBudget(l: Record<string, unknown> | null, annee: number): BudgetPilotage {
  if (!l) return budgetVide(annee);
  const b = budgetVide(annee);
  for (const k of ['objectif_depannage', 'objectif_chantier', 'achats_pc', 'sous_traitance', 'salaires', 'charges_pc', 'coef_depannage', 'coef_chantier', 'impot_pc'] as const)
    b[k] = Number(l[k]) || 0;
  b.aide = (l.aide as BudgetPilotage['aide']) ?? null;
  b.frais = Array.isArray(l.frais) ? (l.frais as { libelle: string; montant: number }[]).map((f) => ({ libelle: String(f.libelle ?? ''), montant: Number(f.montant) || 0 })) : [];
  b.carnet_accepte = nombre(l.carnet_accepte);
  b.carnet_facture = nombre(l.carnet_facture);
  b.carnet_le = (l.carnet_le as string | null) ?? null;
  return b;
}

/** Charge l'année en cours. Réservé au dirigeant (les tables du pilotage ne s'ouvrent qu'à lui). */
export async function chargerMonAnnee({ supabase }: Awaited<ReturnType<typeof contexteBureau>>): Promise<DonneesMonAnnee> {
  const jour = aujourdhui();
  const annee = Number(jour.slice(0, 4));
  const debut = `${annee - 1}-01-01`;

  const [{ data: budgetLu }, { data: importeeLue }, { data: docsLus }, { data: liees }, { data: contrats }, { data: titres }] = await Promise.all([
    supabase.from('budgets').select('*').eq('annee', annee).maybeSingle(),
    supabase.from('production_importee').select('mois, famille, montant_ht').gte('mois', debut).lt('mois', `${annee + 1}-01-01`),
    // Factures et avoirs des deux années, devis signés (le reste à exécuter) et envoyés (en attente).
    supabase
      .from('documents')
      .select(SELECT_DOCUMENTS)
      .neq('statut', 'annule')
      .or(`date_document.gte.${debut},statut.in.(signe,envoye)`)
      .limit(10000),
    supabase.from('interventions').select('id, type, contrat_id, devis_id').not('devis_id', 'is', null).limit(5000),
    supabase.from('contrats').select('renouvellement_id').not('renouvellement_id', 'is', null),
    supabase.from('lignes_document').select('document_id').eq('titre', true).limit(10000),
  ]);

  // Documents qu'il faut en plus : devis d'origine, facture d'un avoir, factures plus anciennes d'un devis signé.
  const documents = ((docsLus ?? []) as unknown as DocumentLu[]).map(versDocument);
  const connus = new Set(documents.map((d) => d.id));
  const manquants = [
    ...new Set(documents.flatMap((d) => [d.devis_id, d.type_facture === 'avoir' ? d.facture_id : null]).filter((id): id is string => !!id && !connus.has(id))),
  ];
  const signes = documents.filter((d) => d.genre === 'devis' && d.statut === 'signe').map((d) => d.id);
  const interventions = (liees ?? []) as InterventionLiee[];
  const vues = new Set(interventions.map((i) => i.id));
  const idsInterventions = [...new Set(documents.flatMap((d) => (d.conditions?.intervention_id ? [d.conditions.intervention_id] : [])))].filter((id) => !vues.has(id));
  const [{ data: autres }, { data: anciennes }, { data: autresInterventions }] = await Promise.all([
    manquants.length ? supabase.from('documents').select(SELECT_DOCUMENTS).in('id', manquants.slice(0, 300)) : Promise.resolve({ data: [] }),
    signes.length
      ? supabase.from('documents').select(SELECT_DOCUMENTS).eq('genre', 'facture').lt('date_document', debut).in('devis_id', signes.slice(0, 300))
      : Promise.resolve({ data: [] }),
    idsInterventions.length ? supabase.from('interventions').select('id, type, contrat_id, devis_id').in('id', idsInterventions.slice(0, 300)) : Promise.resolve({ data: [] }),
  ]);
  const tous = [...documents];
  for (const d of [...((autres ?? []) as unknown as DocumentLu[]), ...((anciennes ?? []) as unknown as DocumentLu[])].map(versDocument))
    if (!connus.has(d.id)) {
      connus.add(d.id);
      tous.push(d);
    }

  const liens: LiensFactures = {
    interventions: [...interventions, ...((autresInterventions ?? []) as InterventionLiee[])],
    renouvellements: ((contrats ?? []) as { renouvellement_id: string }[]).map((c) => c.renouvellement_id),
    avecLots: ((titres ?? []) as { document_id: string }[]).map((t) => t.document_id),
  };
  const budget = lireBudget(budgetLu as Record<string, unknown> | null, annee);
  const importee = ((importeeLue ?? []) as { mois: string; famille: MoisImporte['famille']; montant_ht: number | string }[]).map((l) => ({
    mois: l.mois,
    famille: l.famille,
    montant_ht: Number(l.montant_ht) || 0,
  }));
  const production = productionAnnee(annee, tous, liens, importee);
  const resteChantio = resteAExecuter(tous, liens, null);
  return {
    annee,
    moisCourant: Number(jour.slice(5, 7)) - 1,
    budget,
    budgetSaisi: !!budgetLu,
    production,
    importee,
    reste: resteAExecuter(tous, liens, budget),
    resteChantio,
    devisEnAttente: devisChantierEnAttente(tous, liens),
    facturesChantio: tous.some((d) => d.genre === 'facture' && (d.statut === 'a_encaisser' || d.statut === 'payee') && d.date_document >= debut),
  };
}
