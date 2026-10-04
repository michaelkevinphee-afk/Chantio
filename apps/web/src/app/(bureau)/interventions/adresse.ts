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
