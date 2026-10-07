'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { deconnecter } from '@/app/actions-session';
import { Icone, type NomIcone } from '../icones';
import { Logo } from '../ui';

// Cadre de la console Chantio : même charte que le bureau, menu à part (les clients ne le voient jamais).
// Ordinateur : menu latéral. Téléphone : barre du haut et menu qui défile à l'horizontale.

export type EntreeConsole = { href: string; libelle: string; icone: NomIcone; pastille?: number; groupe: string };

function allume(href: string, chemin: string) {
  return href === '/console' ? chemin === '/console' : chemin === href || chemin.startsWith(`${href}/`);
}

export function CadreConsole({
  entrees,
  qui,
  role,
  children,
}: {
  entrees: EntreeConsole[];
  qui: string;
  role: string;
  children: ReactNode;
}) {
  const chemin = usePathname();
  return (
    <div className="min-h-screen menu:flex">
      <aside className="sticky top-0 z-40 flex shrink-0 flex-col gap-1 border-b border-trait bg-white/95 px-3 py-2.5 menu:h-screen menu:w-[248px] menu:overflow-y-auto menu:border-r menu:border-b-0 menu:bg-white/85 menu:p-3">
        <div className="flex items-center justify-between gap-2 menu:mb-3 menu:block">
          <Link href="/console" className="flex items-center gap-2 rounded-[12px] px-1.5 py-1">
            <Logo taille={24} />
            <span className="rounded-full bg-doux px-2 py-0.5 text-[11.5px] font-extrabold text-cobalt">Console</span>
          </Link>
          <Link href="/" className="text-[13px] font-bold text-gris hover:text-cobalt menu:hidden">
            ← Bureau
          </Link>
        </div>
        <nav aria-label="Console Chantio" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 menu:mx-0 menu:flex-col menu:overflow-visible menu:px-0 menu:pb-0">
          {entrees.map((e, i) => {
            const on = allume(e.href, chemin);
            const titreGroupe = i === 0 || entrees[i - 1].groupe !== e.groupe ? e.groupe : null;
            return (
              <div key={e.href} className="contents">
                {titreGroupe && (
                  <span className="hidden px-2.5 pt-3 pb-1 text-[12px] font-bold text-gris first:pt-0 menu:block">{titreGroupe}</span>
                )}
                <Link
                  href={e.href}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex shrink-0 items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-[14.5px] font-bold whitespace-nowrap transition ${
                    on ? 'degrade text-white' : 'text-gris hover:bg-doux hover:text-encre'
                  }`}
                >
                  <Icone nom={e.icone} taille={19} className="shrink-0" />
                  <span>{e.libelle}</span>
                  {!!e.pastille && (
                    <span className={`ml-auto min-w-5 rounded-full px-1.5 py-px text-center text-[11px] leading-[1.45] font-extrabold tabular-nums ${on ? 'bg-white text-cobalt' : 'bg-violet text-white'}`}>
                      {e.pastille}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto hidden flex-col gap-1 border-t border-trait pt-3 menu:flex">
          <div className="px-2.5 pb-1.5 leading-tight">
            <b className="block truncate text-[14.5px]">{qui}</b>
            <small className="text-[12.5px] font-semibold text-gris">{role} · équipe Chantio</small>
          </div>
          <Link href="/" className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-[15px] font-bold text-gris transition hover:bg-doux hover:text-encre">
            <Icone nom="gauche" taille={20} className="shrink-0" /> Retour au bureau
          </Link>
          <form action={deconnecter}>
            <button className="flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-[15px] font-bold text-gris transition hover:bg-doux hover:text-encre">
              <Icone nom="sortie" taille={20} className="shrink-0" /> Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
