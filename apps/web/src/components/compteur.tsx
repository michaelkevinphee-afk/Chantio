'use client';

import { useEffect, useState } from 'react';

/** Nombre qui monte de 0 à sa valeur à l'affichage (sauf si l'utilisateur limite les animations). */
export function Compteur({ valeur }: { valeur: number }) {
  const [affiche, setAffiche] = useState(0);
  useEffect(() => {
    const debut = performance.now();
    const duree = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    let image = 0;
    const pas = (t: number) => {
      const p = duree ? Math.min(1, (t - debut) / duree) : 1;
      setAffiche(Math.round(valeur * (1 - Math.pow(1 - p, 3))));
      if (p < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur]);
  return <>{affiche}</>;
}
