// Mise en forme en français (dates, heures, durées, adresses).

import type { Ton } from './libelles.ts';
import type { TypeIntervention } from './types.ts';

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

/** N° d'intervention par type (« DEP-2026-0001 »), ou l'ancien « N° 0042 » s'il n'en a pas encore. */
export function numeroIntervention(i: { reference?: string | null; numero: number }): string {
  return i.reference || numero(i.numero);
}

/** Préfixe du numéro d'une intervention, comme dans la base (prive.prefixe_intervention). */
export function prefixeIntervention(type: string): 'DEP' | 'CH' | 'ENT' {
  return type === 'depannage' || type === 'sav' ? 'DEP' : type === 'entretien' ? 'ENT' : 'CH';
}

// ---------- Formats courts du bureau (tableaux, listes, puces) ----------

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « Christophe R. » (prénom + initiale du nom) ; le prénom seul s'il n'y a pas de nom. */
export function nomCourt(prenom: string, nom?: string | null): string {
  const p = prenom.trim();
  const n = nom?.trim();
  return n ? `${p} ${n[0].toUpperCase()}.` : p;
}

/** « 2026-10-03 » (ou un horodatage) → « 3 oct. 2026 » ; chaîne vide sans date. */
export function dateMois(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS_COURTS[m - 1]} ${a}`;
}

/** « 2026-10-03 » → « 03/10 » ; chaîne vide sans date. */
export function jjmm(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Les trois familles d'interventions du bureau (filtres, couleurs, numéros DEP / CH / ENT). */
export type FamilleIntervention = 'depannage' | 'chantier' | 'entretien';

/** Famille d'un type d'intervention, calquée sur prefixeIntervention : SAV = dépannage, le reste = chantier. */
export function familleIntervention(type: TypeIntervention | string): FamilleIntervention {
  return type === 'depannage' || type === 'sav' ? 'depannage' : type === 'entretien' ? 'entretien' : 'chantier';
}

/** Libellés des familles, au pluriel (menu « Tous les types », légendes). */
export const LIBELLE_FAMILLE: Record<FamilleIntervention, string> = {
  depannage: 'Dépannages',
  chantier: 'Chantiers',
  entretien: 'Entretiens',
};

/** Couleur de la pastille de type : dépannage en rouge, chantier en bleu, entretien en vert. */
export const TON_FAMILLE: Record<FamilleIntervention, Ton> = {
  depannage: 'rouge',
  chantier: 'bleu',
  entretien: 'vert',
};

// ---------- Interventions du bureau (liste, volet, fenêtre de création) ----------

const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

/** « 2026-10-02 » → « Ven. 2 oct. » (jour de la semaine abrégé, sans l'année). */
export function jourCourt(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${JOURS_COURTS[new Date(Date.UTC(a, m - 1, j)).getUTCDay()]} ${j} ${MOIS_COURTS[m - 1]}`;
}

/** « 14:30:00 » → « 14:30 » ; chaîne vide sans heure. */
export function heureCourte(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : '';
}

/**
 * Colonne « Quand » de la liste des interventions, comme le bac :
 * « à placer », « souhaitée le 12/10 », « du 12/10 au 16/10 », « Aujourd’hui · 14:30 », « Ven. 2 oct. · 14:00 ».
 * Jamais « Demain » ni « Hier ».
 */
export function quandLigneIntervention(
  i: { date_prevue: string | null; heure_prevue: string | null; date_fin?: string | null; souhaitee_le?: string | null },
  jour: string,
): string {
  if (!i.date_prevue) return i.souhaitee_le ? `souhaitée le ${jjmm(i.souhaitee_le)}` : 'à placer';
  if (i.date_fin && i.date_fin > i.date_prevue) return `du ${jjmm(i.date_prevue)} au ${jjmm(i.date_fin)}`;
  const h = heureCourte(i.heure_prevue);
  return `${i.date_prevue === jour ? 'Aujourd’hui' : jourCourt(i.date_prevue)}${h ? ` · ${h}` : ''}`;
}

/**
 * Qui reçoit la facture : pour un syndic ou un bailleur, la copropriété de l'immeuble « représentée par » le client
 * (« Syndicat des copropriétaires du 12 rue de la Pompe, représenté par Cabinet Dupré Gestion ») ; sinon le client.
 */
export function payeurTexte(
  client: { nom: string; type: string } | null | undefined,
  site?: { adresse: string; copropriete?: string | null } | null,
): string {
  if (!client) return '';
  if ((client.type === 'syndic' || client.type === 'bailleur') && site) {
    const copro = site.copropriete?.trim() || (client.type === 'syndic' ? `Syndicat des copropriétaires du ${site.adresse}` : '');
    if (copro) return `${copro}, représenté par ${client.nom}`;
  }
  return client.nom;
}

/** « intervention DEP-2026-0145, 12 rue de la Pompe, Mme Martin, ordre de service 55790 » (mentions d'une facture de syndic). */
export function mentionsFacture(m: { reference: string; adresse?: string | null; occupant?: string | null; ordre_service?: string | null }): string {
  return [
    `intervention ${m.reference}`,
    m.adresse,
    m.occupant,
    m.ordre_service?.trim() ? `ordre de service ${m.ordre_service.trim()}` : 'n° d’ordre de service à renseigner',
  ]
    .filter(Boolean)
    .join(', ');
}
