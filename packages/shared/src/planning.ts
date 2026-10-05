// Planning par demi-journée : un dépannage occupe le matin ou l'après-midi de
// son jour, un chantier toutes les demi-journées de son premier à son dernier
// jour (les week-ends sautés, sauf s'il commence ou finit ce jour-là). Sert au
// planning du bureau, à la charge de chaque technicien et à « Ma journée ».

import { ajouterJours } from './format.ts';

export type Demi = 0 | 1;

/** Ce qu'il faut d'une intervention pour la placer au planning. */
export interface Creneau {
  date_prevue: string | null;
  heure_prevue: string | null;
  /** Dernier jour d'un chantier sur plusieurs jours. */
  date_fin?: string | null;
  /** Le dernier jour se termine à midi. */
  fin_midi?: boolean | null;
  /** Durée prévue (h) d'une intervention d'un jour. */
  duree_prevue?: number | null;
}

/** Heures comptées pour une demi-journée de chantier. */
export const HEURES_DEMI_JOURNEE = 3.75;
/** Heure posée quand on place une intervention le matin ou l'après-midi. */
export const HEURE_DEMI: Record<Demi, string> = { 0: '08:30', 1: '14:00' };
/** Heure de début d'un chantier, le matin ou l'après-midi. */
export const HEURE_CHANTIER: Record<Demi, string> = { 0: '08:00', 1: '13:30' };

export const LIBELLE_DEMI: Record<Demi, string> = { 0: 'matin', 1: 'après-midi' };
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Lundi = 0 … dimanche = 6. */
export function jourSemaine(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number);
  return (new Date(Date.UTC(a, m - 1, j)).getUTCDay() + 6) % 7;
}

/** Numéro de semaine ISO 8601 (« Semaine 40 » du planning) : la semaine du lundi 28 septembre 2026 est la 40e. */
export function numeroSemaine(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number);
  // Le jeudi de la semaine donne l'année ; la semaine 1 est celle du 4 janvier.
  const jeudi = Date.UTC(a, m - 1, j + 3 - jourSemaine(iso));
  const annee = new Date(jeudi).getUTCFullYear();
  const quatre = Date.UTC(annee, 0, 4);
  const jeudi1 = quatre + (3 - ((new Date(quatre).getUTCDay() + 6) % 7)) * 86_400_000;
  return 1 + Math.round((jeudi - jeudi1) / (7 * 86_400_000));
}

/**
 * Va dans « À placer au planning » : toute intervention à planifier (même datée, sans technicien),
 * et toute intervention sans date qui n'est ni validée ni facturée. Même règle que le bac.
 */
export function aPlacer(i: { statut: string; date_prevue: string | null }): boolean {
  return i.statut === 'a_planifier' || (!i.date_prevue && i.statut !== 'validee' && i.statut !== 'facturee');
}

const ecartJours = (de: string, a: string) => {
  const t = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(a) - t(de)) / 86_400_000);
};

/** Commence l'après-midi : heure prévue à midi ou après. */
export const demiDebut = (i: Pick<Creneau, 'heure_prevue'>): Demi => (i.heure_prevue && i.heure_prevue.slice(0, 5) >= '12:00' ? 1 : 0);

export const surPlusieursJours = (i: Creneau) => !!i.date_prevue && !!i.date_fin && i.date_fin > i.date_prevue;

/** Dernier jour occupé (le jour prévu pour une intervention d'un jour). */
export const dernierJour = (i: Creneau): string | null => (surPlusieursJours(i) ? i.date_fin! : i.date_prevue);

/** L'intervention occupe ce jour. */
export function occupe(i: Creneau, jour: string): boolean {
  if (!i.date_prevue) return false;
  if (!surPlusieursJours(i)) return i.date_prevue === jour;
  if (jour < i.date_prevue || jour > i.date_fin!) return false;
  return jourSemaine(jour) < 5 || jour === i.date_prevue || jour === i.date_fin;
}

/** [matin, après-midi] occupés ce jour. Une intervention d'un jour de plus de 4 h déborde sur l'après-midi. */
export function demiJournees(i: Creneau, jour: string): [boolean, boolean] {
  if (!occupe(i, jour)) return [false, false];
  const debut = demiDebut(i);
  if (!surPlusieursJours(i)) return debut === 1 ? [false, true] : [true, Number(i.duree_prevue) > 4];
  return [!(jour === i.date_prevue && debut === 1), !(jour === i.date_fin && i.fin_midi)];
}

/** Heures de travail comptées ce jour (charge du technicien). */
export function heuresDuJour(i: Creneau, jour: string): number {
  const [m, a] = demiJournees(i, jour);
  if (surPlusieursJours(i)) return (m ? HEURES_DEMI_JOURNEE : 0) + (a ? HEURES_DEMI_JOURNEE : 0);
  return m || a ? Number(i.duree_prevue) || 1 : 0;
}

