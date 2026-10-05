// Chiffres › Mon année : le pilotage de l'année d'un fichier Excel de dirigeant
// (onglets « Plan » et « Production »), recalculé avec les factures de Chantio.
// Production d'un mois = factures HT du mois (avoirs déduits) ; l'entretien compte
// avec les dépannages. Les mois facturés hors Chantio (OPERA, Batigest, fichier
// importé) remplacent ceux de Chantio, mois par mois et type par type.

import { contexteParcours, parcoursFacture, type DocumentChiffres, type LiensFactures } from './chiffres.ts';
import { factureEmise } from './suivi-client.ts';

export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;
export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;

// ---------- Le budget de l'année ----------

export interface FraisBudget {
  libelle: string;
  /** Montant à l'année. */
  montant: number;
}

/** Aide au calcul de l'objectif dépannages : heures vendues des compagnons + fournitures. */
export interface AideDepannage {
  compagnons: number;
  heures: number;
  taux: number;
  /** Part du temps passée en dépannage, en %. */
  part_pc: number;
  /** Fournitures vendues en plus de la main-d'œuvre, en %. */
  fournitures_pc: number;
}

/** Une ligne de la table budgets (montants en euros, pourcentages de 0 à 100). */
export interface BudgetPilotage {
  annee: number;
  objectif_depannage: number;
  objectif_chantier: number;
  achats_pc: number;
  sous_traitance: number;
  salaires: number;
  charges_pc: number;
  coef_depannage: number;
  coef_chantier: number;
  impot_pc: number;
  aide: AideDepannage | null;
  frais: FraisBudget[];
  carnet_accepte: number | null;
  carnet_facture: number | null;
  carnet_le: string | null;
}

export const budgetVide = (annee: number): BudgetPilotage => ({
  annee, objectif_depannage: 0, objectif_chantier: 0, achats_pc: 0, sous_traitance: 0, salaires: 0, charges_pc: 0,
  coef_depannage: 2, coef_chantier: 1.6, impot_pc: 25, aide: null, frais: [], carnet_accepte: null, carnet_facture: null, carnet_le: null,
});

/** Objectif dépannages de l'aide : heures × taux × compagnons × part, plus les fournitures. */
export function objectifAide(a: AideDepannage): number {
  return a.heures * a.taux * a.compagnons * (a.part_pc / 100) * (1 + a.fournitures_pc / 100);
}

export interface TotauxBudget {
  objDep: number;
  objCha: number;
  /** Chiffre d'affaires visé. */
  ca: number;
  /** Achats consommés : matières (en % du chiffre d'affaires) + sous-traitance. */
  achats: number;
  /** Marge brute. */
  mb: number;
  charges: number;
  /** Frais généraux, salaires et charges compris. */
  fg: number;
  /** Résultat visé, impôt, résultat après impôt. */
  res: number;
  impot: number;
  apres: number;
}

const n = (v: unknown) => Number(v) || 0;

/** Les totaux de l'onglet « Plan ». */
export function totauxBudget(b: BudgetPilotage): TotauxBudget {
  const objDep = n(b.objectif_depannage), objCha = n(b.objectif_chantier), ca = objDep + objCha;
  const achats = (ca * n(b.achats_pc)) / 100 + n(b.sous_traitance);
  const charges = (n(b.salaires) * n(b.charges_pc)) / 100;
  const fg = b.frais.reduce((s, f) => s + n(f.montant), 0) + n(b.salaires) + charges;
  const res = ca - achats - fg;
  return { objDep, objCha, ca, achats, mb: ca - achats, charges, fg, res, impot: (res * n(b.impot_pc)) / 100, apres: res * (1 - n(b.impot_pc) / 100) };
}

// ---------- La production des mois ----------

export type FamillePilotage = 'depannage' | 'chantier';
export type FamilleImportee = FamillePilotage | 'total';

/** Une ligne de production_importee. */
export interface MoisImporte {
  mois: string;
  famille: FamilleImportee;
  montant_ht: number;
}

/** 12 valeurs, janvier à décembre ; null = rien de connu ce mois-là. */
export type Douze = (number | null)[];

export interface ProductionAnnee {
  dep: Douze;
  cha: Douze;
  /** L'année précédente, tous types confondus. */
  n1: Douze;
  /** Mois venus d'un import (ou saisis) plutôt que des factures de Chantio. */
  importes: boolean[];
}

