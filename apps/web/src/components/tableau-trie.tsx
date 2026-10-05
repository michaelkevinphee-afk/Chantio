'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { demarrerNavigation } from './barre-chargement';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

// Tableau de gestion du bureau, comme « tab-docs » du bac (Mes devis, Mes factures, Dépenses fournisseurs) :
// tri en cliquant sur l'en-tête (↕, puis ↓ ou ↑), 25 lignes par page avec « N résultats · Résultats par page »,
// rangée cliquable vers une adresse, et une carte par ligne sur téléphone.
// Composant client : les colonnes contiennent des fonctions, il s'utilise donc depuis un composant client
// (la page serveur lit les données et les passe à la liste).

export type Sens = 'asc' | 'desc';

export interface Colonne<T> {
  /** Identifiant de la colonne (sert au tri). */
  cle: string;
  titre: ReactNode;
  aligne?: 'gauche' | 'droite';
  /** Valeur de tri : présente = colonne triable. Nombres comparés entre eux, le reste comme du texte (ordre français). */
  tri?: (ligne: T) => string | number | null | undefined;
  /** Sens du premier clic : 'desc' par défaut (dates, montants) ; 'asc' pour un nom. */
  sensInitial?: Sens;
  /** Contenu de la cellule. */
  rendu: (ligne: T) => ReactNode;
  /** Classes de l'en-tête et des cellules (ex. 'max-[1360px]:hidden' pour masquer la colonne, 'whitespace-nowrap'). */
  className?: string;
}

const CARTES = {
  700: { table: 'max-[700px]:hidden', cartes: 'min-[701px]:hidden' },
  1180: { table: 'max-[1180px]:hidden', cartes: 'min-[1181px]:hidden' },
} as const;

/** Lien principal d'une rangée (nom du client, du fournisseur) : donne l'accès au clavier, la rangée entière reste cliquable. */
export function LienLigne({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`font-bold text-encre hover:underline ${className}`}>
      {children}
    </Link>
  );
}

function comparer(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { numeric: true, sensitivity: 'base' });
}

/** Ne pas ouvrir la rangée quand on clique sur un vrai bouton, lien ou champ à l'intérieur. */
const INTERACTIF = 'a, button, input, select, textarea, label, summary, [role="button"], [data-sans-clic]';

/**
 * Tableau trié et paginé.
 * - `colonnes` : titre, alignement, `tri` facultatif, `rendu` de la cellule.
 * - `triInitial` : ex. { cle: 'date', sens: 'desc' } ; `departage` range les égalités (ex. numéro décroissant).
 * - `lien` : adresse ouverte au clic sur la rangée (Ctrl/Cmd + clic : nouvel onglet). Mettre aussi un
 *   <LienLigne> dans la cellule principale pour le clavier.
 * - `carte` : rendu d'une ligne en carte sous `cartesSous` px (700 par défaut, 1180 comme les devis du bac) ;
 *   sans `carte`, le tableau défile horizontalement dans son cadre.
 * - `parPage` : 25 par défaut ; false = tout afficher, avec seulement « N résultats ».
 * La page revient à 1 quand les lignes reçues changent (filtre, recherche) ou quand on trie.
 */
