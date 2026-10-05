'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { masquerPremiersPas } from '@/app/actions-premiers-pas';
import { grade, MISSIONS, type IdMission } from '@/lib/premiers-pas';
import { lancerVisite } from '../guide/visite';

/** Casque de chantier du grade : lavande (Apprenti), pervenche (Compagnon), or (Maître artisan). */
function Casque({ n }: { n: number }) {
  const c = n >= 6 ? '#B7791F' : n >= 3 ? '#7C93F5' : '#B9C6FB';
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path d="M5 22a11 11 0 0 1 22 0z" fill={c} />
      <rect x="3" y="21" width="26" height="4" rx="2" fill={c} />
      <rect x="14" y="8" width="4" height="9" rx="1.5" fill="#fff" opacity=".6" />
    </svg>
  );
}

/**
 * Carte « Mes premiers pas » de l'Accueil : six missions, une barre et un grade (Apprenti, Compagnon,
 * Maître artisan). « Montre-moi » lance la visite guidée sur les vrais boutons ; la mission « fiche »
 * se fait sur le téléphone et renvoie à l'Aide. Une mission se coche aussi quand elle est faite pour de vrai.
 */
export function PremiersPas({ faites }: { faites: IdMission[] }) {
  const [enCours, demarrer] = useTransition();
  const n = faites.length;
  const g = grade(n);
  return (
    <section aria-labelledby="premiers-pas" className="rounded-[20px] border-2 border-lavande bg-gradient-to-b from-[#F7F9FF] to-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h2 id="premiers-pas" className="text-xl font-extrabold">
            Mes premiers pas
          </h2>
          <p className="text-[15px] text-gris">
            {n} mission{n > 1 ? 's' : ''} sur 6. Une bulle vous montre où cliquer, c’est vous qui faites.
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#FDF3DC] px-3.5 py-2 font-extrabold text-[#B7791F]">
          <Casque n={n} />
          <div>
            {g.nom}
            <span className="block text-[12.5px] font-semibold text-gris">{g.reste}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 mb-1.5 h-3.5 overflow-hidden rounded-full bg-doux" role="progressbar" aria-valuemin={0} aria-valuemax={6} aria-valuenow={n} aria-label="Missions faites">
        <div className="degrade h-full rounded-full transition-[width] duration-500" style={{ width: `${(n / 6) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[12.5px] font-semibold text-gris">
        <span>Apprenti</span>
        <span>Compagnon · 3</span>
        <span>Maître artisan · 6</span>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MISSIONS.map((m) => {
          const faite = faites.includes(m.id);
          return (
            <li key={m.id} className={`flex flex-col gap-2 rounded-[14px] border-[1.5px] p-3.5 ${faite ? 'border-menthe bg-vert-doux' : 'border-trait bg-white'}`}>
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-[2.5px] text-sm font-extrabold text-white ${faite ? 'border-menthe bg-menthe' : 'border-lavande'}`}
                >
                  {faite ? '✓' : ''}
                </span>
                <div className="min-w-0">
                  <p className="leading-snug font-extrabold">
                    {m.titre}
                    {faite && <span className="sr-only"> (faite)</span>}
                  </p>
                  <p className="text-[14px] text-gris">{faite ? m.bravo : m.phrase}</p>
                </div>
              </div>
              {!faite && (
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {m.gestes ? (
                    <button type="button" onClick={() => lancerVisite(m.id)} className="degrade rounded-[12px] px-3.5 py-2 text-[14.5px] font-bold text-white">
                      Montre-moi
                    </button>
                  ) : (
                    <Link href={`/aide#${m.aide}`} className="degrade rounded-[12px] px-3.5 py-2 text-[14.5px] font-bold text-white">
                      Voir comment faire
                    </Link>
                  )}
                  <span className="text-[12.5px] font-bold text-cobalt">
                    {m.gestes ? `${m.gestes.length} gestes · ` : 'Sur le téléphone · '}environ {m.duree}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={enCours}
        onClick={() => demarrer(async () => void (await masquerPremiersPas(true)))}
        className="mt-3 text-[13.5px] font-semibold text-gris underline hover:text-encre"
      >
        Masquer les premiers pas
      </button>
    </section>
  );
}
