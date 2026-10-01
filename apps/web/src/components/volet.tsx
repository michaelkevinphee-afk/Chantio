'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
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
  children,
}: {
  /** Adresse de la page sans la fiche. */
  fermer: string;
  titre: ReactNode;
  sous?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [sortie, setSortie] = useState(false);

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
        className={`absolute inset-0 bg-encre/25 backdrop-blur-[2px] ${sortie ? 'volet-fond-sortie' : 'volet-fond'}`}
      />
      <section
        className={`absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-fond shadow-[-24px_0_60px_-30px_var(--halo)] sm:rounded-l-[28px] sm:border-l sm:border-trait ${
          sortie ? 'volet-sortie' : 'volet-entree'
        }`}
      >
        <header className="flex items-start gap-4 border-b border-trait bg-white px-6 py-5 sm:rounded-tl-[28px]">
          <div className="min-w-0 flex-1">
            {sous && <div className="mb-1.5 text-sm text-gris">{sous}</div>}
            <h2 className="text-2xl font-extrabold leading-tight">{titre}</h2>
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
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
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

/** Bouton d'envoi qui montre tout de suite que le clic est pris en compte. */
export function BoutonEnvoi({ children, enCours = 'Enregistrement…', className = '' }: { children: ReactNode; enCours?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`degrade inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-70 ${className}`}
    >
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {pending ? enCours : children}
    </button>
  );
}

/** Ligne de tableau entièrement cliquable, qui ouvre une fiche. */
export function LigneCliquable({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const ouvrir = () => demarrer(() => router.push(href, { scroll: false }));
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