export function TableauTrie<T>({
  lignes,
  colonnes,
  cle,
  triInitial,
  departage,
  lien,
  carte,
  cartesSous = 700,
  parPage: parPageInitial = 25,
  vide = 'Aucun résultat.',
  etiquette,
  classeLigne,
  onTri,
  pageInitiale = 1,
  onEtat,
}: {
  lignes: readonly T[];
  colonnes: readonly Colonne<T>[];
  /** Identifiant unique d'une ligne. */
  cle: (ligne: T) => string;
  triInitial?: { cle: string; sens: Sens };
  departage?: (a: T, b: T) => number;
  lien?: (ligne: T) => string | null | undefined;
  carte?: (ligne: T) => ReactNode;
  cartesSous?: keyof typeof CARTES;
  parPage?: number | false;
  /** Texte quand la liste est vide (« Aucun devis dans cette sélection. »). */
  vide?: ReactNode;
  /** Nom du tableau pour les lecteurs d'écran. */
  etiquette?: string;
  classeLigne?: (ligne: T) => string;
  /** Appelé à chaque changement de tri (ex. le garder en mémoire et le repasser en `triInitial` au retour). */
  onTri?: (tri: { cle: string; sens: Sens }) => void;
  /** Page de départ (liste retrouvée telle qu'on l'avait laissée). */
  pageInitiale?: number;
  /** Appelé à chaque changement de tri, de page ou de nombre par page (pour mémoriser la vue). */
  onEtat?: (e: { tri: { cle: string; sens: Sens } | null; page: number; parPage: number }) => void;
}) {
  const router = useRouter();
  const [tri, setTri] = useState(triInitial ?? null);
  const [page, setPage] = useState(pageInitiale);
  const parDefaut = parPageInitial || 25;
  const [parPage, setParPage] = useState(parDefaut);
  const zone = useRef<HTMLDivElement>(null);
  const precedent = useRef<HTMLButtonElement>(null);
  const suivant = useRef<HTMLButtonElement>(null);

  // Nouvelles lignes (filtre, recherche) : retour à la première page.
  const signature = lignes.map(cle).join('|');
  const [vue, setVue] = useState(signature);
  if (vue !== signature) {
    setVue(signature);
    setPage(1);
  }

  const colTri = tri ? colonnes.find((c) => c.cle === tri.cle && c.tri) : undefined;
  let triees: readonly T[] = lignes;
  if (colTri?.tri) {
    const f = colTri.tri;
    const s = tri!.sens === 'asc' ? 1 : -1;
    triees = lignes
      .map((l, i) => ({ l, v: f(l), i }))
      .sort((a, b) => comparer(a.v, b.v) * s || (departage ? departage(a.l, b.l) : 0) || a.i - b.i)
      .map((x) => x.l);
  } else if (departage) triees = [...lignes].sort(departage);

  const pagine = parPageInitial !== false;
  const pages = pagine ? Math.max(1, Math.ceil(triees.length / parPage)) : 1;
  const pg = Math.min(page, pages);
  const visibles = pagine ? triees.slice((pg - 1) * parPage, pg * parPage) : triees;

  const etat = useRef(onEtat);
  useEffect(() => {
    etat.current = onEtat;
  });
  useEffect(() => {
    etat.current?.({ tri, page: pg, parPage });
  }, [tri, pg, parPage]);

  const trier = (c: Colonne<T>) => {
    const t: { cle: string; sens: Sens } =
      tri?.cle === c.cle ? { cle: c.cle, sens: tri.sens === 'asc' ? 'desc' : 'asc' } : { cle: c.cle, sens: c.sensInitial ?? 'desc' };
    setTri(t);
    onTri?.(t);
    setPage(1);
  };

  const allerPage = (n: number) => {
    setPage(n);
    // Le bouton cliqué devient grisé en bout de liste : le focus passe à l'autre.
    setTimeout(() => {
      if (n <= 1) suivant.current?.focus();
      else if (n >= pages) precedent.current?.focus();
      const haut = zone.current?.getBoundingClientRect().top ?? 0;
      if (haut < 0) zone.current?.scrollIntoView({ block: 'start' });
    });
  };

  const ouvrir = (e: MouseEvent, href: string | null | undefined) => {
    if (!href || (e.target as HTMLElement).closest(INTERACTIF)) return;
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
    else {
      demarrerNavigation(href);
      router.push(href);
    }
  };

  if (!lignes.length) return <div className="px-3 py-10 text-center text-[15px] text-gris">{vide}</div>;

  const droite = (c: Colonne<T>) => (c.aligne === 'droite' ? 'text-right' : 'text-left');
  const bascule = carte ? CARTES[cartesSous] : null;

  return (
    <div ref={zone} className="scroll-mt-24">
      <div className={`overflow-x-auto ${bascule?.table ?? ''}`}>
        <table aria-label={etiquette} className="w-full border-collapse text-[14.5px] tabular-nums">
          <thead>
            <tr>
              {colonnes.map((c) => {
                const on = colTri?.cle === c.cle;
                return (
                  <th
                    key={c.cle}
                    scope="col"
                    aria-sort={c.tri ? (on ? (tri!.sens === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    className={`bg-fond px-2.5 py-3 align-middle text-[13.5px] font-bold whitespace-nowrap text-gris first:rounded-l-xl last:rounded-r-xl ${droite(c)} ${c.className ?? ''}`}
                  >
                    {c.tri ? (
                      <button
                        type="button"
                        onClick={() => trier(c)}
                        className={`inline-flex items-center gap-1.5 rounded-md text-left whitespace-nowrap transition hover:text-encre ${on ? 'text-encre' : ''}`}
                      >
                        {c.titre}
                        <span aria-hidden="true" className="text-xs opacity-65">
                          {on ? (tri!.sens === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.titre
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const href = lien?.(l);
              return (
                <tr
                  key={cle(l)}
                  onClick={href ? (e) => ouvrir(e, href) : undefined}
                  onMouseEnter={href ? () => router.prefetch(href) : undefined}
                  className={`border-b border-trait ${href ? 'cursor-pointer transition-colors hover:bg-[#F9FAFF]' : ''} ${classeLigne?.(l) ?? ''}`}
                >
                  {colonnes.map((c) => (
                    <td key={c.cle} className={`px-2.5 py-[15px] align-middle ${droite(c)} ${c.className ?? ''}`}>
                      {c.rendu(l)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {carte && (
        <ul className={bascule!.cartes}>
          {visibles.map((l) => {
            const href = lien?.(l);
            return (
              <li
                key={cle(l)}
                onClick={href ? (e) => ouvrir(e, href) : undefined}
                className={`border-b border-trait px-0.5 py-3.5 ${href ? 'cursor-pointer' : ''} ${classeLigne?.(l) ?? ''}`}
              >
                {carte(l)}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5 px-2 pt-4 pb-0.5 text-[14.5px] text-gris max-[700px]:pt-3 max-[700px]:text-[13.5px]">
        <span>
          {triees.length} {triees.length > 1 ? 'résultats' : 'résultat'}
          {pagine && (
            <>
              {' · '}
              <label>
                Résultats par page
                <select
                  value={parPage}
                  onChange={(e) => {
                    setParPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className="ml-1.5 cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 font-bold text-cobalt"
                >
                  {[...new Set([parDefaut, 25, 50, 100])].sort((a, b) => a - b).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </span>
        {pagine && (
          <nav aria-label="Pages" className="flex items-center gap-2">
            <button
              ref={precedent}
              type="button"
              onClick={() => allerPage(pg - 1)}
              disabled={pg <= 1}
              aria-label="Page précédente"
              className="grid h-10 w-9 place-items-center rounded-lg text-lg text-gris transition hover:bg-doux hover:text-cobalt disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gris"
            >
              ‹
            </button>
            <span className="grid h-10 min-w-10 place-items-center rounded-xl border border-trait bg-white px-2 font-bold text-encre" aria-current="page">
              <span className="sr-only">Page </span>
              {pg}
            </span>
            <span>/ {pages}</span>
            <button
              ref={suivant}
              type="button"
              onClick={() => allerPage(pg + 1)}
              disabled={pg >= pages}
              aria-label="Page suivante"
              className="grid h-10 w-9 place-items-center rounded-lg text-lg text-gris transition hover:bg-doux hover:text-cobalt disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gris"
            >
              ›
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
