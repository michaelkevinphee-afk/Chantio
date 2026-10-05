'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  FILTRES_TYPE_CLIENT,
  LIBELLE_TYPE_CLIENT,
  TON_TYPE_CLIENT,
  contientMots,
  texteImmeubles,
  trouveDans,
  type ImmeubleRecherche,
  type TonSuivi,
  type TypeClient,
} from '@chantio/shared';
import { ChampRecherche, PucesFiltre } from '@/components/outils-liste';
import { Puce } from '@/components/ui';

export type CarteClient = {
  id: string;
  nom: string;
  type: TypeClient;
  initiales: string;
  /** « M. Leroy, gestionnaire · 01 45 20 11 08 · 2 immeubles » */
  sous: string;
  etat: { ton: TonSuivi; etiquette: string };
  /** Syndic ou bailleur : passe en tête de liste. */
  aDesImmeubles: boolean;
  /** Nom, contact, adresse, SIREN, téléphone, e-mail : où chercher le client lui-même. */
  texte: string;
  immeubles: ImmeubleRecherche[];
};

// La recherche et le type restent le temps de la visite, comme dans le bac (retour depuis une fiche, rechargement).
const CLE_MEMOIRE = 'chantio-clients-liste';
type Memoire = { q: string; type: string };
const abonnes = new Set<() => void>();
let enMemoire: string | null = null;
function lireBrut(): string {
  if (enMemoire === null) {
    try {
      enMemoire = sessionStorage.getItem(CLE_MEMOIRE) ?? '';
    } catch {
      enMemoire = '';
    }
  }
  return enMemoire;
}
function lireMemoire(brut: string): Memoire {
  try {
    const v = JSON.parse(brut || 'null') as Memoire | null;
    if (v && typeof v.q === 'string' && typeof v.type === 'string') return v;
  } catch {}
  return { q: '', type: 'tous' };
}
function ecrireMemoire(m: Memoire) {
  enMemoire = JSON.stringify(m);
  try {
    sessionStorage.setItem(CLE_MEMOIRE, enMemoire);
  } catch {}
  abonnes.forEach((f) => f());
}
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};

/** « Mes clients » : une carte par client, cherchée et filtrée dans le navigateur (vClients du bac). */
export function ListeClients({ cartes }: { cartes: CarteClient[] }) {
  const memoire = lireMemoire(useSyncExternalStore(abonner, lireBrut, () => ''));
  const changer = (m: Partial<Memoire>) => ecrireMemoire({ ...memoire, ...m });
  const { q, type } = memoire;

  const visibles = cartes
    .filter((c) => (type === 'tous' || c.type === type) && (!q.trim() || contientMots(`${c.texte} ${texteImmeubles(c.immeubles)}`, q)))
    .sort((a, b) => Number(b.aDesImmeubles) - Number(a.aDesImmeubles) || a.nom.localeCompare(b.nom));

  return (
    <section className="carte flex flex-col gap-3 p-4" aria-label="Liste des clients">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ChampRecherche
          etiquette="Rechercher un client"
          placeholder="Rechercher un client, un immeuble, un occupant…"
          loupe={false}
          valeur={q}
          onChange={(v) => changer({ q: v })}
        />
        <PucesFiltre etiquette="Type de client" choix={FILTRES_TYPE_CLIENT} actif={type} onChoisir={(v) => changer({ type: v })} />
      </div>

      <div className="flex flex-col gap-2">
        {visibles.length ? (
          visibles.map((c) => {
            const trouve = trouveDans(c.texte, c.immeubles, q);
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] border border-trait bg-white px-3.5 py-3 text-left transition hover:border-lavande hover:bg-[#F9FAFF] max-[700px]:grid-cols-[auto_minmax(0,1fr)] max-[700px]:text-[15px]"
              >
                <span aria-hidden="true" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-doux text-[13px] font-extrabold text-cobalt">
                  {c.initiales}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className="text-[15px] font-extrabold [overflow-wrap:anywhere]">{c.nom}</b>
                    <Puce ton={TON_TYPE_CLIENT[c.type]}>{LIBELLE_TYPE_CLIENT[c.type]}</Puce>
                  </span>
                  {c.sous && <span className="text-[13px] text-gris [overflow-wrap:anywhere] max-[700px]:text-[15px]">{c.sous}</span>}
                  {trouve && <span className="text-[13px] font-bold text-violet [overflow-wrap:anywhere] max-[700px]:text-[15px]">{trouve}</span>}
                </span>
                <span className="flex flex-col items-end gap-1 max-[700px]:col-start-2 max-[700px]:flex-row max-[700px]:flex-wrap max-[700px]:items-center max-[700px]:justify-between">
                  <Puce ton={c.etat.ton}>{c.etat.etiquette}</Puce>
                  <span className="text-[13px] font-bold whitespace-nowrap text-cobalt">
                    Voir la fiche <span aria-hidden="true">›</span>
                  </span>
                </span>
              </Link>
            );
          })
        ) : (
          <p className="px-4 py-8 text-center text-gris">
            {cartes.length ? 'Aucun client ne correspond.' : 'Aucun client pour l’instant. Créez le premier avec « Nouveau client ».'}
          </p>
        )}
      </div>
    </section>
  );
}
