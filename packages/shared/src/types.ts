import type { ReglagesFacturation } from './devis.ts';
import type { HorairesPosition } from './position.ts';
// Types des données stockées dans Supabase (voir supabase/migrations).

export type RoleMembre =
  | 'dirigeant'
  | 'chef_chantier'
  | 'assistant'
  | 'technicien'
  | 'apprenti'
  | 'sous_traitant';

export type StatutIntervention =
  | 'a_planifier'
  | 'planifiee'
  | 'en_cours'
  | 'terminee'
  | 'a_reprendre'
  | 'validee'
  | 'facturee';

export type TypeIntervention =
  | 'depannage'
  | 'entretien'
  | 'installation'
  | 'mise_en_service'
  | 'sav'
  | 'visite_technique'
  | 'chantier';

export type Urgence = 'normale' | 'urgente' | 'astreinte';

export type TypeClient = 'particulier' | 'syndic' | 'bailleur' | 'entreprise' | 'collectivite';

export type ResultatFiche = 'termine' | 'a_reprendre' | 'attente_piece' | 'devis_a_etablir';

export interface Entreprise {
  id: string;
  nom: string;
  siret: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  metiers: string[];
  logo_chemin: string | null;
  /** Mentions de facturation (assurance, médiateur, objectif…), voir devis.ts. */
  facturation?: ReglagesFacturation | null;
  /** Heures pendant lesquelles la position des techniciens peut être partagée, voir position.ts. */
  geolocalisation?: HorairesPosition | null;
  siren?: string | null;
  forme_juridique?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  tva_intracom?: string | null;
  activite?: string | null;
  formule?: Formule;
  identite_statut?: StatutIdentite;
  cree_le: string;
}

/** Formule d'abonnement, propre à chaque entreprise. */
export type Formule = 'solo' | 'equipe' | 'entreprise';

/** Vérification d'identité du dirigeant : à faire, en contrôle chez Chantio, faite, refusée. */
export type StatutIdentite = 'a_verifier' | 'en_attente' | 'verifiee' | 'refusee';

/** Une entreprise du compte connecté (sélecteur d'entreprise, page « Vos entreprises »). */
export interface MonEntreprise {
  id: string;
  nom: string;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  logo_chemin: string | null;
  formule: Formule;
  identite_statut: StatutIdentite;
  identite_mode: 'registre' | 'documents' | null;
  identite_motif: string | null;
  role: RoleMembre;
  active: boolean;
}

export interface Membre {
  id: string;
  entreprise_id: string;
  user_id: string | null;
  email: string;
  prenom: string;
  nom: string | null;
  telephone: string | null;
  role: RoleMembre;
  actif: boolean;
  /** Photo de profil dans le stockage « profils ». */
  photo_chemin: string | null;
  /** Le membre a activé le partage de sa position (écran Moi de l'appli). */
  partage_position?: boolean;
  /** Équipier Chantio entré dans le compte pendant une session d'assistance (sinon absent ou null). */
  assistance_id?: string | null;
  partage_position_le?: string | null;
  /** Heures de travail par semaine (charge au planning). */
  heures_semaine?: number;
  /** Demi-journées gardées pour les urgences : 0 = lundi matin … 13 = dimanche après-midi. */
  reserve_urgences?: number[];
  cree_le: string;
}

export interface Client {
  id: string;
  entreprise_id: string;
  nom: string;
  type: TypeClient;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  adresse_facturation: string | null;
  notes: string | null;
  civilite: string | null;
  mobile: string | null;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  activite: string | null;
  tva_intracom: string | null;
  site_web: string | null;
  /** Syndics et bailleurs : une facture par intervention, ou un relevé par mois. */
  facturation: FacturationClient;
  cree_le: string;
}

export type FacturationClient = 'intervention' | 'mensuel';

/** Personne à joindre chez un client (gestionnaire, gardien, comptable…). */
export interface ContactClient {
  id: string;
  entreprise_id: string;
  client_id: string;
  nom: string;
  fonction: string | null;
  telephone: string | null;
  email: string | null;
  cree_le: string;
}

