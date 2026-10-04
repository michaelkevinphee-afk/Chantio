import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { estBureau, type Entreprise, type Membre, type MonEntreprise } from '@chantio/shared';
import { supabaseServeur } from './supabase/server';

/** Utilisateur connecté, sa fiche membre et son entreprise. */
export const contexte = cache(async () => {
  const supabase = await supabaseServeur();
  // getClaims vérifie le jeton sur place (clés de signature du projet),
  // sans aller-retour vers Supabase à chaque page.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect('/connexion');
  const user = { id: data.claims.sub, email: data.claims.email as string | undefined };

  // Fiche membre dans l'entreprise active (un compte peut en avoir plusieurs) et
  // entreprise, en une seule requête.
  type MembreEtEntreprise = Membre & { entreprise: Entreprise | null };
  const lireMembre = () =>
    supabase.rpc('membre_actif').select('*, entreprise:entreprises(*)').maybeSingle<MembreEtEntreprise>();

  let { data: ligne } = await lireMembre();
  if (!ligne) {
    // Invitations faites après la création du compte : on les relie maintenant.
    const { data: rejoint } = await supabase.rpc('rejoindre_entreprise');
    if (rejoint) ({ data: ligne } = await lireMembre());
  }
  if (!ligne?.entreprise) redirect('/bienvenue');
  const { entreprise, ...membre } = ligne;

  return { supabase, user, membre, entreprise };
});

/** Pages du back office : réservées au bureau (dirigeant, chef de chantier, assistant). */
export async function contexteBureau() {
  const ctx = await contexte();
  if (!estBureau(ctx.membre.role)) redirect('/terrain');
  return ctx;
}

/** Toutes les entreprises du compte connecté, l'active marquée. */
export const mesEntreprises = cache(async () => {
  const supabase = await supabaseServeur();
  const { data } = await supabase.rpc('mes_entreprises');
  return (data ?? []) as MonEntreprise[];
});
