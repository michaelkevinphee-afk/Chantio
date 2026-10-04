import { arrondi } from './devis.ts';
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
  email: 'E-mail',
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

/** Les onglets de la liste des factures fournisseurs. */
export const GROUPES_ACHAT: { cle: string; libelle: string; statuts: StatutAchat[] | null }[] = [
  { cle: 'tous', libelle: 'Toutes', statuts: null },
  { cle: 'recu', libelle: 'Reçues', statuts: ['recu'] },
  { cle: 'a_payer', libelle: 'À payer', statuts: ['a_payer', 'planifie'] },
  { cle: 'suspendu', libelle: 'Contestées', statuts: ['suspendu'] },
  { cle: 'termine', libelle: 'Terminées', statuts: ['payee', 'refusee'] },
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
