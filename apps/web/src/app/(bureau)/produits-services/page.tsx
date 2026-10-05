import { lireArticles } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { ProduitsServices } from './catalogue';

export const metadata = { title: 'Produits et services · Chantio' };

/** Ventes › Produits et services (l'ancien « Catalogue » de /devis/catalogue). ?nouveau=1 ouvre la fenêtre de création. */
export default async function PageProduitsServices({ searchParams }: PageProps<'/produits-services'>) {
  const { supabase, entreprise } = await contexteBureau();
  const [{ nouveau }, articles] = await Promise.all([searchParams, lireArticles(supabase)]);
  return <ProduitsServices articles={articles} reglages={entreprise.facturation ?? {}} nouveau={!!nouveau} />;
}
