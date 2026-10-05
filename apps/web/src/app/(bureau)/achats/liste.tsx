'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  achatEchu,
  compterSegments,
  dansSegment,
  dateMois,
  ECHEANCES_ACHAT,
  euroAchat,
  filtrerAchats,
  LIBELLE_RECEPTION,
  LIBELLE_STATUT_ACHAT,
  MONTANTS_ACHAT,
  PERIODES_ACHAT,
  TON_STATUT_ACHAT,
  ttcSigne,
  type ReceptionAchat,
  type StatutAchat,
} from '@chantio/shared';
import { CompteursOnglets } from '@/components/compteurs-onglets';
import { ChampRecherche, MenuFiltre } from '@/components/outils-liste';
import { LienLigne, TableauTrie, type Colonne } from '@/components/tableau-trie';
import { classeBouton, Puce, Titre } from '@/components/ui';
import { BasculeAchats } from './bascule';
import { FenetreCollecte } from './collecte';
import { FORMATS_ACHAT } from './fichiers';
import { IconeAchat } from './icones';
import { importerFactures, useLecturesEnCours } from './imports';
import { memoireAchats, type EtatListeAchats } from './memoire';

export type LigneAchatListe = {
  id: string;
  numero: string | null;
  date_facture: string;
  echeance: string | null;
  montant_ttc: number;
  statut: StatutAchat;
  reception: ReceptionAchat;
  avoir: boolean;
  responsable_id: string | null;
  cree_le: string;
  fournisseur: { id: string; nom: string; siret: string | null } | null;
  responsable: string | null;
  paye: number;
};

// Les quatre menus et la recherche tiennent sur une ligne à 1500 px, comme dans le bac (flèche un peu plus près du texte).
const MENU = '!pr-8';

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const nomF = (a: LigneAchatListe) => a.fournisseur?.nom ?? 'Fournisseur à vérifier';

function Echeance({ a, jour, prefixe = '' }: { a: LigneAchatListe; jour: string; prefixe?: string }) {
  if (!a.echeance) return <>—</>;
  const tard = achatEchu(a, a.paye, jour);
  return (
    <span className={tard ? 'font-bold text-[#B42318]' : ''}>
      {tard && <IconeAchat nom="horloge" taille={15} className="mr-1.5 inline align-[-2px]" />}
      {prefixe}
      {dateMois(a.echeance)}
    </span>
  );
}

