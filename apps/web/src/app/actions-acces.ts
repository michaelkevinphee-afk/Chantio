'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { contexteBureau } from '@/lib/session';

// Paramètres › Accès de Chantio : le dirigeant ouvre, accepte, refuse ou coupe l'accès de
// l'équipe Chantio à son compte. La base vérifie qu'il est bien dirigeant et note tout au journal.

const RUBRIQUE = '/parametres?rubrique=acces';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revenir(cle: 'ok' | 'erreur', message: string): never {
  revalidatePath('/', 'layout');
  redirect(`${RUBRIQUE}&${cle}=${encodeURIComponent(message)}`);
}

const lisible = (e: { message?: string }) =>
  e.message && /[éèàç’']/.test(e.message) && !/function|relation|column/i.test(e.message) ? e.message : 'L’action n’a pas pu être enregistrée.';

export async function autoriserAcces(d: FormData) {
  const { supabase } = await contexteBureau();
  const duree = Number(d.get('duree')) || 60;
  const motif = String(d.get('motif') ?? '').trim().slice(0, 300) || null;
  const mode = d.get('mode') === 'modification' ? 'modification' : 'lecture';
  const { error } = await supabase.rpc('autoriser_assistance', { p_duree_minutes: duree, p_motif: motif, p_mode: mode });
  if (error) revenir('erreur', lisible(error));
  revenir('ok', 'Accès ouvert. Il se coupera tout seul à la fin de la durée choisie.');
}

export async function repondreAcces(d: FormData) {
  const { supabase } = await contexteBureau();
  const id = String(d.get('id') ?? '');
  const accepter = d.get('reponse') === 'oui';
  if (!UUID.test(id)) revenir('erreur', 'Demande introuvable.');
  const { error } = await supabase.rpc('repondre_assistance', { p_assistance: id, p_accepter: accepter });
  if (error) revenir('erreur', lisible(error));
  revenir('ok', accepter ? 'Accès accordé. Vous pouvez le couper à tout moment ici.' : 'Demande refusée. Personne chez Chantio ne voit vos données.');
}

export async function retirerAcces(d: FormData) {
  const { supabase } = await contexteBureau();
  const id = String(d.get('id') ?? '');
  if (!UUID.test(id)) revenir('erreur', 'Accès introuvable.');
  const { error } = await supabase.rpc('retirer_assistance', { p_assistance: id });
  if (error) revenir('erreur', lisible(error));
  revenir('ok', 'Accès coupé. L’équipe Chantio ne voit plus vos données.');
}

// Équipier Chantio : quitte le compte du client et revient à sa propre entreprise (ou à la console).
export async function quitterCompteClient() {
  const { supabase } = await contexteBureau();
  await supabase.rpc('quitter_compte_client');
  const { data } = await supabase.rpc('mes_entreprises');
  revalidatePath('/', 'layout');
  redirect((data ?? []).length ? '/' : '/console/assistance');
}
