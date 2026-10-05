// Écran « Chiffres » du bureau, comme vChiffres() du bac à sable (40-bureau.js) :
// les quatre tuiles, la charge de la semaine, le facturé depuis janvier par type
// et les dossiers du tableau « Prévu au devis contre réalisé ».

import type { Parcours, StatutDocument } from './devis.ts';
import { familleIntervention, type FamilleIntervention } from './format.ts';
import { heuresSur, type Creneau } from './planning.ts';
import type { PieceUtilisee } from './rentabilite.ts';
import { factureAEncaisser, factureEmise, factureEnRetard, jourParis, resteDu, type ConditionsSuivi, type DocumentSuivi } from './suivi-client.ts';
import type { RoleMembre } from './types.ts';

// ---------- Facturé par type ----------

/** Liens rangés dans documents.conditions (jsonb) qui servent au classement : type choisi, intervention, contrat. */
export interface ConditionsChiffres extends ConditionsSuivi {
  /** Type choisi à la création (Dépannage / Chantier / Contrat d'entretien), recopié du devis sur ses factures. */
  parcours?: string | null;
}

export type DocumentChiffres = Omit<DocumentSuivi, 'conditions'> & { conditions?: ConditionsChiffres | null };

/** Intervention reliée à un document : créée depuis un devis (devis_id), ou d'où vient le document (conditions.intervention_id). */
export interface InterventionLiee {
  id: string;
  type: string;
  contrat_id: string | null;
  devis_id: string | null;
}

export interface LiensFactures {
  interventions: InterventionLiee[];
  /** Devis de renouvellement des contrats d'entretien (contrats.renouvellement_id). */
  renouvellements?: Iterable<string>;
  /** Documents qui ont des lots (lignes de titre) : un devis de chantier. */
  avecLots?: Iterable<string>;
}

/** Le type d'un document donne la ligne de « Facturé depuis janvier, par type » : Contrat → Entretien, comme dans le bac. */
export const FAMILLE_PARCOURS: Record<Parcours, FamilleIntervention> = { depannage: 'depannage', chantier: 'chantier', contrat: 'entretien' };

const PARCOURS: readonly string[] = ['depannage', 'chantier', 'contrat'];
const parcoursValide = (p: unknown): Parcours | null => (typeof p === 'string' && PARCOURS.includes(p) ? (p as Parcours) : null);
const RENOUVELLEMENT = /^Renouvellement du contrat/i;

/** Ce qu'il faut pour classer des factures : documents par id, interventions par id et par devis, renouvellements, lots. */
export interface ContexteParcours {
  documents: ReadonlyMap<string, DocumentChiffres>;
  interventions: ReadonlyMap<string, InterventionLiee>;
  parDevis: ReadonlyMap<string, InterventionLiee[]>;
  renouvellements: ReadonlySet<string>;
  avecLots: ReadonlySet<string>;
}

export function contexteParcours(documents: DocumentChiffres[], liens: LiensFactures): ContexteParcours {
  const parDevis = new Map<string, InterventionLiee[]>();
  for (const i of liens.interventions) if (i.devis_id) parDevis.set(i.devis_id, [...(parDevis.get(i.devis_id) ?? []), i]);
  return {
    documents: new Map(documents.map((d) => [d.id, d])),
    interventions: new Map(liens.interventions.map((i) => [i.id, i])),
    parDevis,
    renouvellements: new Set(liens.renouvellements ?? []),
    avecLots: new Set(liens.avecLots ?? []),
  };
}

/** Type d'après les interventions : une visite de contrat ou un entretien → contrat, sinon la famille (chantier ou dépannage). */
function parcoursInterventions(liste: (InterventionLiee | undefined)[]): Parcours | null {
  const L = liste.filter((i): i is InterventionLiee => !!i);
  if (!L.length) return null;
  if (L.some((i) => i.contrat_id || familleIntervention(i.type) === 'entretien')) return 'contrat';
  return L.some((i) => familleIntervention(i.type) === 'chantier') ? 'chantier' : 'depannage';
}

/**
 * Type d'une facture (ou d'un avoir), pour « Facturé depuis janvier, par type ».
 * Le bac range chaque facture selon le type choisi à sa création (Dépannage / Chantier / Contrat),
 * recopié du devis quand on le facture. La production n'a ce type que pour les documents faits
 * avec le nouvel éditeur : pour les autres, on le retrouve par les liens, dans cet ordre.
 * 1. Type choisi : conditions.parcours de la facture ; pour un avoir, le type de la facture qu'il corrige ;
 *    sinon conditions.parcours du devis d'origine.
 * 2. Contrat d'entretien : conditions.contrat_id (facture ou devis), devis de renouvellement
 *    (contrats.renouvellement_id) ou objet « Renouvellement du contrat … » → contrat.
 * 3. Intervention liée : celle d'où vient la facture (conditions.intervention_id), sinon celles créées
 *    depuis le devis (interventions.devis_id), sinon celle d'où vient le devis : visite d'un contrat ou
 *    entretien → contrat ; dépannage ou SAV → dépannage ; le reste (chantier, installation…) → chantier.
 * 4. Appel d'offres ou lots (lignes de titre) sur la facture ou le devis → chantier.
 * 5. Sinon : dépannage, le type proposé par défaut à la création d'une facture dans le bac.
 */
