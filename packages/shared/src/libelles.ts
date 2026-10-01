import type {
  ResultatFiche,
  RoleMembre,
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

export type Ton = 'gris' | 'bleu' | 'jaune' | 'vert' | 'rouge';

export const TON_STATUT: Record<StatutIntervention, Ton> = {
  a_planifier: 'gris',
  planifiee: 'bleu',
  en_cours: 'jaune',
  terminee: 'jaune',
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

export const LIBELLE_TYPE_CLIENT: Record<TypeClient, string> = {
  particulier: 'Particulier',
  syndic: 'Syndic',
  bailleur: 'Bailleur',
  entreprise: 'Entreprise',
  collectivite: 'Collectivité',
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
