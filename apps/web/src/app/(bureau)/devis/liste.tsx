'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dateMois, euro, LIBELLE_PARCOURS, nombreBac, statutDocument, type Parcours, type TypeFacture } from '@chantio/shared';
import { CompteursOnglets } from '@/components/compteurs-onglets';
import { Icone } from '@/components/icones';
import { LienVentes } from '@/components/lien-ventes';
import { ChampRecherche, MenuFiltre } from '@/components/outils-liste';
import { LienLigne, TableauTrie, type Colonne } from '@/components/tableau-trie';
import { classeBouton, LienBouton, Puce, Titre } from '@/components/ui';
import { FenetreNouveauDocument } from './liste-nouveau';
import type { ClientFenetre } from './liste-donnees';
import {
  cookieListe,
  defautSegment,
  ecrireMemoire,
  lignesDeBase,
  PERIODES,
  SEGMENTS,
  TRI_DEFAUT,
  TYPE_FACTURE_COURT,
  TYPES,
  lireMemoire,
  type GenreListe,
  type LigneVente,
  type MemoireListe,
} from './liste-regles';

// « Mes devis » et « Mes factures », comme le tableau de gestion du bac : recherche, « Tous les types »,
// « Toutes les dates », compteurs avec montants HT, tableau trié (date d'émission décroissante, brouillons
// en haut), 25 lignes par page, une petite carte par document sous 1180 px. Les filtres restent dans
// l'adresse (?filtre=, ?type=, ?periode=, ?q=) pour qu'un lien ou un rechargement retrouve la même vue.

export interface CriteresListe {
  segment: string;
  type: string;
  periode: string;
  q: string;
  nouveau: boolean;
  /** Page du tableau au retour de l'éditeur. */
  page: number;
}

const HORLOGE = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mr-[5px] inline align-[-2px]">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M5 3 2 6M19 3l3 3" />
  </svg>
);

/** « 1 180,35 € », « − 165,00 € » pour un avoir (montants enregistrés signés). */
const montant = (n: number) => (n < 0 ? `− ${euro(-n)}` : euro(n));

const typeLibelle = (l: LigneVente) => (l.genre === 'facture' ? TYPE_FACTURE_COURT[l.type as TypeFacture] : LIBELLE_PARCOURS[l.type as Parcours]) ?? '—';

function Statut({ l }: { l: LigneVente }) {
  const s = l.enRetard
    ? { libelle: 'En retard', ton: 'rouge' as const }
    : l.annuleeParAvoir
      ? { libelle: 'Annulée par un avoir', ton: 'gris' as const }
      : statutDocument(l);
  return (
    <>
      <Puce ton={s.ton}>{s.libelle}</Puce>
      {l.facturePct !== null && <small className="mt-1 block text-[12.5px] font-medium text-gris">facturé {nombreBac(l.facturePct)} %</small>}
    </>
  );
}

function Echeance({ l, prefixe }: { l: LigneVente; prefixe?: string }) {
  if (!l.echeance) return null;
  return (
    <span className={l.echeanceDepassee ? 'font-semibold text-[#B42318]' : ''}>
      {l.echeanceDepassee && HORLOGE}
      {prefixe}
      {dateMois(l.echeance)}
    </span>
  );
}

/** Réponse à un appel d'offres encore en brouillon : la date est celle de la réponse à rendre. */
const reponseARendre = (l: LigneVente) => l.ao && l.statut === 'brouillon' && !!l.echeance;

function Objet({ l, tronque }: { l: LigneVente; tronque: boolean }) {
  if (!l.objet) return null;
  return (
    <small
      className={`mt-0.5 block text-[12.5px] font-medium text-gris ${tronque ? 'max-w-[230px] truncate max-[1360px]:max-w-[170px]' : ''}`}
      title={tronque ? l.objet : undefined}
    >
      {l.ao && <b className="font-bold text-violet">Appel d’offres</b>}
      {l.ao && ' · '}
      {l.objet}
    </small>
  );
}

