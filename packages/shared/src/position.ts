// Équipe en direct : quand la position d'un technicien peut être partagée, et
// comment la présenter au bureau. La base applique les mêmes règles
// (prive.en_heures_de_travail) : ce calcul sert seulement à ne pas allumer le GPS pour rien.

export interface HorairesPosition {
  /** Jours ISO : 1 = lundi … 7 = dimanche. */
  jours: number[];
  /** « 07:30 » */
  debut: string;
  fin: string;
  pause_debut?: string;
  pause_fin?: string;
}

export const HORAIRES_POSITION: HorairesPosition = {
  jours: [1, 2, 3, 4, 5],
  debut: '07:30',
  fin: '18:30',
  pause_debut: '12:00',
  pause_fin: '13:30',
};

/** Dernière position partagée d'un membre (table positions). */
export interface PositionMembre {
  membre_id: string;
  latitude: number;
  longitude: number;
  precision_m: number | null;
  enregistree_le: string;
}

/** Arrivée (Démarrer) ou départ (Terminer) noté sur une intervention (table pointages). */
export interface Pointage {
  intervention_id: string;
  membre_id: string;
  genre: 'arrivee' | 'depart';
  latitude: number | null;
  longitude: number | null;
  le: string;
}

/** Envoi de la position toutes les 2 minutes ; au-delà de 15 minutes, elle n'est plus affichée. */
export const INTERVALLE_POSITION_MS = 2 * 60_000;
export const POSITION_PERIMEE_MS = 15 * 60_000;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Heure et jour à Paris, quel que soit le fuseau de l'appareil. */
function heureDeParis(d: Date): { jour: number; min: number } {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const jours = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return { jour: jours.indexOf(v('weekday')) + 1, min: Number(v('hour')) * 60 + Number(v('minute')) };
}

export function enHeuresDeTravail(h: HorairesPosition | null | undefined, d = new Date()): boolean {
  const r = h ?? HORAIRES_POSITION;
  const { jour, min } = heureDeParis(d);
  if (!r.jours.includes(jour)) return false;
  if (min < minutes(r.debut) || min >= minutes(r.fin)) return false;
  if (r.pause_debut && r.pause_fin && min >= minutes(r.pause_debut) && min < minutes(r.pause_fin)) return false;
  return true;
}

/** « du lundi au vendredi, de 7:30 à 18:30, hors pause de 12:00 à 13:30 » */
export function decrireHoraires(h: HorairesPosition | null | undefined): string {
  const r = h ?? HORAIRES_POSITION;
  const noms = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const j = [...r.jours].sort();
  const suite = j.length > 1 && j.every((x, i) => i === 0 || x === j[i - 1] + 1);
  const jours = !j.length ? 'aucun jour' : j.length === 7 ? 'tous les jours' : suite ? `du ${noms[j[0] - 1]} au ${noms[j[j.length - 1] - 1]}` : j.map((x) => noms[x - 1]).join(', ');
  const hh = (t: string) => t.replace(/^0/, '');
  const pause = r.pause_debut && r.pause_fin ? `, hors pause de ${hh(r.pause_debut)} à ${hh(r.pause_fin)}` : '';
  return `${jours}, de ${hh(r.debut)} à ${hh(r.fin)}${pause}`;
}

/** « il y a 40 s », « il y a 3 min » */
export function depuisQuand(iso: string, maintenant = Date.now()): string {
  const s = Math.max(0, Math.round((maintenant - new Date(iso).getTime()) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `il y a ${Math.floor(s / 3600)} h`;
}
