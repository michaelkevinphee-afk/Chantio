'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { dureeLisible } from '@chantio/shared';
import { contexteConsole, messageBase } from '@/lib/console';
import { envoyerCourriel } from '@/lib/courriel';
import { envoyerCode } from '@/lib/envoi-code';
import type { FicheEntreprise } from './(espace)/donnees';

// Actions de la console. Chaque fonction de la base vérifie elle-même le rôle et la
// double vérification : ces actions ne font que transmettre et revenir à la page.

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revient à la page avec un message (?ok= ou ?erreur=). */
function revenir(chemin: string, cle: 'ok' | 'erreur', message: string): never {
  redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}${cle}=${encodeURIComponent(message)}`);
}

/** Page d'où vient le formulaire (champ caché « retour »), limitée à la console. */
function retourDe(d: FormData, defaut: string) {
  const r = texte(d, 'retour');
  return r.startsWith('/console') && !r.startsWith('//') ? r.replace(/[?&](ok|erreur)=[^&]*/g, '') : defaut;
}

const fiche = (id: string, onglet: string) => `/console/entreprises/${id}?onglet=${onglet}`;

// Abonnement ----------------------------------------------------------------

export async function modifierAbonnement(d: FormData) {
  const { supabase } = await contexteConsole();
  const id = texte(d, 'entreprise');
  if (!UUID.test(id)) revenir('/console/entreprises', 'erreur', 'Entreprise introuvable.');
  const prix = texte(d, 'prix_special').replace(/\s/g, '').replace(',', '.');
  if (prix && !(Number(prix) >= 0)) revenir(fiche(id, 'abonnement'), 'erreur', 'Le prix particulier doit être un nombre.');
  const statut = texte(d, 'statut');
  const { error } = await supabase.rpc('console_modifier_abonnement', {
    p_entreprise: id,
    p_formule: texte(d, 'formule'),
    p_statut: statut,
    p_essai_fin: statut === 'essai' ? texte(d, 'essai_fin') || null : null,
    p_prix_special: prix ? Number(prix) : null,
    p_options: d.getAll('options').map(String),
  });
  if (error) revenir(fiche(id, 'abonnement'), 'erreur', messageBase(error));
  revalidatePath('/console', 'layout');
  revenir(fiche(id, 'abonnement'), 'ok', 'Abonnement enregistré. Le changement est noté dans le journal du client.');
}

export async function creerEntreprise(d: FormData) {
  const { supabase } = await contexteConsole();
  const email = texte(d, 'email').toLowerCase();
  const { data: id, error } = await supabase.rpc('console_creer_entreprise', {
    p_nom: texte(d, 'nom'),
    p_prenom: texte(d, 'prenom'),
    p_nom_famille: texte(d, 'nom_famille') || null,
    p_email: email,
    p_siren: texte(d, 'siren') || null,
    p_code_postal: texte(d, 'code_postal') || null,
    p_ville: texte(d, 'ville') || null,
    p_formule: texte(d, 'formule'),
    p_statut: texte(d, 'statut'),
  });
  if (error || !id) {
    const champs = new URLSearchParams();
    for (const k of ['nom', 'prenom', 'nom_famille', 'email', 'siren', 'code_postal', 'ville', 'formule', 'statut']) champs.set(k, texte(d, k));
    revenir(`/console/entreprises/nouvelle?${champs}`, 'erreur', messageBase(error, 'L’entreprise n’a pas pu être créée.'));
  }
  revalidatePath('/console', 'layout');
  let message = 'Entreprise créée.';
  if (d.get('envoyer') === 'oui') {
    const erreurEnvoi = await envoyerCode(email);
    message = erreurEnvoi
      ? `Entreprise créée, mais le code de connexion n’est pas parti (${erreurEnvoi}). Le dirigeant peut l’obtenir lui-même sur la page de connexion avec « Première connexion ».`
      : `Entreprise créée. Un code de connexion est parti à ${email} : avec lui, le dirigeant choisit son mot de passe et retrouve son entreprise.`;
  }
  revenir(fiche(String(id), 'resume'), 'ok', message);
}

// Assistance ------------------------------------------------------------------

export async function demanderAssistance(d: FormData) {
  const { supabase, moi } = await contexteConsole();
  const id = texte(d, 'entreprise');
  if (!UUID.test(id)) revenir('/console/assistance', 'erreur', 'Choisissez une entreprise.');
  const duree = Number(texte(d, 'duree')) || 60;
  const motif = texte(d, 'motif');
  const mode = texte(d, 'mode') === 'modification' ? 'modification' : 'lecture';
  const { error } = await supabase.rpc('console_demander_assistance', { p_entreprise: id, p_duree_minutes: duree, p_motif: motif, p_mode: mode });
  if (error) revenir(retourDe(d, fiche(id, 'assistance')), 'erreur', messageBase(error));

  // Prévient le ou les dirigeants par e-mail : la demande les attend aussi dans le bureau.
  const { data } = await supabase.rpc('console_entreprise', { p_entreprise: id });
  const f = data as FicheEntreprise | null;
  const h = await headers();
  const site = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const dirigeants = (f?.membres ?? []).filter((m) => m.role === 'dirigeant' && m.actif && m.compte);
  let envoyes = 0;
  for (const m of dirigeants) {
    const ok = await envoyerCourriel(
      { email: m.email, nom: [m.prenom, m.nom].filter(Boolean).join(' ') },
      `${moi.prenom} de Chantio demande l’accès à votre compte`,
      [
        `Bonjour ${m.prenom},`,
        '',
        `${moi.prenom}, de l’équipe Chantio, souhaite ${mode === 'modification' ? 'voir et modifier' : 'voir'} le compte de ${f?.entreprise.nom ?? 'votre entreprise'} pendant ${dureeLisible(duree)} pour vous aider :`,
        `« ${motif} »`,
        '',
        `Pour accepter ou refuser : ${site}/parametres?rubrique=acces`,
        '',
        'Sans votre accord, personne chez Chantio ne voit vos clients, vos interventions ni vos factures. L’accès se coupe seul à la fin de la durée, vous pouvez le couper avant, et chaque consultation est notée dans Paramètres › Accès de Chantio.',
        '',
        'L’équipe Chantio',
      ].join('\n'),
    );
    if (ok) envoyes++;
  }
  revalidatePath('/console', 'layout');
  revenir(
    retourDe(d, fiche(id, 'assistance')),
    'ok',
    envoyes
      ? `Demande envoyée. Le dirigeant est prévenu par e-mail et dans son bureau.`
      : `Demande envoyée. Le dirigeant la verra en haut de son bureau à sa prochaine connexion (aucun e-mail n’est parti).`,
  );
}

// Entre dans le bureau du client (session « lecture et modification ») pour le paramétrer.
export async function entrerCompte(d: FormData) {
  const { supabase } = await contexteConsole();
  const id = texte(d, 'entreprise');
  const retour = retourDe(d, fiche(id, 'assistance'));
  if (!UUID.test(id)) revenir(retour, 'erreur', 'Entreprise introuvable.');
  const { error } = await supabase.rpc('console_entrer_compte', { p_entreprise: id });
  if (error) revenir(retour, 'erreur', messageBase(error));
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function terminerAssistance(d: FormData) {
  const { supabase } = await contexteConsole();
  const id = texte(d, 'assistance');
  const retour = retourDe(d, '/console/assistance');
  if (!UUID.test(id)) revenir(retour, 'erreur', 'Session introuvable.');
  const { error } = await supabase.rpc('console_terminer_assistance', { p_assistance: id });
  if (error) revenir(retour, 'erreur', messageBase(error));
  revalidatePath('/console', 'layout');
  revenir(retour, 'ok', 'Session fermée.');
}

// Identité, idées --------------------------------------------------------------

export async function deciderIdentite(d: FormData) {
  const { supabase } = await contexteConsole();
  const id = texte(d, 'entreprise');
  if (!UUID.test(id)) revenir('/console/identites', 'erreur', 'Entreprise introuvable.');
  const valider = texte(d, 'decision') === 'valider';
  const { error } = await supabase.rpc('console_decider_identite', { p_entreprise: id, p_valider: valider, p_motif: texte(d, 'motif') || null });
  if (error) revenir('/console/identites', 'erreur', messageBase(error));
  revalidatePath('/console', 'layout');
  revenir('/console/identites', 'ok', valider ? 'Identité vérifiée : le client peut activer la facturation électronique.' : 'Vérification refusée : le client voit le motif.');
}

export async function suivreIdee(d: FormData) {
  const { supabase } = await contexteConsole();
  const retour = retourDe(d, '/console/idees');
  const { error } = await supabase.rpc('console_suivre_idee', { p_retour: texte(d, 'id'), p_statut: texte(d, 'statut') });
  if (error) revenir(retour, 'erreur', messageBase(error));
  revalidatePath('/console', 'layout');
  redirect(retour);
}

// Équipe Chantio ---------------------------------------------------------------

export async function inviterEquipier(d: FormData) {
  const { supabase } = await contexteConsole();
  const { error } = await supabase.rpc('console_inviter_equipier', {
    p_email: texte(d, 'email'),
    p_prenom: texte(d, 'prenom'),
    p_nom: texte(d, 'nom') || null,
    p_role: texte(d, 'role'),
  });
  if (error) revenir('/console/equipe', 'erreur', messageBase(error));
  revalidatePath('/console/equipe');
  revenir(
    '/console/equipe',
    'ok',
    `${texte(d, 'prenom')} est ajouté. Il ouvre l’adresse /console avec ${texte(d, 'email').toLowerCase()} (compte Chantio créé avec cette adresse), puis active sa double vérification.`,
  );
}

export async function modifierEquipier(d: FormData) {
  const { supabase } = await contexteConsole();
  const { error } = await supabase.rpc('console_modifier_equipier', {
    p_equipier: texte(d, 'id'),
    p_role: texte(d, 'role'),
    p_actif: texte(d, 'actif') !== 'non',
  });
  if (error) revenir('/console/equipe', 'erreur', messageBase(error));
  revalidatePath('/console/equipe');
  revenir('/console/equipe', 'ok', 'Accès mis à jour.');
}
