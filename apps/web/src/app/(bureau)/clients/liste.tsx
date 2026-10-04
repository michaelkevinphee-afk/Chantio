'use client';

import { useState } from 'react';
import { LIBELLE_TYPE_CLIENT, type TonSuivi, type TypeClient } from '@chantio/shared';
import { Puce, Vide } from '@/components/ui';
import { LigneCliquable } from '@/components/volet';

export type LigneClient = {
  id: string;
  nom: string;
  type: TypeClient;
  telephone: string | null;
  adresse: string;
  /** Autres adresses (immeubles) que la première. */
  autres: number;
  interventions: number;
  etat: { ton: TonSuivi; etiquette: string; urgent: number; afaire: number };
  /** Texte où chercher : nom, contact, adresses, occupants. */
  recherche: string;
};

const FILTRES = [
  ['tous', 'Tous'],
  ['urgent', 'Urgents'],
  ['afaire', 'Choses à faire'],
  ['ajour', 'À jour'],
] as const;
type Filtre = (typeof FILTRES)[number][0];

const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** « Mes clients » : chaque client avec son état, filtré et cherché dans le navigateur. */
export function ListeClients({ lignes }: { lignes: LigneClient[] }) {
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [type, setType] = useState<TypeClient | 'tous'>('tous');

  const q = sansAccent(recherche.trim());
  const cherchees = lignes.filter((l) => (type === 'tous' || l.type === type) && (!q || sansAccent(l.recherche).includes(q)));
  const garde: Record<Filtre, (l: LigneClient) => boolean> = {
    tous: () => true,
    urgent: (l) => l.etat.urgent > 0,
    afaire: (l) => l.etat.urgent + l.etat.afaire > 0,
    ajour: (l) => l.etat.urgent + l.etat.afaire === 0,
  };
  const visibles = cherchees.filter(garde[filtre]);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTRES.map(([f, libelle]) => {
          const actif = f === filtre;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={actif}
              onClick={() => setFiltre(f)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-transform active:scale-[0.96] ${
                actif ? 'degrade border border-transparent text-white' : 'border border-trait bg-white text-encre hover:border-cobalt'
              }`}
            >
              {libelle}
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs ${actif ? 'bg-white/25' : 'bg-doux text-gris'}`}>
                {cherchees.filter(garde[f]).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Client, immeuble, occupant…"
          aria-label="Rechercher un client"
          className="champ w-full py-2 sm:w-72"
        />
        <select value={type} onChange={(e) => setType(e.target.value as TypeClient | 'tous')} aria-label="Type de client" className="champ w-auto py-2">
          <option value="tous">Tous les types</option>
          {(Object.keys(LIBELLE_TYPE_CLIENT) as TypeClient[]).map((t) => (
            <option key={t} value={t}>
              {LIBELLE_TYPE_CLIENT[t]}
            </option>
          ))}
        </select>
        <p className="ml-auto text-sm font-bold text-gris">
          {visibles.length} client{visibles.length > 1 ? 's' : ''}
        </p>
      </div>

      {visibles.length === 0 ? (
        <Vide titre="Aucun client">{lignes.length ? 'Rien ne correspond à ce filtre.' : 'Ajoutez votre premier client avec le bouton « Nouveau client ».'}</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-trait text-left text-xs uppercase text-gris">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3 text-right">Interventions</th>
                <th className="px-4 py-3">Où on en est</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {visibles.map((c) => (
                <LigneCliquable key={c.id} href={`/clients?fiche=${c.id}`}>
                  <td className="px-4 py-3 font-semibold">{c.nom}</td>
                  <td className="px-4 py-3">{LIBELLE_TYPE_CLIENT[c.type]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.telephone ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.adresse || '—'}
                    {c.autres > 0 && <span className="text-gris"> (+{c.autres})</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{c.interventions}</td>
                  <td className="px-4 py-3">
                    <Puce ton={c.etat.ton}>{c.etat.etiquette}</Puce>
                  </td>
                </LigneCliquable>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
