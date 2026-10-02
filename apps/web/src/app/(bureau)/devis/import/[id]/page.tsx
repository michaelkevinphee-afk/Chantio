import { notFound } from 'next/navigation';
import type { ImportLu } from '@/lib/devis';
import { lectureActivee } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { Verification } from './verification';

// La lecture d'un document peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Vérifier la lecture · Chantio' };

export default async function PageVerification({ params }: PageProps<'/devis/import/[id]'>) {
  const { id } = await params;
  const { supabase } = await contexteBureau();
  const [{ data }, { data: suivants }] = await Promise.all([
    supabase.from('imports').select('*').eq('id', id).maybeSingle(),
    supabase.from('imports').select('id').in('statut', ['a_lire', 'a_verifier', 'pret']).neq('id', id).order('cree_le').limit(1),
  ]);
  if (!data) notFound();
  const imp = data as ImportLu;
  const { data: lien } = await supabase.storage.from('documents').createSignedUrl(imp.chemin, 60 * 60);
  return <Verification imp={imp} lien={lien?.signedUrl ?? null} suivant={suivants?.[0]?.id ?? null} lecture={lectureActivee()} />;
}