const douze = (): Douze => Array.from({ length: 12 }, () => null);
const ajouter = (t: Douze, i: number, v: number) => (t[i] = (t[i] ?? 0) + v);

/**
 * La production de l'année et de la précédente :
 * - factures et avoirs émis de Chantio, HT, rangés par mois de leur date et par type (l'entretien avec les dépannages) ;
 * - un mois importé remplace, pour son type, ce que Chantio a facturé ce mois-là ;
 * - l'année précédente : ligne « total » importée, sinon dépannages + chantiers importés, sinon les factures de Chantio.
 */
export function productionAnnee(annee: number, documents: DocumentChiffres[], liens: LiensFactures, importee: MoisImporte[]): ProductionAnnee {
  const ctx = contexteParcours(documents, liens);
  const chantio = { [annee]: { dep: douze(), cha: douze() }, [annee - 1]: { dep: douze(), cha: douze() } };
  for (const d of documents) {
    if (!factureEmise(d)) continue;
    const a = Number(d.date_document.slice(0, 4));
    const t = chantio[a];
    if (!t) continue;
    const m = Number(d.date_document.slice(5, 7)) - 1;
    const v = (d.type_facture === 'avoir' ? -1 : 1) * Math.abs(n(d.total_ht));
    ajouter(parcoursFacture(d, ctx) === 'chantier' ? t.cha : t.dep, m, v);
  }
  const imp = { [annee]: { depannage: douze(), chantier: douze(), total: douze() }, [annee - 1]: { depannage: douze(), chantier: douze(), total: douze() } };
  for (const l of importee) {
    const t = imp[Number(l.mois.slice(0, 4))];
    if (t) t[l.famille][Number(l.mois.slice(5, 7)) - 1] = n(l.montant_ht);
  }
  const cur = imp[annee], prec = imp[annee - 1], c = chantio[annee], p = chantio[annee - 1];
  const dep = douze(), cha = douze(), n1 = douze(), importes: boolean[] = [];
  for (let i = 0; i < 12; i++) {
    dep[i] = cur.depannage[i] ?? c.dep[i];
    cha[i] = cur.chantier[i] ?? c.cha[i];
    // Un import « total » sans détail : compté en chantier.
    if (cur.total[i] != null && cur.depannage[i] == null && cur.chantier[i] == null) cha[i] = cur.total[i];
    importes.push(cur.depannage[i] != null || cur.chantier[i] != null || cur.total[i] != null);
    const detail = prec.depannage[i] != null || prec.chantier[i] != null ? (prec.depannage[i] ?? 0) + (prec.chantier[i] ?? 0) : null;
    const chantioN1 = p.dep[i] != null || p.cha[i] != null ? (p.dep[i] ?? 0) + (p.cha[i] ?? 0) : null;
    n1[i] = prec.total[i] ?? detail ?? chantioN1;
  }
  return { dep, cha, n1, importes };
}

/**
 * Reste à exécuter sur les chantiers : devis de chantier signés moins ce qui a déjà été facturé
 * dessus (factures et avoirs émis reliés au devis), plus le carnet tenu hors Chantio (Batigest).
 */
export function resteAExecuter(documents: DocumentChiffres[], liens: LiensFactures, budget: Pick<BudgetPilotage, 'carnet_accepte' | 'carnet_facture'> | null): number {
  const ctx = contexteParcours(documents, liens);
  let reste = 0;
  for (const dv of documents) {
    if (dv.genre !== 'devis' || dv.statut !== 'signe' || parcoursFacture(dv, ctx) !== 'chantier') continue;
    const facture = documents
      .filter((f) => factureEmise(f) && f.devis_id === dv.id)
      .reduce((s, f) => s + (f.type_facture === 'avoir' ? -1 : 1) * Math.abs(n(f.total_ht)), 0);
    reste += Math.max(0, n(dv.total_ht) - facture);
  }
  if (budget?.carnet_accepte != null) reste += Math.max(0, n(budget.carnet_accepte) - n(budget.carnet_facture));
  return reste;
}

/** Devis de chantier envoyés qui attendent la réponse du client, HT. */
export function devisChantierEnAttente(documents: DocumentChiffres[], liens: LiensFactures): number {
  const ctx = contexteParcours(documents, liens);
  return documents.filter((d) => d.genre === 'devis' && d.statut === 'envoye' && parcoursFacture(d, ctx) === 'chantier').reduce((s, d) => s + n(d.total_ht), 0);
}

// ---------- L'année : réel, prévision, résultat ----------

