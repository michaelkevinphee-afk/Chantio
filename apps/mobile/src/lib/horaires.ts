// Petits calculs d'heures pour l'affichage terrain.
import { aujourdhui } from '@chantio/shared';

/** « 08:30:00 » → « 8:30 » (comme sur la maquette). */
export function heureCourte(h: string | null | undefined): string {
  if (!h) return '--:--';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}:${mm}`;
}

/** Minutes avant l'heure prévue d'aujourd'hui (négatif si elle est passée), null sinon. */
export function minutesAvant(date: string | null, h: string | null, maintenant = new Date()): number | null {
  if (!h || date !== aujourdhui()) return null;
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm - (maintenant.getHours() * 60 + maintenant.getMinutes());
}

/** 12 → « 12 min », 80 → « 1 h 20 ». */
export function delai(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}
