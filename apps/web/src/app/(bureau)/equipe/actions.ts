'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { RoleMembre } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;

// Ajoute une personne : son compte sera relié à sa première connexion
// avec la même adresse e-mail.
export async function inviter(d: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const prenom = texte(d, 'prenom');
  const { error } = await supabase.from('membres').insert({
    entreprise_id: entreprise.id,
    email: texte(d, 'email')?.toLowerCase(),
    prenom,
    nom: texte(d, 'nom'),
    telephone: texte(d, 'telephone'),
    role: (texte(d, 'role') ?? 'technicien') as RoleMembre,
  });
  if (error) {
    const message = error.code === '23505' ? 'Cette adresse e-mail fait déjà partie de l’équipe.' : 'Ajout impossible.';
    redirect(`/equipe?erreur=${encodeURIComponent(message)}`);
  }
  revalidatePath('/equipe');
  redirect(`/equipe?invite=${encodeURIComponent(prenom ?? '')}`);
}

export async function changerActif(membreId: string, actif: boolean) {
  const { supabase } = await contexteBureau();
  await supabase.from('membres').update({ actif }).eq('id', membreId);
  revalidatePath('/equipe');
}
