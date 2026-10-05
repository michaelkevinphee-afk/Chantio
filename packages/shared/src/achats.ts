import { arrondi, euro } from './devis.ts';
import { ajouterJours } from './format.ts';
import type { Ton } from './libelles.ts';

// Achats : factures fournisseurs et fournisseurs (voir supabase/migrations/20261008000000_achats.sql).

export type StatutAchat = 'recu' | 'planifie' | 'suspendu' | 'a_payer' | 'payee' | 'refusee';
export type ReceptionAchat = 'import' | 'photo' | 'electronique' | 'email';

export interface Fournisseur {
  id: string;
  entreprise_id: string;
  nom: string;
  categorie: string;
  siret: string | null;
  tva_intracom: string | null;
  adresse: string | null;
  email: string | null;
  telephone: string | null;
  iban: string | null;
  delai_paiement: number;
  lu_sur_facture: boolean;
  cree_le: string;
}

export interface LigneAchat {
  designation: string;
  quantite: number | null;
  prix_unitaire_ht: number | null;
  total_ht: number | null;
}

export interface PieceAchat {
  chemin: string;
  nom: string;
  taille: number;
}

export interface Achat {
  id: string;
  entreprise_id: string;
  fournisseur_id: string | null;
  numero: string | null;
  date_facture: string;
  delai_paiement: number | null;
  echeance: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  ttc_lu: number | null;
  avoir: boolean;
  statut: StatutAchat;
  reception: ReceptionAchat;
  responsable_id: string | null;
  intervention_id: string | null;
  fichier_chemin: string | null;
  fichier_nom: string | null;
  fichier_type: string | null;
  fichier_taille: number | null;
  lignes: LigneAchat[];
  pieces: PieceAchat[];
  lecture: 'ia' | 'pas_facture' | 'manuel' | null;
  lecture_message: string | null;
  motif: string | null;
  avant_contestation: StatutAchat | null;
  approuvee_le: string | null;
  planifie_le: string | null;
  moyen_prevu: string | null;
  cree_le: string;
}

export interface PaiementAchat {
  id: string;
  achat_id: string;
  moyen: string;
  montant: number;
  date_paiement: string;
}

export const LIBELLE_STATUT_ACHAT: Record<StatutAchat, string> = {
  recu: 'Reçu',
  planifie: 'Paiement planifié',
  suspendu: 'Contestée',
  a_payer: 'À payer',
  payee: 'Payée',
  refusee: 'Refusée',
};

export const TON_STATUT_ACHAT: Record<StatutAchat, Ton> = {
  recu: 'bleu',
  planifie: 'violet',
  suspendu: 'rouge',
  a_payer: 'cobalt',
  payee: 'vert',
  refusee: 'gris',
};

export const LIBELLE_RECEPTION: Record<ReceptionAchat, string> = {
  import: 'Import',
  photo: 'Photo',
  electronique: 'Facture électronique',
  // Factures reçues par e-mail : la « Collecte automatique » du bac à sable.
  email: 'Collecte automatique',
};

export const MOYENS_PAIEMENT = ['Virement', 'Carte bancaire', 'Prélèvement', 'Chèque', 'Espèces'];

export const CATEGORIES_FOURNISSEUR = [
  'Négoce et fournitures',
  'Location de matériel',
  'Sous-traitance',
  'Carburant et véhicules',
  'Téléphone et internet',
  'Assurances',
  'Autre',
];

export const TAUX_TVA_ACHAT: [number, string][] = [
  [20, '20 %'],
  [10, '10 %'],
  [5.5, '5,5 %'],
  [2.1, '2,1 %'],
  [0, '0 % (autoliquidation ou exonéré)'],
];

/** Ce qu'il reste à payer sur une facture (rien si elle est refusée). */
export function resteAPayer(a: Pick<Achat, 'statut' | 'montant_ttc'>, paye: number) {
  if (a.statut === 'refusee') return 0;
  return Math.max(0, arrondi(Number(a.montant_ttc) - paye));
}

