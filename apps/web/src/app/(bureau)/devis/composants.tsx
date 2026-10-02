'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { euro } from '@chantio/shared';

/**
 * Racine d'un écran du module : la classe « actif » arrive juste après
 * l'affichage, ce qui déclenche les animations (barres, anneau, courbes).
 */
export function Ecran({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  const [actif, setActif] = useState(false);
  useEffect(() => {
    const image = requestAnimationFrame(() => setActif(true));
    return () => cancelAnimationFrame(image);
  }, []);
  return (
    <section className={`df ecran ${actif ? 'actif' : ''} ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

/** Nombre ou montant qui monte de 0 à sa valeur (sauf si l'utilisateur limite les animations). */
export function Compte({ valeur, monnaie = false }: { valeur: number; monnaie?: boolean }) {
  const [affiche, setAffiche] = useState(0);
  const precedent = useRef(0);
  useEffect(() => {
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const depart = precedent.current;
    precedent.current = valeur;
    const debut = performance.now();
    const duree = reduit ? 0 : 1100 + Math.min(600, Math.abs(valeur - depart) / 100);
    let image = 0;
    const pas = (t: number) => {
      const k = duree ? Math.min(1, (t - debut) / duree) : 1;
      setAffiche(depart + (valeur - depart) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur]);
  return <>{monnaie ? euro(affiche) : Math.round(affiche)}</>;
}

/** Petites icônes du module (traits). */
const TRACES = {
  plus: <path d="M12 5v14M5 12h14" />,
  importer: <path d="M12 15V3M7 8l5-5 5 5M5 21h14" />,
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  fleche: <path d="M9 6l6 6-6 6" />,
  croix: <path d="M6 6l12 12M18 6L6 18" />,
  corbeille: <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  coche: <path d="M5 12l5 5 9-10" />,
  catalogue: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  particulier: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  pro: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </>
  ),
  imprimer: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  envoyer: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  reglages: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  goutte: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  flamme: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 3 2 3 4 0-3 0-5 0-7z" />,
  cle: <path d="M14.5 6.5a4 4 0 1 0 3 3L21 6l-3-3-3.5 3.5zM12 12l-8 8" />,
  camion: (
    <>
      <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  tube: <path d="M4 8h16M4 16h16M8 4v4M16 16v4" />,
} as const;

export type NomPicto = keyof typeof TRACES;

export function Picto({ nom, taille = 18, epaisseur = 2.2 }: { nom: NomPicto; taille?: number; epaisseur?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}

/** Logo Chantio en blocs (dépôt de fichiers). */
export function Blocs({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden="true">
      <rect x="14" y="14" width="24" height="68" rx="10" fill="#2F54EB" />
      <rect x="44" y="14" width="38" height="24" rx="10" fill="#7C93F5" />
      <rect x="44" y="58" width="38" height="24" rx="10" fill="#B9C6FB" />
    </svg>
  );
}
