import type {
  Formule,
  ResultatFiche,
  RoleMembre,
  StatutIdentite,
  StatutIntervention,
  TypeClient,
  TypeIntervention,
  Urgence,
} from './types.ts';

export const LIBELLE_STATUT: Record<StatutIntervention, string> = {
  a_planifier: 'À planifier',
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'À valider',
  a_reprendre: 'À reprendre',
  validee: 'Validée',
  facturee: 'Facturée',
};

/** Pour le technicien, une fiche envoyée est simplement « terminée ». */
export const LIBELLE_STATUT_TERRAIN: Record<StatutIntervention, string> = {
  a_planifier: 'À faire',
  planifiee: 'À faire',
  en_cours: 'En cours',
  terminee: 'Terminée',
  a_reprendre: 'À reprendre',
  validee: 'Terminée',
  facturee: 'Terminée',
};

export type Ton = 'gris' | 'bleu' | 'cobalt' | 'violet' | 'vert' | 'rouge';

export const TON_STATUT: Record<StatutIntervention, Ton> = {
  a_planifier: 'gris',
  planifiee: 'bleu',
  en_cours: 'cobalt',
  terminee: 'violet',
  a_reprendre: 'rouge',
  validee: 'vert',
  facturee: 'gris',
};

export const LIBELLE_TYPE: Record<TypeIntervention, string> = {
  depannage: 'Dépannage',
  entretien: 'Entretien',
  installation: 'Installation',
  mise_en_service: 'Mise en service',
  sav: 'SAV',
  visite_technique: 'Visite technique',
  chantier: 'Chantier',
};

export const LIBELLE_URGENCE: Record<Urgence, string> = {
  normale: 'Normale',
  urgente: 'Urgente',
  astreinte: 'Astreinte',
};

export const LIBELLE_ROLE: Record<RoleMembre, string> = {
  dirigeant: 'Dirigeant',
  chef_chantier: 'Chef de chantier',
  assistant: 'Assistant(e)',
  technicien: 'Technicien',
  apprenti: 'Apprenti',
  sous_traitant: 'Sous-traitant',
};

/**
 * Accès d'un compte à une entreprise, comme ROLES_ACCES / roleAcces() du bac : « Dirigeant », « Bureau »
 * ou « Technicien » (sélecteur d'entreprise, « Gérer vos entreprises », « Mon profil »).
 */
export function libelleAcces(role: RoleMembre): 'Dirigeant' | 'Bureau' | 'Technicien' {
  if (role === 'dirigeant') return 'Dirigeant';
  return role === 'technicien' || role === 'apprenti' || role === 'sous_traitant' ? 'Technicien' : 'Bureau';
}

export const LIBELLE_FORMULE: Record<Formule, string> = {
  solo: 'Solo',
  equipe: 'Équipe',
  entreprise: 'Entreprise',
};

export const PRIX_FORMULE: Record<Formule, string> = {
  solo: '19 € / mois',
  equipe: '49 € / mois',
  entreprise: '149 € / mois',
};

export const LIBELLE_IDENTITE: Record<StatutIdentite, string> = {
  a_verifier: 'Identité à vérifier',
  en_attente: 'Vérification en cours',
  verifiee: 'Identité vérifiée',
  refusee: 'Vérification refusée',
};

export const TON_IDENTITE: Record<StatutIdentite, Ton> = {
  a_verifier: 'gris',
  en_attente: 'violet',
  verifiee: 'vert',
  refusee: 'rouge',
};

export const LIBELLE_TYPE_CLIENT: Record<TypeClient, string> = {
  particulier: 'Particulier',
  syndic: 'Syndic',
  bailleur: 'Bailleur',
  entreprise: 'Entreprise',
  collectivite: 'Collectivité',
};

/** Puces de « Mes clients » (FILTRES_C du bac) : « Tous » puis chaque type au pluriel. */
export const FILTRES_TYPE_CLIENT: readonly (readonly ['tous' | TypeClient, string])[] = [
  ['tous', 'Tous'],
  ['syndic', 'Syndics'],
  ['bailleur', 'Bailleurs'],
  ['particulier', 'Particuliers'],
  ['entreprise', 'Entreprises'],
  ['collectivite', 'Collectivités'],
];

