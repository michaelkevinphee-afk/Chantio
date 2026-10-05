'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Rafraîchit l'Accueil chaque minute tant qu'il est affiché (qui est où, carte du jour, à faire) :
 * les techniciens démarrent et envoient leurs fiches depuis leur téléphone pendant la journée.
 * La page ne le pose pas quand un volet ou une fenêtre est ouvert, pour ne pas gêner une saisie.
 */
export function Rafraichir({ toutesLes = 60_000 }: { toutesLes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, toutesLes);
    return () => clearInterval(t);
  }, [router, toutesLes]);
  return null;
}