export function parcoursFacture(f: DocumentChiffres, ctx: ContexteParcours, vus: Set<string> = new Set()): Parcours {
  vus.add(f.id);
  const propre = parcoursValide(f.conditions?.parcours);
  if (propre) return propre;
  // Un avoir suit la facture qu'il corrige (dans le bac, il en recopie le type).
  const origine = f.type_facture === 'avoir' && f.facture_id ? ctx.documents.get(f.facture_id) : undefined;
  if (origine && !vus.has(origine.id)) return parcoursFacture(origine, ctx, vus);

  const dv = f.devis_id ? ctx.documents.get(f.devis_id) : undefined;
  const c: ConditionsChiffres = f.conditions ?? {};
  const cd: ConditionsChiffres = dv?.conditions ?? {};
  const choisi = parcoursValide(cd.parcours);
  if (choisi) return choisi;

  if (c.contrat_id || cd.contrat_id) return 'contrat';
  if (ctx.renouvellements.has(f.id) || (f.devis_id && ctx.renouvellements.has(f.devis_id))) return 'contrat';
  if (RENOUVELLEMENT.test(f.objet ?? '') || RENOUVELLEMENT.test(dv?.objet ?? '')) return 'contrat';

  const parInterventions =
    parcoursInterventions([c.intervention_id ? ctx.interventions.get(c.intervention_id) : undefined]) ??
    parcoursInterventions(f.devis_id ? (ctx.parDevis.get(f.devis_id) ?? []) : []) ??
    parcoursInterventions([cd.intervention_id ? ctx.interventions.get(cd.intervention_id) : undefined]);
  if (parInterventions) return parInterventions;

  if (c.ao || cd.ao || ctx.avecLots.has(f.id) || (f.devis_id && ctx.avecLots.has(f.devis_id))) return 'chantier';
  return 'depannage';
}

// ---------- Les quatre tuiles et le facturé par type ----------

export interface ChiffresBureau {
  /** Facturé depuis janvier, HT, avoirs déduits (= la somme des trois types). */
  factureHT: number;
  parType: Record<FamilleIntervention, number>;
  /** Encaissé ce mois-ci : factures payées ce mois-ci (TTC, net à payer), avoirs payés déduits. */
  encaisseMois: number;
  /** Reste à encaisser (TTC, avoirs déduits), nombre de factures et de factures en retard. */
  resteAEncaisser: number;
  aEncaisser: number;
  enRetard: number;
  /** Devis en attente de réponse : envoyés, HT. */
  devisAttenteHT: number;
  devisAttente: number;
}

const signe = (d: Pick<DocumentChiffres, 'type_facture'>) => (d.type_facture === 'avoir' ? -1 : 1);

/**
 * Les chiffres de l'écran, avec les règles du bac :
 * - facturé : factures et avoirs émis (à encaisser ou payés) datés de cette année, HT, avoirs en moins ;
 * - encaissé ce mois-ci : documents payés dont le paiement (paye_le, à l'heure de Paris) tombe ce mois-ci ;
 * - reste à encaisser : factures à encaisser dont il reste quelque chose à payer, avoirs émis déduits ;
 * - devis en attente : devis envoyés.
 * `documents` peut contenir d'autres documents (devis anciens, factures d'origine des avoirs) : ils ne comptent pas.
 */
export function chiffresBureau(documents: DocumentChiffres[], liens: LiensFactures, aujourdhui: string): ChiffresBureau {
  const annee = aujourdhui.slice(0, 4);
  const mois = aujourdhui.slice(0, 7);
  const D = documents as DocumentSuivi[];
  const ctx = contexteParcours(documents, liens);

  const parType: Record<FamilleIntervention, number> = { chantier: 0, depannage: 0, entretien: 0 };
  for (const d of documents) {
    if (!factureEmise(d) || d.date_document.slice(0, 4) !== annee) continue;
    parType[FAMILLE_PARCOURS[parcoursFacture(d, ctx)]] += signe(d) * Math.abs(Number(d.total_ht) || 0);
  }
  const encaisseMois = documents
    .filter((d) => d.genre === 'facture' && d.statut === 'payee' && !!d.paye_le && jourParis(d.paye_le).slice(0, 7) === mois)
    .reduce((s, d) => s + signe(d) * Math.abs(Number(d.net_a_payer) || 0), 0);
  const ouvertes = D.filter((d) => factureAEncaisser(d, D));
  const attente = documents.filter((d) => d.genre === 'devis' && d.statut === 'envoye');
  return {
    factureHT: parType.chantier + parType.depannage + parType.entretien,
    parType,
    encaisseMois,
    resteAEncaisser: ouvertes.reduce((s, d) => s + resteDu(d, D), 0),
    aEncaisser: ouvertes.length,
    enRetard: ouvertes.filter((d) => factureEnRetard(d, D, aujourdhui)).length,
    devisAttenteHT: attente.reduce((s, d) => s + (Number(d.total_ht) || 0), 0),
    devisAttente: attente.length,
  };
}

