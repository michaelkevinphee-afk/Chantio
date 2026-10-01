'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { contexteBureau } from '@/lib/session';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;

export async function ajouterClient(d: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      entreprise_id: entreprise.id,
      nom: texte(d, 'nom'),
      type: texte(d, 'type') ?? 'particulier',
      telephone: texte(d, 'telephone'),
      email: texte(d, 'email'),
    })
    .select('id')
    .single();
  if (error || !data) redirect(`/clients?erreur=${encodeURIComponent('Le client n’a pas pu être ajouté.')}`);

  const adresse = texte(d, 'adresse');
  if (adresse) {
    await supabase.from('sites').insert({
      entreprise_id: entreprise.id,
      client_id: data.id,
      adresse,
      code_postal: texte(d, 'code_postal'),
      ville: texte(d, 'ville'),
    });
  }
  revalidatePath('/clients');
}
