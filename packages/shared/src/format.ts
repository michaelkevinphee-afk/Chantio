// Mise en forme en français (dates, heures, durées, adresses).

const pad = (n: number) => String(n).padStart(2, '0');

/** Date du jour au format AAAA-MM-JJ, en heure locale. */
export function aujourdhui(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ajouterJours(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  return aujourdhui(new Date(a, m - 1, j + n));
}

function versDate(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}

/** « lundi 6 octobre » */
export function dateLongue(iso: string): string {
  return versDate(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** « Aujourd'hui », « Demain » ou « 6 oct. » */
export function dateCourte(iso: string | null, reference: string = aujourdhui()): string {
  if (!iso) return 'Sans date';
  if (iso === reference) return "Aujourd'hui";
  if (iso === ajouterJours(reference, 1)) return 'Demain';
  if (iso === ajouterJours(reference, -1)) return 'Hier';
  return versDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** « 08:30:00 » → « 8 h 30 » */
export function heure(h: string | null): string {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)} h ${mm}`;
}

/** 75 → « 1 h 15 », 45 → « 45 min » */
export function duree(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)}`;
}

export function adresseComplete(site: { adresse: string; code_postal?: string | null; ville?: string | null } | null): string {
  if (!site) return '';
  const ville = [site.code_postal, site.ville].filter(Boolean).join(' ');
  return [site.adresse, ville].filter(Boolean).join(', ');
}

/** N° d'intervention affiché : « N° 0042 » */
export function numero(n: number): string {
  return `N° ${String(n).padStart(4, '0')}`;
}
