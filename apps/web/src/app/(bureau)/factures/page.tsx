import { EcranDocuments } from '../devis/liste-ecran';

export const metadata = { title: 'Mes factures · Chantio' };

/**
 * « Mes factures » (Ventes › Factures, factures de vente ; les factures fournisseurs sont dans Achats) :
 * ?filtre=toutes|brouillon|a_encaisser|retard|terminee, ?type=totale|acompte|avancement|situation|solde|avoir,
 * ?periode=, ?q=, ?client=<id>, ?nouveau=1 (fenêtre « Nouvelle facture »). Chaque facture s'ouvre sur /devis/<id>.
 */
export default async function PageFactures({ searchParams }: PageProps<'/factures'>) {
  return <EcranDocuments genre="facture" sp={await searchParams} />;
}
