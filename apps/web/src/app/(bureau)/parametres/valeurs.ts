// Petites conversions des Paramètres, utilisables côté serveur et côté navigateur.

/** « 1.45 » → « 1,45 » ; les entiers restent sans décimale. */
export function nombreAffiche(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Adresse d'une entreprise sur une ligne : l'adresse saisie, complétée du code postal et de la ville s'ils n'y sont pas. */
export function adresseComplete(e: { adresse?: string | null; code_postal?: string | null; ville?: string | null }): string {
  const rue = (e.adresse ?? '').trim();
  const lieu = [e.code_postal, e.ville].filter(Boolean).join(' ');
  if (!lieu || (e.code_postal && rue.includes(e.code_postal))) return rue;
  return [rue, lieu].filter(Boolean).join(', ');
}

/** « 2 mois » → « 2 » (Validité des devis). */
export const moisDe = (validite?: string) => (validite ?? '1 mois').match(/\d+/)?.[0] ?? '1';

/** « À réception de facture » → « 0 », « 30 jours date de facture » → « 30 » (Délai de paiement). */
export const joursDe = (delai?: string) => (delai ?? '').match(/\d+/)?.[0] ?? '0';

/** « 8 000 € » → « 8 000 » (Capital social, l'unité est affichée à côté). */
export const capitalDe = (capital?: string) => (capital ?? '').replace(/\s*€\s*$/, '');

/** « NAF 43.22A » → « 43.22A » (Secteur d'activité). */
export const nafDe = (activite?: string | null) => (activite ?? '').replace(/^NAF\s*/i, '').trim();

/** SIREN lisible tiré d'un SIRET : « 123 456 789 ». */
export function sirenDe(siret?: string | null): string {
  const d = (siret ?? '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}` : '';
}

export type Notifications = { retard: boolean; signe: boolean; fiche: boolean; resume: boolean };
/** Choix par défaut des notifications (comme le bac). */
export const NOTIFICATIONS_DEFAUT: Notifications = { retard: true, signe: true, fiche: true, resume: false };
