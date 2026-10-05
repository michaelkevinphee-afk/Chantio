'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { consommerVoletAttente, demarrerNavigation } from './barre-chargement';
import { Icone } from './icones';

/**
 * Fiche qui glisse depuis la droite, par-dessus la page.
 * Elle s'ouvre avec un paramètre d'adresse (?fiche=…, ?nouveau=1) : le lien
 * reste partageable et le bouton « retour » du navigateur la referme.
 */
export function Volet({
  fermer,
  titre,
  sous,
  dessous,
  blanc = false,
  children,
}: {
  /** Adresse de la page sans la fiche. */
  fermer: string;
  titre: ReactNode;
  sous?: ReactNode;
  /** Sous le titre (pastilles d'état d'une intervention…). */
  dessous?: ReactNode;
  /** Corps blanc à rubriques séparées par des filets (volet d'intervention du bac) au lieu du fond bleuté à cartes. */
  blanc?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [sortie, setSortie] = useState(false);
  // Déjà glissé à l'écran (volet d'attente affiché au clic) : pas de seconde entrée.
  const [dejaOuvert] = useState(() => typeof window !== 'undefined' && consommerVoletAttente());

  const refermer = () => {
    setSortie(true);
    setTimeout(() => router.push(fermer, { scroll: false }), 180);
  };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && refermer();
    document.addEventListener('keydown', touche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', touche);
      document.body.style.overflow = debordement;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fermer]);

  return (
    <div className={`fixed inset-0 z-50 ${sortie ? 'pointer-events-none' : ''}`} role="dialog" aria-modal="true">
      <div
        onClick={refermer}
        className={`absolute inset-0 bg-encre/25 backdrop-blur-[2px] ${sortie ? 'volet-fond-sortie' : dejaOuvert ? '' : 'volet-fond'}`}
      />
      <section
        className={`absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-fond shadow-[-24px_0_60px_-30px_var(--halo)] sm:rounded-l-[28px] sm:border-l sm:border-trait ${
          sortie ? 'volet-sortie' : dejaOuvert ? '' : 'volet-entree'
        }`}
      >
        <header className="flex items-start gap-4 border-b border-trait bg-white px-6 py-5 sm:rounded-tl-[28px]">
          <div className="min-w-0 flex-1">
            {sous && <div className="mb-1.5 text-sm text-gris">{sous}</div>}
            <h2 className="text-2xl font-extrabold leading-tight">{titre}</h2>
            {dessous && <div className="mt-1.5">{dessous}</div>}
          </div>
          <button
            type="button"
            onClick={refermer}
            aria-label="Fermer"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-trait bg-white text-gris transition hover:border-cobalt hover:text-encre"
          >
            <Icone nom="fermer" taille={18} />
          </button>
        </header>
        <div className={`flex-1 overflow-y-auto ${blanc ? 'bg-white px-[18px] pt-4 pb-10 max-sm:px-3.5' : 'px-6 py-6'}`}>{children}</div>
      </section>
    </div>
  );
}

/** Bloc délimité à l'intérieur d'une fiche : petit titre + carte blanche. */
export function Bloc({ titre, action, children }: { titre: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-gris">{titre}</h3>
        {action}
      </div>
      <div className="carte p-4">{children}</div>
    </section>
  );
}

/** Ligne « libellé : valeur » d'une fiche ; rien si la valeur est vide. */
export function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="flex gap-3 border-b border-trait py-2 text-sm last:border-0 first:pt-0 last:pb-0">
      <span className="w-32 shrink-0 text-gris">{libelle}</span>
      <span className="min-w-0 flex-1 font-semibold break-words">{children}</span>
    </div>
  );
}

/** Ligne de tableau entièrement cliquable, qui ouvre une fiche. */
export function LigneCliquable({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const ouvrir = () => {
    demarrerNavigation(href);
    demarrer(() => router.push(href, { scroll: false }));
  };
  return (
    <tr
      tabIndex={0}
      onClick={(e) => {
        // Laisse fonctionner les vrais liens (téléphone, e-mail) dans la ligne.
        if ((e.target as HTMLElement).closest('a')) return;
        ouvrir();
      }}
      onKeyDown={(e) => e.key === 'Enter' && ouvrir()}
      onMouseEnter={() => router.prefetch(href)}
      aria-busy={enCours}
      className={`cursor-pointer transition-colors hover:bg-fond focus-visible:bg-doux ${enCours ? 'bg-doux' : ''}`}
    >
      {children}
    </tr>
  );
}
