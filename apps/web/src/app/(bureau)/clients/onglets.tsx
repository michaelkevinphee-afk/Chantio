import Link from 'next/link';

/**
 * Bascule du bac (« Clients | Immeubles et contrats », « Immeubles | Échéancier des contrats ») :
 * des liens, l'onglet actif sur fond bleu clair. Sous 821 px, elle prend toute la largeur.
 */
export function Bascule({
  etiquette,
  onglets,
  actif,
  className = '',
}: {
  etiquette: string;
  onglets: { cle: string; libelle: string; href: string }[];
  actif: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={etiquette}
      className={`inline-flex max-w-full rounded-[12px] border border-trait bg-white p-[3px] max-menu:grid max-menu:w-full max-menu:auto-cols-[minmax(0,1fr)] max-menu:grid-flow-col ${className}`}
    >
      {onglets.map((o) => {
        const oui = o.cle === actif;
        return (
          <Link
            key={o.cle}
            href={o.href}
            scroll={false}
            aria-current={oui ? 'page' : undefined}
            className={`grid place-items-center rounded-[9px] px-3.5 py-1.5 text-center text-[15px] leading-tight font-bold transition max-menu:min-h-11 max-menu:px-1 max-menu:text-[13.5px] ${
              oui ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'
            }`}
          >
            {o.libelle}
          </Link>
        );
      })}
    </nav>
  );
}

/** Onglets de « Mes clients » : la liste des clients, et les immeubles avec leurs contrats d'entretien. */
export function OngletsClients({ actif }: { actif: 'clients' | 'immeubles' }) {
  return (
    <Bascule
      etiquette="Mes clients"
      actif={actif}
      className="mb-4"
      onglets={[
        { cle: 'clients', libelle: 'Clients', href: '/clients' },
        { cle: 'immeubles', libelle: 'Immeubles et contrats', href: '/clients/immeubles' },
      ]}
    />
  );
}
