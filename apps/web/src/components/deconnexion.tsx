import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase/server';

async function deconnecter() {
  'use server';
  const supabase = await supabaseServeur();
  await supabase.auth.signOut();
  redirect('/connexion');
}

export function BoutonDeconnexion({ className = '' }: { className?: string }) {
  return (
    <form action={deconnecter}>
      <button className={`text-sm font-semibold underline ${className}`}>Se déconnecter</button>
    </form>
  );
}
