'use client';

import { useRouter } from 'next/navigation';
import { Icone } from '@/components/icones';

/** Les deux vues de Chiffres (Objectifs de l'année est réservé au dirigeant). */
const VUES = [
  { cle: 'point', libelle: 'Activité en cours', href: '/chiffres' },
  { cle: 'annee', libelle: 'Objectifs de l’année', href: '/chiffres?vue=annee' },
] as const;

/** Menu déroulant « Activité en cours » / « Objectifs de l’année », en haut de Chiffres. */
export function OngletsChiffres({ actif }: { actif: 'point' | 'annee' }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Vue de Chiffres</span>
      <select
        value={actif}
        onChange={(e) => router.push(VUES.find((v) => v.cle === e.target.value)!.href)}
        className="cursor-pointer appearance-none rounded-xl border border-trait bg-white py-2 pr-9 pl-3.5 text-sm font-bold text-encre shadow-[0_1px_3px_rgba(16,26,61,.08)] hover:border-cobalt focus:border-cobalt focus:outline-none"
      >
        {VUES.map((v) => (
          <option key={v.cle} value={v.cle}>
            {v.libelle}
          </option>
        ))}
      </select>
      <Icone nom="chevron_bas" taille={16} className="pointer-events-none absolute right-3 text-gris" />
    </label>
  );
}
