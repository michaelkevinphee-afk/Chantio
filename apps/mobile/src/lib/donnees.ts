// Accès aux données : une même interface pour Supabase et pour le mode démo,
// pour que les écrans n'aient pas à savoir d'où viennent les données.
import type { Entreprise, FicheAEnvoyer, Intervention, Membre, Occupant, RoleMembre, Site } from '@chantio/shared';

export interface InterventionVue extends Intervention {
  client: { nom: string; telephone: string | null; contact: string | null } | null;
  site: Pick<Site, 'adresse' | 'code_postal' | 'ville' | 'acces' | 'consignes'> & Partial<Pick<Site, 'latitude' | 'longitude' | 'gardien'>> | null;
  /** Dans l'immeuble d'un syndic : l'occupant chez qui on intervient. */
  occupant?: Pick<Occupant, 'nom' | 'lot' | 'telephone'> | null;
  intervenants: { id: string; prenom: string }[];
}

export interface Profil {
  membre: Membre;
  entreprise: Pick<Entreprise, 'id' | 'nom'> & Partial<Pick<Entreprise, 'geolocalisation'>>;
}

export interface EntrepriseDuCompte {
  id: string;
  nom: string;
  role: RoleMembre;
  active: boolean;
}

export interface SourceDonnees {
  mode: 'supabase' | 'demo';
  /** Profil du compte connecté ; null s'il n'appartient à aucune entreprise. */
  chargerProfil(): Promise<Profil | null>;
  creerEntreprise(nom: string, prenom: string): Promise<void>;
  /** Les entreprises du compte (un technicien peut travailler pour plusieurs). */
  listerEntreprises(): Promise<EntrepriseDuCompte[]>;
  /** Passe sur une autre entreprise du compte. */
  choisirEntreprise(id: string): Promise<void>;
  /** Interventions visibles (de aujourd'hui aux 30 prochains jours, plus celles en cours). */
  listerInterventions(): Promise<InterventionVue[]>;
  demarrer(interventionId: string): Promise<void>;
  envoyerPhoto(chemin: string, uriLocale: string): Promise<void>;
  envoyerFiche(fiche: FicheAEnvoyer): Promise<void>;
  /** Dépose une nouvelle photo de profil (JPEG local) et l'enregistre sur le membre. Retourne son chemin. */
  changerPhotoProfil(membre: Pick<Membre, 'id' | 'entreprise_id'>, uriLocale: string): Promise<string>;
  /** Retire la photo de profil du membre connecté. */
  retirerPhotoProfil(): Promise<void>;
  /** Adresse affichable d'une photo de profil (lien signé, ou fichier local en démo). */
  urlPhotoProfil(chemin: string): Promise<string | null>;
  /** Active ou coupe le partage de position du membre connecté (couper efface sa dernière position). */
  reglerPartagePosition(actif: boolean): Promise<void>;
  /** Envoie la position du téléphone. false si le serveur l'a refusée (partage coupé, hors heures). */
  partagerPosition(p: PositionTelephone): Promise<boolean>;
  /** Note l'arrivée (Démarrer) ou le départ (Terminer), avec le lieu si on l'a. */
  pointer(interventionId: string, genre: 'arrivee' | 'depart', p: PositionTelephone | null, le: string): Promise<void>;
}

export interface PositionTelephone {
  lat: number;
  lon: number;
  precision: number | null;
}

/** Transforme une erreur Supabase (objet simple) en vraie Error lisible. */
export function enErreur(e: unknown): Error {
  if (e instanceof Error) return e;
  const msg = (e as { message?: string } | null)?.message;
  return new Error(msg || 'Erreur inconnue');
}
