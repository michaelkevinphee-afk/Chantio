'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AIDE, BARRE_TELEPHONE, DANS_GROUPE, entreeActive, MENU, PARAMETRES, type CleMenu, type EntreeMenu, type GroupeMenu } from '@/lib/menu';
import { Icone } from './icones';

/**
 * Pastille d'une entrée du menu : ce qui attend le bureau. Clés : '/' (Accueil : choses à faire),
 * '/interventions' (à planifier + fiches à valider), '/achats' (factures reçues, sur l'en-tête du groupe Achats).
 * `titre` sert d'info-bulle et de texte lu ; `urgent` met la pastille en rouge (sinon violet).
 */
export type Pastille = { n: number; titre: string; urgent?: boolean };
export type Pastilles = Record<string, Pastille>;

type Groupe = GroupeMenu['groupe'];

/** Pastille dans le menu : à droite du nom, dans le coin de l'icône en menu réduit ou dans la barre du bas. */
function Compteur({ p, place }: { p?: Pastille; place: 'ligne' | 'reduit' | 'barre' }) {
  if (!p || p.n <= 0) return null;
  const position = {
    ligne: 'ml-auto min-w-5 px-1.5 text-[11px]',
    reduit: 'absolute top-0.5 right-0.5 min-w-[18px] px-[5px] text-[10.5px]',
    barre: 'absolute top-[3px] left-[calc(50%+6px)] min-w-[18px] px-1.5 text-[10.5px]',
  }[place];
  return (
    <>
      <span
        aria-hidden="true"
        title={p.titre}
        className={`rounded-full py-px text-center leading-[1.45] font-extrabold text-white tabular-nums ${p.urgent ? 'bg-rouge' : 'bg-violet'} ${position}`}
      >
        {p.n}
      </span>
      <span className="sr-only"> : {p.titre}</span>
    </>
  );
}

const LIGNE = 'relative flex items-center gap-2.5 rounded-[12px] font-bold transition';
const couleur = (allume: boolean) => (allume ? 'degrade text-white' : 'text-gris hover:bg-doux hover:text-encre');

/** « Factures » des achats ouvre directement les factures reçues à vérifier s'il y en a. */
function hrefDe(e: EntreeMenu, pastilles: Pastilles) {
  return e.cle === 'ach-factures' && (pastilles['/achats']?.n ?? 0) > 0 ? '/achats?filtre=recu' : e.href;
}

function Entree({ e, actif, reduit, sous, pastille, href }: { e: EntreeMenu; actif: CleMenu | null; reduit: boolean; sous?: boolean; pastille?: Pastille; href?: string }) {
  const allume = actif === e.cle;
  return (
    <Link
      href={href ?? e.href}
      aria-current={allume ? 'page' : undefined}
      title={reduit ? e.libelle : undefined}
      className={`${LIGNE} ${couleur(allume)} ${reduit ? 'justify-center py-2.5' : sous ? 'px-2.5 py-[7px] text-[14.5px]' : 'px-2.5 py-2 text-[15px]'}`}
    >
      {/* Les sous-entrées n'ont pas d'icône, sauf en menu réduit. */}
      {(!sous || reduit) && <Icone nom={e.icone} taille={20} className="shrink-0" />}
      <span className={reduit ? 'sr-only' : 'min-w-0 truncate'}>{e.libelle}</span>
      <Compteur p={pastille} place={reduit ? 'reduit' : 'ligne'} />
    </Link>
  );
}

/**
 * Menu latéral (ordinateur, à partir de 821 px) : entrées et groupes repliables Ventes et Achats.
 * `ouverts` / `onBasculer` : groupes dépliés (gérés par CadreBureau, mémorisés dans un cookie) ;
 * `reduit` : icônes seules, nom en info-bulle, pastille dans le coin de l'icône.
 */
