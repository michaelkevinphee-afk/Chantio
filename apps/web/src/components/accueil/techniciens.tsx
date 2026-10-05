import { couleurTechnicien, initiales, type Membre } from '@chantio/shared';

// Les techniciens de l'Accueil : qui va sur le terrain, dans quel ordre, et de quelle couleur.

/**
 * Les membres de terrain (tous sauf les assistant(e)s), dans un ordre fixe : le dirigeant, puis
 * la date d'arrivée dans l'entreprise, puis le prénom. Cet ordre donne aussi leur couleur (palette du bac),
 * la même sur la carte du jour, dans « Qui est où », dans la légende, au Planning et dans les Chiffres.
 */
export function techniciensTerrain<M extends Pick<Membre, 'id' | 'prenom' | 'nom' | 'role' | 'cree_le' | 'photo_chemin'>>(equipe: M[]) {
  return equipe
    .filter((m) => m.role !== 'assistant')
    .sort(
      (a, b) =>
        Number(b.role === 'dirigeant') - Number(a.role === 'dirigeant') || String(a.cree_le).localeCompare(String(b.cree_le)) || a.prenom.localeCompare(b.prenom, 'fr'),
    )
    .map((m, n) => ({ ...m, couleur: couleurTechnicien(n) }));
}

export type Technicien = ReturnType<typeof techniciensTerrain<Membre>>[number];

/**
 * Ceux qu'on montre (techsTerrain() du bac : membres de terrain actifs, sans les invités) :
 * ceux qui ont déjà ouvert leur compte, plus tout invité qui a quand même du travail sur la période
 * affichée (`occupes` : ids des techniciens des interventions du jour ou de la semaine), pour qu'aucune
 * intervention ne disparaisse. Les couleurs restent celles de la liste complète.
 */
export function presentsSurLeTerrain<M extends Pick<Membre, 'id' | 'user_id'>>(techniciens: M[], occupes: Iterable<string>): M[] {
  const ids = new Set(occupes);
  return techniciens.filter((m) => !!m.user_id || ids.has(m.id));
}

/** Avatar du bac : carré arrondi à la couleur du technicien, initiales en blanc (ou sa photo). */
export function AvatarTechnicien({
  prenom,
  nom,
  couleur,
  photo,
  taille = 34,
}: {
  prenom: string;
  nom: string | null;
  couleur: string;
  photo?: string | null;
  taille?: number;
}) {
  const style = { width: taille, height: taille, borderRadius: Math.round(taille * 0.3) };
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" style={{ ...style, boxShadow: `0 0 0 2px ${couleur}` }} className="shrink-0 object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: couleur, fontSize: Math.max(9, Math.round(taille * 0.38)) }}
      className="grid shrink-0 place-items-center font-extrabold text-white"
    >
      {initiales(prenom, nom)}
    </span>
  );
}
