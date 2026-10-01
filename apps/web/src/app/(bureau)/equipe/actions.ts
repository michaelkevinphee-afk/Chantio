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
    redirect(`/equipe?nouveau=1&erreur=${encodeURIComponent(message)}`);
  }
  const errEnvoi = await envoyerCode(email ?? '');
  revalidatePath('/equipe');
  redirect(`/equipe?invite=${encodeURIComponent(prenom ?? '')}${errEnvoi ? `&sansmail=${encodeURIComponent(errEnvoi)}` : ''}`);
}

// Renvoie le code de première connexion à une personne déjà ajoutée.
export async function renvoyer(membreId: string) {
  const { supabase } = await contexteBureau();
  const { data } = await supabase.from('membres').select('prenom, email').eq('id', membreId).maybeSingle();
  if (!data?.email) redirect(`/equipe?erreur=${encodeURIComponent('Adresse e-mail introuvable.')}`);
  const errEnvoi = await envoyerCode(data.email);
  redirect(
    `/equipe?renvoi=${encodeURIComponent(data.prenom ?? '')}${errEnvoi ? `&sansmail=${encodeURIComponent(errEnvoi)}` : ''}`,
  );
}

// Envoie un code de connexion par e-mail. Renvoie le message d'erreur, ou null.
// Client sans session : l'envoi ne touche pas à la connexion du dirigeant.
async function envoyerCode(email: string) {
  const envoi = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await envoi.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return null;
  console.error('Envoi du code impossible', error);
  return /rate|limit|seconds/i.test(error.message)
    ? 'trop d’envois rapprochés, réessayez dans une minute'
    : error.message;
}

export async function changerActif(membreId: string, actif: boolean) {
  const { supabase } = await contexteBureau();
  await supabase.from('membres').update({ actif }).eq('id', membreId);
  revalidatePath('/equipe');
}