/** Rythme des dépannages à venir : moyenne de l'année, 3 derniers mois, ou saisons de l'an dernier. */
export type ModeRythme = 'moyenne' | 'trois' | 'n1';

export interface Scenario {
  mode: ModeRythme;
  /** Part des chantiers signés qui sera facturée d'ici la fin de l'année, en %. */
  part: number;
  /** Devis en attente qu'on pense signer et facturer cette année, HT. */
  devis: number;
}

export const SCENARIO_DE_BASE: Scenario = { mode: 'moyenne', part: 100, devis: 0 };

export interface MoisAnnee {
  i: number;
  /** Mois terminé (réel). */
  reel: boolean;
  /** Mois en cours : déjà facturé ou prévision, le plus grand des deux. */
  enCours: boolean;
  dep: number;
  cha: number;
  tot: number;
  /** Fourchette de la prévision (égale au réel pour un mois terminé). */
  bas: number;
  haut: number;
  n1: number;
  obj: number;
  objDep: number;
  objCha: number;
  /** Marge des travaux, avec les coefficients. */
  marge: number;
  cum: number;
  cumObj: number;
  cumN1: number;
  cumBas: number;
  cumHaut: number;
  /** Résultat théorique cumulé à la fin du mois. */
  cumRes: number;
}

export interface Annee {
  B: TotauxBudget;
  /** Nombre de mois terminés. */
  n: number;
  mois: MoisAnnee[];
  /** Dépannages des mois terminés : moyenne, écart type, moyenne des 3 derniers. */
  moy: number;
  sd: number;
  trois: number;
  reste: number;
  /** Dépannages attendus d'ici la fin de l'année. */
  depAttendu: number;
  /** Fin du dernier mois terminé (null en janvier). */
  fait: MoisAnnee | null;
  fin: MoisAnnee;
}

export interface DonneesAnnee {
  budget: BudgetPilotage;
  production: ProductionAnnee;
  reste: number;
  /** Mois en cours, de 0 (janvier) à 11 ; 12 pour une année terminée. */
  moisCourant: number;
}

const somme = (a: (number | null)[]) => a.reduce<number>((s, v) => s + (v ?? 0), 0);

/**
 * Mois terminés : ceux avant le mois en cours, et au moins jusqu'au dernier mois importé
 * (un fichier tenu à jour hors Chantio peut aller plus loin).
 */
export function moisTermines(p: ProductionAnnee, moisCourant: number): number {
  let n = Math.min(12, Math.max(0, moisCourant));
  for (let i = 0; i < 12; i++) if (p.importes[i]) n = Math.max(n, i + 1);
  return n;
}

/**
 * Comme l'onglet « Production » du fichier :
 * - objectif d'un mois = objectif de l'année ÷ 12 ;
 * - mois à venir : dépannages au rythme choisi (± l'écart type des mois faits) ; chantiers = reste à
 *   exécuter × part, plus les devis retenus, répartis sur les mois restants (80 % du reste au plus bas) ;
 * - sans aucun mois fait, les dépannages suivent l'objectif ;
 * - résultat théorique : marge des travaux (production × (1 − 1/coefficient)) + salaires chargés − frais généraux ÷ 12,
 *   cumulés mois après mois.
 */
