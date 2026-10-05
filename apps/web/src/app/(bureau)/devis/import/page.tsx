import { contexteBureau } from '@/lib/session';
import type { ImportLu } from '@/lib/devis';
import { lectureActivee } from '@/lib/lecture';
import { Import } from './import';

// La lecture d'un document peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Importer · Chantio' };

export default async function PageImport({ searchParams }: PageProps<'/devis/import'>) {
  const { depuis } = await searchParams;
  const { supabase, entreprise } = await contexteBureau();
  const { data } = await supabase.from('imports').select('*').or('champs->>genre.is.null,champs->>genre.neq.intervention').order('cree_le', { ascending: false }).limit(50);
  return <Import entrepriseId={entreprise.id} imports={(data ?? []) as ImportLu[]} lecture={lectureActivee()} depuis={depuis === 'factures' || depuis === 'ventes' ? depuis : 'devis'} />;
}
