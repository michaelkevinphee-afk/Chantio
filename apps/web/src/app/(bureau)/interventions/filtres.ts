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

/** La date prévue tombe-t-elle dans la période choisie (jour = date du jour, AAAA-MM-JJ) ? */
export function dansPeriode(date: string | null, periode: Periode, jour: string): boolean {
  if (periode === 'toutes') return true;
  if (!date) return false;
  if (periode === 'aujourdhui') return date === jour;
  if (periode === 'avenir') return date >= jour;
  if (periode === 'passees') return date < jour;
  const lundi = lundiDe(jour);
  return date >= lundi && date <= ajouterJours(lundi, 6);
}
