'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone, type NomIcone } from './icones';

const LIENS: { href: string; libelle: string; icone: NomIcone }[] = [
  { href: '/', libelle: 'Pilotage', icone: 'pilotage' },
  { href: '/interventions', libelle: 'Interventions', icone: 'interventions' },
  { href: '/clients', libelle: 'Clients', icone: 'clients' },
  { href: '/equipe', libelle: 'Équipe', icone: 'equipe' },
];

export function Navigation() {
  const chemin = usePathname();
  return (
    <nav className="flex min-w-0 gap-1 overflow-x-auto lg:flex-col">
      {LIENS.map((l) => {
        const actif = l.href === '/' ? chemin === '/' : chemin.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 font-bold whitespace-nowrap transition ${
              actif ? 'bg-white text-marine' : 'text-white/65 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icone nom={l.icone} taille={20} className={actif ? 'text-marine' : ''} />
            {l.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