/** Échéance dépassée sur une facture approuvée et pas encore réglée. */
export function achatEchu(a: Pick<Achat, 'statut' | 'echeance' | 'montant_ttc'>, paye: number, aujourdhui: string) {
  return (a.statut === 'a_payer' || a.statut === 'planifie') && !!a.echeance && a.echeance < aujourdhui && resteAPayer(a, paye) > 0;
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (b − a). */
export function ecartJours(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Liste « Dépenses fournisseurs » : compteurs, filtres et totaux (mêmes règles que le bac à sable)
// ---------------------------------------------------------------------------

export type CleSegmentAchat = 'tous' | 'recu' | 'attente' | 'a_payer' | 'termine';

export interface SegmentAchat {
  cle: CleSegmentAchat;
  libelle: string;
  /** Couleur de la pastille du nombre. */
  ton: 'gris' | 'cobalt' | 'violet' | 'encre' | 'vert';
  /** Statuts comptés (null = tous). */
  statuts: readonly StatutAchat[] | null;
  /** Petite phrase sous le libellé, à la place du montant. */
  sous?: string;
  /** Montant affiché sous le libellé : total TTC ou reste à payer. */
  montant?: 'ttc' | 'reste';
}

/** Les cinq compteurs du haut de la liste, dans l'ordre du bac. */
export const SEGMENTS_ACHAT: readonly SegmentAchat[] = [
  { cle: 'tous', libelle: 'Tous', ton: 'gris', statuts: null, sous: 'Toutes les factures & avoirs' },
  { cle: 'recu', libelle: 'Reçu', ton: 'cobalt', statuts: ['recu'], montant: 'ttc' },
  { cle: 'attente', libelle: 'En attente', ton: 'violet', statuts: ['planifie', 'suspendu'], sous: 'Planifié ou suspendu' },
  { cle: 'a_payer', libelle: 'À payer', ton: 'encre', statuts: ['a_payer'], montant: 'reste' },
  { cle: 'termine', libelle: 'Terminé', ton: 'vert', statuts: ['payee', 'refusee'], sous: 'Payées ou refusées' },
];

export function segmentAchat(cle: string | null | undefined): SegmentAchat | undefined {
  return SEGMENTS_ACHAT.find((s) => s.cle === cle);
}

/**
 * Compteur ouvert à l'arrivée : celui demandé dans l'adresse s'il existe (l'ancien onglet « suspendu »
 * vaut « En attente »), sinon « Reçu » s'il y a des factures reçues, sinon « Tous ».
 */
export function segmentInitial(demande: string | null | undefined, statuts: readonly StatutAchat[]): CleSegmentAchat {
  const d = demande === 'suspendu' ? 'attente' : demande;
  const s = segmentAchat(d);
  if (s) return s.cle;
  return statuts.includes('recu') ? 'recu' : 'tous';
}

export function dansSegment(a: Pick<Achat, 'statut'>, cle: string): boolean {
  const s = segmentAchat(cle) ?? SEGMENTS_ACHAT[0];
  return !s.statuts || s.statuts.includes(a.statut);
}

/** Listes déroulantes de la barre d'outils : [valeur, libellé], la première = pas de filtre. */
export const PERIODES_ACHAT: readonly (readonly [string, string])[] = [
  ['tout', 'Date de facturation'],
  ['mois', 'Ce mois-ci'],
  ['mois_prec', 'Le mois dernier'],
  ['trimestre', 'Les 3 derniers mois'],
  ['annee', 'Cette année'],
  ['annee_prec', 'L’année dernière'],
];
export const ECHEANCES_ACHAT: readonly (readonly [string, string])[] = [
  ['tout', 'Date d’échéance'],
  ['retard', 'Échéance dépassée'],
  ['semaine', 'Dans les 7 jours'],
  ['mois', 'Dans les 30 jours'],
];
export const MONTANTS_ACHAT: readonly (readonly [string, string])[] = [
  ['tous', 'Montant TTC'],
  ['m100', 'Moins de 100 €'],
  ['m1000', 'De 100 à 1 000 €'],
  ['p1000', 'Plus de 1 000 €'],
];

const premierDuMois = (a: number, m: number) => {
  const d = new Date(Date.UTC(a, m, 1));
  return d.toISOString().slice(0, 10);
};

/** La date de facturation tombe dans la période choisie (dansPeriode() du bac). */
export function dansPeriodeAchat(date: string | null | undefined, periode: string | null | undefined, jour: string): boolean {
  if (!periode || periode === 'tout') return true;
  if (!date) return false;
  const x = date.slice(0, 10);
  const a = Number(jour.slice(0, 4));
  const m = Number(jour.slice(5, 7)) - 1;
  const m0 = premierDuMois(a, m);
  if (periode === 'mois') return x >= m0;
  if (periode === 'mois_prec') return x >= premierDuMois(a, m - 1) && x < m0;
  if (periode === 'trimestre') return x >= premierDuMois(a, m - 2);
  if (periode === 'annee') return x >= `${a}-01-01`;
  if (periode === 'annee_prec') return x >= `${a - 1}-01-01` && x < `${a}-01-01`;
  return true;
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Chaque mot cherché est dans le texte, sans accents ni majuscules (contient() du bac). */
function contient(texte: string, q: string) {
  const t = sansAccents(texte);
  return sansAccents(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((mot) => t.includes(mot));
}

/** Ce que la liste sait d'une facture pour la filtrer. */
export type AchatFiltrable = Pick<Achat, 'numero' | 'statut' | 'date_facture' | 'echeance' | 'montant_ttc' | 'responsable_id'> & {
  paye: number;
  fournisseur: { nom: string; siret?: string | null } | null;
};

export interface FiltresAchats {
  /** Recherche : n° de facture, nom ou SIRET du fournisseur. */
  q?: string;
  periode?: string;
  echeance?: string;
  /** Id du membre responsable, ou « tous ». */
  responsable?: string;
  montant?: string;
}

/** La recherche et les quatre listes déroulantes (baseA() du bac), sans le compteur choisi. */
export function filtrerAchats<T extends AchatFiltrable>(liste: readonly T[], f: FiltresAchats, jour: string): T[] {
  const q = (f.q ?? '').trim();
  return liste.filter((a) => {
    if (q && !contient([a.numero ?? '', a.fournisseur?.nom ?? '', a.fournisseur?.siret ?? ''].join(' '), q)) return false;
    if (!dansPeriodeAchat(a.date_facture, f.periode, jour)) return false;
    const e = f.echeance;
    if (e === 'retard' && !achatEchu(a, a.paye, jour)) return false;
    if (e === 'semaine' || e === 'mois') {
      const aPayer = a.statut === 'a_payer' || a.statut === 'planifie';
      if (!(aPayer && a.echeance && a.echeance >= jour && a.echeance <= ajouterJours(jour, e === 'semaine' ? 7 : 30))) return false;
    }
    if (f.responsable && f.responsable !== 'tous' && a.responsable_id !== f.responsable) return false;
    const t = Number(a.montant_ttc);
    const m = f.montant;
    if ((m === 'm100' && t >= 100) || (m === 'm1000' && (t < 100 || t > 1000)) || (m === 'p1000' && t <= 1000)) return false;
    return true;
  });
}

/** Montant TTC signé : un avoir compte en moins. */
export function ttcSigne(a: Pick<Achat, 'avoir' | 'montant_ttc'>): number {
  return (a.avoir ? -1 : 1) * Number(a.montant_ttc);
}

/** Les cinq compteurs calculés sur une liste déjà filtrée : nombre, et montant signé pour « Reçu » (TTC) et « À payer » (reste). */
export function compterSegments(
  base: readonly (Pick<Achat, 'statut' | 'montant_ttc' | 'avoir'> & { paye: number })[],
): (SegmentAchat & { nombre: number; total: number })[] {
  return SEGMENTS_ACHAT.map((s) => {
    const l = base.filter((a) => !s.statuts || s.statuts.includes(a.statut));
    const total = arrondi(l.reduce((t, a) => t + (a.avoir ? -1 : 1) * (s.montant === 'reste' ? resteAPayer(a, a.paye) : Number(a.montant_ttc)), 0));
    return { ...s, nombre: l.length, total };
  });
}

/** « Achats depuis janvier » d'un fournisseur : TTC des factures de l'année en cours, hors refusées, avoirs en moins. */
export function achatsDepuisJanvier(factures: readonly Pick<Achat, 'statut' | 'date_facture' | 'montant_ttc' | 'avoir'>[], jour: string): number {
  const an = jour.slice(0, 4);
  return arrondi(factures.filter((a) => a.statut !== 'refusee' && (a.date_facture ?? '').slice(0, 4) === an).reduce((t, a) => t + ttcSigne(a), 0));
}

/** Reste à payer à un fournisseur : factures à payer ou planifiées, avoirs en moins. */
export function resteFournisseur(factures: readonly (Pick<Achat, 'statut' | 'montant_ttc' | 'avoir'> & { paye: number })[]): number {
  return arrondi(
    factures
      .filter((a) => a.statut === 'a_payer' || a.statut === 'planifie')
      .reduce((t, a) => t + (a.avoir ? -1 : 1) * resteAPayer(a, a.paye), 0),
  );
}

/** « 92,30 € », « − 92,30 € » pour un avoir (eurA() du bac, signe moins espacé). */
export function euroAchat(a: Pick<Achat, 'avoir'>, n: number): string {
  return `${a.avoir && n ? '− ' : ''}${euro(n)}`;
}
