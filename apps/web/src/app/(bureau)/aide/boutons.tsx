'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { masquerPremiersPas } from '@/app/actions-premiers-pas';
import { lancerVisite } from '@/components/guide/visite';
import type { IdMission } from '@/lib/premiers-pas';

/** « Me montrer » : la visite guidée de la tâche, sur les vrais boutons. */
export function BoutonMontrer({ mission }: { mission: IdMission }) {
  return (
    <button type="button" onClick={() => lancerVisite(mission)} className="degrade mt-4 rounded-[12px] px-4 py-2.5 text-[15px] font-bold text-white">
      Me montrer
    </button>
  );
}

/** Remet la carte « Mes premiers pas » sur l'Accueil après l'avoir masquée. */
export function ReafficherPremiersPas() {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  return (
    <p className="text-[14px] text-gris">
      Vous avez masqué « Mes premiers pas » ?{' '}
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            await masquerPremiersPas(false);
            router.push('/');
          })
        }
        className="font-bold text-cobalt underline"
      >
        Les remettre sur l’Accueil
      </button>
    </p>
  );
}
