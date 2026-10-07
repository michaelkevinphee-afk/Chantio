import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { RoleChantio } from '@chantio/shared';
import { supabaseServeur } from './supabase/server';

// Console Chantio (/console) : réservée à l'équipe Chantio, après la double vérification.
// Ces contrôles servent à l'affichage ; la base refuse de toute façon chaque fonction
// « console_… » à qui n'a pas le rôle et le niveau « aal2 » (voir la migration console).

export type Equipier = {
  id: string;
  prenom: string;
  nom: string | null;
  email: string;
  role: RoleChantio;
  double_verification: boolean;
};

/** Le compte connecté et sa place dans l'équipe Chantio (null : pas de l'équipe). */
export const equipierConnecte = cache(async () => {
  const supabase = await supabaseServeur();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect('/connexion?suite=/console');
  const { data: moi } = await supabase.rpc('console_moi');
  return { supabase, moi: (moi ?? null) as Equipier | null, email: (data.claims.email as string | undefined) ?? '' };
});

/** Pages de la console : équipe Chantio, double vérification faite. Sinon la page n'existe pas. */
export const contexteConsole = cache(async () => {
  const { supabase, moi } = await equipierConnecte();
  if (!moi) notFound();
  if (!moi.double_verification) redirect('/console/verification');
  return { supabase, moi };
});

/** Message d'erreur de la base, lisible par une personne (sinon un message général). */
export function messageBase(e: { message?: string; code?: string } | null | undefined, general = 'L’action n’a pas pu être enregistrée.') {
  if (!e) return general;
  if (e.code === '42501') return 'Votre rôle ne permet pas cette action.';
  // Les messages levés par nos fonctions sont déjà en français.
  return e.message && /[éèàç’']|^[A-ZÀ-Ý]/.test(e.message) && !/function|relation|column|syntax/i.test(e.message) ? e.message : general;
}

/** Date et heure de Paris, pour l'affichage (« mar. 7 oct., 18 h 20 »). */
export function quand(iso: string | null | undefined, avecJour = true) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    ...(avecJour ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(':', ' h ');
}

/** Date seule (« 07/10/2026 »). */
export function jour(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );
}

/** « il y a 4 min », « hier », « il y a 12 j » (dernière connexion). */
export function ilYa(iso: string | null | undefined, maintenant = Date.now()) {
  if (!iso) return 'jamais';
  const s = Math.max(0, (maintenant - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86_400) return 'hier';
  if (s < 60 * 86_400) return `il y a ${Math.floor(s / 86_400)} j`;
  return `le ${jour(iso)}`;
}

/** Aujourd'hui à Paris (AAAA-MM-JJ). */
export function aujourdhuiParis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

export const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
