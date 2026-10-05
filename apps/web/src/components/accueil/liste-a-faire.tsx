'use client';

import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';

// Limites du bac : 10 lignes sur ordinateur, 5 sur téléphone (moins de 700 px de large).
const ORDI = 10;
const TEL = 5;
const plus = (reste: number) => (reste > 1 ? `Afficher les ${reste} autres` : 'Afficher la dernière');

/**
 * La liste « À faire » de l'Accueil : les premières lignes, puis « Afficher les N autres ».
 * Les lignes en trop sont masquées par des classes (et non selon la largeur lue dans le navigateur),
 * pour que la page rendue par le serveur soit déjà la bonne. Au clic, tout s'affiche et le focus
 * passe au bouton de la première ligne qui vient d'apparaître, comme dans le bac.
 */
export function ListeAFaire({ children }: { children: ReactNode }) {
  const lignes = Children.toArray(children);
  const [tout, setTout] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const n = lignes.length;

  const afficher = () => {
    const premiere = window.matchMedia('(max-width: 699.98px)').matches ? TEL : ORDI;
    setTout(true);
    requestAnimationFrame(() => {
      const ligne = boite.current?.querySelectorAll<HTMLElement>('[data-ligne]')[premiere];
      (ligne?.querySelector<HTMLElement>('[data-action]') ?? ligne?.querySelector<HTMLElement>('a, button'))?.focus({ preventScroll: true });
    });
  };

  return (
    <div ref={boite} className="flex flex-col gap-2">
      {lignes.map((l, i) => (
        <div
          key={isValidElement(l) && l.key != null ? l.key : i}
          data-ligne
          className={tout || i < TEL ? 'contents' : i < ORDI ? 'contents max-[699.98px]:hidden' : 'hidden'}
        >
          {l}
        </div>
      ))}
      {!tout && n > TEL && (
        <button
          type="button"
          onClick={afficher}
          className={`self-start py-2 text-left text-[14.5px] font-extrabold text-cobalt hover:underline max-[700px]:min-h-12 ${n > ORDI ? '' : 'min-[700px]:hidden'}`}
        >
          {n > ORDI && <span className="max-[699.98px]:hidden">{plus(n - ORDI)}</span>}
          <span className="min-[700px]:hidden">{plus(n - TEL)}</span>
        </button>
      )}
    </div>
  );
}
