'use server';

import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase/server';

/** Se déconnecter : utilisable dans un formulaire, côté serveur comme côté client (liste du sélecteur d'entreprise). */
export async function deconnecter() {
  const supabase = await supabaseServeur();
  await supabase.auth.signOut();
  redirect('/connexion');
}
