'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { contexteBureau } from '@/lib/session';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;
const chiffres = (d: FormData, cle: string, n: number) => {
  const v = String(d.get(cle) ?? '').replace(/\s/g, '');
  return v.length === n && /^\d+$/.test(v) ? v : null;
};
const nombre = (d: FormData, cle: string) => {
  const v = Number(texte(d, cle));
  return texte(d, cle) && Number.isFinite(v) ? v : null;
};

export type EtatClient = { erreur?: string } | undefined;

// Crée le client, ses contacts et son adresse d'intervention, puis ouvre sa fiche.
export async function ajouterClient(_: EtatClient, d: FormData): Promise<EtatClient> {
  const { supabase, entreprise } = await contexteBureau();
  const particulier = texte(d, 'genre') !== 'pro';
  const nom = particulier ? [texte(d, 'prenom'), texte(d, 'nom')].filter(Boolean).join(' ') : texte(d, 'nom');
  if (!nom) return { erreur: particulier ? 'Indiquez au moins le nom du client.' : 'Indiquez la raison sociale.' };

  const { data, error } = await supabase
    .from('clients')
    .insert({
      entreprise_id: entreprise.id,
      nom,
      type: particulier ? 'particulier' : (texte(d, 'type') ?? 'entreprise'),
      civilite: particulier ? texte(d, 'civilite') : null,
      telephone: texte(d, 'telephone'),
      mobile: particulier ? texte(d, 'mobile') : null,
      email: texte(d, 'email'),
      siren: particulier ? null : chiffres(d, 'siren', 9),
      siret: particulier ? null : chiffres(d, 'siret', 14),
      forme_juridique: particulier ? null : texte(d, 'forme_juridique'),
      activite: particulier ? null : texte(d, 'activite'),
      tva_intracom: particulier ? null : texte(d, 'tva_intracom'),
      site_web: particulier ? null : texte(d, 'site_web'),
      adresse_facturation: texte(d, 'adresse_facturation'),
      notes: texte(d, 'notes'),
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Création du client impossible', error);
    return { erreur: 'Le client n’a pas pu être ajouté. Réessayez.' };
  }

  if (!particulier) {
    const noms = d.getAll('contact_nom').map((v) => String(v).trim());
    const contacts = noms
      .map((n, k) => ({
        entreprise_id: entreprise.id,
        client_id: data.id,
        nom: n,
        fonction: String(d.getAll('contact_fonction')[k] ?? '').trim() || null,
        telephone: String(d.getAll('contact_telephone')[k] ?? '').trim() || null,
        email: String(d.getAll('contact_email')[k] ?? '').trim() || null,
      }))
      .filter((c) => c.nom);
    if (contacts.length) await supabase.from('contacts_client').insert(contacts);
  }

  const adresse = texte(d, 'adresse');
  if (adresse) {
    await supabase.from('sites').insert({
      entreprise_id: entreprise.id,
      client_id: data.id,
      adresse,
      code_postal: texte(d, 'code_postal'),
      ville: texte(d, 'ville'),
      acces: texte(d, 'acces'),
      consignes: texte(d, 'consignes'),
      latitude: nombre(d, 'latitude'),
      longitude: nombre(d, 'longitude'),
    });
  }
  revalidatePath('/clients');
  redirect(`/clients?fiche=${data.id}&cree=1`);
}

export async function ajouterContact(clientId: string, d: FormData) {
  const { supabase, entreprise } = await contexteBureau();
  const nom = texte(d, 'nom');
  if (nom) {
    await supabase.from('contacts_client').insert({
      entreprise_id: entreprise.id,
      client_id: clientId,
      nom,
      fonction: texte(d, 'fonction'),
      telephone: texte(d, 'telephone'),
      email: texte(d, 'email'),
    });
  }
  revalidatePath('/clients');
}

export async function supprimerContact(contactId: string) {
  const { supabase } = await contexteBureau();
  await supabase.from('contacts_client').delete().eq('id', contactId);
  revalidatePath('/clients');
}
