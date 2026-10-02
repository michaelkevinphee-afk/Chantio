// Partagé entre la page (serveur) et la liste (navigateur).

/** Adresse de la liste avec son filtre, sa recherche et, au besoin, la fiche ouverte. */
export function adresse(f: string, q: string, fiche?: string) {
  const p = new URLSearchParams();
  if (f !== 'toutes') p.set('statut', f);
  if (q.trim()) p.set('q', q.trim());
  if (fiche) p.set('fiche', fiche);
  const qs = p.toString();
  return qs ? `/interventions?${qs}` : '/interventions';
}