export function calculerAnnee(d: DonneesAnnee, scen: Scenario = SCENARIO_DE_BASE): Annee {
  const b = d.budget, B = totauxBudget(b), P = d.production;
  const nb = moisTermines(P, d.moisCourant), restant = 12 - nb;
  const faits = P.dep.slice(0, nb).map((v) => v ?? 0);
  const moy = nb ? somme(faits) / nb : B.objDep / 12;
  const sd = nb ? Math.sqrt(somme(faits.map((v) => (v - moy) ** 2)) / Math.max(1, nb - 1)) : 0;
  const trois = nb ? somme(faits.slice(-3)) / Math.min(3, nb) : moy;
  const moyN1 = nb ? somme(P.n1.slice(0, nb)) / nb : 0;
  const saisons = scen.mode === 'n1' && moyN1 > 0 && P.n1.some((v, i) => i >= nb && v != null);
  const rythme = scen.mode === 'trois' ? trois : moy;
  const resteRetenu = (d.reste * scen.part) / 100;
  const chaParMois = restant ? (resteRetenu + scen.devis) / restant : 0;
  const chaBas = restant ? (resteRetenu * 0.8) / restant : 0;
  const coefDep = Math.max(1, n(b.coef_depannage)), coefCha = Math.max(1, n(b.coef_chantier));

  const mois: MoisAnnee[] = [];
  let cum = 0, cumObj = 0, cumN1 = 0, cumBas = 0, cumHaut = 0, cumRes = 0;
  const salaires = (n(b.salaires) + B.charges) / 12, frais = B.fg / 12;
  for (let i = 0; i < 12; i++) {
    const reel = i < nb;
    let dep: number, cha: number, bas: number, haut: number;
    if (reel) {
      dep = P.dep[i] ?? 0;
      cha = P.cha[i] ?? 0;
      bas = haut = dep + cha;
    } else {
      const prevu = saisons ? (moy * (P.n1[i] ?? moyN1)) / moyN1 : rythme;
      // Le mois en cours garde ce qui est déjà facturé s'il dépasse la prévision.
      dep = Math.max(prevu, P.dep[i] ?? 0);
      cha = Math.max(chaParMois, P.cha[i] ?? 0);
      bas = Math.max(0, dep - sd) + Math.max(chaBas, P.cha[i] ?? 0);
      haut = dep + sd + cha;
    }
    const m: MoisAnnee = {
      i, reel, enCours: !reel && i === nb && i === d.moisCourant, dep, cha, tot: dep + cha, bas, haut, n1: P.n1[i] ?? 0,
      obj: B.ca / 12, objDep: B.objDep / 12, objCha: B.objCha / 12,
      marge: dep * (1 - 1 / coefDep) + cha * (1 - 1 / coefCha),
      cum: 0, cumObj: 0, cumN1: 0, cumBas: 0, cumHaut: 0, cumRes: 0,
    };
    cum += m.tot; cumObj += m.obj; cumN1 += m.n1; cumBas += m.bas; cumHaut += m.haut; cumRes += m.marge + salaires - frais;
    Object.assign(m, { cum, cumObj, cumN1, cumBas, cumHaut, cumRes });
    mois.push(m);
  }
  return {
    B, n: nb, mois, moy, sd, trois, reste: d.reste,
    depAttendu: mois.slice(nb).reduce((s, m) => s + m.dep, 0),
    fait: nb ? mois[nb - 1] : null,
    fin: mois[11],
  };
}

// ---------- Mois ou trimestres ----------

export type Granularite = 'mois' | 'trim';

export interface Periode {
  k: number;
  /** Mois de la période (0 à 11). */
  idx: number[];
  /** « mars » / « T1 », « mars » / « 1er trimestre », « en mars » / « au 1er trimestre ». */
  lib: string;
  libL: string;
  dans: string;
  /** Tous les mois sont terminés ; certains seulement. */
  reel: boolean;
  partiel: boolean;
  fin: MoisAnnee;
  dep: number;
  cha: number;
  tot: number;
  obj: number;
  objDep: number;
  objCha: number;
  n1: number;
  marge: number;
  /** Résultat théorique de la période seule. */
  res: number;
}

const TRIMESTRES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
const rang = (k: number) => `${k + 1}${k ? 'e' : 'er'} trimestre`;

/** Regroupe les mois de calculerAnnee() par mois ou par trimestre. */
export function periodes(A: Annee, budget: BudgetPilotage, gran: Granularite): Periode[] {
  const net = (n(budget.salaires) + A.B.charges) / 12 - A.B.fg / 12;
  const trim = gran === 'trim';
  const groupes = trim ? TRIMESTRES : A.mois.map((m) => [m.i]);
  return groupes.map((g, k) => {
    const ms = g.map((i) => A.mois[i]);
    const s = (c: 'dep' | 'cha' | 'tot' | 'obj' | 'objDep' | 'objCha' | 'n1' | 'marge') => ms.reduce((t, m) => t + m[c], 0);
    const marge = s('marge');
    return {
      k, idx: g,
      lib: trim ? `T${k + 1}` : MOIS_COURTS[g[0]],
      libL: trim ? rang(k) : MOIS_LONGS[g[0]],
      dans: trim ? `au ${rang(k)}` : `en ${MOIS_LONGS[g[0]]}`,
      reel: ms.every((m) => m.reel),
      partiel: ms.some((m) => m.reel) && !ms.every((m) => m.reel),
      fin: ms[ms.length - 1],
      dep: s('dep'), cha: s('cha'), tot: s('tot'), obj: s('obj'), objDep: s('objDep'), objCha: s('objCha'), n1: s('n1'), marge,
      res: marge + net * g.length,
    };
  });
}
