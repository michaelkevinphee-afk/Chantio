import Link from 'next/link';

/** Sur téléphone, le bouton Achats de la barre du bas ouvre les factures ; on passe aux fournisseurs ici (comme le bac). */
export function BasculeAchats({ actif }: { actif: 'factures' | 'fournisseurs' }) {
  const bouton = (cle: 'factures' | 'fournisseurs', href: string, libelle: string) => (
    <Link
      href={href}
      aria-current={actif === cle ? 'page' : undefined}
      className={`rounded-[10px] px-4 py-2.5 text-[15px] font-extrabold transition ${actif === cle ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'}`}
    >
      {libelle}
    </Link>
  );
  return (
    <nav aria-label="Achats" className="mb-3.5 inline-flex gap-1 rounded-[14px] border border-trait bg-white p-1 menu:hidden">
      {bouton('factures', '/achats', 'Factures')}
      {bouton('fournisseurs', '/achats/fournisseurs', 'Fournisseurs')}
    </nav>
  );
}
