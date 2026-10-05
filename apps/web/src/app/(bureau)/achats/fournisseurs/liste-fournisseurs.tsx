'use client';

import { useMemo, useState } from 'react';
import { achatsDepuisJanvier, euro, resteFournisseur, type Fournisseur } from '@chantio/shared';
import { ChampRecherche } from '@/components/outils-liste';
import { classeBouton, Titre } from '@/components/ui';
import { BasculeAchats } from '../bascule';
import { FenetreFournisseur, type FactureDuFournisseur } from '../fournisseur';

export type FactureFournisseur = FactureDuFournisseur & { fournisseur_id: string; paye: number };

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const contient = (texte: string, q: string) =>
  sansAccents(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((m) => sansAccents(texte).includes(m));

type Ligne = { f: Fournisseur; factures: FactureFournisseur[]; annee: number; reste: number };

/** « Fournisseurs » du bac : phrase d'introduction, « + Créer un fournisseur », recherche, tableau, fenêtre du fournisseur. */
export function ListeFournisseurs({ fournisseurs, factures, jour }: { fournisseurs: Fournisseur[]; factures: FactureFournisseur[]; jour: string }) {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState<Fournisseur | 'nouveau' | null>(null);

  const parFournisseur = useMemo(() => {
    const m = new Map<string, FactureFournisseur[]>();
    for (const a of factures) m.set(a.fournisseur_id, [...(m.get(a.fournisseur_id) ?? []), a]);
    return m;
  }, [factures]);

  const lignes: Ligne[] = fournisseurs
    .filter((f) => !q.trim() || contient([f.nom, f.siret ?? '', f.categorie].join(' '), q))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map((f) => {
      const A = parFournisseur.get(f.id) ?? [];
      return { f, factures: A, annee: achatsDepuisJanvier(A, jour), reste: resteFournisseur(A) };
    });

  const nomFournisseur = (l: Ligne) => (
    <>
      <button type="button" onClick={() => setOuvert(l.f)} className="text-left font-bold text-encre hover:underline">
        {l.f.nom}
      </button>
      <small className="mt-0.5 block text-[12.5px] font-medium text-gris">
        {l.f.categorie || 'Autre'}
        {l.f.lu_sur_facture && (
          <>
            {' · '}
            <b className="font-bold text-violet">lu sur une facture</b>
          </>
        )}
      </small>
    </>
  );
  const pluriel = (n: number) => `${n} ${n > 1 ? 'factures' : 'facture'}`;

  return (
    <>
      <BasculeAchats actif="fournisseurs" />
      <Titre
        texte="Les entreprises qui vous facturent : négoces, loueurs, sous-traitants… Ceux lus sur une facture s’ajoutent tout seuls."
        actions={
          <button type="button" className={classeBouton('principal', 'px-4 py-2.5')} onClick={() => setOuvert('nouveau')}>
            <span aria-hidden="true">+</span> Créer un fournisseur
          </button>
        }
      >
        Fournisseurs
      </Titre>

      <section aria-label="Fournisseurs" className="carte p-4 pt-[18px] sm:p-5">
        <div className="mb-4 flex">
          <ChampRecherche etiquette="Rechercher un fournisseur" placeholder="Nom, SIRET ou catégorie" valeur={q} onChange={setQ} className="flex-1" />
        </div>

        {!lignes.length ? (
          <div className="px-3 py-10 text-center text-[15px] text-gris">
            {q.trim() ? `Aucun fournisseur pour « ${q.trim()} ».` : 'Aucun fournisseur pour l’instant : importez une facture ou créez-en un.'}
          </div>
        ) : (
          <>
            {/* Écran large : le tableau. La rangée entière ouvre la fiche du fournisseur. */}
            <table aria-label="Fournisseurs" className="w-full border-collapse text-[14.5px] tabular-nums max-[1180px]:hidden">
              <thead>
                <tr>
                  {[
                    ['Fournisseur', 'text-left'],
                    ['SIRET', 'text-left'],
                    ['Factures', 'text-left'],
                    ['Achats depuis janvier', 'text-right'],
                    ['Reste à payer', 'text-right'],
                  ].map(([t, c]) => (
                    <th
                      key={t}
                      scope="col"
                      className={`bg-fond px-2.5 py-3 align-middle text-[13.5px] font-bold whitespace-nowrap text-gris first:rounded-l-xl last:rounded-r-xl ${c}`}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr
                    key={l.f.id}
                    onClick={(e) => !(e.target as HTMLElement).closest('button, a') && setOuvert(l.f)}
                    className="cursor-pointer border-b border-trait transition-colors hover:bg-[#F9FAFF]"
                  >
                    <td className="px-2.5 py-[15px] align-middle">{nomFournisseur(l)}</td>
                    <td className="px-2.5 py-[15px] align-middle font-mono text-[13px]">{l.f.siret || '—'}</td>
                    <td className="px-2.5 py-[15px] align-middle">{l.factures.length}</td>
                    <td className="px-2.5 py-[15px] text-right align-middle font-extrabold whitespace-nowrap">{euro(l.annee)}</td>
                    <td className="px-2.5 py-[15px] text-right align-middle whitespace-nowrap">{l.reste ? euro(l.reste) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Écran moyen et téléphone : une petite carte par fournisseur. */}
            <ul aria-label="Fournisseurs" className="min-[1181px]:hidden">
              {lignes.map((l) => (
                <li
                  key={l.f.id}
                  onClick={(e) => !(e.target as HTMLElement).closest('button, a') && setOuvert(l.f)}
                  className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-trait px-0.5 py-3.5"
                >
                  <div className="min-w-0">{nomFournisseur(l)}</div>
                  <b className="text-right font-extrabold whitespace-nowrap tabular-nums">{euro(l.annee)}</b>
                  <span />
                  <span className="text-right text-[13px] whitespace-nowrap text-gris tabular-nums">{l.reste ? euro(l.reste) : '—'}</span>
                  <div className="col-span-2 text-[12.5px] text-gris">
                    {pluriel(l.factures.length)}
                    {l.reste ? ` · reste à payer ${euro(l.reste)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {ouvert && (
        <FenetreFournisseur
          key={ouvert === 'nouveau' ? 'nouveau' : ouvert.id}
          fournisseur={ouvert === 'nouveau' ? null : ouvert}
          factures={ouvert === 'nouveau' ? undefined : (parFournisseur.get(ouvert.id) ?? [])}
          fermer={() => setOuvert(null)}
        />
      )}
    </>
  );
}
