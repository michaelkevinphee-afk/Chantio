// Adresses du planning, partagées entre la page (serveur) et le calendrier (navigateur).
// ?semaine=AAAA-MM-JJ (lundi) ou ?mois=AAAA-MM (vue Mois), ?familles=chantier,entretien (cases cochées,
// absent = les trois), ?fiche=<id> (volet d'une intervention), ?nouvelle=1&date&moment&technicien (création).

import type { FamilleIntervention } from '@chantio/shared';
import { PARAMS_FICHE, PARAMS_NOUVELLE } from '../interventions/adresse';

/** Les trois cases à cocher du bac, dans son ordre. */
export const FAMILLES: FamilleIntervention[] = ['chantier', 'depannage', 'entretien'];

/** Familles cochées lues dans l'adresse ; absent = les trois. */
export function lireFamilles(v: unknown): FamilleIntervention[] {
  if (typeof v !== 'string') return FAMILLES;
  const choisies = v.split(',');
  return FAMILLES.filter((f) => choisies.includes(f));
}

/** Valeur de ?familles : null (retiré) quand les trois sont cochées. */
export function ecrireFamilles(montrees: ReadonlySet<FamilleIntervention>): string | null {
  const liste = FAMILLES.filter((f) => montrees.has(f));
  return liste.length === FAMILLES.length ? null : liste.join(',');
}

/** Paramètres du volet et de la fenêtre de création : ils ne suivent pas quand on change de semaine ou de vue. */
export const PARAMS_PASSAGERS: readonly string[] = [...PARAMS_FICHE, ...PARAMS_NOUVELLE];

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Adresse du planning à partir des paramètres actuels : le volet et la fenêtre sont retirés, puis
 * les changements appliqués (null = retiré). La semaine, la vue et les familles cochées sont gardées.
 */
export function adressePlanning(actuels: Params, changements: Record<string, string | null> = {}): string {
  const p = new URLSearchParams();
  const entrees = actuels instanceof URLSearchParams ? [...actuels.entries()] : Object.entries(actuels);
  for (const [cle, v] of entrees) if (typeof v === 'string' && !PARAMS_PASSAGERS.includes(cle)) p.set(cle, v);
  for (const [cle, v] of Object.entries(changements)) {
    if (v === null) p.delete(cle);
    else p.set(cle, v);
  }
  const qs = p.toString();
  return qs ? `/planning?${qs}` : '/planning';
}
