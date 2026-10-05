'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LIBELLE_ROLE, type ReglagesFacturation, type RoleMembre } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/config';

// L'équipe se gère dans Paramètres › Membres : chaque action y ramène.
const MEMBRES = '/parametres?rubrique=membres';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;
const enc = encodeURIComponent;

/** Heures par semaine saisies (« 39 », « 37,5 ») : 35 si vide, refusées hors de 0 à 80. */
function heures(d: FormData): number | null {
  const brut = texte(d, 'heures');
  if (!brut) return 35;
  const n = Math.round(Number(brut.replace(/\s/g, '').replace(',', '.')) * 2) / 2;
  return Number.isFinite(n) && n >= 0 && n <= 80 ? n : null;
}

const roleValide = (r: string | null): r is RoleMembre => !!r && Object.hasOwn(LIBELLE_ROLE, r);

/** Le métier de chaque membre est rangé dans les réglages de l'entreprise (pas de colonne dans membres). */
async function enregistrerMetier(supabase: SupabaseClient, entrepriseId: string, membreId: string, metier: string | null) {
  const { data } = await supabase.from('entreprises').select('facturation').eq('id', entrepriseId).single();
  const f = { ...((data?.facturation as ReglagesFacturation | null) ?? {}) };
  const metiers = { ...(f.metiers_membres ?? {}) };
  if ((metiers[membreId] ?? null) === (metier ?? null)) return;
  if (metier) metiers[membreId] = metier.slice(0, 80);
  else delete metiers[membreId];
  f.metiers_membres = metiers;
  await supabase.from('entreprises').update({ facturation: f }).eq('id', entrepriseId);
}

// Ajoute une personne et lui envoie par e-mail un code de première connexion.
// Son compte sera relié à sa fiche dès qu'elle se connecte avec cette adresse.
export async function inviter(d: FormData) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const erreur = (m: string) => redirect(`${MEMBRES}&nouveau=1&erreur=${enc(m)}`);
  if (membre.role !== 'dirigeant') erreur('Seul le dirigeant peut inviter un collaborateur.');
  const prenom = texte(d, 'prenom');
  const email = texte(d, 'email')?.toLowerCase();
  const role = texte(d, 'role') ?? 'technicien';
  const h = heures(d);
  if (!prenom) erreur('Indiquez au moins le prénom');
  if (!email || !EMAIL.test(email)) erreur('Indiquez une adresse e-mail valide : le code de connexion part à cette adresse.');
  if (!roleValide(role)) erreur('Ce rôle n’existe pas.');
  if (h === null) erreur('Les heures par semaine vont de 0 à 80.');
  const { data: cree, error } = await supabase
    .from('membres')
    .insert({
      entreprise_id: entreprise.id,
      email,
      prenom,
      nom: texte(d, 'nom'),
      telephone: texte(d, 'telephone'),
      role: role as RoleMembre,
      heures_semaine: h,
    })
    .select('id')
    .single();
  if (error || !cree) {
    erreur(error?.code === '23505' ? 'Cette adresse e-mail fait déjà partie de l’équipe.' : 'Ajout impossible.');
    return;
  }
  await enregistrerMetier(supabase, entreprise.id, cree.id, texte(d, 'metier'));
  const errEnvoi = await envoyerCode(email ?? '');
  revalidatePath('/parametres');
  redirect(`${MEMBRES}&invite=${enc(prenom ?? '')}${errEnvoi ? `&sansmail=${enc(errEnvoi)}` : ''}`);
}

/** Modifie un membre (fenêtre « Modifier Prénom Nom ») : identité, téléphone, rôle, métier, heures. */
export async function modifierMembre(membreId: string, d: FormData) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const erreur = (m: string) => redirect(`${MEMBRES}&modifier=${membreId}&erreur=${enc(m)}`);
  if (membre.role !== 'dirigeant') erreur('Seul le dirigeant peut modifier les membres.');
  const { data: avant } = await supabase.from('membres').select('id, user_id, role').eq('id', membreId).maybeSingle();
  if (!avant) erreur('Ce membre est introuvable.');
  const prenom = texte(d, 'prenom');
  const role = texte(d, 'role');
  const h = heures(d);
  if (!prenom) erreur('Indiquez au moins le prénom');
  if (h === null) erreur('Les heures par semaine vont de 0 à 80.');
  const maj: Record<string, unknown> = { prenom, nom: texte(d, 'nom'), telephone: texte(d, 'telephone'), heures_semaine: h };
  // Son propre rôle ne se change pas (règle de la base) ; le champ n'est alors pas envoyé.
  if (role && membreId !== membre.id) {
    if (!roleValide(role)) erreur('Ce rôle n’existe pas.');
    maj.role = role;
  }
  // L'adresse d'une personne qui a déjà son compte sert à se connecter : elle ne change pas ici.
  const email = texte(d, 'email')?.toLowerCase();
  if (!avant?.user_id && email) {
    if (!EMAIL.test(email)) erreur('Cette adresse e-mail n’est pas valide.');
    maj.email = email;
  }
  const { error } = await supabase.from('membres').update(maj).eq('id', membreId);
  if (error) erreur(error.code === '23505' ? 'Cette adresse e-mail fait déjà partie de l’équipe.' : 'Modification impossible.');
  await enregistrerMetier(supabase, entreprise.id, membreId, texte(d, 'metier'));
  revalidatePath('/parametres');
  if (membreId === membre.id) revalidatePath('/', 'layout');
  redirect(`${MEMBRES}&modifie=${enc(prenom ?? '')}`);
}

// Renvoie le code de première connexion à une personne déjà ajoutée.
export async function renvoyer(membreId: string) {
  const { supabase } = await contexteBureau();
  const { data } = await supabase.from('membres').select('prenom, email').eq('id', membreId).maybeSingle();
  if (!data?.email) redirect(`${MEMBRES}&erreur=${enc('Adresse e-mail introuvable.')}`);
  const errEnvoi = await envoyerCode(data.email);
  redirect(`${MEMBRES}&renvoi=${enc(data.prenom ?? '')}${errEnvoi ? `&sansmail=${enc(errEnvoi)}` : ''}`);
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

/** Désactive ou réactive un membre (jamais un dirigeant, jamais soi-même). */
export async function changerActif(membreId: string, actif: boolean): Promise<{ erreur?: string }> {
  const { supabase, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { erreur: 'Seul le dirigeant peut désactiver un membre.' };
  if (membreId === membre.id) return { erreur: 'Vous ne pouvez pas vous désactiver vous-même.' };
  const { data: cible } = await supabase.from('membres').select('role').eq('id', membreId).maybeSingle();
  if (!cible) return { erreur: 'Ce membre est introuvable.' };
  if (!actif && cible.role === 'dirigeant') return { erreur: 'Un dirigeant ne se désactive pas.' };
  const { error } = await supabase.from('membres').update({ actif }).eq('id', membreId);
  if (error) return { erreur: 'Le changement n’a pas pu être enregistré.' };
  revalidatePath('/parametres');
  return {};
}
