'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import type { CaseAFaire } from '@chantio/shared';

export interface CaseAccueil {
  cle: CaseAFaire;
  titre: string;
  phrase: string;
  n: number;
  urgent: boolean;
  /** « 8 450 € HT », ou rien. */
  somme: string | null;
}

export interface RetardAccueil {
  cle: string;
  qui: string;
  montant: string;
  jours: number | null;
  lien: string;
}

const RETARDS_VISIBLES = 4;

/**
 * « En un coup d'œil » : les paiements clients en retard en grand (total, une ligne par facture),
 * puis une case par sorte de chose à faire (nombre, Urgent ou À faire, total). Un clic sur une case
 * n'affiche dessous que ses lignes, chacune avec le bouton qui la règle (rendues par le serveur : `details`).
 */
export function CoupDOeil({
  retards,
  totalRetards,
  cases,
  details,
}: {
  retards: RetardAccueil[];
  totalRetards: string;
  cases: CaseAccueil[];
  details: Partial<Record<CaseAFaire, ReactNode>>;
}) {
  const pleines = cases.filter((c) => c.n > 0);
  const premiere = pleines.find((c) => c.urgent) ?? pleines[0];
  const [choix, setChoix] = useState<CaseAFaire | null>(premiere?.cle ?? (retards.length ? 'retards' : null));
  const titre = useRef<HTMLHeadingElement>(null);
  const total = retards.length + cases.reduce((s, c) => s + c.n, 0);

  const choisir = (cle: CaseAFaire) => {
    setChoix(cle);
    requestAnimationFrame(() => titre.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const titreChoisi = choix === 'retards' ? 'Paiements clients en retard' : cases.find((c) => c.cle === choix)?.titre;

  return (
    <>
      <section aria-labelledby="aj-o" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="aj-o" className="text-[19px] font-extrabold max-[700px]:text-lg">
            En un coup d’œil
          </h2>
          <span className="text-[13px] text-gris">
            {total ? `${total} chose${total > 1 ? 's' : ''} à faire · cliquez une case pour voir ses lignes` : 'Tout est à jour : rien à faire pour l’instant.'}
          </span>
        </div>
        <div className="grid gap-3.5 min-[1100px]:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]">
          {/* Les retards de paiement, en grand. */}
          {retards.length ? (
            <div className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-[#F7B4AE] bg-white p-4">
              <b className="flex items-center gap-2 text-[15px] font-extrabold">
                <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-rouge" />
                Paiements clients en retard
              </b>
              <p>
                <span className="text-[32px] leading-none font-extrabold text-rouge tabular-nums">{totalRetards}</span>{' '}
                <span className="text-[13px] text-gris">
                  TTC sur {retards.length} facture{retards.length > 1 ? 's' : ''}
                </span>
              </p>
              <ul className="flex flex-col gap-1.5">
                {retards.slice(0, RETARDS_VISIBLES).map((r) => (
                  <li key={r.cle}>
                    <Link
                      href={r.lien}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[12px] bg-rouge-doux px-3 py-2 text-[13.5px] hover:brightness-[0.98]"
                    >
                      <b className="truncate font-extrabold">{r.qui}</b>
                      <span className="text-right font-extrabold tabular-nums">{r.montant}</span>
                      <span className="text-[12.5px] text-gris">Voir la facture</span>
                      {r.jours != null && (
                        <span className="text-right text-[12.5px] font-bold text-rouge">
                          {r.jours} jour{r.jours > 1 ? 's' : ''} de retard
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href="/factures?filtre=retard"
                  className="inline-flex min-h-10 items-center rounded-[10px] bg-rouge px-3 py-2 text-[13px] font-extrabold text-white max-[700px]:min-h-12 max-[700px]:flex-1 max-[700px]:justify-center"
                >
                  Voir les factures en retard
                </Link>
                {retards.length > RETARDS_VISIBLES && (
                  <button
                    type="button"
                    onClick={() => choisir('retards')}
                    className="inline-flex min-h-10 items-center rounded-[10px] bg-white px-3 py-2 text-[13px] font-extrabold text-cobalt ring-[1.5px] ring-lavande ring-inset hover:bg-doux max-[700px]:min-h-12"
                  >
                    Et {retards.length - RETARDS_VISIBLES} autre{retards.length - RETARDS_VISIBLES > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-[18px] bg-vert-doux p-4">
              <b className="text-[15px] font-extrabold text-vert">Aucun paiement client en retard</b>
              <span className="text-[13px] text-vert">Toutes les factures échues sont réglées.</span>
            </div>
          )}

          {/* Les six autres cases. */}
          <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3">
            {cases.map((c) => (
              <button
                key={c.cle}
                type="button"
                aria-pressed={choix === c.cle}
                disabled={!c.n}
                onClick={() => choisir(c.cle)}
                className="flex min-w-0 flex-col gap-1.5 rounded-[16px] border border-trait bg-white p-3.5 text-left transition enabled:hover:border-lavande enabled:hover:shadow-[0_4px_14px_rgba(47,84,235,.10)] disabled:cursor-default aria-pressed:border-cobalt aria-pressed:ring-2 aria-pressed:ring-cobalt"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-[28px] leading-none font-extrabold tabular-nums ${c.n ? '' : 'text-gris'}`}>{c.n}</span>
                  {c.n > 0 && (
                    <span className={`rounded-full px-2 py-[3px] text-[11.5px] font-extrabold ${c.urgent ? 'bg-rouge text-white' : 'bg-doux text-cobalt'}`}>
                      {c.urgent ? 'Urgent' : 'À faire'}
                    </span>
                  )}
                </span>
                <span className="text-[15px] leading-tight font-extrabold">{c.titre}</span>
                {c.somme && <span className="text-[13.5px] font-extrabold tabular-nums">{c.somme}</span>}
                <span className="text-[13px] text-gris">{c.n ? c.phrase : 'Rien pour l’instant.'}</span>
                {c.n > 0 && <span className="mt-auto pt-1 text-[13px] font-extrabold text-cobalt">Voir {c.n > 1 ? `les ${c.n}` : 'la ligne'} →</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      {choix && details[choix] && (
        <section aria-labelledby="aj-d" aria-live="polite" className="carte flex min-w-0 scroll-mt-4 flex-col gap-3 p-4">
          <h2 id="aj-d" ref={titre} className="text-[19px] font-extrabold max-[700px]:text-lg">
            {titreChoisi}
          </h2>
          {details[choix]}
        </section>
      )}
    </>
  );
}
