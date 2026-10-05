import type { ReactNode } from 'react';

// Briques de mise en page des rubriques (composants sans état, utilisables côté serveur ou client).

/** Une section titrée d'une rubrique ; les sections se suivent séparées par un filet, comme dans le bac. */
export function Section({ titre, children, grille = true }: { titre: ReactNode; children: ReactNode; grille?: boolean }) {
  return (
    <section className="flex flex-col gap-3 pt-5 [&+&]:mt-5 [&+&]:border-t [&+&]:border-trait">
      <h3 className="text-base font-extrabold">{titre}</h3>
      {grille ? <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-5 gap-y-4 min-[1101px]:grid-cols-2">{children}</div> : children}
    </section>
  );
}

/** Pastille « Bientôt » : une fonction annoncée, pas encore branchée. */
export function Bientot() {
  return <span className="inline-block rounded-full bg-violet-doux px-2.5 py-0.5 align-middle text-xs font-bold whitespace-nowrap text-violet">Bientôt</span>;
}

/** Phrase grise sous un champ. */
export function Aide({ children, id, erreur = false }: { children: ReactNode; id?: string; erreur?: boolean }) {
  return (
    <span id={id} className={`mt-1 block text-xs font-medium ${erreur ? 'text-rouge' : 'text-gris'}`}>
      {children}
    </span>
  );
}

/** Petite note grise. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] text-gris ${className}`}>{children}</p>;
}