/** Heures prévues sur une liste de jours. */
export const heuresSur = (i: Creneau, jours: string[]) => jours.reduce((t, j) => t + heuresDuJour(i, j), 0);

/** Décale une demi-journée de « delta » demi-journées (négatif pour reculer). */
export function decalerDemi(date: string, demi: Demi, delta: number): { date: string; demi: Demi } {
  const t = demi + delta;
  const jours = Math.floor(t / 2);
  return { date: ajouterJours(date, jours), demi: (t - jours * 2) as Demi };
}

/** Ce qui change quand on dépose une intervention au planning. */
export type Deplacement = Pick<Creneau, 'date_prevue' | 'heure_prevue' | 'date_fin'> & { fin_midi: boolean };

/**
 * Nouvelle place d'une intervention déposée sur une demi-journée. Un chantier
 * attrapé par une de ses demi-journées glisse d'autant en gardant sa longueur ;
 * venu d'ailleurs (« À planifier », autre ligne), il commence sur la case visée
 * et garde son nombre de jours. Une intervention d'un jour garde son heure si
 * elle reste dans la même demi-journée.
 */
export function deplacer(i: Creneau, cible: { jour: string; demi: Demi }, attrape?: { jour: string; demi: Demi } | null): Deplacement {
  const debut = demiDebut(i);
  if (surPlusieursJours(i) && i.date_prevue) {
    const fin: Demi = i.fin_midi ? 0 : 1;
    const delta = attrape ? ecartJours(attrape.jour, cible.jour) * 2 + cible.demi - attrape.demi : null;
    if (delta !== null) {
      const d1 = decalerDemi(i.date_prevue, debut, delta);
      const d2 = decalerDemi(i.date_fin!, fin, delta);
      return {
        date_prevue: d1.date,
        heure_prevue: d1.demi === debut && i.heure_prevue ? i.heure_prevue.slice(0, 5) : HEURE_CHANTIER[d1.demi],
        date_fin: d2.date,
        fin_midi: d2.demi === 0,
      };
    }
    const longueur = ecartJours(i.date_prevue, i.date_fin!);
    return {
      date_prevue: cible.jour,
      heure_prevue: cible.demi === debut && i.heure_prevue ? i.heure_prevue.slice(0, 5) : HEURE_CHANTIER[cible.demi],
      date_fin: ajouterJours(cible.jour, longueur),
      fin_midi: !!i.fin_midi,
    };
  }
  return {
    date_prevue: cible.jour,
    heure_prevue: i.heure_prevue && demiDebut(i) === cible.demi ? i.heure_prevue.slice(0, 5) : HEURE_DEMI[cible.demi],
    date_fin: null,
    fin_midi: false,
  };
}

/** Demi-journée gardée pour les urgences : 0 = lundi matin … 13 = dimanche après-midi. */
export const indexDemi = (jour: string, demi: Demi) => jourSemaine(jour) * 2 + demi;

/** « jeudi après-midi », « lundi matin et mardi » … */
export function texteReserve(reserve: number[]): string {
  const parJour = new Map<number, Demi[]>();
  for (const k of [...reserve].sort((a, b) => a - b)) {
    const j = Math.floor(k / 2);
    parJour.set(j, [...(parJour.get(j) ?? []), (k % 2) as Demi]);
  }
  const morceaux = [...parJour].map(([j, demis]) => (demis.length === 2 ? JOURS[j] : `${JOURS[j]} ${LIBELLE_DEMI[demis[0]]}`));
  return morceaux.length > 1 ? `${morceaux.slice(0, -1).join(', ')} et ${morceaux[morceaux.length - 1]}` : (morceaux[0] ?? '');
}

/** « du lundi 6 au jeudi 9 octobre », pour un chantier sur plusieurs jours. */
export function periode(i: Creneau): string | null {
  if (!surPlusieursJours(i) || !i.date_prevue) return null;
  const d = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [a, m, j] = iso.split('-').map(Number);
    return new Date(a, m - 1, j).toLocaleDateString('fr-FR', opts);
  };
  const memeMois = i.date_prevue.slice(0, 7) === i.date_fin!.slice(0, 7);
  const debut = d(i.date_prevue, memeMois ? { weekday: 'long', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' });
  const debutApresMidi = demiDebut(i) === 1 ? ' après-midi' : '';
  const finMidi = i.fin_midi ? ', fin à midi' : '';
  return `du ${debut}${debutApresMidi} au ${d(i.date_fin!, { weekday: 'long', day: 'numeric', month: 'long' })}${finMidi}`;
}