/** « Dépenses fournisseurs » : compteurs, recherche, quatre filtres, tableau triable, glisser-déposer. */
export function ListeAchats({
  entrepriseId,
  achats,
  membres,
  lecture,
  jour,
  segInitial,
}: {
  entrepriseId: string;
  achats: LigneAchatListe[];
  membres: { id: string; nom: string }[];
  lecture: boolean;
  jour: string;
  segInitial: string;
}) {
  const router = useRouter();
  // En revenant d'une facture (✕ ou Échap), la liste reprend où on l'avait laissée ; sinon, à neuf.
  const [etat, setEtat] = useState<EtatListeAchats>(() =>
    memoireAchats.retour && memoireAchats.etat
      ? memoireAchats.etat
      : { seg: segInitial, q: '', periode: 'tout', echeance: 'tout', responsable: 'tous', montant: 'tous' },
  );
  const [collecte, setCollecte] = useState(false);
  const [survol, setSurvol] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const champPhoto = useRef<HTMLInputElement>(null);
  const lectures = useLecturesEnCours();

  const changer = (p: Partial<EtatListeAchats>) => {
    const e = { ...etat, ...p };
    setEtat(e);
    if (p.seg && typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      u.searchParams.delete('onglet');
      u.searchParams.set('filtre', p.seg);
      window.history.replaceState(null, '', `${u.pathname}?${u.searchParams}`);
    }
  };

  // Mémoire de la liste ; au retour d'une facture, le focus revient sur son nom (comme le bac).
  useEffect(() => {
    memoireAchats.etat = etat;
  }, [etat]);
  useEffect(() => {
    if (!memoireAchats.retour) return;
    memoireAchats.retour = false;
    const u = new URL(window.location.href);
    if (u.searchParams.get('filtre') !== memoireAchats.etat?.seg && memoireAchats.etat) {
      u.searchParams.set('filtre', memoireAchats.etat.seg);
      window.history.replaceState(null, '', `${u.pathname}?${u.searchParams}`);
    }
    const id = memoireAchats.id;
    if (id) [...document.querySelectorAll<HTMLElement>(`[data-achat="${id}"] a`)].find((x) => x.offsetParent !== null)?.focus();
  }, []);

  const base = useMemo(() => filtrerAchats(achats, etat, jour), [achats, etat, jour]);
  const compteurs = compterSegments(base);
  const lignes = base.filter((a) => dansSegment(a, etat.seg));

  const importer = async (fichiers: FileList | File[] | null, photo = false) => {
    const ok = await importerFactures({ fichiers, photo, entrepriseId, lecture, rafraichir: () => router.refresh() });
    // Après un import, la liste passe sur « Reçu », sans recherche (comme le bac).
    if (ok) changer({ seg: 'recu', q: '' });
  };

  const glisser = {
    onDragEnter: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      e.preventDefault();
      setSurvol(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
      e.preventDefault();
      setSurvol(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setSurvol(false);
      importer(e.dataTransfer.files);
    },
  };

  const lien = (a: LigneAchatListe) => `/achats/${a.id}`;

  const colonnes: Colonne<LigneAchatListe>[] = [
    {
      cle: 'st',
      titre: 'Statut',
      rendu: (a) => (
        <>
          <Puce ton={TON_STATUT_ACHAT[a.statut]}>{LIBELLE_STATUT_ACHAT[a.statut]}</Puce>
          {lectures.has(a.id) && <small className="mt-1 block text-[12.5px] text-gris">lecture en cours…</small>}
        </>
      ),
    },
    {
      cle: 'four',
      titre: 'Fournisseur',
      tri: (a) => sansAccents(nomF(a)),
      sensInitial: 'asc',
      rendu: (a) => (
        <span data-achat={a.id}>
          <LienLigne href={lien(a)}>{nomF(a)}</LienLigne>
          <small className="mt-0.5 block max-w-[230px] truncate text-[12.5px] font-medium text-gris max-[1360px]:max-w-[170px]">
            {a.avoir && <b className="font-bold text-violet">Avoir</b>}
            {a.avoir && ' · '}
            {a.numero ?? 'n° à compléter'}
          </small>
        </span>
      ),
    },
    { cle: 'date', titre: 'Date de facturation', tri: (a) => a.date_facture, rendu: (a) => dateMois(a.date_facture) || '—', className: 'whitespace-nowrap' },
    { cle: 'ech', titre: 'Date d’échéance', tri: (a) => a.echeance ?? '', rendu: (a) => <Echeance a={a} jour={jour} />, className: 'whitespace-nowrap' },
    { cle: 'resp', titre: 'Responsable', rendu: (a) => <span className="text-gris">{a.responsable ?? '—'}</span>, className: 'max-[1360px]:hidden' },
    { cle: 'rec', titre: 'Type de réception', rendu: (a) => <span className="text-[13px] whitespace-nowrap text-gris">{LIBELLE_RECEPTION[a.reception] ?? '—'}</span> },
    {
      cle: 'ttc',
      titre: 'Montant TTC',
      aligne: 'droite',
      tri: (a) => ttcSigne(a),
      rendu: (a) => <b className="font-extrabold whitespace-nowrap">{euroAchat(a, a.montant_ttc)}</b>,
    },
  ];

  // Sur téléphone et écran moyen : une petite carte par facture (fournisseur et montant, statut, détails).
  const carte = (a: LigneAchatListe) => {
    const aPayer = a.statut === 'a_payer' || a.statut === 'planifie';
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0" data-achat={a.id}>
          <LienLigne href={lien(a)}>{nomF(a)}</LienLigne>
          <small className="mt-0.5 block text-[12.5px] font-medium text-gris">
            {a.avoir && <b className="font-bold text-violet">Avoir · </b>}
            {a.numero ?? 'n° à compléter'}
          </small>
        </div>
        <b className="text-right font-extrabold whitespace-nowrap tabular-nums">{euroAchat(a, a.montant_ttc)}</b>
        <div className="col-span-2">
          <Puce ton={TON_STATUT_ACHAT[a.statut]}>{LIBELLE_STATUT_ACHAT[a.statut]}</Puce>
          {lectures.has(a.id) && <small className="ml-2 text-[12.5px] text-gris">lecture en cours…</small>}
        </div>
        <div className="col-span-2 text-[12.5px] text-gris">
          {[
            a.numero && (
              <span key="n" className="font-mono text-xs">
                {a.numero}
              </span>
            ),
            a.date_facture && <span key="d">du {dateMois(a.date_facture)}</span>,
            a.echeance && aPayer && <Echeance key="e" a={a} jour={jour} prefixe="échéance " />,
            LIBELLE_RECEPTION[a.reception] && <span key="r">{LIBELLE_RECEPTION[a.reception]}</span>,
          ]
            .filter(Boolean)
            .flatMap((x, i) => (i ? [' · ', x] : [x]))}
        </div>
      </div>
    );
  };

  const choixResponsable = [['tous', 'Responsable'] as const, ...membres.map((m) => [m.id, m.nom] as const)];

  return (
    <>
      <BasculeAchats actif="factures" />
      <Titre
        actions={
          <>
            <button type="button" className={classeBouton('principal', 'px-4 py-2.5')} onClick={() => champ.current?.click()}>
              Importer
            </button>
            <button type="button" className={classeBouton('secondaire', 'px-4 py-2.5 menu:hidden')} onClick={() => champPhoto.current?.click()}>
              <IconeAchat nom="photo" taille={18} />
              Scanner
            </button>
            <button type="button" className={classeBouton('secondaire', 'px-4 py-2.5')} onClick={() => setCollecte(true)}>
              <IconeAchat nom="eclair" taille={18} />
              Collecte automatique
            </button>
          </>
        }
      >
        Dépenses fournisseurs
      </Titre>
      <input
        ref={champ}
        type="file"
        multiple
        accept={FORMATS_ACHAT}
        hidden
        onChange={(e) => {
          importer(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={champPhoto}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          importer(e.target.files, true);
          e.target.value = '';
        }}
      />

      <section
        aria-label="Factures fournisseurs"
        className={`carte p-4 pt-[18px] transition-colors sm:p-5 ${survol ? 'bg-doux outline-2 -outline-offset-[6px] outline-cobalt outline-dashed' : ''}`}
        {...glisser}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ChampRecherche
            etiquette="Rechercher une facture fournisseur"
            placeholder="N° de facture ou fournisseur"
            valeur={etat.q}
            onChange={(q) => changer({ q })}
            // La recherche cède la place pour que les quatre menus tiennent sur sa ligne, comme dans le bac.
            className="!basis-[220px]"
          />
          <MenuFiltre etiquette="Date de facturation" choix={PERIODES_ACHAT} valeur={etat.periode} onChange={(periode) => changer({ periode })} className={MENU} />
          <MenuFiltre etiquette="Date d’échéance" choix={ECHEANCES_ACHAT} valeur={etat.echeance} onChange={(echeance) => changer({ echeance })} className={MENU} />
          <MenuFiltre etiquette="Responsable" choix={choixResponsable} valeur={etat.responsable} onChange={(responsable) => changer({ responsable })} className={MENU} />
          <MenuFiltre etiquette="Montant TTC" choix={MONTANTS_ACHAT} valeur={etat.montant} onChange={(montant) => changer({ montant })} className={MENU} />
        </div>

        <CompteursOnglets
          actif={etat.seg}
          onChoisir={(seg) => changer({ seg })}
          compteurs={compteurs.map((c) => ({
            cle: c.cle,
            libelle: c.libelle,
            nombre: c.nombre,
            ton: c.ton,
            // Comme le bac : « 0,00 € TTC » quand le compteur est vide (pas de « — »).
            ...(c.sous ? { texte: c.sous } : { montant: c.total, unite: 'TTC', montantAZero: true }),
          }))}
        />

        {achats.length ? (
          <TableauTrie
            lignes={lignes}
            colonnes={colonnes}
            cle={(a) => a.id}
            triInitial={memoireAchats.tri ?? { cle: 'date', sens: 'desc' }}
            onTri={(t) => {
              memoireAchats.tri = t;
            }}
            departage={(a, b) => b.cree_le.localeCompare(a.cree_le)}
            lien={lien}
            carte={carte}
            cartesSous={1180}
            parPage={false}
            etiquette="Factures fournisseurs"
            vide={etat.q.trim() ? `Aucune facture fournisseur pour « ${etat.q.trim()} ».` : 'Aucune facture fournisseur dans cette sélection.'}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-[70px] text-center text-gris">
            <IconeAchat nom="eclair" taille={44} className="text-cobalt" />
            <b className="text-[22px] text-encre">Aucune facture fournisseur à afficher</b>
            <span>Importez vos premières factures pour les afficher.</span>
          </div>
        )}

        <p className="mt-3 text-center text-[13px] text-gris">Glissez ici vos factures (PDF ou photos) pour les importer.</p>
      </section>

      {collecte && <FenetreCollecte fermer={() => setCollecte(false)} />}
    </>
  );
}
