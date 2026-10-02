import type { ReglagesFacturation } from './devis.ts';
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
  cree_le: string;
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
  latitude: number | null;
  longitude: number | null;
}

export interface Intervention {
  id: string;
  entreprise_id: string;
  numero: number;
  client_id: string;
  site_id: string | null;
  equipement_id: string | null;
  type: TypeIntervention;
  urgence: Urgence;
  motif: string;
  description: string | null;
  date_prevue: string | null; // AAAA-MM-JJ
  heure_prevue: string | null; // HH:MM:SS
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
