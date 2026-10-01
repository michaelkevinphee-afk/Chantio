import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { LIBELLE_STATUT, TON_STATUT, type StatutIntervention, type Ton } from '@chantio/shared';

const TONS: Record<Ton, string> = {
  gris: 'bg-[#ECEBE6] text-[#4B5563]',
  bleu: 'bg-bleu-doux text-bleu',
  jaune: 'bg-jaune-doux text-[#8A6100]',
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

const VARIANTES = {
  principal: 'bg-jaune text-marine hover:brightness-95',
  sombre: 'bg-marine text-white hover:bg-marine-clair',
  secondaire: 'bg-white text-marine shadow-[0_1px_0_#DDDAD0,0_2px_6px_rgb(20_33_61/0.06)] hover:bg-beton',
  danger: 'bg-white text-rouge border border-rouge/30 hover:bg-rouge-doux',
};

type Variante = keyof typeof VARIANTES;
const classeBouton = (v: Variante, extra = '') =>
  `inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-bold transition active:scale-[0.97] disabled:opacity-50 ${VARIANTES[v]} ${extra}`;

export function Bouton({ variante = 'principal', className, ...props }: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={classeBouton(variante, className)} {...props} />;
}

export function LienBouton({ variante = 'principal', className, ...props }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={classeBouton(variante, className)} {...props} />;
}

export function Titre({ children, sous, actions }: { children: ReactNode; sous?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="apparition mb-8 flex flex-wrap items-end justify-between gap-4 max-sm:items-start">
      <div>
        {sous && <p className="text-lg font-semibold text-gris">{sous}</p>}
        <h1 className="font-titre text-5xl font-extrabold uppercase leading-none tracking-tight text-marine">{children}</h1>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
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
  // Logo Chantio « C en blocs ».
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <svg width={taille} height={taille} viewBox="0 0 96 96" aria-hidden="true">
        <rect x="14" y="14" width="24" height="68" rx="10" fill="#2F54EB" />
        <rect x="44" y="14" width="38" height="24" rx="10" fill="#7C93F5" />
        <rect x="44" y="58" width="38" height="24" rx="10" fill="#B9C6FB" />
      </svg>
      <span
        className={`font-extrabold tracking-tight ${clair ? 'text-white' : 'text-marine'}`}
        style={{ fontSize: Math.round(taille * 0.72) }}
      >
        chantio
      </span>
    </span>
  );
}

/** Photo de profil ronde (ou initiales), avec l'anneau jaune des maquettes. */
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
  const bord = anneau ? 'ring-[3px] ring-jaune ring-offset-2 ring-offset-beton' : '';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={style} className={`shrink-0 rounded-full object-cover ${bord} ${className}`} />
  ) : (
    <span style={style} className={`grid shrink-0 place-items-center rounded-full bg-[#ECEBE6] font-titre font-extrabold text-marine ${bord} ${className}`}>
      {initiales}
    </span>
  );
}
