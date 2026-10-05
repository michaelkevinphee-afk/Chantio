'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Formule, ReglagesFacturation, RoleMembre } from '@chantio/shared';
import { ficheSiren, figureParmiDirigeants } from '@/lib/registre';
import { numeroValide } from '@/lib/siret';
import { supabaseServeur } from '@/lib/supabase/server';
import { serviceActif, supabaseService } from '@/lib/supabase/service';
import { ORDRE_CHAMPS, TAILLES, TRANCHES_CA } from './nouvelle/listes';

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim();
const chiffres = (d: FormData, cle: string) => texte(d, cle).replace(/\s/g, '');

export type EtatAjout = { erreur?: string; champs?: Record<string, string>; dejaInscrite?: { siren: string; nom: string } } | undefined;

/** Contrôles de la fiche « Créer une entreprise », mêmes messages que creerEntreprise() du bac (un par champ). */
function controlerFiche(d: FormData): Record<string, string> {
  const e: Record<string, string> = {};
  if (!texte(d, 'nom')) e.nom = 'Indiquez la raison sociale.';
  if (!texte(d, 'adresse')) e.adresse = 'Indiquez l’adresse du siège.';
  if (!d.get('siret_attente')) {
    const s = chiffres(d, 'siret');
    if (!s) e.siret = 'Indiquez le SIRET, ou cochez « SIRET en cours d’attribution ».';
    else if (!/^\d{14}$/.test(s)) e.siret = 'Le SIRET compte 14 chiffres.';
    else if (!numeroValide(s)) e.siret = 'Ce SIRET n’existe pas : vérifiez les chiffres.';
  }
  if (!texte(d, 'forme_juridique')) e.forme_juridique = 'Choisissez la forme juridique.';
  const capital = texte(d, 'capital');
  if (capital && !/^[\d\s.,]+$/.test(capital)) e.capital = 'Le capital s’écrit en chiffres.';
  if (!(TAILLES as readonly string[]).includes(texte(d, 'taille'))) e.taille = 'Choisissez le nombre de salariés.';
  if (!(TRANCHES_CA as readonly string[]).includes(texte(d, 'ca'))) e.ca = 'Choisissez une tranche de chiffre d’affaires.';
  if (!d.get('atteste')) e.atteste = 'Cochez cette case pour créer l’entreprise.';
  return e;
}

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
  // « complet » : la fiche de « Créer une entreprise » (champs du bac) ; sinon la fiche courte de « Bienvenue ».
  const complet = texte(d, 'formulaire') === 'complet';
  if (complet) {
    const champs = controlerFiche(d);
    const premier = ORDRE_CHAMPS.find((k) => champs[k]);
    if (premier) return { erreur: champs[premier], champs };
  }
  const attente = !!d.get('siret_attente');
  const siret = attente ? '' : chiffres(d, 'siret');
  const siren = (attente ? '' : chiffres(d, 'siren')) || siret.slice(0, 9);
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

  // Fiche complète : l'adresse tient sur une ligne (« 3 rue Gros, 75016 Paris ») ; code postal et ville en sont tirés,
  // comme dans « Mon entreprise ». Le nom affiché est le nom commercial, sinon la raison sociale.
  const raison = texte(d, 'nom');
  const adresse = texte(d, 'adresse').replace(/\s+/g, ' ');
  const lieu = complet ? adresse.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/) : null;
  const naf = texte(d, 'naf');
  const { data: id, error } = await supabase.rpc('creer_entreprise', {
    p_nom: complet ? texte(d, 'nom_commercial') || raison : raison,
    p_prenom: prenom || null,
    p_nom_famille: nomFamille || null,
    p_siren: siren || null,
    p_siret: siret || null,
    p_forme_juridique: texte(d, 'forme_juridique') || null,
    p_adresse: adresse || null,
    p_code_postal: complet ? (lieu?.[2] ?? null) : texte(d, 'code_postal') || null,
    p_ville: complet ? (lieu?.[3].trim() ?? null) : texte(d, 'ville') || null,
    p_tva_intracom: texte(d, 'tva_intracom').replace(/\s+/g, ' ').toUpperCase() || null,
    p_activite: complet ? (naf ? `NAF ${naf}` : null) : texte(d, 'activite') || null,
    p_representant: [prenom, nomFamille].filter(Boolean).join(' ') || 'Dirigeant',
  });
  if (error) {
    if (error.code === '23505') {
      const message = complet ? 'Cette entreprise utilise déjà Chantio : demandez l’accès à son dirigeant.' : 'Cette entreprise est déjà inscrite sur Chantio.';
      return { erreur: message, champs: complet ? { siret: message } : undefined, dejaInscrite: { siren, nom: raison } };
    }
    return { erreur: `La création a échoué : ${error.message}` };
  }

  // Réglages de la nouvelle entreprise, rangés comme dans « Mon entreprise » : raison sociale, forme, capital, TVA,
  // SIRET lisible, « SIRET en cours d'attribution » (la carte affiche « en cours d'attribution », la facturation
  // électronique attend le SIRET), et la taille et la tranche de chiffre d'affaires demandées par la fiche du bac.
  const reglages: Record<string, unknown> = {};
  if (attente) reglages.siret_attente = true;
  if (complet) {
    const forme = texte(d, 'forme_juridique');
    const capital = texte(d, 'capital').replace(/\s*€\s*$/, '');
    const tva = texte(d, 'tva_intracom').replace(/\s+/g, ' ').toUpperCase();
    Object.assign(reglages, {
      raison,
      ...(forme && forme !== 'Autre' ? { forme } : {}),
      ...(capital ? { capital: `${capital} €` } : {}),
      ...(tva ? { tva_intra: tva } : {}),
      ...(siret ? { siret: `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}` } : {}),
      taille: texte(d, 'taille'),
      tranche_ca: texte(d, 'ca'),
    });
  }
  if (Object.keys(reglages).length) await supabase.from('entreprises').update({ facturation: reglages }).eq('id', id as string);

  let identite: ResultatRegistre | 'sans_siren' = 'sans_siren';
  if (siren) {
    // Prénom et nom réellement enregistrés (repris d'une autre entreprise s'ils manquaient).
    const { data: moi } = await supabase.rpc('membre_actif').maybeSingle<{ prenom: string; nom: string | null }>();
    identite = await controlerRegistre(supabase, id as string, siren, moi?.prenom ?? prenom, moi?.nom ?? nomFamille);
  }
  revalidatePath('/', 'layout');
  if (texte(d, 'retour') === 'bienvenue') redirect('/');
  // « Créer une entreprise » finit sur l'écran « … est prête » du bac.
  redirect(complet ? `/entreprises/nouvelle?cree=1&identite=${identite}&annuaire=${d.get('annuaire') ? 1 : 0}` : `/entreprises?cree=1&identite=${identite}`);
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
  revalidatePath('/parametres');
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

