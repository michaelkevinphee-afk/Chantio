'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { LIBELLE_STATUT, LIBELLE_TYPE, dateCourte, heure, numero, type StatutIntervention } from '@chantio/shared';
import { Puce, PuceStatut, Vide } from '@/components/ui';
import { LigneCliquable } from '@/components/volet';
import { adresse } from './adresse';
import { dansPeriode, FILTRES, PERIODES, type Periode } from './filtres';

type TypeLigne = keyof typeof LIBELLE_TYPE;

export type LigneIntervention = {
  id: string;
  numero: number;
  statut: StatutIntervention;
  date_prevue: string | null;
  heure_prevue: string | null;
  client: string;
  ville: string | null;
  motif: string;
  type: TypeLigne;
  urgence: string;
  techniciens: string;
};

const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Liste des interventions filtrée dans le navigateur : les filtres et la recherche
 * répondent au clic, sans recharger la page ni attendre le serveur.
 */
export function ListeInterventions({
  lignes,
  filtreInitial,
  rechercheInitiale,
  typeInitial,
  periodeInitiale,
  jour,
}: {
  lignes: LigneIntervention[];
  filtreInitial: StatutIntervention | 'toutes';
  rechercheInitiale: string;
  typeInitial: TypeLigne | 'tous';
  periodeInitiale: Periode;
  jour: string;
}) {
  const [filtre, setFiltre] = useState(filtreInitial);
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [type, setType] = useState(typeInitial);
  const [periode, setPeriode] = useState(periodeInitiale);
  const rechercheDiff = useDeferredValue(recherche);
  const criteres = { statut: filtre, q: recherche, type, periode };

  // Garde les filtres dans l'adresse (retour arrière, lien partagé) sans recharger.
  function majAdresse(c: Partial<typeof criteres>) {
    window.history.replaceState(null, '', adresse({ ...criteres, ...c }));
  }

  // La recherche, le type et la période d'abord ; les pastilles de statut comptent ce qui reste.
  const cherchees = useMemo(() => {
    const q = sansAccent(rechercheDiff.trim());
    return lignes.filter(
      (l) =>
        (type === 'tous' || l.type === type) &&
        dansPeriode(l.date_prevue, periode, jour) &&
        (!q || sansAccent(`${l.motif} ${l.client} ${l.ville ?? ''} ${l.techniciens} ${l.numero}`).includes(q)),
    );
  }, [lignes, rechercheDiff, type, periode, jour]);

  const nombres = useMemo(() => {
    const n: Record<string, number> = { toutes: cherchees.length };
    for (const l of cherchees) n[l.statut] = (n[l.statut] ?? 0) + 1;
    return n;
  }, [cherchees]);

  const visibles = filtre === 'toutes' ? cherchees : cherchees.filter((l) => l.statut === filtre);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTRES.map((f) => {
          const actif = f === filtre;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={actif}
              onClick={() => {
                setFiltre(f);
                majAdresse({ statut: f });
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-transform active:scale-[0.96] ${
                actif ? 'degrade border border-transparent text-white' : 'border border-trait bg-white text-encre hover:border-cobalt'
              }`}
            >
              {f === 'toutes' ? 'Toutes' : LIBELLE_STATUT[f]}
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs ${actif ? 'bg-white/25' : 'bg-doux text-gris'}`}>
                {nombres[f] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            majAdresse({ q: e.target.value });
          }}
          placeholder="Client, motif, ville…"
          aria-label="Rechercher"
          className="champ w-full py-2 sm:w-72"
        />
        <select
          value={type}
          onChange={(e) => {
            const t = e.target.value as TypeLigne | 'tous';
            setType(t);
            majAdresse({ type: t });
          }}
          aria-label="Type"
          className="champ w-auto py-2"
        >
          <option value="tous">Tous les types</option>
          {(Object.keys(LIBELLE_TYPE) as TypeLigne[]).map((t) => (
            <option key={t} value={t}>
              {LIBELLE_TYPE[t]}
            </option>
          ))}
        </select>
        <select
          value={periode}
          onChange={(e) => {
            const p = e.target.value as Periode;
            setPeriode(p);
            majAdresse({ periode: p });
          }}
          aria-label="Période"
          className="champ w-auto py-2"
        >
          {PERIODES.map(([v, lib]) => (
            <option key={v} value={v}>
              {lib}
            </option>
          ))}
        </select>
        <p className="ml-auto text-sm font-bold text-gris">
          {visibles.length} intervention{visibles.length > 1 ? 's' : ''}
        </p>
      </div>

      {visibles.length === 0 ? (
        <Vide titre="Aucune intervention">
          {lignes.length ? 'Rien ne correspond à ce filtre.' : 'Créez la première avec le bouton « Nouvelle intervention ».'}
        </Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-trait text-left text-xs uppercase text-gris">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Motif</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Technicien</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {visibles.map((i) => (
                <LigneCliquable key={i.id} href={adresse(criteres, i.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-gris">{numero(i.numero)}</td>
                  <td className="px-4 py-3 whitespace-nowrap" suppressHydrationWarning>
                    {dateCourte(i.date_prevue)} {heure(i.heure_prevue)}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {i.client}
                    {i.ville && <span className="block text-xs font-normal text-gris">{i.ville}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {i.motif} {i.urgence !== 'normale' && <Puce ton="rouge">{i.urgence === 'urgente' ? 'Urgent' : 'Astreinte'}</Puce>}
                  </td>
                  <td className="px-4 py-3">{LIBELLE_TYPE[i.type]}</td>
                  <td className="px-4 py-3">{i.techniciens}</td>
                  <td className="px-4 py-3">
                    <PuceStatut statut={i.statut} />
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
