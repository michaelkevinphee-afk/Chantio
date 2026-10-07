import { PRIX_FORMULE_HT, type Ton } from './libelles.ts';
import type { Formule } from './types.ts';

// Console Chantio : l'espace de l'équipe Chantio (adresse /console du site).
// Les droits sont vérifiés par la base (supabase/migrations/20261016000000_console.sql) ;
// ce fichier sert à l'affichage et au calcul du revenu mensuel.

/** État du compte d'une entreprise chez Chantio. */
export type StatutAbonnement = 'essai' | 'actif' | 'offert' | 'resilie';

export const LIBELLE_STATUT_ABONNEMENT: Record<StatutAbonnement, string> = {
  essai: 'En essai',
  actif: 'Payant',
  offert: 'Offert',
  resilie: 'Résilié',
};

export const TON_STATUT_ABONNEMENT: Record<StatutAbonnement, Ton> = {
  essai: 'violet',
  actif: 'vert',
  offert: 'bleu',
  resilie: 'gris',
};

/** Ce que veut dire chaque état, pour l'équipe Chantio. */
export const AIDE_STATUT_ABONNEMENT: Record<StatutAbonnement, string> = {
  essai: 'Essai gratuit jusqu’à la date indiquée.',
  actif: 'Client payant : compté dans le revenu mensuel.',
  offert: 'Gratuit (client pilote, partenaire) : pas compté dans le revenu.',
  resilie: 'Contrat terminé.',
};

/** Options payantes en plus de la formule (prix du business plan, à confirmer). */
export type OptionAbonnement = 'compta' | 'entreprise_sup';

export const OPTIONS_ABONNEMENT: Record<OptionAbonnement, { libelle: string; prix: number; description: string }> = {
  compta: { libelle: 'Connecteur comptable', prix: 15, description: 'Envoi des ventes et des achats au logiciel de l’expert-comptable.' },
  entreprise_sup: { libelle: 'Entreprise supplémentaire', prix: 29, description: 'Une deuxième société gérée avec le même compte.' },
};

/** Utilisateurs compris dans chaque formule, et prix HT par utilisateur en plus (null : pas d'utilisateur en plus). */
export const UTILISATEURS_FORMULE: Record<Formule, { inclus: number; parUtilisateur: number | null }> = {
  solo: { inclus: 2, parUtilisateur: null },
  equipe: { inclus: 3, parUtilisateur: 15 },
  entreprise: { inclus: 8, parUtilisateur: 12 },
};

/** Les rôles de l'équipe Chantio. */
export type RoleChantio = 'proprietaire' | 'support' | 'commercial';

export const LIBELLE_ROLE_CHANTIO: Record<RoleChantio, string> = {
  proprietaire: 'Propriétaire',
  support: 'Support',
  commercial: 'Commercial',
};

/** Les droits, comme la fonction prive.console_peut() de la base. */
export type DroitConsole = 'voir' | 'abonnement' | 'assistance' | 'identite' | 'idees' | 'equipe';

const DROITS: Record<RoleChantio, DroitConsole[]> = {
  proprietaire: ['voir', 'abonnement', 'assistance', 'identite', 'idees', 'equipe'],
  support: ['voir', 'assistance', 'identite', 'idees'],
  commercial: ['voir', 'abonnement', 'idees'],
};

export function peutConsole(role: RoleChantio | null | undefined, droit: DroitConsole): boolean {
  return !!role && (DROITS[role]?.includes(droit) ?? false);
}

/** Le tableau « Ce que chaque rôle peut faire » de l'écran Équipe Chantio. */
export const TABLEAU_DROITS: { libelle: string; droit: DroitConsole }[] = [
  { libelle: 'Voir les entreprises, leurs utilisateurs et leurs volumes', droit: 'voir' },
  { libelle: 'Changer une formule, un prix, l’état d’un compte ; créer une entreprise', droit: 'abonnement' },
  { libelle: 'Assistance chez un client (avec son accord)', droit: 'assistance' },
  { libelle: 'Valider l’identité d’un dirigeant', droit: 'identite' },
  { libelle: 'Suivre les idées des clients', droit: 'idees' },
  { libelle: 'Gérer l’équipe Chantio', droit: 'equipe' },
];

export interface AbonnementCalcul {
  formule: Formule;
  statut: StatutAbonnement;
  /** Prix mensuel HT négocié (null : prix de la formule). */
  prix_special: number | string | null;
  options: string[];
  /** Comptes actifs de l'entreprise. */
  utilisateurs: number;
}

/** Ce que l'entreprise paierait chaque mois hors taxe avec sa formule, ses utilisateurs et ses options. */
export function prixMensuel(a: AbonnementCalcul): number {
  if (a.prix_special != null && a.prix_special !== '') return Number(a.prix_special) || 0;
  const u = UTILISATEURS_FORMULE[a.formule] ?? UTILISATEURS_FORMULE.equipe;
  const enPlus = u.parUtilisateur == null ? 0 : Math.max(0, a.utilisateurs - u.inclus) * u.parUtilisateur;
  const options = a.options.reduce((s, o) => s + (OPTIONS_ABONNEMENT[o as OptionAbonnement]?.prix ?? 0), 0);
  return (PRIX_FORMULE_HT[a.formule] ?? 0) + enPlus + options;
}

/** Revenu mensuel récurrent : seuls les clients payants comptent. */
export function revenuMensuel(a: AbonnementCalcul): number {
  return a.statut === 'actif' ? prixMensuel(a) : 0;
}

/** La formule Artisan ne prévoit pas d'utilisateur en plus : signalé quand elle est dépassée. */
export function depasseFormule(formule: Formule, utilisateurs: number): boolean {
  const u = UTILISATEURS_FORMULE[formule];
  return !!u && u.parUtilisateur == null && utilisateurs > u.inclus;
}

/** Jours d'essai restants (négatif : essai terminé). Dates au format AAAA-MM-JJ. */
export function joursRestants(fin: string, aujourdhui: string): number {
  return Math.round((Date.parse(`${fin.slice(0, 10)}T00:00:00Z`) - Date.parse(`${aujourdhui.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** Durées proposées pour une session d'assistance (en minutes). */
export const DUREES_ASSISTANCE: { minutes: number; libelle: string }[] = [
  { minutes: 30, libelle: '30 minutes' },
  { minutes: 60, libelle: '1 heure' },
  { minutes: 240, libelle: '4 heures' },
  { minutes: 1440, libelle: '24 heures' },
];

/** Ce que l'équipe Chantio peut faire pendant une session d'assistance (choisi par le dirigeant). */
export type ModeAssistance = 'lecture' | 'modification';
export const MODES_ASSISTANCE: { mode: ModeAssistance; libelle: string }[] = [
  { mode: 'lecture', libelle: 'Lecture seule' },
  { mode: 'modification', libelle: 'Lecture et modification' },
];

export function dureeLisible(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Taille lisible d'un stockage (octets → « 3,1 Go »). */
export function tailleLisible(octets: number): string {
  const unites = ['octets', 'Ko', 'Mo', 'Go', 'To'];
  let v = octets;
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) {
    v /= 1000;
    i++;
  }
  return `${i ? v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 }) : v} ${unites[i]}`;
}
