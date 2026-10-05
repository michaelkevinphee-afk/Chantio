'use server';

import { revalidatePath } from 'next/cache';
import { contexte, contexteBureau } from '@/lib/session';

export type StatutRetour = 'nouveau' | 'en_cours' | 'fait';

const coupe = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Enregistre un retour envoyé depuis la bulle, avec la page exacte où se trouvait l'utilisateur. */
export async function envoyerRetour(d: { texte: string; page: string; titrePage: string; appareil: string }): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const { supabase, membre, entreprise } = await contexte();
  const texte = coupe(d.texte, 5000);
  if (!texte) return { ok: false, erreur: 'Le message est vide.' };
  const { error } = await supabase.from('retours').insert({
    entreprise_id: entreprise.id,
    membre_id: membre.id,
    auteur: [membre.prenom, membre.nom].filter(Boolean).join(' '),
    texte,
    page: coupe(d.page, 1000) || '/',
    titre_page: coupe(d.titrePage, 300) || null,
    appareil: coupe(d.appareil, 300) || null,
  });
  if (error) {
    console.error('retour', error);
    return { ok: false, erreur: 'Le message n’est pas parti. Réessayez dans un instant.' };
  }
  revalidatePath('/parametres');
  return { ok: true };
}

/** Change le statut d'un retour (liste de Paramètres › Retours sur Chantio). */
export async function suivreRetour(formulaire: FormData) {
  const { supabase } = await contexteBureau();
  const statut = String(formulaire.get('statut')) as StatutRetour;
  if (!['nouveau', 'en_cours', 'fait'].includes(statut)) return;
  await supabase.from('retours').update({ statut }).eq('id', String(formulaire.get('id')));
  revalidatePath('/parametres');
}