export function Navigation({
  pastilles = {},
  reduit = false,
  ouverts = { ventes: true, achats: true },
  onBasculer,
}: {
  pastilles?: Pastilles;
  reduit?: boolean;
  ouverts?: Record<Groupe, boolean>;
  onBasculer?: (groupe: Groupe) => void;
}) {
  const actif = entreeActive(usePathname());
  return (
    <nav aria-label="Menu" className="flex flex-col gap-1">
      {MENU.map((item) => {
        if (!('groupe' in item)) return <Entree key={item.cle} e={item} actif={actif} reduit={reduit} pastille={item.pastille ? pastilles[item.pastille] : undefined} />;
        const ouvert = ouverts[item.groupe];
        // Groupe replié contenant la page affichée : son en-tête s'allume.
        const allume = !ouvert && !!actif && DANS_GROUPE[item.groupe].includes(actif);
        const id = `menu-${item.groupe}`;
        return (
          <div key={item.groupe} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onBasculer?.(item.groupe)}
              aria-expanded={ouvert}
              aria-controls={id}
              title={reduit ? item.libelle : undefined}
              className={`${LIGNE} ${couleur(allume)} ${reduit ? 'justify-center py-2.5' : 'px-2.5 py-2 text-left text-[15px]'}`}
            >
              <Icone nom={item.icone} taille={20} className="shrink-0" />
              <span className={reduit ? 'sr-only' : 'min-w-0 truncate'}>{item.libelle}</span>
              <Compteur p={item.pastille ? pastilles[item.pastille] : undefined} place={reduit ? 'reduit' : 'ligne'} />
              {!reduit && (
                <Icone
                  nom="chevron_bas"
                  taille={16}
                  className={`shrink-0 transition-transform ${item.pastille && pastilles[item.pastille]?.n ? '' : 'ml-auto'} ${ouvert ? '' : '-rotate-90'}`}
                />
              )}
            </button>
            <div
              id={id}
              hidden={!ouvert}
              className={reduit ? 'flex flex-col gap-0.5 border-y border-trait py-1' : 'mb-1 ml-[19px] flex flex-col gap-0.5 border-l border-trait pl-2'}
            >
              {item.entrees.map((e) => (
                <Entree key={e.cle} e={e} actif={actif} reduit={reduit} sous href={hrefDe(e, pastilles)} />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Paramètres (ou Aide, avec `entree`) : entrée en bas du menu latéral, ou bouton carré (roue) en haut à droite sur téléphone. */
export function LienParametres({ variante = 'menu', entree = PARAMETRES }: { variante?: 'menu' | 'reduit' | 'barre'; entree?: EntreeMenu }) {
  const allume = entreeActive(usePathname()) === entree.cle;
  if (variante === 'barre')
    return (
      <Link
        href={entree.href}
        aria-label={entree.libelle}
        aria-current={allume ? 'page' : undefined}
        title={entree.libelle}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border transition ${
          allume ? 'border-transparent bg-doux text-cobalt' : 'border-trait bg-white text-gris hover:text-encre'
        }`}
      >
        <Icone nom={entree.icone} taille={20} />
      </Link>
    );
  return <Entree e={entree} actif={allume ? entree.cle : null} reduit={variante === 'reduit'} />;
}

/** Aide : même présentation que Paramètres, juste au-dessus. */
export function LienAide({ variante = 'menu' }: { variante?: 'menu' | 'reduit' | 'barre' }) {
  return <LienParametres variante={variante} entree={AIDE} />;
}

/**
 * Barre du bas du téléphone (jusqu'à 820 px) : Accueil, Planning, Interventions, Ventes, Achats,
 * avec les pastilles dans le coin de l'icône. Ventes reste allumé sur ses écrans et sur Chiffres.
 */
export function BarreBas({ pastilles = {} }: { pastilles?: Pastilles }) {
  const actif = entreeActive(usePathname());
  return (
    <nav
      data-menu
      aria-label="Menu"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-trait bg-white px-0.5 pt-1 pb-[calc(4px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgb(16_26_61/0.3)] menu:hidden"
    >
      {BARRE_TELEPHONE.map((b) => {
        const allume = !!actif && b.allume.includes(actif);
        return (
          <Link
            key={b.cle}
            href={hrefDe(b, pastilles)}
            aria-current={allume ? 'page' : undefined}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-[3px] rounded-[12px] py-1.5 text-center text-[clamp(9px,2.65vw,10.8px)] leading-tight font-bold tracking-[-0.02em] whitespace-nowrap transition ${
              allume ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'
            }`}
          >
            <Icone nom={b.icone} taille={22} className="shrink-0" />
            <span className="max-w-full truncate">{b.libelle}</span>
            <Compteur p={b.pastille ? pastilles[b.pastille] : undefined} place="barre" />
          </Link>
        );
      })}
    </nav>
  );
}
