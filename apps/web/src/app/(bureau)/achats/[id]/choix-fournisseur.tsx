'use client';

import { useState } from 'react';
import type { Fournisseur } from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { ChampRecherche } from '@/components/outils-liste';
import { classeBouton } from '@/components/ui';

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const contient = (texte: string, q: string) =>
  sansAccents(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((m) => sansAccents(texte).includes(m));

/** Fenêtre « Choisir le fournisseur » du bac : recherche « Nom ou SIRET », liste, « + Nouveau fournisseur ». */
export function FenetreChoixFournisseur({
  fournisseurs,
  actuel,
  fermer,
  choisir,
  nouveau,
}: {
  fournisseurs: Fournisseur[];
  actuel: string | null;
  fermer: () => void;
  choisir: (f: Fournisseur) => void;
  nouveau: () => void;
}) {
  const [q, setQ] = useState('');
  const liste = [...fournisseurs]
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .filter((f) => !q.trim() || contient(`${f.nom} ${f.siret ?? ''}`, q));
  return (
    <Fenetre
      titre="Choisir le fournisseur"
      fermer={fermer}
      sansCroix
      pied={
        <>
          <button type="button" onClick={nouveau} className={classeBouton('secondaire', 'px-4 py-2.5')}>
            + Nouveau fournisseur
          </button>
          <button type="button" data-fermer className={classeBouton('secondaire', 'px-4 py-2.5')}>
            Annuler
          </button>
        </>
      }
    >
      <ChampRecherche etiquette="Rechercher un fournisseur" placeholder="Nom ou SIRET" valeur={q} onChange={setQ} autoFocus />
      <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
        {liste.length ? (
          liste.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => choisir(f)}
              aria-pressed={f.id === actuel}
              className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition hover:border-cobalt hover:bg-doux ${
                f.id === actuel ? 'border-cobalt bg-doux' : 'border-trait bg-white'
              }`}
            >
              <b>{f.nom}</b>
              <small className="text-[13px] text-gris">
                {f.categorie}
                {f.siret ? ` · SIRET ${f.siret}` : ''}
              </small>
            </button>
          ))
        ) : (
          <p className="py-6 text-center text-gris">Aucun fournisseur trouvé.</p>
        )}
      </div>
    </Fenetre>
  );
}
