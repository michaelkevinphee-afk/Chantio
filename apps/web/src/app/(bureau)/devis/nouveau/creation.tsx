'use client';

// Crée le brouillon prérempli une seule fois, puis ouvre l'éditeur à son adresse (/devis/<id>).

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { annoncer, Roue } from '@/components/retour';
import { creerDocumentPrerempli, type Preremplissage } from '../actions';

export function CreationBrouillon({ demande, retour }: { demande: Preremplissage; retour: string }) {
  const router = useRouter();
  const lance = useRef(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    void creerDocumentPrerempli(demande).then((r) => {
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      router.replace(`/devis/${r.id}`);
      annoncer(r.message);
    });
  }, [demande, router]);

  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-center">
      {erreur ? (
        <div className="flex max-w-md flex-col items-center gap-3">
          <p className="font-bold text-rouge" role="alert">
            {erreur}
          </p>
          <Link href={retour} className="font-bold text-cobalt hover:underline">
            Revenir à la liste
          </Link>
        </div>
      ) : (
        <p className="flex items-center gap-3 text-gris" aria-live="polite">
          <Roue /> Préparation du brouillon…
        </p>
      )}
    </div>
  );
}
