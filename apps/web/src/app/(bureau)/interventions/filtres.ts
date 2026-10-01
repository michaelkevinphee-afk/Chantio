import type { StatutIntervention } from '@chantio/shared';

// Filtres de la liste, lus à la fois par la page serveur (?statut=) et par la liste dans le navigateur.
export const FILTRES: (StatutIntervention | 'toutes')[] = [
  'toutes',
  'a_planifier',
  'planifiee',
  'en_cours',
  'terminee',
  'a_reprendre',
  'validee',
  'facturee',
];
