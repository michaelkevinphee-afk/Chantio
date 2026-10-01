'use server';

import { redirect } from 'next/navigation';
import { supabaseServeur } from '@/lib/supabase/server';

export async function creerEntreprise(donnees: FormData) {
  const supabase = await supabaseServeur();
  const { error } = await supabase.rpc('creer_entreprise', {
    p_nom: String(donnees.get('entreprise') ?? ''),
    p_prenom: String(donnees.get('prenom') ?? ''),
    p_nom_famille: String(donnees.get('nom') ?? ''),
  });
  if (error) redirect(`/bienvenue?erreur=${encodeURIComponent("La création a échoué : " + error.message)}`);
  redirect('/');
}
