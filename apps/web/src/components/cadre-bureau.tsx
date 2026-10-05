'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { COOKIE_MENU, ecrireEtatMenu, type EtatMenu } from '@/lib/menu';
import { Icone } from './icones';
import { BarreBas, LienParametres, Navigation, type Pastilles } from './navigation';
import { ZoneAnnonces } from './retour';
import { SelecteurEntreprise } from './selecteur-entreprise';
import { Logo } from './ui';

/**
 * Cadre de l'appli bureau, comme le bac à sable.
 * Ordinateur (≥ 821 px) : menu latéral (sélecteur d'entreprise, menu, « Propulsé par chantio », Paramètres,
 * « Réduire le menu ») et le contenu sur toute la largeur restante.
 * Téléphone : barre du haut (sélecteur, roue des Paramètres) et barre du bas à cinq boutons.
 * Pages pleines : le menu et les barres portent data-menu, la zone principale data-contenu ;
 * globals.css les masque / libère quand la page contient .ed-plein (composant PleinEcran).
 */
export function CadreBureau({
  selecteur,
  pastilles,
  menu,
  children,
}: {
  /** Props du sélecteur d'entreprise (sans la variante, choisie ici). */
  selecteur: Omit<ComponentProps<typeof SelecteurEntreprise>, 'variante'>;
  pastilles: Pastilles;
  /** État du menu relu dans le cookie (premier affichage sans saut). */
  menu: EtatMenu;
  children: ReactNode;
}) {
  const [etat, setEtat] = useState(menu);
  const changer = (e: EtatMenu) => {
    setEtat(e);
    document.cookie = `${COOKIE_MENU}=${ecrireEtatMenu(e)}; path=/; max-age=31536000; samesite=lax`;
  };
  const reduit = etat.reduit;

  return (
    <div className="min-h-screen menu:flex">
      {/* Téléphone : barre du haut collante. */}
      <header data-menu className="sticky top-0 z-40 flex h-[52px] items-center justify-between gap-3 border-b border-trait bg-white px-3 menu:hidden">
        <div className="flex min-w-0 flex-1">
          <SelecteurEntreprise {...selecteur} variante="barre" />
        </div>
        <LienParametres variante="barre" />
      </header>

      {/* Ordinateur : menu latéral, 72 px quand il est réduit. */}
      <aside
        data-menu
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-trait bg-white/85 menu:flex ${
          reduit ? 'w-[72px] px-2.5 py-3.5' : 'w-[248px] p-3'
        }`}
      >
        <div className={reduit ? 'mb-1.5 border-b border-trait pb-2.5' : 'mb-2.5'}>
          <SelecteurEntreprise {...selecteur} variante={reduit ? 'reduit' : 'menu'} />
        </div>
        <Navigation
          pastilles={pastilles}
          reduit={reduit}
          ouverts={{ ventes: etat.ventes, achats: etat.achats }}
          onBasculer={(g) => changer({ ...etat, [g]: !etat[g] })}
        />
        {reduit ? (
          <div className="mt-auto" />
        ) : (
          <div className="mt-auto mb-1.5 rounded-[12px] bg-fond px-3 py-2.5 text-xs font-semibold text-gris">
            Propulsé par <Logo taille={16} />
          </div>
        )}
        <LienParametres variante={reduit ? 'reduit' : 'menu'} />
        <button
          type="button"
          onClick={() => changer({ ...etat, reduit: !reduit })}
          aria-pressed={reduit}
          title={reduit ? 'Agrandir le menu' : undefined}
          className={`flex items-center gap-2.5 rounded-[12px] py-2 text-[13px] font-bold text-gris transition hover:bg-doux hover:text-encre ${reduit ? 'justify-center' : 'px-2.5'}`}
        >
          <Icone nom="reduire" taille={16} className={`shrink-0 ${reduit ? 'rotate-180' : ''}`} />
          <span className={reduit ? 'sr-only' : ''}>{reduit ? 'Agrandir le menu' : 'Réduire le menu'}</span>
        </button>
      </aside>

      {/* Contenu sur toute la largeur ; sur téléphone, place laissée à la barre du bas. */}
      <main data-contenu className="min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-10 max-menu:pb-[calc(96px+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <BarreBas pastilles={pastilles} />
      {/* Bulles « Enregistré » : au-dessus de la barre du bas sur téléphone. */}
      <div className="contents max-menu:[&>div]:bottom-[calc(80px+env(safe-area-inset-bottom))]">
        <ZoneAnnonces />
      </div>
    </div>
  );
}
