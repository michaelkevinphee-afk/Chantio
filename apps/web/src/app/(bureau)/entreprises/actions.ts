'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Formule, RoleMembre } from '@chantio/shared';
import { ficheSiren, figureParmiDirigeants } from '@/lib/registre';
import { numeroValide } from '@/lib/siret';
import { supabaseServeur } from '@/lib/supabase/server';
import { serviceActif, supabaseService } from '@/lib/supabase/service';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim();
const chiffres = (d: FormData, cle: string) => texte(d, cle).replace(/\s/g, '');

export type EtatAjout = { erreur?: string; dejaInscrite?: { siren: string; nom: string } } | undefined;

/** Le compte connecté (les pages hors bureau, comme « Bienvenue », n'ont pas encore d'entreprise). */
async function compte() {
  const supabase = await supabaseServeur();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect('/connexion');
  return supabase;
}

export type ResultatRegistre = 'verifiee' | 'en_attente' | 'absent' | 'indisponible';

/**
 * Contrôle d'identité au registre : le prénom et le nom du dirigeant figurent-ils
 * parmi les dirigeants déclarés ? Si oui, la demande part chez Chantio, et elle est
 * confirmée d'office quand le site dispose de la clé de service.
 */
async function controlerRegistre(
  supabase: SupabaseClient,
  entrepriseId: string,
  siren: string,
  prenom: string,
  nom: string | null,
): Promise<ResultatRegistre> {
  let fiche;
  try {
    fiche = await ficheSiren(siren);
  } catch {
    return 'indisponible';
  }
  if (!fiche || !figureParmiDirigeants(fiche, prenom, nom)) return 'absent';
  const { error } = await supabase.rpc('demander_verification_registre', { p_entreprise: entrepriseId });
  if (error) return 'indisponible';
  if (!serviceActif) return 'en_attente';
  const { error: errConfirm } = await supabaseService()
    .from('entreprises')
    .update({ identite_statut: 'verifiee', identite_le: new Date().toISOString() })
    .eq('id', entrepriseId)
    .eq('identite_mode', 'registre');
  return errConfirm ? 'en_attente' : 'verifiee';
}

/** Ajoute une entreprise (page « Bienvenue » ou « Ajouter une entreprise »). */
export async function creerEntreprise(_: EtatAjout, d: FormData): Promise<EtatAjout> {
  const supabase = await compte();
  const siren = chiffres(d, 'siren') || chiffres(d, 'siret').slice(0, 9);
  const siret = chiffres(d, 'siret');
  const prenom = texte(d, 'prenom');
  const nomFamille = texte(d, 'nom_famille');
  if (!texte(d, 'nom')) return { erreur: 'Le nom de l’entreprise est obligatoire.' };
  if (!d.get('atteste')) return { erreur: 'Cochez l’attestation de représentant légal pour continuer.' };
  if (siret && !numeroValide(siret)) return { erreur: 'Ce SIRET n’est pas valide (14 chiffres). Vérifiez-le ou cochez « SIRET en cours d’attribution ».' };
  if (siren && !numeroValide(siren)) return { erreur: 'Ce SIREN n’est pas valide (9 chiffres).' };

  // Une entreprise fermée au registre ne s'inscrit pas.
  if (siren) {
    const fiche = await ficheSiren(siren).catch(() => null);
    if (fiche?.fermee) return { erreur: 'Cette entreprise est fermée au registre : elle ne peut pas être inscrite.' };
  }

  const { data: id, error } = await supabase.rpc('creer_entreprise', {
    p_nom: texte(d, 'nom'),
    p_prenom: prenom || null,
    p_nom_famille: nomFamille || null,
    p_siren: siren || null,
    p_siret: siret || null,
    p_forme_juridique: texte(d, 'forme_juridique') || null,
    p_adresse: texte(d, 'adresse') || null,
    p_code_postal: texte(d, 'code_postal') || null,
    p_ville: texte(d, 'ville') || null,
    p_tva_intracom: texte(d, 'tva_intracom') || null,
    p_activite: texte(d, 'activite') || null,
    p_representant: [prenom, nomFamille].filter(Boolean).join(' ') || 'Dirigeant',
  });
  if (error) {
    if (error.code === '23505') return { erreur: 'Cette entreprise est déjà inscrite sur Chantio.', dejaInscrite: { siren, nom: texte(d, 'nom') } };
    return { erreur: `La création a échoué : ${error.message}` };
  }

  let identite: ResultatRegistre | 'sans_siren' = 'sans_siren';
  if (siren) {
    // Prénom et nom réellement enregistrés (repris d'une autre entreprise s'ils manquaient).
    const { data: moi } = await supabase.rpc('membre_actif').maybeSingle<{ prenom: string; nom: string | null }>();
    identite = await controlerRegistre(supabase, id as string, siren, moi?.prenom ?? prenom, moi?.nom ?? nomFamille);
  }
  revalidatePath('/', 'layout');
  redirect(texte(d, 'retour') === 'bienvenue' ? '/' : `/entreprises?cree=1&identite=${identite}`);
}

