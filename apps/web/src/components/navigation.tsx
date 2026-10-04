'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone, type NomIcone } from './icones';

const LIENS: { href: string; libelle: string; icone: NomIcone }[] = [
  { href: '/', libelle: 'Pilotage', icone: 'pilotage' },
  { href: '/planning', libelle: 'Planning', icone: 'calendrier' },
  { href: '/interventions', libelle: 'Interventions', icone: 'interventions' },
  { href: '/clients', libelle: 'Clients', icone: 'clients' },
  { href: '/devis', libelle: 'Devis et factures', icone: 'devis' },
  { href: '/achats', libelle: 'Achats', icone: 'achats' },
  { href: '/chiffres', libelle: 'Chiffres', icone: 'chiffres' },
  { href: '/equipe', libelle: 'Équipe', icone: 'equipe' },
  { href: '/parametres', libelle: 'Paramètres', icone: 'reglages' },
];

/** Pastille d'une entrée du menu : ce qui attend le bureau (interventions à planifier, factures reçues…). */
export type Pastille = { n: number; titre: string };

export function Navigation({ pastilles = {} }: { pastilles?: Record<string, Pastille> }) {
  const chemin = usePathname();
  return (
    <nav className="flex min-w-0 gap-1 overflow-x-auto lg:flex-col">
      {LIENS.map((l) => {
        const actif = l.href === '/' ? chemin === '/' : chemin.startsWith(l.href);
        const pastille = pastilles[l.href];
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 font-bold whitespace-nowrap transition ${
              actif ? 'degrade text-white' : 'text-gris hover:bg-doux hover:text-encre'
            }`}
          >
            <Icone nom={l.icone} taille={20} />
            {l.libelle}
            {pastille && pastille.n > 0 && (
              <span
                title={pastille.titre}
                className={`ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-extrabold tabular-nums ${
                  actif ? 'bg-white/25 text-white' : 'bg-cobalt text-white'
                }`}
              >
                {pastille.n}
                <span className="sr-only"> : {pastille.titre}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
