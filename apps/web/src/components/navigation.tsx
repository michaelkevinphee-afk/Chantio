'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LIENS = [
  { href: '/', libelle: 'Tableau de bord' },
  { href: '/interventions', libelle: 'Interventions' },
  { href: '/clients', libelle: 'Clients' },
  { href: '/equipe', libelle: 'Équipe' },
];

export function Navigation() {
  const chemin = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {LIENS.map((l) => {
        const actif = l.href === '/' ? chemin === '/' : chemin.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
              actif ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
            }`}
          >
            {actif && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-jaune align-middle" />}
            {l.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
