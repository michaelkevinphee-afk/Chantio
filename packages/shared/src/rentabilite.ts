// Coefficients et marges des devis du bâtiment : prix calculé d'une ligne
// (fourniture + temps de pose × coût horaire) × coefficient, frais généraux,
// marge brute et nette, métrés. Rien de tout cela n'est imprimé : le client
// ne voit que les prix.

import { arrondi, type LigneDocument, type Metre, type ReglagesFacturation } from './devis.ts';

export interface ReglagesPrix {
  /** Coût horaire chargé de la main-d'œuvre (€ HT / h) : salaire et charges, divisés par les heures productives. */
  cout_horaire: number;
  /** Frais généraux, en % du déboursé sec. */
  frais_generaux: number;
  /** Coefficient global par défaut des nouveaux devis. */
  coefficient: number;
  /** Marge nette minimale (%) : en dessous, le devis affiche une alerte. */
  marge_min: number;
  /** Chute ajoutée par défaut aux métrés en m² (%). */
  chute: number;
}

export const REGLAGES_PRIX_DEFAUT: ReglagesPrix = { cout_horaire: 42, frais_generaux: 30, coefficient: 1.45, marge_min: 8, chute: 10 };

const BORNES: Record<keyof ReglagesPrix, [number, number]> = {
  cout_horaire: [0, 1000],
  frais_generaux: [0, 300],
  coefficient: [0.5, 10],
  marge_min: [0, 90],
  chute: [0, 100],
};

/** Réglages de prix de l'entreprise, complétés par les valeurs par défaut. */
export function reglagesPrix(r?: ReglagesFacturation | null): ReglagesPrix {
  const out = { ...REGLAGES_PRIX_DEFAUT };
  for (const k of Object.keys(BORNES) as (keyof ReglagesPrix)[]) {
    const v = r?.[k];
    const n = typeof v === 'number' ? v : Number.NaN;
    if (Number.isFinite(n) && n >= BORNES[k][0] && n <= BORNES[k][1]) out[k] = n;
  }
  return out;
}

/** Coefficient au-dessous duquel la marge nette passe sous le minimum : (1 + FG) / (1 − marge mini). */
export function coefficientPlancher(rp: ReglagesPrix): number {
  return Math.ceil(((1 + rp.frais_generaux / 100) / (1 - rp.marge_min / 100)) * 100) / 100;
}

type LigneCout = Pick<LigneDocument, 'achat' | 'heures'>;

/** La ligne a un coût connu (fourniture ou pose). */
export const aUnCout = (l: LigneCout) => !!(Number(l.achat) || Number(l.heures));

/** Déboursé sec d'une unité : fourniture + temps de pose × coût horaire. */
export const debourseUnitaire = (l: LigneCout, rp: ReglagesPrix) => (Number(l.achat) || 0) + (Number(l.heures) || 0) * rp.cout_horaire;

/** Coefficient qui s'applique à la ligne : le sien, sinon celui du document. */
export const coefficientLigne = (l: Pick<LigneDocument, 'coefficient'>, coefDocument: number) =>
  l.coefficient && l.coefficient > 0 ? l.coefficient : coefDocument;

/** Prix unitaire d'une ligne : calculé depuis son coût, ou le prix fixe saisi. */
export function prixLigne(l: LigneDocument, coefDocument: number, rp: ReglagesPrix): number {
  if (l.titre || !l.prix_calcule) return l.prix_unitaire;
  return arrondi(debourseUnitaire(l, rp) * coefficientLigne(l, coefDocument));
}

/** Recalcule le prix des lignes au prix calculé (coefficient ou réglages changés). */
export function appliquerPrix<T extends LigneDocument>(lignes: T[], coefDocument: number, rp: ReglagesPrix): T[] {
  return lignes.map((l) => {
    const p = prixLigne(l, coefDocument, rp);
    return p === l.prix_unitaire ? l : { ...l, prix_unitaire: p };
  });
}

export interface Rentabilite {
  fournitures: number;
  mainOeuvre: number;
  heures: number;
  /** Déboursé sec : fournitures + main-d'œuvre. */
  debourse: number;
  fraisGeneraux: number;
  /** Prix de revient : déboursé sec + frais généraux. */
  prixRevient: number;
  /** Prix de vente HT, remise déduite. */
  prixVente: number;
  margeBrute: number;
  margeNette: number;
  tauxMargeBrute: number;
  tauxMargeNette: number;
  /** Prix de vente ÷ déboursé sec. */
  coefficientReel: number;
  /** Lignes vendues sans coût connu : la marge est surestimée. */
  sansCout: number;
  sousMinimum: boolean;
}

