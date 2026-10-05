'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Retour immédiat au clic, le temps que le serveur réponde :
// - une fine barre bleue en haut de l'écran, dès le clic sur un lien ou une ligne de tableau ;
// - quand le clic ouvre une intervention (?fiche=…), le volet glisse aussitôt depuis la droite,
//   vide et grisé, puis se remplit à l'arrivée de la fiche.

const EVENEMENT = 'chantio:navigation';

/** À appeler avant un router.push() fait à la main (ligne de tableau cliquable…). */
export function demarrerNavigation(href: string) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: href }));
}

// Le vrai volet ne rejoue pas son entrée s'il remplace le volet d'attente déjà affiché.
let voletAttenteAffiche = false;
/** Lu une fois par le volet à son ouverture. */
export function consommerVoletAttente() {
  const v = voletAttenteAffiche;
  voletAttenteAffiche = false;
  return v;
}

/** Adresse interne d'un lien cliqué sans touche (pas d'ouverture dans un nouvel onglet), sinon null. */
function lienInterne(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  return a.href;
}

/** 'page' si l'adresse change, 'volet' si elle ouvre une autre intervention par-dessus la page, null sinon. */
function genre(href: string): 'page' | 'volet' | null {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || url.pathname.endsWith('.html')) return null;
  if (url.pathname + url.search === location.pathname + location.search) return null;
  const fiche = url.searchParams.get('fiche');
  return fiche && fiche !== new URLSearchParams(location.search).get('fiche') ? 'volet' : 'page';
}

export function BarreChargement() {
  const adresse = usePathname() + '?' + useSearchParams().toString();
  const actuelle = useRef(adresse);
  // Adresse affichée au moment du clic (null au repos), et volet d'attente ou non.
  const [depart, setDepart] = useState<{ adresse: string; volet: boolean } | null>(null);
  const [fin, setFin] = useState(false);
  const garde = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // La nouvelle adresse est affichée : la barre se remplit puis s'efface (ajusté pendant le rendu).
  if (depart && depart.adresse !== adresse) {
    setDepart(null);
    setFin(true);
  }

  useEffect(() => {
    actuelle.current = adresse;
    clearTimeout(garde.current);
    // Le volet arrivé avec cette adresse l'a déjà lu en s'affichant (même rendu, avant cet effet).
    voletAttenteAffiche = false;
  }, [adresse]);

  useEffect(() => {
    if (!fin) return;
    const t = setTimeout(() => setFin(false), 350);
    return () => clearTimeout(t);
  }, [fin]);

  useEffect(() => {
    const demarrer = (href: string | null) => {
      const g = href ? genre(href) : null;
      if (!g) return;
      setDepart({ adresse: actuelle.current, volet: g === 'volet' });
      setFin(false);
      voletAttenteAffiche = g === 'volet';
      clearTimeout(garde.current);
      // Sécurité : jamais plus de 15 s à l'écran (navigation annulée, erreur réseau…).
      garde.current = setTimeout(() => {
        setDepart(null);
        voletAttenteAffiche = false;
      }, 15000);
    };
    const clic = (e: MouseEvent) => demarrer(lienInterne(e));
    const appel = (e: Event) => demarrer((e as CustomEvent<string>).detail);
    // Phase de capture : le clic est vu avant que Next ne le prenne en charge.
    document.addEventListener('click', clic, true);
    window.addEventListener(EVENEMENT, appel);
    return () => {
      document.removeEventListener('click', clic, true);
      window.removeEventListener(EVENEMENT, appel);
    };
  }, []);

  const etat = depart ? 'charge' : fin ? 'fin' : 'repos';
  if (etat === 'repos') return null;
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[2000] h-[3px]">
        <div className={`h-full bg-cobalt shadow-[0_0_8px_var(--color-cobalt)] ${etat === 'fin' ? 'barre-chargement-fin' : 'barre-chargement'}`} />
      </div>
      {depart?.volet && <VoletAttente />}
    </>
  );
}

/** Volet vide, mêmes dimensions que components/volet.tsx, le temps que la fiche arrive. */
function VoletAttente() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-busy="true" aria-label="Ouverture de la fiche">
      <div className="volet-fond absolute inset-0 bg-encre/25 backdrop-blur-[2px]" />
      <section className="volet-entree absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-fond shadow-[-24px_0_60px_-30px_var(--halo)] sm:rounded-l-[28px] sm:border-l sm:border-trait">
        <header className="border-b border-trait bg-white px-6 py-5 sm:rounded-tl-[28px]">
          <div className="animate-pulse space-y-2.5">
            <div className="h-4 w-32 rounded bg-black/10" />
            <div className="h-7 w-64 rounded-lg bg-black/10" />
            <div className="h-5 w-40 rounded-full bg-black/5" />
          </div>
        </header>
        <div className="flex-1 animate-pulse space-y-4 bg-white px-6 py-6">
          <div className="h-24 rounded-2xl bg-black/5" />
          <div className="h-40 rounded-2xl bg-black/5" />
          <div className="h-32 rounded-2xl bg-black/5" />
        </div>
      </section>
    </div>
  );
}
