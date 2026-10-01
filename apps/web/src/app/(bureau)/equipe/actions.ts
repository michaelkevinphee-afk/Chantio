'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { RoleMembre } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/config';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;

// Ajoute une personne et lui envoie par e-mail un code de première connexion.
// Son compte sera relié à sa fiche dès qu'elle se connecte avec cette adresse.
export async function inviter(d: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const prenom = texte(d, 'prenom');
  const email = texte(d, 'email')?.toLowerCase();
  const { error } = await supabase.from('membres').insert({
    entreprise_id: entreprise.id,
    email,
    prenom,
    nom: texte(d, 'nom'),
    telephone: texte(d, 'telephone'),
    role: (texte(d, 'role') ?? 'technicien') as RoleMembre,
  });
  if (error) {
    const message = error.code === '23505' ? 'Cette adresse e-mail fait déjà partie de l’équipe.' : 'Ajout impossible.';
    redirect(`/equipe?erreur=${encodeURIComponent(message)}`);
  }
  // Client sans session : l'envoi ne touche pas à la connexion du dirigeant.
  const envoi = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: errEnvoi } = await envoi.auth.signInWithOtp({
    email: email ?? '',
    options: { shouldCreateUser: true },
  });
  revalidatePath('/equipe');
  redirect(`/equipe?invite=${encodeURIComponent(prenom ?? '')}${errEnvoi ? '&sansmail=1' : ''}`);
}

export async function changerActif(membreId: string, actif: boolean) {
  const { supabase } = await contexteBureau();
  await supabase.from('membres').update({ actif }).eq('id', membreId);
  revalidatePath('/equipe');
}