/** Couleur de l'étiquette de type d'un client (TON_TYPE_C du bac) : syndic et bailleur en bleu, particulier en vert, entreprise et collectivité en violet. */
export const TON_TYPE_CLIENT: Record<TypeClient, Ton> = {
  syndic: 'bleu',
  bailleur: 'bleu',
  particulier: 'vert',
  entreprise: 'violet',
  collectivite: 'violet',
};

export const LIBELLE_RESULTAT: Record<ResultatFiche, string> = {
  termine: 'Terminé',
  a_reprendre: 'À reprendre',
  attente_piece: 'En attente de pièce',
  devis_a_etablir: 'Devis à établir',
};

/** Rôles qui travaillent depuis le bureau (voient et gèrent toute l'entreprise). */
export const ROLES_BUREAU: RoleMembre[] = ['dirigeant', 'chef_chantier', 'assistant'];
export const estBureau = (role: RoleMembre | null | undefined) => !!role && ROLES_BUREAU.includes(role);
export const peutValider = (role: RoleMembre | null | undefined) =>
  role === 'dirigeant' || role === 'chef_chantier';

/** Paramètres › Mon entreprise : formes juridiques proposées (comme le bac à sable). */
export const FORMES_JURIDIQUES = ['Entrepreneur individuel', 'EURL', 'SARL', 'SASU', 'SAS', 'SA', 'SNC', 'Autre'] as const;

/** Paramètres › Mon entreprise : secteurs d'activité (code NAF, libellé) du bâtiment. */
export const CODES_NAF: readonly (readonly [string, string])[] = [
  ['43.22A', 'Travaux d’installation d’eau et de gaz en tous locaux'],
  ['43.22B', 'Travaux d’installation d’équipements thermiques et de climatisation'],
  ['43.21A', 'Travaux d’installation électrique dans tous locaux'],
  ['43.29A', 'Travaux d’isolation'],
  ['43.29B', 'Autres travaux d’installation'],
  ['43.31Z', 'Travaux de plâtrerie'],
  ['43.32A', 'Travaux de menuiserie bois et PVC'],
  ['43.33Z', 'Travaux de revêtement des sols et des murs'],
  ['43.34Z', 'Travaux de peinture et vitrerie'],
  ['43.39Z', 'Autres travaux de finition'],
  ['43.91A', 'Travaux de charpente'],
  ['43.91B', 'Travaux de couverture par éléments'],
  ['43.99A', 'Travaux d’étanchéification'],
  ['43.99C', 'Travaux de maçonnerie générale et gros œuvre de bâtiment'],
  ['43.12A', 'Travaux de terrassement courants et travaux préparatoires'],
  ['41.20A', 'Construction de maisons individuelles'],
];

/** Paramètres › Personnalisation : couleur des devis et factures (clé, libellé, couleur). */
export const COULEURS_DOCUMENT = [
  ['marine', 'Bleu marine', '#101A3D'],
  ['cobalt', 'Bleu cobalt', '#2F54EB'],
  ['violet', 'Violet', '#5925DC'],
  ['vert', 'Vert', '#067647'],
  ['ardoise', 'Gris ardoise', '#475467'],
] as const;
export type CouleurDocument = (typeof COULEURS_DOCUMENT)[number][0];

/** Couleur (hexa) des documents de l'entreprise : bleu marine par défaut. */
export function couleurDocument(r?: { couleur_doc?: string } | null): string {
  return (COULEURS_DOCUMENT.find((c) => c[0] === r?.couleur_doc) ?? COULEURS_DOCUMENT[0])[2];
}

/** Paramètres › Tenue comptable : logiciel du cabinet (« Je ne sais pas » = vide). */
export const LOGICIELS_COMPTA = ['Sage', 'Cegid', 'EBP', 'Quadra', 'ACD', 'Pennylane', 'Autre'] as const;

/** Paramètres › Abonnement : prix hors taxe par mois et public de chaque formule. */
export const PRIX_FORMULE_HT: Record<Formule, number> = { solo: 19, equipe: 49, entreprise: 149 };
export const DESCRIPTION_FORMULE: Record<Formule, string> = {
  solo: 'Pour l’artisan seul',
  equipe: 'Pour une petite équipe avec ses techniciens',
  entreprise: 'Pour les PME et plusieurs équipes',
};
