import { lundiDe, ajouterJours, type StatutIntervention } from '@chantio/shared';

// Filtres de la liste, lus à la fois par la page serveur (?statut=, ?periode=) et par la liste dans le navigateur.
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

export const PERIODES = [
  ['toutes', 'Toutes les dates'],
  ['aujourdhui', 'Aujourd’hui'],
  ['semaine', 'Cette semaine'],
  ['avenir', 'À venir'],
  ['passees', 'Passées'],
] as const;

export type Periode = (typeof PERIODES)[number][0];

/**
 * L'intervention tombe-t-elle dans la période choisie (jour = date du jour, AAAA-MM-JJ) ?
 * Un chantier sur plusieurs jours compte tant qu'il n'est pas fini.
 */
export function dansPeriode(date: string | null, periode: Periode, jour: string, fin?: string | null): boolean {
  if (periode === 'toutes') return true;
  if (!date) return false;
  const dernier = fin && fin > date ? fin : date;
  if (periode === 'aujourdhui') return date <= jour && jour <= dernier;
  if (periode === 'avenir') return dernier >= jour;
  if (periode === 'passees') return dernier < jour;
  const lundi = lundiDe(jour);
  return date <= ajouterJours(lundi, 6) && dernier >= lundi;
}