export function ListeDocuments({
  genre,
  lignes,
  aujourdhui,
  initial,
  client,
  clients,
  memoire: memoireServeur,
  garder,
}: {
  genre: GenreListe;
  lignes: LigneVente[];
  aujourdhui: string;
  initial: CriteresListe;
  /** Tri, résultats par page et vues gardés (cookie), comme etat.docTri / docParPage du bac. */
  memoire: MemoireListe;
  /** Retour de l'éditeur (?garder=1) : la liste reprend la vue gardée. */
  garder: boolean;
  /** Liste ouverte depuis une fiche client (?client=) : filtrée sur ce client, avec « ← Retour à la fiche de … ». */
  client: { id: string; nom: string } | null;
  clients: ClientFenetre[];
}) {
  const fac = genre === 'facture';
  // Dans le navigateur, le cookie fait foi (la page peut venir du cache du routeur) ; sur le serveur, celui de la requête.
  const [depart] = useState(() => {
    const memoire = typeof document === 'undefined' ? memoireServeur : lireMemoire(cookieListe());
    const vue = garder ? memoire.vues[genre] : undefined;
    return { memoire, criteres: vue ? { ...initial, ...vue, nouveau: false } : initial };
  });
  const memoire = depart.memoire;
  const [c, setC] = useState<CriteresListe>(depart.criteres);

  // Les critères suivent l'adresse sans recharger la page (le bouton Précédent et un lien partagé retrouvent la vue).
  const majAdresse = (n: CriteresListe) => {
    const u = new URL(window.location.href);
    const poser = (cle: string, v: string | null) => (v ? u.searchParams.set(cle, v) : u.searchParams.delete(cle));
    u.searchParams.delete('onglet');
    u.searchParams.delete('garder');
    poser('filtre', n.segment === defautSegment(genre) ? null : n.segment);
    poser('type', n.type === 'tous' ? null : n.type);
    poser('periode', n.periode === 'tout' ? null : n.periode);
    poser('q', client && n.q === client.nom ? null : n.q.trim() || null);
    poser('nouveau', n.nouveau ? '1' : null);
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}`);
  };

  // Mémoire de la liste (cookie de session) : la croix de l'éditeur ramène au même compteur, type, période,
  // recherche, tri et page ; le menu rouvre la liste sans filtre mais garde le tri (comme le bac).
  const courant = useRef(c);
  const tableau = useRef({ tri: memoire.tri, page: depart.criteres.page, parPage: memoire.parPage });
  const memoriser = () => {
    const n = courant.current;
    const t = tableau.current;
    ecrireMemoire({
      tri: t.tri,
      parPage: t.parPage,
      vues: client ? memoire.vues : { ...memoire.vues, [genre]: { segment: n.segment, type: n.type, periode: n.periode, q: n.q, page: t.page } },
    });
  };

  const changer = (p: Partial<CriteresListe>) => {
    const n = { ...c, ...p };
    setC(n);
    courant.current = n;
    majAdresse(n);
    memoriser();
  };

  // Retour de l'éditeur (?garder=1) : l'adresse reprend les filtres retrouvés.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('garder')) majAdresse(courant.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = useMemo(() => lignesDeBase(lignes, { q: c.q.trim(), clientAuto: client, type: c.type, periode: c.periode }, aujourdhui), [lignes, c.q, c.type, c.periode, client, aujourdhui]);
  const segments = SEGMENTS[genre];
  const segment = segments.find((s) => s.cle === c.segment) ?? segments[0];
  const affichees = base.filter(segment.test);

  const lien = (l: LigneVente) => `/devis/${l.id}${client ? '?retour=client' : ''}`;

  const colonnes: Colonne<LigneVente>[] = [
    { cle: 'statut', titre: 'Statut', rendu: (l) => <Statut l={l} /> },
    { cle: 'type', titre: 'Type', rendu: typeLibelle, className: 'whitespace-nowrap max-[1360px]:hidden' },
    {
      cle: 'client',
      titre: 'Client',
      tri: (l) => l.client.toLowerCase(),
      sensInitial: 'asc',
      rendu: (l) => (
        <>
          <LienLigne href={lien(l)}>{l.client}</LienLigne>
          <Objet l={l} tronque />
        </>
      ),
    },
    {
      cle: 'num',
      titre: fac ? 'N° de facture' : 'N° de devis',
      tri: (l) => l.numero ?? '',
      rendu: (l) => <span className="font-mono text-[13px] whitespace-nowrap">{l.numero ?? '—'}</span>,
    },
    {
      cle: 'date',
      titre: 'Date d’émission',
      // Les brouillons en haut, puis du plus récent au plus ancien (comme le bac).
      tri: (l) => (l.statut === 'brouillon' ? '9999' : l.date),
      rendu: (l) => (l.emission ? dateMois(l.emission) : '—'),
      className: 'whitespace-nowrap',
    },
    {
      cle: 'ech',
      titre: fac ? 'Date d’échéance' : 'Valable jusqu’au',
      tri: (l) => l.echeance ?? '',
      rendu: (l) =>
        l.echeance ? (
          <>
            <Echeance l={l} />
            {reponseARendre(l) && <small className="block text-xs font-semibold text-gris">réponse à rendre</small>}
          </>
        ) : (
          '—'
        ),
      className: 'whitespace-nowrap',
    },
    { cle: 'ht', titre: 'Total HT', aligne: 'droite', tri: (l) => l.ht, rendu: (l) => <b className="font-bold whitespace-nowrap">{montant(l.ht)}</b> },
    { cle: 'ttc', titre: 'Total TTC', aligne: 'droite', tri: (l) => l.ttc, rendu: (l) => <span className="whitespace-nowrap">{montant(l.ttc)}</span> },
  ];

  // Sous 1180 px : client et Total HT, statut et TTC, puis numéro et dates sur une ligne grise.
  const carte = (l: LigneVente) => {
    const meta = [
      l.numero && (
        <span key="n" className="font-mono text-xs">
          {l.numero}
        </span>
      ),
      l.emission ? `${fac ? 'émise' : 'émis'} le ${dateMois(l.emission)}` : `pas encore ${fac ? 'émise' : 'émis'}`,
      l.echeance && <Echeance key="e" l={l} prefixe={fac ? 'échéance ' : reponseARendre(l) ? 'réponse avant le ' : 'valable jusqu’au '} />,
    ]
      .filter(Boolean)
      .flatMap((x, i) => (i ? [' · ', x] : [x]));
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <LienLigne href={lien(l)}>{l.client}</LienLigne>
          <Objet l={l} tronque={false} />
        </div>
        <b className="text-right font-bold whitespace-nowrap tabular-nums">{montant(l.ht)}</b>
        <div className="min-w-0">
          <Statut l={l} />
        </div>
        <span className="text-right text-[13px] whitespace-nowrap text-gris tabular-nums">{montant(l.ttc)}</span>
        <div className="col-span-2 text-[12.5px] text-gris">{meta}</div>
      </div>
    );
  };

  const q = c.q.trim();

  return (
    <>
      <Titre
        retour={client ? <LienVentes fiche={{ href: `/clients/${client.id}`, nom: client.nom }} /> : <LienVentes />}
        actions={
          <>
            <LienBouton href={fac ? '/devis/import?depuis=factures' : '/devis/import'} variante="secondaire" className="px-4 py-2.5 !text-cobalt">
              Importer
            </LienBouton>
            <button type="button" className={classeBouton('principal', 'px-4 py-2.5')} onClick={() => changer({ nouveau: true })}>
              <Icone nom="plus" taille={18} />
              {fac ? 'Créer une facture' : 'Créer un devis'}
            </button>
          </>
        }
      >
        {fac ? 'Mes factures' : 'Mes devis'}
      </Titre>

      <section aria-label={fac ? 'Factures' : 'Devis'} className="carte p-4 pt-[18px] sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ChampRecherche
            etiquette={fac ? 'Rechercher une facture' : 'Rechercher un devis'}
            placeholder={fac ? 'N° de facture, client ou objet' : 'N° de devis, client ou objet'}
            valeur={c.q}
            onChange={(v) => changer({ q: v })}
          />
          <MenuFiltre etiquette="Type" choix={TYPES[genre]} valeur={c.type} onChange={(type) => changer({ type })} />
          <MenuFiltre etiquette="Date d’émission" choix={PERIODES} valeur={c.periode} onChange={(periode) => changer({ periode })} />
        </div>

        <CompteursOnglets
          actif={segment.cle}
          onChoisir={(s) => changer({ segment: s })}
          compteurs={segments.map((s, i) => {
            const l = base.filter(s.test);
            return {
              cle: s.cle,
              libelle: s.libelle,
              nombre: l.length,
              ton: s.ton,
              // « Tous » : le nombre seul ; les autres : le montant hors taxes (avoirs déduits).
              ...(i ? { montant: l.reduce((t, x) => t + x.ht, 0), unite: 'HT' } : {}),
            };
          })}
        />

        <TableauTrie
          lignes={affichees}
          colonnes={colonnes}
          cle={(l) => l.id}
          triInitial={memoire.tri}
          parPage={memoire.parPage}
          pageInitiale={depart.criteres.page}
          onEtat={(e) => {
            tableau.current = { tri: e.tri ?? TRI_DEFAUT, page: e.page, parPage: e.parPage };
            memoriser();
          }}
          departage={(a, b) => b.date.localeCompare(a.date) || (b.numero ?? '').localeCompare(a.numero ?? '') || b.creeLe.localeCompare(a.creeLe)}
          lien={lien}
          carte={carte}
          cartesSous={1180}
          etiquette={fac ? 'Mes factures' : 'Mes devis'}
          vide={`${fac ? 'Aucune facture' : 'Aucun devis'}${q ? ` pour « ${q} »` : ' dans cette sélection'}.`}
        />
      </section>

      {c.nouveau && (
        <FenetreNouveauDocument
          genre={genre}
          clients={clients}
          clientInitial={client?.id}
          retourClient={!!client}
          fermer={() => changer({ nouveau: false })}
        />
      )}
    </>
  );
}
