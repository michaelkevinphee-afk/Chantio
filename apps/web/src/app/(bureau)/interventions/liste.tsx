'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { LIBELLE_URGENCE, TON_FAMILLE, type FamilleIntervention, type StatutIntervention, type Urgence } from '@chantio/shared';
import { CompteursOnglets } from '@/components/compteurs-onglets';
import { ChampRecherche, MenuFiltre } from '@/components/outils-liste';
import { Puce, PuceStatut } from '@/components/ui';
import { adresse } from './adresse';
import { dansFiltre, dansPeriode, FILTRES, PERIODES, TYPES, type CleFiltre, type CleType, type Periode } from './filtres';

/** Une rangée de la liste, préparée par la page (serveur). */
export type LigneIntervention = {
  id: string;
  reference: string;
  /** État affiché (une fiche renvoyée par le bureau compte « À reprendre »). */
  etat: StatutIntervention;
  famille: FamilleIntervention;
  libelleType: string;
  motif: string;
  /** « Cabinet Dupré Gestion · ordre de service 55790 · contrat CT-2024-008 » */
  sousMotif: string;
  lieu: string;
  occupant: string;
  quand: string;
  aPlacer: boolean;
  techniciens: string;
  urgence: Urgence;
  devisAEtablir: boolean;
  date_prevue: string | null;
  date_fin: string | null;
  /** Texte de recherche, en minuscules et sans accents. */
  recherche: string;
};

const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Au-delà, la liste propose d'afficher le reste (la recherche, elle, porte toujours sur tout). */
const PAR_PAGE = 300;
/** Sur téléphone, les deux menus tiennent côte à côte en entier (« Toutes les dates »). */
const MENU_TEL = 'max-[700px]:pl-2.5 max-[700px]:pr-2 max-[700px]:text-[14px] max-[700px]:font-medium';

/**
 * Liste des interventions, comme le bac : compteurs-onglets, recherche, type et période dans la même carte,
 * puis une rangée par intervention (une petite carte sur téléphone). Tout se filtre dans le navigateur,
 * sans recharger ; l'adresse suit, pour le retour arrière et les liens partagés.
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
  filtreInitial: CleFiltre;
  rechercheInitiale: string;
  typeInitial: CleType;
  periodeInitiale: Periode;
  jour: string;
}) {
  const [filtre, setFiltre] = useState(filtreInitial);
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [type, setType] = useState(typeInitial);
  const [periode, setPeriode] = useState(periodeInitiale);
  const [tout, setTout] = useState(false);
  const rechercheDiff = useDeferredValue(recherche);
  const criteres = { statut: filtre, q: recherche, type, periode };

  // Garde les filtres dans l'adresse (retour arrière, lien partagé) sans recharger.
  function majAdresse(c: Partial<typeof criteres>) {
    window.history.replaceState(null, '', adresse({ ...criteres, ...c }));
    setTout(false);
  }

  // La base : recherche, type et période ; les compteurs comptent dans cette base, comme le bac.
  const base = useMemo(() => {
    const mots = sansAccent(rechercheDiff.trim()).split(/\s+/).filter(Boolean);
    return lignes
      .filter((l) => (type === 'tous' || l.famille === type) && dansPeriode(l.date_prevue, periode, jour, l.date_fin) && mots.every((m) => l.recherche.includes(m)))
      .sort((a, b) => {
        if (!a.date_prevue !== !b.date_prevue) return a.date_prevue ? 1 : -1;
        return (b.date_prevue ?? '').localeCompare(a.date_prevue ?? '') || b.reference.localeCompare(a.reference);
      });
  }, [lignes, rechercheDiff, type, periode, jour]);
  const visibles = base.filter((l) => dansFiltre(l.etat, filtre));
  const affichees = tout ? visibles : visibles.slice(0, PAR_PAGE);

  return (
    <div className="carte p-4 max-sm:p-3">
      <CompteursOnglets
        etiquette="Filtrer par état"
        actif={filtre}
        onChoisir={(cle) => {
          setFiltre(cle as CleFiltre);
          majAdresse({ statut: cle as CleFiltre });
        }}
        compteurs={FILTRES.map((f) => ({
          cle: f.cle,
          libelle: f.libelle,
          ton: f.ton,
          nombre: base.filter((l) => dansFiltre(l.etat, f.cle)).length,
        }))}
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <ChampRecherche
          etiquette="Rechercher une intervention"
          placeholder="Rechercher : client, adresse, occupant, motif, numéro…"
          loupe={false}
          valeur={recherche}
          onChange={(v) => {
            setRecherche(v);
            majAdresse({ q: v });
          }}
          className="max-[700px]:basis-full"
        />
        <MenuFiltre
          etiquette="Type"
          className={MENU_TEL}
          choix={TYPES}
          valeur={type}
          onChange={(v) => {
            setType(v as CleType);
            majAdresse({ type: v as CleType });
          }}
        />
        <MenuFiltre
          etiquette="Période"
          className={MENU_TEL}
          choix={PERIODES}
          valeur={periode}
          onChange={(v) => {
            setPeriode(v as Periode);
            majAdresse({ periode: v as Periode });
          }}
        />
      </div>

      {visibles.length ? (
        <div className="flex flex-col">
          <div className="iv-tete" aria-hidden="true">
            <span>Intervention</span>
            <span>Lieu et occupant</span>
            <span>Quand</span>
            <span>Technicien</span>
            <span>État</span>
            <span>Type</span>
          </div>
          {affichees.map((l) => (
            <Link key={l.id} href={adresse(criteres, l.id)} prefetch={false} scroll={false} className="iv-ligne">
              <span className="iv-motif">
                <b>{l.motif}</b>
                {l.sousMotif && <small>{l.sousMotif}</small>}
              </span>
              <span className="iv-lieu">
                {l.lieu}
                {l.occupant && <small>{l.occupant}</small>}
              </span>
              <span className="iv-quand">{l.aPlacer ? <span className="iv-gris">{l.quand}</span> : l.quand}</span>
              <span className="iv-tech">{l.techniciens}</span>
              <span className="iv-etat">
                <PuceStatut statut={l.etat} />
                {l.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[l.urgence]}</Puce>}
                {l.devisAEtablir && <Puce ton="violet">Devis à établir</Puce>}
              </span>
              <span className="iv-num">
                <Puce ton={TON_FAMILLE[l.famille]}>{l.libelleType}</Puce>
                <small>{l.reference}</small>
              </span>
            </Link>
          ))}
          {affichees.length < visibles.length && (
            <button type="button" className="mt-3 self-center text-[14px] font-bold text-cobalt hover:underline" onClick={() => setTout(true)}>
              Afficher les {visibles.length - affichees.length} autres interventions
            </button>
          )}
        </div>
      ) : (
        <p className="iv-vide">Aucune intervention {rechercheDiff.trim() ? `pour « ${rechercheDiff.trim()} »` : 'dans cette sélection'}.</p>
      )}
    </div>
  );
}
