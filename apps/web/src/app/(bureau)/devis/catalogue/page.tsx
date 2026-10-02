import { lireArticles } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { Catalogue } from './catalogue';

export const metadata = { title: 'Catalogue · Chantio' };

export default async function PageCatalogue() {
  const { supabase } = await contexteBureau();
  const articles = await lireArticles(supabase);
  return <Catalogue articles={articles} />;
}
