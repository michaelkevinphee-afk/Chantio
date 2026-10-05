import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icone } from './icones';

/**
 * Barre du haut des pages pleines, comme le bac (éditeur de devis ou de facture, fiche d'une facture
 * fournisseur, « Gérer vos entreprises ») : à gauche une action facultative (corbeille…), au centre
 * le statut et le titre (h1 de la page), à droite la croix ✕ qui ramène à `retour`.
 * Sur téléphone (≤ 700 px), l'action de gauche disparaît et le titre passe à gauche.
 * À poser en haut d'un <PleinEcran> : <BarrePleine statut={<Puce ton="vert">Signé</Puce>} titre="Devis N° DE-2026-0213" retour="/devis" />.
 */
export function BarrePleine({
  titre,
  statut,
  retour,
  libelleRetour = 'Fermer',
  gauche,
}: {
  titre: ReactNode;
  statut?: ReactNode;
  /** Écran d'où l'on vient (liste, fiche client…). */
  retour: string;
  /** Texte lu de la croix, ex. « Fermer et revenir aux devis ». */
  libelleRetour?: string;
  gauche?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 grid min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-trait bg-white px-5 py-2 max-[700px]:grid-cols-[minmax(0,1fr)_auto] max-[700px]:px-3">
      <div className="flex justify-self-start max-[700px]:hidden">{gauche}</div>
      <div className="flex min-w-0 items-center gap-3 max-[700px]:gap-2">
        {statut}
        <h1 className="truncate text-xl font-extrabold max-[700px]:text-base">{titre}</h1>
      </div>
      <Link
        href={retour}
        aria-label={libelleRetour}
        title="Fermer"
        className="grid h-10 w-10 place-items-center justify-self-end rounded-[12px] text-gris transition hover:bg-doux hover:text-encre"
      >
        <Icone nom="fermer" taille={20} />
      </Link>
    </header>
  );
}
