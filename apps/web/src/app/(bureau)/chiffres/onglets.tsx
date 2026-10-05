import Link from 'next/link';

/** « Le point » / « Mon année », en haut de Chiffres (Mon année est réservé au dirigeant). */
export function OngletsChiffres({ actif }: { actif: 'point' | 'annee' }) {
  const onglet = (cle: 'point' | 'annee', libelle: string, href: string) => (
    <Link
      href={href}
      aria-current={actif === cle ? 'page' : undefined}
      className={`rounded-[9px] px-3.5 py-[7px] text-sm font-bold ${actif === cle ? 'bg-white text-cobalt shadow-[0_1px_3px_rgba(16,26,61,.12)]' : 'text-gris hover:text-encre'}`}
    >
      {libelle}
    </Link>
  );
  return (
    <nav aria-label="Vues de Chiffres" className="inline-flex gap-0.5 rounded-xl bg-doux p-1">
      {onglet('point', 'Le point', '/chiffres')}
      {onglet('annee', 'Mon année', '/chiffres?vue=annee')}
    </nav>
  );
}
