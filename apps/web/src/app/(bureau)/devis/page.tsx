import { redirect } from 'next/navigation';
import { chaine, EcranDocuments } from './liste-ecran';

export const metadata = { title: 'Mes devis · Chantio' };

/**
 * « Mes devis » : ?filtre=tous|brouillon|attente|signe|refuse (|ao = appels d'offres), ?type=, ?periode=, ?q=,
 * ?client=<id>, ?nouveau=1 (fenêtre « Nouveau devis »). Les anciennes adresses ?onglet=factures… mènent à /factures.
 */
export default async function PageDevis({ searchParams }: PageProps<'/devis'>) {
  const sp = await searchParams;
  const onglet = chaine(sp.onglet);
  if (onglet === 'factures' || onglet === 'importes') {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== 'onglet' && typeof v === 'string') p.set(k, v);
    const s = p.toString();
    redirect(onglet === 'importes' ? '/devis/import' : `/factures${s ? `?${s}` : ''}`);
  }
  return <EcranDocuments genre="devis" sp={sp} />;
}
