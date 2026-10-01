// Gabarit de la fiche plomberie / chauffage du MVP.
// Rien de propre à un métier n'est codé ailleurs : un nouveau métier
// ajoutera ses propres listes ici (puis dans la base, en V2).

import type { CodeMesure, ResultatFiche } from './types.ts';

export const MOTIFS = [
  'Entretien',
  'Fuite',
  'Panne',
  'Odeur de gaz',
  'Bruit',
  'Installation',
  'Autre',
] as const;

export const CONSTATS = [
  'Fuite',
  'Joint usé',
  'Pièce cassée',
  'Entartrage',
  'Pression basse',
  'Mauvaise combustion',
  'Problème électrique',
  'RAS',
] as const;

export const FOURNITURES_FREQUENTES = [
  'Joint fibre 3/4',
  'Joint fibre 1/2',
  'Flexible inox',
  "Robinet d'arrêt",
  'Siphon',
  "Mécanisme chasse d'eau",
  'Kit entretien',
  "Électrode d'allumage",
  'Raccord laiton',
] as const;

export interface DefinitionMesure {
  code: CodeMesure;
  libelle: string;
  unite: string;
  pas: number;
  /** Plage normale ; en dehors, la mesure est signalée. */
  min?: number;
  max?: number;
}

export const MESURES: DefinitionMesure[] = [
  { code: 'co', libelle: 'CO ambiant', unite: 'ppm', pas: 1, max: 50 },
  { code: 'co2', libelle: 'CO₂ des fumées', unite: '%', pas: 0.1, min: 8, max: 10 },
  { code: 't_fumees', libelle: 'Température des fumées', unite: '°C', pas: 1 },
  { code: 'pression', libelle: 'Pression du circuit', unite: 'bar', pas: 0.1, min: 1, max: 2 },
];

export type EtatMesure = 'vide' | 'ok' | 'alerte';

export function etatMesure(code: CodeMesure, valeur: number | null | undefined): EtatMesure {
  if (valeur == null || Number.isNaN(valeur)) return 'vide';
  const def = MESURES.find((m) => m.code === code);
  if (!def) return 'ok';
  if (def.min != null && valeur < def.min) return 'alerte';
  if (def.max != null && valeur > def.max) return 'alerte';
  return 'ok';
}

export const RESULTATS: ResultatFiche[] = ['termine', 'a_reprendre', 'attente_piece', 'devis_a_etablir'];
