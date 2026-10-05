'use client';

import { useState, useTransition } from 'react';
import { recapRetours } from '@/app/actions-retours';
import { Icone } from '@/components/icones';
import { annoncer, Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';

/** « Faire le récap » : Claude regroupe les retours en attente par thème, avec les priorités. */
export function RecapRetours() {
  const [enCours, demarrer] = useTransition();
  const [recap, setRecap] = useState<{ texte: string } | { erreur: string } | null>(null);

  const lancer = () =>
    demarrer(async () => {
      setRecap(await recapRetours().catch(() => ({ erreur: 'Le récap n’a pas pu être fait : relancez-le dans un instant.' })));
    });

  const copier = async (texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      annoncer('Récap copié');
    } catch {
      annoncer('Copie impossible : sélectionnez le texte à la main', 'erreur');
    }
  };

  return (
    <div className="border-b border-trait py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Bouton type="button" onClick={lancer} disabled={enCours} aria-busy={enCours} className="!px-4 !py-2.5 text-sm">
          {enCours ? <Roue /> : <Icone nom="p_retours" taille={18} />}
          {enCours ? 'Claude lit les retours…' : recap && 'texte' in recap ? 'Refaire le récap' : 'Faire le récap'}
        </Bouton>
        <span className="text-[13px] text-gris">Les retours pas encore faits, regroupés par thème avec les priorités.</span>
      </div>
      {recap && 'erreur' in recap && <p className="mt-3 text-sm font-semibold text-rouge">{recap.erreur}</p>}
      {recap && 'texte' in recap && (
        <div className="mt-4 rounded-[16px] border border-trait bg-fond p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold">Récap des retours</p>
            <button type="button" onClick={() => void copier(recap.texte)} className="text-[13px] font-bold text-cobalt hover:underline">
              Copier
            </button>
          </div>
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{recap.texte}</p>
        </div>
      )}
    </div>
  );
}
