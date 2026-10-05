// Partagé entre la page (serveur) et la liste (navigateur).

export type CriteresListe = { statut: string; q: string; type: string; periode: string };

/** Adresse de la liste avec ses filtres, sa recherche et, au besoin, la fiche ouverte. */
export function adresse(c: CriteresListe, fiche?: string) {
  const p = new URLSearchParams();
  if (c.statut !== 'toutes') p.set('statut', c.statut);
  if (c.type !== 'tous') p.set('type', c.type);
  if (c.periode !== 'toutes') p.set('periode', c.periode);
  if (c.q.trim()) p.set('q', c.q.trim());
  if (fiche) p.set('fiche', fiche);
  const qs = p.toString();
  return qs ? `/interventions?${qs}` : '/interventions';
}

/** Paramètres de la fenêtre « Nouvelle intervention » (retirés de l'adresse à sa fermeture). */
export const PARAMS_NOUVELLE = ['nouvelle', 'client', 'site', 'devis', 'date', 'heure', 'moment', 'technicien', 'erreur'] as const;

/** Paramètres du volet d'une intervention (retirés de l'adresse à sa fermeture). */
export const PARAMS_FICHE = ['fiche', 'cree', 'erreur', 'facturer', 'chiffrer'] as const;

/**
 * Adresse relative sûre pour revenir après une action (pas d'adresse externe), avec des paramètres
 * changés : `null` retire le paramètre.
 */
export function adresseRetour(retour: unknown, changements: Record<string, string | null> = {}, defaut = '/interventions'): string {
  const brut = typeof retour === 'string' && /^\/(?![/\\])/.test(retour) ? retour : defaut;
  const u = new URL(brut, 'http://local');
  for (const [cle, v] of Object.entries(changements)) {
    if (v === null) u.searchParams.delete(cle);
    else u.searchParams.set(cle, v);
  }
  const qs = u.searchParams.toString();
  return `${u.pathname}${qs ? `?${qs}` : ''}`;
}
