import { Titre } from '@/components/ui';
import { SECTIONS_AIDE } from '@/lib/aide-contenu';
import { BoutonMontrer, ReafficherPremiersPas } from './boutons';

export const metadata = { title: 'Aide · Chantio' };

/**
 * Aide : le guide de Chantio tâche par tâche (lib/aide-contenu.ts, le même que l'assistant de la bulle),
 * avec les vrais noms de boutons, une capture d'exemple et « Me montrer » qui lance la visite guidée.
 */
export default function Aide() {
  return (
    <>
      <Titre texte="Une tâche par carte, dans l’ordre d’une journée. « Me montrer » vous guide sur les vrais boutons. Une question précise ? La bulle en bas à droite, « Une question ».">
        Aide
      </Titre>

      <nav aria-label="Sommaire de l’aide" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS_AIDE.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-trait bg-white px-3.5 py-1.5 text-[14px] font-bold text-gris transition hover:border-lavande hover:text-cobalt">
            {s.titre.split(' : ')[0]}
          </a>
        ))}
      </nav>

      <div className="flex max-w-[980px] flex-col gap-5">
        {SECTIONS_AIDE.map((s) => (
          <section key={s.id} id={s.id} className="carte scroll-mt-6 p-5 sm:p-6">
            <h2 className="text-[22px] leading-tight font-extrabold text-balance">{s.titre}</h2>
            <p className="mt-1 text-[15px] text-gris">{s.quand}</p>
            <p className="mt-3 inline-block rounded-[8px] bg-doux px-2.5 py-1 text-[13.5px] font-bold text-cobalt">{s.ou}</p>
            <div className={`mt-4 grid gap-5 ${s.image ? (s.image.telephone ? 'md:grid-cols-[minmax(0,1fr)_220px]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]') : ''}`}>
              <div className="min-w-0">
                <ol className="flex flex-col gap-3">
                  {s.etapes.map((e, i) => (
                    <li key={i} className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 text-[16px] leading-snug">
                      <span className="grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-cobalt text-[14px] font-extrabold text-cobalt">{i + 1}</span>
                      <span className="pt-1">{e}</span>
                    </li>
                  ))}
                </ol>
                {s.astuce && <p className="mt-4 rounded-[12px] bg-fond px-4 py-3 text-[15px]">{s.astuce}</p>}
                {s.mission && <BoutonMontrer mission={s.mission} />}
              </div>
              {s.image && (
                <figure className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image.src}
                    alt={s.image.alt}
                    loading="lazy"
                    className={`w-full rounded-[14px] border border-trait ${s.image.telephone ? 'rounded-[24px] border-[6px] border-encre' : ''}`}
                  />
                  <figcaption className="mt-1.5 text-[12.5px] text-gris">Capture d’une entreprise d’exemple.</figcaption>
                </figure>
              )}
            </div>
          </section>
        ))}
        <ReafficherPremiersPas />
      </div>
    </>
  );
}