// ---------- Charge de la semaine ----------

/** Va sur le terrain : tout le monde sauf les assistant(e)s, dirigeant compris (même règle que le Planning et Paramètres › Membres). */
export const vaSurLeTerrain = (m: { role: RoleMembre }) => m.role !== 'assistant';

export interface InterventionCharge extends Creneau {
  type: string;
  affectations: { membre_id: string }[];
}

export interface LigneCharge<M> {
  membre: M;
  heures: Record<FamilleIntervention, number>;
  total: number;
  /** Heures par semaine du membre. */
  dispo: number;
  /** Charge en % des heures par semaine. */
  taux: number;
}

/** Heures prévues de chaque membre de terrain sur les jours de la semaine, par famille (chargeSemaine du bac). */
export function chargeSemaine<M extends { id: string; role: RoleMembre; heures_semaine?: number | string | null }>(
  equipe: M[],
  interventions: InterventionCharge[],
  semaine: string[],
): LigneCharge<M>[] {
  return equipe.filter(vaSurLeTerrain).map((membre) => {
    const heures: Record<FamilleIntervention, number> = { chantier: 0, depannage: 0, entretien: 0 };
    for (const i of interventions)
      if (i.affectations.some((a) => a.membre_id === membre.id)) heures[familleIntervention(i.type)] += heuresSur(i, semaine);
    const total = heures.chantier + heures.depannage + heures.entretien;
    const dispo = Number(membre.heures_semaine ?? 35) || 0;
    return { membre, heures, total, dispo, taux: dispo ? (total / dispo) * 100 : 0 };
  });
}

// ---------- Prévu au devis contre réalisé ----------

export interface FichePrevu {
  envoyee_le: string | null;
  duree_minutes: number | null;
  resultat: string | null;
  fournitures: PieceUtilisee[];
}

export interface InterventionPrevu {
  id: string;
  statut: string;
  devis_id: string | null;
  contrat_id: string | null;
  fiches: FichePrevu[];
}

export interface DevisLie {
  id: string;
  statut: StatutDocument;
  conditions?: { intervention_id?: string | null } | null;
}

export type SourcePrevu = { genre: 'devis'; id: string } | { genre: 'contrat' };

const FINIES = ['terminee', 'validee', 'facturee'];
const envoyees = (i: InterventionPrevu) => i.fiches.filter((f) => f.envoyee_le).sort((a, b) => a.envoyee_le!.localeCompare(b.envoyee_le!));

/**
 * D'où vient le « prévu » d'une intervention (devisPrevu du bac) : son devis signé (pas refusé, le signé d'abord),
 * sauf si la fiche demande un devis (« devis à établir » : c'était une visite de diagnostic) ;
 * sinon une visite de son contrat d'entretien ; sinon rien.
 */
export function sourcePrevu(i: InterventionPrevu, devis: DevisLie[]): SourcePrevu | null {
  const derniere = envoyees(i).at(-1);
  if (derniere?.resultat !== 'devis_a_etablir') {
    const lies = devis
      .filter((d) => d.statut !== 'refuse' && (d.id === i.devis_id || d.conditions?.intervention_id === i.id))
      .sort((a, b) => Number(b.statut === 'signe') - Number(a.statut === 'signe'));
    if (lies[0]?.statut === 'signe') return { genre: 'devis', id: lies[0].id };
  }
  return i.contrat_id ? { genre: 'contrat' } : null;
}

export interface DossierPrevu<I extends InterventionPrevu> {
  intervention: I;
  source: SourcePrevu;
  /** Durée et pièces notées sur les fiches envoyées. */
  minutes: number;
  pieces: PieceUtilisee[];
}

/**
 * Les lignes du tableau : une par intervention terminée (terminée, validée ou facturée) dont une fiche
 * a été envoyée et qui a un devis signé ou un contrat. La plus récente fiche en premier.
 */
export function dossiersPrevuRealise<I extends InterventionPrevu>(interventions: I[], devis: DevisLie[]): DossierPrevu<I>[] {
  const lignes: { le: string; dossier: DossierPrevu<I> }[] = [];
  for (const i of interventions) {
    const fiches = envoyees(i);
    if (!fiches.length || !FINIES.includes(i.statut)) continue;
    const source = sourcePrevu(i, devis);
    if (!source) continue;
    lignes.push({
      le: fiches.at(-1)!.envoyee_le!,
      dossier: {
        intervention: i,
        source,
        minutes: fiches.reduce((t, f) => t + (Number(f.duree_minutes) || 0), 0),
        pieces: fiches.flatMap((f) => f.fournitures.map((p) => ({ ...p, quantite: Number(p.quantite) || 0 }))),
      },
    });
  }
  return lignes.sort((a, b) => b.le.localeCompare(a.le)).map((l) => l.dossier);
}