/** Demande à rejoindre une entreprise déjà inscrite (même SIREN). */
export async function demanderAcces(_: EtatAjout, d: FormData): Promise<EtatAjout> {
  const supabase = await compte();
  const { data: nom, error } = await supabase.rpc('demander_acces', {
    p_siren: chiffres(d, 'siren'),
    p_prenom: texte(d, 'prenom'),
    p_nom: texte(d, 'nom_famille') || null,
    p_message: texte(d, 'message') || null,
  });
  if (error) return { erreur: error.message };
  redirect(`${texte(d, 'retour') === 'bienvenue' ? '/bienvenue' : '/entreprises'}?demande=${encodeURIComponent(String(nom))}`);
}

/** Passe sur une autre entreprise du compte (puis va sur `vers`, le Pilotage par défaut). */
export async function choisirEntreprise(entrepriseId: string, vers = '/') {
  const supabase = await compte();
  await supabase.rpc('choisir_entreprise', { p_entreprise: entrepriseId });
  revalidatePath('/', 'layout');
  redirect(vers.startsWith('/') ? vers : '/');
}

/** Accepte une invitation reçue d'une autre entreprise. */
export async function rejoindre(membreId: string) {
  const supabase = await compte();
  const { error } = await supabase.rpc('rejoindre_entreprise', { p_membre: membreId });
  if (error) redirect(`/entreprises?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath('/', 'layout');
  redirect('/');
}

/** Le dirigeant accepte (avec un rôle) ou refuse une demande d'accès. */
export async function traiterDemande(demandeId: string, accepter: boolean, d?: FormData) {
  const supabase = await compte();
  const role = (d && texte(d, 'role')) || 'technicien';
  const { error } = await supabase.rpc('traiter_demande', {
    p_demande: demandeId,
    p_accepter: accepter,
    p_role: role as RoleMembre,
  });
  if (error) redirect(`/entreprises?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath('/entreprises');
  revalidatePath('/equipe');
}

/** Change la formule de l'entreprise active (dirigeant). */
export async function changerFormule(entrepriseId: string, formule: Formule) {
  const supabase = await compte();
  await supabase.from('entreprises').update({ formule }).eq('id', entrepriseId);
  revalidatePath('/entreprises');
}

type Actif = { prenom: string; nom: string | null; entreprise_id: string; role: RoleMembre };

/** La fiche du compte dans l'entreprise active : l'identité se vérifie toujours sur celle-ci. */
async function dirigeantActif(supabase: SupabaseClient) {
  const { data } = await supabase.rpc('membre_actif').maybeSingle<Actif>();
  if (!data || data.role !== 'dirigeant') redirect('/entreprises');
  return data;
}

const RETOUR_IDENTITE = '/entreprises/identite';

/** Renseigne le SIREN d'une entreprise créée sans, à partir du registre. */
export async function definirSiren(d: FormData) {
  const supabase = await compte();
  const moi = await dirigeantActif(supabase);
  const siren = chiffres(d, 'siren');
  if (siren.length !== 9 || !numeroValide(siren)) redirect(`${RETOUR_IDENTITE}?erreur=${encodeURIComponent('Ce SIREN n’est pas valide (9 chiffres).')}`);
  const fiche = await ficheSiren(siren).catch(() => null);
  if (fiche?.fermee) redirect(`${RETOUR_IDENTITE}?erreur=${encodeURIComponent('Cette entreprise est fermée au registre.')}`);
  const { error } = await supabase.rpc('definir_siren', {
    p_entreprise: moi.entreprise_id,
    p_siren: siren,
    p_siret: fiche?.siret ?? null,
    p_forme_juridique: fiche?.forme_juridique ?? null,
    p_adresse: fiche?.adresse ?? null,
    p_code_postal: fiche?.code_postal ?? null,
    p_ville: fiche?.ville ?? null,
    p_tva_intracom: fiche?.tva_intracom ?? null,
    p_activite: fiche?.activite ?? null,
  });
  if (error) redirect(`${RETOUR_IDENTITE}?erreur=${encodeURIComponent(error.code === '23505' ? 'Ce SIREN est déjà inscrit sur Chantio.' : error.message)}`);
  revalidatePath('/', 'layout');
  redirect(RETOUR_IDENTITE);
}

/** Vérification au registre depuis la page Identité. */
export async function verifierRegistre() {
  const supabase = await compte();
  const moi = await dirigeantActif(supabase);
  const { data: e } = await supabase.from('entreprises').select('siren').eq('id', moi.entreprise_id).maybeSingle();
  const resultat = e?.siren ? await controlerRegistre(supabase, moi.entreprise_id, e.siren, moi.prenom, moi.nom) : 'absent';
  revalidatePath('/', 'layout');
  redirect(`${RETOUR_IDENTITE}?registre=${resultat}`);
}

/** Pièce d'identité et Kbis déposés dans le stockage : la demande part chez Chantio. */
export async function envoyerJustificatifs(chemins: string[]) {
  const supabase = await compte();
  const moi = await dirigeantActif(supabase);
  const { error } = await supabase.rpc('envoyer_justificatifs', { p_entreprise: moi.entreprise_id, p_chemins: chemins });
  if (error) return { erreur: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
