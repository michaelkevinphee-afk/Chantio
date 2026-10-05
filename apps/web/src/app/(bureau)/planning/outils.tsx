'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ajouterJours, lundiDe } from '@chantio/shared';
import { LienBouton } from '@/components/ui';
import { adressePlanning } from './adresse';

// Morceaux communs aux vues Semaine et Mois du planning. Les liens partent de l'adresse du moment
// (elle porte aussi les familles cochées), pour qu'on les retrouve en changeant de semaine ou de vue.

const BASCULE = 'inline-flex items-center rounded-lg px-3 py-1.5 font-bold transition max-menu:min-h-11';
const FLECHE =
  'grid h-8 min-w-8 place-items-center rounded-md px-2 text-xl leading-none text-gris transition hover:bg-doux hover:text-cobalt max-menu:min-h-11 max-menu:min-w-11';

/**
 * Barre d'outils du bac, hors carte : [Semaine | Mois] [‹] [Cette semaine] [›], puis les cases à cocher
 * de la semaine (children).
 */
export function BarreOutils({
  vue,
  lundi,
  mois,
  aujourdhui,
  children,
}: {
  vue: 'semaine' | 'mois';
  /** Lundi affiché (vue Semaine) ou semaine où revenir (vue Mois). */
  lundi: string;
  /** Mois affiché (vue Mois) ou mois où aller (vue Semaine), AAAA-MM. */
  mois: string;
  aujourdhui: string;
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const lien = (changements: Record<string, string | null>) => adressePlanning(params, changements);
  const semaineCourante = lundiDe(aujourdhui);
  const versSemaine = (l: string) => lien({ mois: null, semaine: l === semaineCourante ? null : l });
  const versMois = (m: string) => lien({ semaine: null, mois: m });
  const decale = (n: number) => {
    const [a, m] = mois.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const semaine = vue === 'semaine';

  return (
    <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
      <div className="inline-flex rounded-[10px] border border-trait bg-white p-[3px]" role="group" aria-label="Affichage">
        <Link
          href={versSemaine(lundi)}
          scroll={false}
          aria-current={semaine ? 'page' : undefined}
          className={`${BASCULE} ${semaine ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'}`}
        >
          Semaine
        </Link>
        <Link
          href={versMois(mois)}
          scroll={false}
          aria-current={semaine ? undefined : 'page'}
          className={`${BASCULE} ${semaine ? 'text-gris hover:text-encre' : 'bg-doux text-cobalt'}`}
        >
          Mois
        </Link>
      </div>
      <div className="inline-flex items-center gap-1">
        <Link href={semaine ? versSemaine(ajouterJours(lundi, -7)) : versMois(decale(-1))} scroll={false} aria-label="Précédent" className={FLECHE}>
          <span aria-hidden="true">‹</span>
        </Link>
        <Link
          href={semaine ? versSemaine(semaineCourante) : versMois(aujourdhui.slice(0, 7))}
          scroll={false}
          className="rounded-[10px] border border-trait bg-white px-2.5 py-1.5 text-[13px] font-bold text-cobalt transition hover:border-cobalt max-menu:min-h-11 max-menu:content-center"
        >
          {semaine ? 'Cette semaine' : 'Ce mois-ci'}
        </Link>
        <Link href={semaine ? versSemaine(ajouterJours(lundi, 7)) : versMois(decale(1))} scroll={false} aria-label="Suivant" className={FLECHE}>
          <span aria-hidden="true">›</span>
        </Link>
      </div>
      {children}
    </div>
  );
}

/** « Nouvelle intervention » : la fenêtre de création s'ouvre par-dessus le planning (?nouvelle=1). */
export function BoutonNouvelle() {
  const params = useSearchParams();
  return (
    <LienBouton href={adressePlanning(params, { nouvelle: '1' })} scroll={false} prefetch={false}>
      Nouvelle intervention
    </LienBouton>
  );
}
