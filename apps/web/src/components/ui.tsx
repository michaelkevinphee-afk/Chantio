import Link from 'next/link';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { LIBELLE_STATUT, TON_STATUT, type StatutIntervention, type Ton } from '@chantio/shared';

const TONS: Record<Ton, string> = {
  gris: 'bg-gris-doux text-gris',
  bleu: 'bg-bleu-doux text-bleu',
  cobalt: 'degrade text-white shadow-none',
  violet: 'bg-violet-doux text-violet',
  vert: 'bg-vert-doux text-vert',
  rouge: 'bg-rouge-doux text-rouge',
};

export function Puce({ ton = 'gris', children }: { ton?: Ton; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${TONS[ton]}`}>
      {children}
    </span>
  );
}

export function PuceStatut({ statut }: { statut: StatutIntervention }) {
  return <Puce ton={TON_STATUT[statut]}>{LIBELLE_STATUT[statut]}</Puce>;
}

// Boutons du site : dégradé cobalt pour l'action principale, blanc cerclé pour le reste.
const VARIANTES = {
  principal: 'degrade text-white',
  secondaire: 'bg-white text-encre shadow-[inset_0_0_0_2px_var(--color-trait)] hover:shadow-[inset_0_0_0_2px_var(--color-cobalt)]',
  danger: 'bg-white text-rouge shadow-[inset_0_0_0_2px_#FECDCA] hover:bg-rouge-doux',
};

type Variante = keyof typeof VARIANTES;
export const classeBouton = (v: Variante, extra = '') =>
  `inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-extrabold transition active:scale-[0.97] disabled:opacity-50 ${VARIANTES[v]} ${extra}`;

export function Bouton({ variante = 'principal', className, ...props }: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={classeBouton(variante, className)} {...props} />;
}

export function LienBouton({ variante = 'principal', className, ...props }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={classeBouton(variante, className)} {...props} />;
}

/**
 * En-tête de page, comme dans le bac : lien de retour facultatif, h1, phrase grise dessous,
 * boutons à droite (ils passent sous le titre sur téléphone).
 * - `texte` : la phrase sous le h1 (« Choisissez un client pour voir sa fiche : … »).
 * - `retour` : un Link ou un bouton au-dessus du titre (« ← Ventes », « ← Retour à la fiche de … ») ;
 *   s'il est masqué (ex. `menu:hidden`), il ne laisse pas d'espace vide.
 * - `sous` : ancien sur-titre gris AU-DESSUS du h1, gardé pour les pages pas encore refaites.
 */
export function Titre({
  children,
  texte,
  actions,
  retour,
  sous,
}: {
  children: ReactNode;
  texte?: ReactNode;
  actions?: ReactNode;
  retour?: ReactNode;
  sous?: ReactNode;
}) {
  return (
    <div className="apparition mb-5">
      {retour && (
        // Grille : chaque enfant devient un bloc qui porte sa marge, et disparaît avec elle s'il est masqué.
        <div className="grid justify-items-start text-[15px] font-bold text-cobalt [&>*]:mb-3 [&_a:hover]:underline">
          {typeof retour === 'string' ? <span>{retour}</span> : retour}
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {/* Avec une phrase, le bloc de gauche se partage la ligne avec les boutons (la phrase passe à la ligne), comme le bac. */}
        <div className={texte ? 'min-w-0 flex-[1_1_420px]' : 'min-w-0'}>
          {sous && <p className="mb-1 text-lg font-semibold text-gris">{sous}</p>}
          <h1 className="text-[26px] leading-tight font-extrabold text-balance text-encre sm:text-3xl">{children}</h1>
          {texte && <p className="mt-1.5 text-[15px] text-gris">{texte}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

export function Vide({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="carte px-6 py-12 text-center">
      <p className="font-bold">{titre}</p>
      {children && <p className="mt-1 text-sm text-gris">{children}</p>}
    </div>
  );
}

export function Logo({ clair = false, taille = 28 }: { clair?: boolean; taille?: number }) {
  // Logo Chantio « C en blocs » (en blanc sur les fonds en dégradé).
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <svg width={taille} height={taille} viewBox="0 0 96 96" aria-hidden="true">
        <rect x="14" y="14" width="24" height="68" rx="10" fill={clair ? '#FFFFFF' : '#2F54EB'} />
        <rect x="44" y="14" width="38" height="24" rx="10" fill={clair ? '#FFFFFF' : '#7C93F5'} fillOpacity={clair ? 0.75 : 1} />
        <rect x="44" y="58" width="38" height="24" rx="10" fill={clair ? '#FFFFFF' : '#B9C6FB'} fillOpacity={clair ? 0.5 : 1} />
      </svg>
      <span
        className={`font-extrabold tracking-[-0.045em] ${clair ? 'text-white' : 'text-encre'}`}
        style={{ fontSize: Math.round(taille * 0.72) }}
      >
        chantio
      </span>
    </span>
  );
}

/** Photo de profil ronde (ou initiales), avec l'anneau cobalt. */
export function Avatar({
  url,
  initiales,
  taille = 40,
  anneau = false,
  className = '',
}: {
  url?: string | null;
  initiales: string;
  taille?: number;
  anneau?: boolean;
  className?: string;
}) {
  const style = { width: taille, height: taille, fontSize: Math.round(taille * 0.36) };
  const bord = anneau ? 'ring-[3px] ring-cobalt ring-offset-2 ring-offset-fond' : '';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={style} className={`shrink-0 rounded-full object-cover ${bord} ${className}`} />
  ) : (
    <span style={style} className={`grid shrink-0 place-items-center rounded-full bg-bleu-doux font-extrabold text-bleu ${bord} ${className}`}>
      {initiales}
    </span>
  );
}

/**
 * Panneau du bureau : carte blanche avec un en-tête toujours pareil (titre, compteur, lien à droite)
 * séparé du contenu par un filet. Sert de brique commune au Pilotage et à l'Équipe.
 */
export function Panneau({
  titre,
  nombre,
  action,
  children,
  className = '',
  style,
}: {
  titre: ReactNode;
  nombre?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section style={style} className={`carte overflow-hidden ${className}`}>
      <header className="flex min-h-14 items-center gap-2 border-b border-trait px-5 py-3">
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">{titre}</h2>
        {nombre != null && (
          <span className="rounded-full bg-doux px-2 py-0.5 text-xs font-extrabold text-cobalt tabular-nums">{nombre}</span>
        )}
        {action && <div className="ml-auto text-sm font-bold text-cobalt">{action}</div>}
      </header>
      {children}
    </section>
  );
}
