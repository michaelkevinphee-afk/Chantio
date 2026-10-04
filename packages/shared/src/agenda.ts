// Invitations d'agenda (format iCalendar, .ics) : comprises par Gmail, Outlook, Apple Calendrier.

export interface RendezVous {
  /** Identifiant stable (celui de l'intervention) : l'agenda met à jour le même rendez-vous. */
  uid: string;
  titre: string;
  description?: string;
  lieu?: string;
  date: string; // AAAA-MM-JJ
  heure?: string | null; // HH:MM ou HH:MM:SS ; sans heure = journée entière
  /** Dernier jour d'un chantier sur plusieurs jours : rendez-vous sur des journées entières. */
  dateFin?: string | null;
  dureeMinutes?: number;
  organisateur?: { nom: string; email: string };
  participants?: { nom: string; email: string }[];
  /** Annule le rendez-vous chez les participants. */
  annule?: boolean;
  /** Doit augmenter à chaque modification ; par défaut, l'horodatage en secondes. */
  sequence?: number;
}

// Fuseau de Paris, pour que l'heure tombe juste même l'hiver et chez un agenda réglé ailleurs.
const FUSEAU_PARIS = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const echapper = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Coupe les lignes à 75 octets, comme l'exige le format. */
function plier(ligne: string): string {
  const octets = new TextEncoder().encode(ligne);
  if (octets.length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = '';
  let taille = 0;
  for (const ch of ligne) {
    const t = new TextEncoder().encode(ch).length;
    if (taille + t > (morceaux.length ? 74 : 75)) {
      morceaux.push(courant);
      courant = '';
      taille = 0;
    }
    courant += ch;
    taille += t;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const compact = (date: string) => date.replace(/-/g, '');

function horodatageUTC(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Ajoute des minutes à une date et une heure locales (sans fuseau). */
function decaler(date: string, heure: string, minutes: number) {
  const [a, m, j] = date.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j, h, mi + minutes));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

/** Fichier .ics d'un rendez-vous : invitation (REQUEST), annulation (CANCEL), ou simple ajout (PUBLISH). */
export function fichierAgenda(r: RendezVous, maintenant: Date = new Date()): string {
  const methode = r.annule ? 'CANCEL' : r.organisateur && r.participants?.length ? 'REQUEST' : 'PUBLISH';
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chantio//Interventions//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${methode}`,
  ];
  const plusieursJours = !!r.dateFin && r.dateFin > r.date;
  const avecHeure = !!r.heure && !plusieursJours;
  if (avecHeure) lignes.push(...FUSEAU_PARIS);
  lignes.push(
    'BEGIN:VEVENT',
    `UID:${r.uid}@chantio`,
    `DTSTAMP:${horodatageUTC(maintenant)}`,
    `SEQUENCE:${r.sequence ?? Math.floor(maintenant.getTime() / 1000)}`,
  );
  if (avecHeure && r.heure) {
    const debut = r.heure.slice(0, 5);
    lignes.push(
      `DTSTART;TZID=Europe/Paris:${decaler(r.date, debut, 0)}`,
      `DTEND;TZID=Europe/Paris:${decaler(r.date, debut, r.dureeMinutes ?? 60)}`,
    );
  } else {
    const [a, m, j] = (plusieursJours ? r.dateFin! : r.date).split('-').map(Number);
    const lendemain = new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10);
    lignes.push(`DTSTART;VALUE=DATE:${compact(r.date)}`, `DTEND;VALUE=DATE:${compact(lendemain)}`);
  }
  lignes.push(`SUMMARY:${echapper(r.titre)}`);
  if (r.description) lignes.push(`DESCRIPTION:${echapper(r.description)}`);
  if (r.lieu) lignes.push(`LOCATION:${echapper(r.lieu)}`);
  if (r.organisateur) lignes.push(`ORGANIZER;CN=${echapper(r.organisateur.nom)}:mailto:${r.organisateur.email}`);
  for (const p of r.participants ?? []) {
    lignes.push(`ATTENDEE;CN=${echapper(p.nom)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${p.email}`);
  }
  lignes.push(`STATUS:${r.annule ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}

/** Lundi de la semaine d'une date (AAAA-MM-JJ). */
export function lundiDe(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
