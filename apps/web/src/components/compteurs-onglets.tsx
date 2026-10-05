'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { euro } from '@chantio/shared';
import { useAdresseFiltre } from './outils-liste';

// Les grandes cases-filtres du bac (« Tous 9 », « Brouillons 3 · 1 180,35 € HT »…) : un bandeau
// bleuté, une case par statut, la case choisie encadrée de cobalt. Styles : .compteurs dans globals.css.

/** Couleur de la pastille du nombre (grise quand il est à 0). */
export type TonCompteur = 'gris' | 'cobalt' | 'violet' | 'vert' | 'rouge' | 'encre';

export interface Compteur {
  /** Valeur du filtre (« tous », « brouillons »…). */
  cle: string;
  libelle: ReactNode;
  nombre: number;
  ton?: TonCompteur;
  /** Montant sous le libellé (« 1 180,35 € HT ») ; « — » quand le nombre est à 0. Absent : pas de ligne. */
  montant?: number;
  /** « HT » ou « TTC », en petit après le montant. */
  unite?: string;
  /** true : le montant reste affiché à 0 (« 0,00 € TTC ») au lieu de « — », comme les compteurs des Achats du bac. */
  montantAZero?: boolean;
  /** Petite phrase grise à la place du montant (« Planifié ou suspendu »). */
  texte?: ReactNode;
  /** Lien explicite de la case (sinon calculé avec `param`). */
  href?: string;
}

/**
 * Rangée de compteurs-filtres.
 * - Mode adresse : `param` (ex. 'filtre') → chaque case est un lien ; la case `parDefaut`
 *   (1re case si absent) retire le paramètre. Utilisable depuis une page serveur.
 * - Lien explicite : `href` sur chaque compteur.
 * - Mode client : `onChoisir` → chaque case est un bouton (aria-pressed).
 * `disposition="rangee"` : libellé et nombre sur une ligne, sans montant (Interventions de l'Accueil).
 * Le bloc prend toute la largeur de son parent. Quand la place manque (moins de 720 px, ex. téléphone) :
 * 2 colonnes, la 1re case seule sur sa ligne si le nombre de cases est impair ; à partir de 6 cases,
 * 3 puis 2 colonnes. `className` s'applique au cadre (ex. mb-0).
 */
export function CompteursOnglets({
  compteurs,
  actif,
  etiquette = 'Filtrer par statut',
  param,
  parDefaut,
  onChoisir,
  disposition = 'normale',
  className = '',
}: {
  compteurs: Compteur[];
  /** Clé de la case choisie (aucune si absent). */
  actif?: string;
  etiquette?: string;
  param?: string;
  parDefaut?: string;
  onChoisir?: (cle: string) => void;
  disposition?: 'normale' | 'rangee';
  className?: string;
}) {
  const adresse = useAdresseFiltre();
  const defaut = parDefaut ?? compteurs[0]?.cle;
  const n = compteurs.length;
  const classes = ['compteurs', n % 2 ? 'impair' : '', n >= 6 ? 'nombreux' : '', disposition === 'rangee' ? 'rangee' : ''].join(' ');

  // Le cadre mesure la place disponible (requêtes de conteneur) : les colonnes suivent la largeur
  // de la carte, menu ouvert ou réduit, plutôt que celle de l'écran.
  return (
    <div className={`compteurs-cadre ${className}`}>
      <div role="group" aria-label={etiquette} className={classes} style={{ '--n': n } as CSSProperties}>
        {compteurs.map((c) => {
          const on = c.cle === actif;
          const ton = c.nombre > 0 ? (c.ton ?? 'gris') : 'gris';
          const contenu = (
            <>
              <span className="compteur-t">
                {c.libelle} <span className={`compteur-n n-${ton}`}>{c.nombre}</span>
              </span>
              {disposition === 'normale' &&
                (c.texte != null ? (
                  <span className="compteur-s">{c.texte}</span>
                ) : c.montant !== undefined ? (
                  <span className="compteur-m">
                    {c.nombre || c.montantAZero ? (
                      <>
                        {euro(c.montant)} {c.unite && <small>{c.unite}</small>}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                ) : null)}
            </>
          );
          const classe = `compteur${on ? ' actif' : ''}`;
          const href = c.href ?? (param ? adresse({ [param]: c.cle === defaut ? null : c.cle }) : null);
          if (href && !onChoisir)
            return (
              <Link key={c.cle} href={href} scroll={false} aria-current={on ? 'true' : undefined} className={classe}>
                {contenu}
              </Link>
            );
          return (
            <button key={c.cle} type="button" aria-pressed={on} onClick={() => onChoisir?.(c.cle)} className={classe}>
              {contenu}
            </button>
          );
        })}
      </div>
    </div>
  );
}
