import Link from 'next/link';

/** Clients ou contrats d'entretien. */
export function OngletsClients({ actif }: { actif: 'clients' | 'contrats' }) {
  const lien = (oui: boolean) =>
    `rounded-[10px] px-3.5 py-1.5 text-sm font-bold transition ${oui ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'}`;
  return (
    <div className="mb-5 inline-flex rounded-xl border border-trait bg-white p-0.5" role="group" aria-label="Clients et contrats">
      <Link href="/clients" aria-current={actif === 'clients' ? 'page' : undefined} className={lien(actif === 'clients')}>
        Clients
      </Link>
      <Link href="/clients/contrats" aria-current={actif === 'contrats' ? 'page' : undefined} className={lien(actif === 'contrats')}>
        Contrats d’entretien
      </Link>
    </div>
  );
}
