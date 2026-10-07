'use client';

import Link from 'next/link';
import { Suspense, useState, type ComponentProps, type ReactNode } from 'react';
import { deconnecter } from '@/app/actions-session';
import { COOKIE_MENU, ecrireEtatMenu, type EtatMenu } from '@/lib/menu';
import { BarreChargement } from './barre-chargement';
import { BulleRetours } from './bulle-retours';
import { VisiteGuidee } from './guide/visite';
import { Icone } from './icones';
import { BarreBas, LienAide, LienParametres, Navigation, type Pastilles } from './navigation';
import { ZoneAnnonces } from './retour';
import { SelecteurEntreprise } from './selecteur-entreprise';
import { Logo } from './ui';

/**
 * Cadre de l'appli bureau, comme le bac à sable.
 * Ordinateur (≥ 821 px) : menu latéral (sélecteur d'entreprise, menu, Aide, Paramètres, Se déconnecter,
 * « Réduire le menu », puis « Propulsé par chantio » tout en bas) et le contenu sur toute la largeur restante.
 * Téléphone : barre du haut (sélecteur, roue des Paramètres) et barre du bas à cinq boutons.
 * Pages pleines : le menu et les barres portent data-menu, la zone principale data-contenu ;
 * globals.css les masque / libère quand la page contient .ed-plein (composant PleinEcran).
 */
export function CadreBureau({
  selecteur,
  pastilles,
  menu,
  prenom,
  bandeau = null,
  children,
}: {
  /** Props du sélecteur d'entreprise (sans la variante, choisie ici). */
  selecteur: Omit<ComponentProps<typeof SelecteurEntreprise>, 'variante'>;
  pastilles: Pastilles;
  /** État du menu relu dans le cookie (premier affichage sans saut). */
  menu: EtatMenu;
  /** Prénom de l'utilisateur, pour l'accueil de la bulle des retours. */
  prenom: string;
  /** Demande ou accès en cours de l'équipe Chantio (dirigeant), lien vers Paramètres › Accès de Chantio. */
  /** quitter : bouton qui envoie l'action au lieu du lien vers Paramètres › Accès de Chantio. */
  bandeau?: { ton: 'violet' | 'vert'; texte: string; action: string; quitter?: () => Promise<void> } | null;
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
        <div className="flex gap-2">
          <LienAide variante="barre" />
          <LienParametres variante="barre" />
        </div>
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
        <div className="mt-auto" />
        <LienAide variante={reduit ? 'reduit' : 'menu'} />
        <LienParametres variante={reduit ? 'reduit' : 'menu'} />
        {/* Se déconnecter : juste sous Paramètres. */}
        <form action={deconnecter}>
          <button
            title={reduit ? 'Se déconnecter' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-[12px] font-bold text-gris transition hover:bg-doux hover:text-encre ${reduit ? 'justify-center py-2.5' : 'px-2.5 py-2 text-[15px]'}`}
          >
            <Icone nom="sortie" taille={20} className="shrink-0" />
            <span className={reduit ? 'sr-only' : 'min-w-0 truncate'}>Se déconnecter</span>
          </button>
        </form>
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
        {/* « Propulsé par chantio » : tout en bas du menu. */}
        {!reduit && (
          <div className="mt-1.5 border-t border-trait px-2.5 pt-2.5 pb-0.5 text-xs font-semibold text-gris">
            Propulsé par <Logo taille={16} />
          </div>
        )}
      </aside>

      {/* Contenu sur toute la largeur ; sur téléphone, place laissée à la barre du bas. */}
      <main data-contenu className="min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-10 max-menu:pb-[calc(96px+env(safe-area-inset-bottom))]">
        {bandeau?.quitter ? (
          <form action={bandeau.quitter} className="mb-5 flex items-center gap-3 rounded-[14px] bg-violet-doux px-4 py-3 text-[15px] font-semibold text-violet">
            <Icone nom="bouclier" taille={20} className="shrink-0" />
            <span className="min-w-0 flex-1 text-encre">{bandeau.texte}</span>
            <button type="submit" className="shrink-0 font-extrabold whitespace-nowrap hover:underline">
              {bandeau.action} ›
            </button>
          </form>
        ) : bandeau && (
          <Link
            href="/parametres?rubrique=acces"
            className={`mb-5 flex items-center gap-3 rounded-[14px] px-4 py-3 text-[15px] font-semibold transition ${bandeau.ton === 'violet' ? 'bg-violet-doux text-violet hover:brightness-95' : 'bg-vert-doux text-vert hover:brightness-95'}`}
          >
            <Icone nom="bouclier" taille={20} className="shrink-0" />
            <span className="min-w-0 flex-1 text-encre">{bandeau.texte}</span>
            <span className="shrink-0 font-extrabold whitespace-nowrap">{bandeau.action} ›</span>
          </Link>
        )}
        {children}
      </main>

      <BarreBas pastilles={pastilles} />
      {/* Barre bleue en haut de l'écran pendant qu'une page arrive. */}
      <Suspense>
        <BarreChargement />
      </Suspense>
      {/* Bulle des retours en bas à droite (au-dessus de la barre du bas sur téléphone). */}
      <Suspense>
        <BulleRetours prenom={prenom} />
      </Suspense>
      {/* Visite guidée des missions « Mes premiers pas » et du bouton « Me montrer » de l'assistant. */}
      <VisiteGuidee />
      {/* Bulles « Enregistré » : au-dessus de la barre du bas sur téléphone. */}
      <div className="contents max-menu:[&>div]:bottom-[calc(80px+env(safe-area-inset-bottom))]">
        <ZoneAnnonces />
      </div>
    </div>
  );
}