/**
 * « Je me mets en conformité » : demande l'inscription de l'entreprise ouverte à l'annuaire de la facturation
 * électronique. Aucune liaison avec la plateforme agréée n'existe encore : la demande est enregistrée
 * dans les réglages de l'entreprise (facturation.pdp) et affichée « Inscription demandée ».
 */
export async function demanderFacturationElectronique(entrepriseId: string): Promise<{ erreur?: string; nom?: string }> {
  const supabase = await compte();
  const moi = await dirigeantActif(supabase);
  if (moi.entreprise_id !== entrepriseId) return { erreur: 'Ouvrez d’abord cette entreprise.' };
  const { data: e } = await supabase
    .from('entreprises')
    .select('nom, siren, siret, identite_statut, facturation')
    .eq('id', entrepriseId)
    .maybeSingle<{ nom: string; siren: string | null; siret: string | null; identite_statut: string; facturation: ReglagesFacturation | null }>();
  if (!e) return { erreur: 'Entreprise introuvable.' };
  const f = e.facturation ?? {};
  if (e.identite_statut !== 'verifiee') return { erreur: 'Vérifiez d’abord votre identité de dirigeant.' };
  if (!e.siren || !e.siret || f.siret_attente) return { erreur: 'Il faut le SIRET définitif de l’entreprise.' };
  const { error } = await supabase
    .from('entreprises')
    .update({ facturation: { ...f, pdp: { statut: 'demandee', le: new Date().toISOString().slice(0, 10), par: moi.prenom } } })
    .eq('id', entrepriseId);
  if (error) return { erreur: 'La demande n’a pas pu être enregistrée. Réessayez.' };
  revalidatePath('/entreprises');
  return { nom: e.nom };
}