export interface Site {
  id: string;
  entreprise_id: string;
  client_id: string;
  adresse: string;
  code_postal: string | null;
  ville: string | null;
  acces: string | null;
  consignes: string | null;
  /** Immeuble de syndic ou de bailleur : gardien (nom, téléphone) et copropriété. */
  gardien: string | null;
  copropriete: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Occupant d'un immeuble : appartement, local ou parties communes. */
export interface Occupant {
  id: string;
  entreprise_id: string;
  site_id: string;
  nom: string;
  /** Étage, porte, n° de lot. */
  lot: string | null;
  telephone: string | null;
  email: string | null;
  cree_le: string;
}

export interface Intervention {
  id: string;
  entreprise_id: string;
  numero: number;
  /** Numéro par type et par année : DEP-2026-0001, CH-2026-0001, ENT-2026-0001. */
  reference: string | null;
  client_id: string;
  site_id: string | null;
  /** Chez qui on intervient dans l'immeuble (le syndic reste le client facturé). */
  occupant_id: string | null;
  /** N° d'ordre de service ou de bon de commande du syndic. */
  ordre_service: string | null;
  /** Devis signé d'où vient l'intervention. */
  devis_id: string | null;
  equipement_id: string | null;
  type: TypeIntervention;
  urgence: Urgence;
  motif: string;
  description: string | null;
  date_prevue: string | null; // AAAA-MM-JJ
  heure_prevue: string | null; // HH:MM:SS
  /** Dernier jour d'un chantier sur plusieurs jours (voir planning.ts). */
  date_fin?: string | null;
  /** Le dernier jour du chantier se termine à midi. */
  fin_midi?: boolean;
  /** Durée prévue en heures, pour la charge des techniciens. */
  duree_prevue?: number | null;
  /** Contrat d'entretien d'où vient la visite. */
  contrat_id?: string | null;
  /** Date souhaitée d'une visite d'entretien pas encore au planning. */
  souhaitee_le?: string | null;
  statut: StatutIntervention;
  cree_par: string | null;
  cree_le: string;
  modifie_le: string;
  validee_par: string | null;
  validee_le: string | null;
  facturee_le: string | null;
}

export interface Affectation {
  intervention_id: string;
  membre_id: string;
  entreprise_id: string;
}

/** Contenu libre d'une fiche, structuré par le gabarit du métier. */
export interface ValeursFiche {
  /** Constats cochés (« Fuite », « Joint usé »…) */
  constat?: string[];
  /** Précisions sur le constat */
  constat_detail?: string;
  /** Travaux réalisés */
  travaux?: string;
  /** Mesures (chauffage) : code → valeur */
  mesures?: Partial<Record<CodeMesure, number | null>>;
  /** Pièces à prévoir pour un prochain passage */
  a_prevoir?: string;
}

export type CodeMesure = 'co' | 'co2' | 't_fumees' | 'pression';

export interface Fiche {
  id: string;
  entreprise_id: string;
  intervention_id: string;
  auteur_id: string | null;
  debut: string | null;
  fin: string | null;
  duree_minutes: number | null;
  valeurs: ValeursFiche;
  resultat: ResultatFiche | null;
  reserves: string | null;
  recommandations: string | null;
  signature_client: string | null;
  signataire_nom: string | null;
  signee_le: string | null;
  refus_signature: string | null;
  envoyee_le: string | null;
}

export interface Fourniture {
  id?: string;
  designation: string;
  reference?: string | null;
  quantite: number;
  unite?: string;
  provenance?: string | null;
}

export interface Media {
  id?: string;
  chemin: string;
  categorie?: 'avant' | 'apres' | null;
  legende?: string | null;
}

/** Ce que le téléphone envoie à la fonction `envoyer_fiche`. */
export interface FicheAEnvoyer {
  id: string;
  intervention_id: string;
  debut?: string | null;
  fin?: string | null;
  duree_minutes?: number | null;
  valeurs: ValeursFiche;
  resultat: ResultatFiche;
  reserves?: string | null;
  recommandations?: string | null;
  signature_client?: string | null;
  signataire_nom?: string | null;
  signee_le?: string | null;
  refus_signature?: string | null;
  fournitures: Fourniture[];
  medias: Media[];
}
