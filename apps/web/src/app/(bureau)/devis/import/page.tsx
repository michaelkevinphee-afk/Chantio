import { contexteBureau } from '@/lib/session';
import type { ImportLu } from '@/lib/devis';
import { lectureActivee } from '@/lib/lecture';
import { Import } from './import';

export const metadata = { title: 'Importer · Chantio' };

export default async function PageImport() {
  const { supabase, entreprise } = await contexteBureau();
  const { data } = await supabase.from('imports').select('*').order('cree_le', { ascending: false }).limit(50);
  return <Import entrepriseId={entreprise.id} imports={(data ?? []) as ImportLu[]} lecture={lectureActivee()} />;
}
