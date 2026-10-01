// Accès aux données : une même interface pour Supabase et pour le mode démo,
// pour que les écrans n'aient pas à savoir d'où viennent les données.
import type { Entreprise, FicheAEnvoyer, Intervention, Membre, Site } from '@chantio/shared';

export interface InterventionVue extends Intervention {
  client: { nom: string; telephone: string | null; contact: string | null } | null;
  site: Pick<Site, 'adresse' | 'code_postal' | 'ville' | 'acces' | 'consignes'> | null;
  intervenants: { id: string; prenom: string }[];
}

export interface Profil {
  membre: Membre;
  entreprise: Pick<Entreprise, 'id' | 'nom'>;
}

export interface SourceDonnees {
  mode: 'supabase' | 'demo';
  /** Profil du compte connecté ; null s'il n'appartient à aucune entreprise. */
  chargerProfil(): Promise<Profil | null>;
  creerEntreprise(nom: string, prenom: string): Promise<void>;
  /** Interventions visibles (de aujourd'hui aux 30 prochains jours, plus celles en cours). */
  listerInterventions(): Promise<InterventionVue[]>;
  demarrer(interventionId: string): Promise<void>;
  envoyerPhoto(chemin: string, uriLocale: string): Promise<void>;
  envoyerFiche(fiche: FicheAEnvoyer): Promise<void>;
}

/** Transforme une erreur Supabase (objet simple) en vraie Error lisible. */
export function enErreur(e: unknown): Error {
  if (e instanceof Error) return e;
  const msg = (e as { message?: string } | null)?.message;
  return new Error(msg || 'Erreur inconnue');
}
