'use client';

import { useSearchParams } from 'next/navigation';
import { LienBouton } from '@/components/ui';
import { PARAMS_FICHE } from './adresse';

/** « Nouvelle intervention » : la fenêtre s'ouvre par-dessus la liste, avec ses filtres du moment. */
export function BoutonNouvelle() {
  const params = useSearchParams();
  const p = new URLSearchParams(params.toString());
  for (const cle of PARAMS_FICHE) p.delete(cle);
  p.set('nouvelle', '1');
  return (
    <LienBouton href={`/interventions?${p}`} scroll={false} prefetch={false}>
      Nouvelle intervention
    </LienBouton>
  );
}