/** Rentabilité d'un devis (ou d'une facture unique) : à partir des coûts des lignes. */
export function rentabilite(doc: { lignes: LigneDocument[]; remise: number }, rp: ReglagesPrix): Rentabilite {
  let fournitures = 0;
  let heures = 0;
  let brut = 0;
  let sansCout = 0;
  for (const l of doc.lignes) {
    if (l.titre) continue;
    const q = Number(l.quantite) || 0;
    fournitures += (Number(l.achat) || 0) * q;
    heures += (Number(l.heures) || 0) * q;
    brut += q * (Number(l.prix_unitaire) || 0);
    if (!aUnCout(l) && q * l.prix_unitaire > 0) sansCout++;
  }
  const mainOeuvre = heures * rp.cout_horaire;
  const debourse = fournitures + mainOeuvre;
  const prixVente = brut * (1 - (Number(doc.remise) || 0) / 100);
  const fraisGeneraux = (debourse * rp.frais_generaux) / 100;
  const prixRevient = debourse + fraisGeneraux;
  const margeBrute = prixVente - debourse;
  const margeNette = prixVente - prixRevient;
  const tauxMargeNette = prixVente ? (margeNette / prixVente) * 100 : 0;
  return {
    fournitures: arrondi(fournitures),
    mainOeuvre: arrondi(mainOeuvre),
    heures: Math.round(heures * 100) / 100,
    debourse: arrondi(debourse),
    fraisGeneraux: arrondi(fraisGeneraux),
    prixRevient: arrondi(prixRevient),
    prixVente: arrondi(prixVente),
    margeBrute: arrondi(margeBrute),
    margeNette: arrondi(margeNette),
    tauxMargeBrute: prixVente ? (margeBrute / prixVente) * 100 : 0,
    tauxMargeNette,
    coefficientReel: debourse ? prixVente / debourse : 0,
    sansCout,
    sousMinimum: prixVente > 0 && tauxMargeNette < rp.marge_min,
  };
}

/** Coefficient d'une ligne et sa marge nette, pour la vue « Coefficients par ligne ». */
export function margeLigne(l: LigneDocument, coefDocument: number, rp: ReglagesPrix) {
  const ds = debourseUnitaire(l, rp);
  const coefficient = l.prix_calcule ? coefficientLigne(l, coefDocument) : ds ? l.prix_unitaire / ds : 0;
  const pv = l.prix_unitaire;
  const tauxMargeNette = pv ? ((pv - ds * (1 + rp.frais_generaux / 100)) / pv) * 100 : 0;
  return { coefficient, propre: !!l.prix_calcule && !!l.coefficient, tauxMargeNette, sousMinimum: tauxMargeNette < rp.marge_min };
}

/**
 * Plus petit coefficient global (au centième) qui donne la marge nette minimale.
 * Null quand le coefficient global n'y peut rien (aucune ligne ne le suit, ou
 * les lignes à prix fixe pèsent trop).
 */
export function coefficientMinimum(doc: { lignes: LigneDocument[]; remise: number }, rp: ReglagesPrix): number | null {
  if (!doc.lignes.some((l) => !l.titre && l.prix_calcule && !l.coefficient && aUnCout(l))) return null;
  const marge = (k: number) => rentabilite({ lignes: appliquerPrix(doc.lignes, k, rp), remise: doc.remise }, rp).tauxMargeNette;
  let bas = 0.5;
  let haut = 10;
  if (marge(haut) < rp.marge_min) return null;
  for (let i = 0; i < 40; i++) {
    const m = (bas + haut) / 2;
    if (marge(m) >= rp.marge_min) haut = m;
    else bas = m;
  }
  return Math.ceil(haut * 100 - 1e-9) / 100;
}

// ---------------------------------------------------------------------------
// Métrés
// ---------------------------------------------------------------------------

export const estMetrable = (unite: string) => ['m²', 'm³', 'ml', 'm'].includes(unite);

export function metreVide(unite: string, rp: ReglagesPrix): Metre {
  return { longueur: 0, largeur: 0, hauteur: 0, nombre: 1, deduction: 0, chute: unite === 'm²' ? rp.chute : 0 };
}

/** Quantité donnée par le métré, dans l'unité de la ligne. */
export function quantiteMetre(m: Metre, unite: string): number {
  const n = Number(m.nombre) || 1;
  const base =
    unite === 'm²' ? m.longueur * m.largeur : unite === 'm³' ? m.longueur * m.largeur * (Number(m.hauteur) || 0) : Number(m.longueur) || 0;
  const q = (base * n - (Number(m.deduction) || 0)) * (1 + (Number(m.chute) || 0) / 100);
  return Math.max(0, Math.round(q * 100) / 100);
}

const nb = (n: number) => String(+(+n).toFixed(2)).replace('.', ',');

/** « 9,6 × 2,5 × 2 − 3,6 + 10 % de chute » : le détail imprimé sous la ligne. */
export function texteMetre(m: Metre, unite: string): string {
  const dims = [m.longueur];
  if (unite === 'm²' || unite === 'm³') dims.push(m.largeur);
  if (unite === 'm³') dims.push(Number(m.hauteur) || 0);
  if ((Number(m.nombre) || 1) > 1) dims.push(m.nombre);
  let t = dims.map(nb).join(' × ');
  if (m.deduction) t += ` − ${nb(m.deduction)}`;
  if (m.chute) t += ` + ${nb(m.chute)} % de chute`;
  return t;
}
