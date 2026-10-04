'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LIBELLE_ROLE, type RoleMembre } from '@chantio/shared';
import { choisirEntreprise } from '@/app/(bureau)/entreprises/actions';
import { Icone } from './icones';
import { Roue } from './retour';

type Choix = { id: string; nom: string; role: RoleMembre; active: boolean };

/**
 * En-tête du menu : logo (ou nom) de l'entreprise active. Un clic ouvre la liste
 * des entreprises du compte pour passer de l'une à l'autre, en ajouter ou les gérer.
 */
export function SelecteurEntreprise({ nom, logo, entreprises }: { nom: string; logo: string | null; entreprises: Choix[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [bascule, setBascule] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement>(null);

  // Après un changement d'entreprise, la liste se referme.
  const [nomVu, setNomVu] = useState(nom);
  if (nomVu !== nom) {
    setNomVu(nom);
    setOuvert(false);
    setBascule(null);
  }

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => zone.current && !zone.current.contains(e.target as Node) && setOuvert(false);
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  return (
    <div ref={zone} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="-m-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-doux"
      >
        <span className="min-w-0 flex-1">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={nom} className="h-12 max-w-[200px] object-contain" />
          ) : (
            <span className="block truncate text-2xl font-extrabold leading-none tracking-[-0.03em]">{nom}</span>
          )}
        </span>
        <Icone nom="haut_bas" taille={18} className="shrink-0 text-gris" />
      </button>

      {ouvert && (
        <div className="carte apparition absolute top-full left-0 z-30 mt-3 w-[min(300px,calc(100vw-32px))] overflow-hidden p-1.5">
          <p className="px-3 pt-2 pb-1 text-xs font-bold tracking-wide text-gris uppercase">Vos entreprises</p>
          <ul>
            {entreprises.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={e.active || bascule !== null}
                  onClick={() => {
                    setBascule(e.id);
                    void choisirEntreprise(e.id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${e.active ? 'bg-doux' : 'hover:bg-fond'}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-bleu-doux font-extrabold text-bleu">
                    {e.nom.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.nom}</span>
                    <span className="block text-xs text-gris">{LIBELLE_ROLE[e.role]}</span>
                  </span>
                  {bascule === e.id ? (
                    <Roue />
                  ) : (
                    e.active && <Icone nom="valider" taille={18} className="shrink-0 text-cobalt" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 border-t border-trait pt-1.5">
            <Link
              href="/entreprises/nouvelle"
              onClick={() => setOuvert(false)}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 font-bold text-cobalt transition hover:bg-fond"
            >
              <Icone nom="plus" taille={18} /> Ajouter une entreprise
            </Link>
            <Link
              href="/entreprises"
              onClick={() => setOuvert(false)}
              className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 font-bold transition hover:bg-fond"
            >
              <Icone nom="entreprise" taille={18} className="text-gris" /> Gérer vos entreprises
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
