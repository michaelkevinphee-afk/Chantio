import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { estBureau, type Entreprise, type Membre } from '@chantio/shared';
import { supabaseServeur } from './supabase/server';

/** Utilisateur connecté, sa fiche membre et son entreprise. */
export const contexte = cache(async () => {
  const supabase = await supabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');

  let { data: membre } = await supabase.from('membres').select('*').eq('user_id', user.id).maybeSingle<Membre>();
  if (!membre) {
    // Invitation faite après la création du compte : on relie maintenant.
    const { data: rejoint } = await supabase.rpc('rejoindre_entreprise');
    if (rejoint) {
      ({ data: membre } = await supabase.from('membres').select('*').eq('user_id', user.id).maybeSingle<Membre>());
    }
  }
  if (!membre) redirect('/bienvenue');

  const { data: entreprise } = await supabase
    .from('entreprises')
    .select('*')
    .eq('id', membre.entreprise_id)
    .single<Entreprise>();
  if (!entreprise) redirect('/bienvenue');

  return { supabase, user, membre, entreprise };
});

/** Pages du back office : réservées au bureau (dirigeant, chef de chantier, assistant). */
export async function contexteBureau() {
  const ctx = await contexte();
  if (!estBureau(ctx.membre.role)) redirect('/terrain');
  return ctx;
}
