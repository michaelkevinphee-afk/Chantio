'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import {
  BORNES_DEPANNAGE,
  BORNES_PRIX,
  CODES_NAF,
  COULEURS_DOCUMENT,
  FORMES_JURIDIQUES,
  LOGICIELS_COMPTA,
  MODELES_MAIL,
  REGLAGES_DEPANNAGE_DEFAUT,
  REGLAGES_PRIX_DEFAUT,
  type Formule,
  type ReglagesFacturation,
} from '@chantio/shared';
import { contexteBureau } from '@/lib/session';
import { numeroValide } from '@/lib/siret';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { NOTIFICATIONS_DEFAUT, nombreAffiche, type Notifications } from './valeurs';

/** Réponse d'un enregistrement automatique : la valeur à afficher (nettoyée), ou le message d'erreur. */
export type Enregistrement = { ok: true; affiche?: string; message?: string } | { ok: false; erreur: string };

type Valeur = string | boolean;
type Modif = {
  /** Clés de entreprises.facturation à poser (null = retirer, pour revenir à la valeur par défaut). */
  facturation?: Record<string, unknown>;
  /** Colonnes de la table entreprises. */
  colonnes?: Record<string, string | null>;
  affiche?: string;
  message?: string;
};

const ERREUR_DIRIGEANT = 'Seul le dirigeant peut modifier les réglages de l’entreprise.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const texte = (v: Valeur) => (typeof v === 'string' ? v.trim() : '');
const nombre = (v: Valeur) => Number(texte(v).replace(/\s/g, '').replace(',', '.'));

/** Texte libre de facturation : vide = clé retirée. */
function libre(cle: string, max: number, opt: { email?: boolean } = {}) {
  return (v: Valeur): Modif | string => {
    const t = texte(v);
    if (t.length > max) return `Ce texte est trop long (${max} caractères au plus).`;
    if (opt.email && t && !EMAIL.test(t)) return 'Cette adresse e-mail n’est pas valide.';
    return { facturation: { [cle]: t || null }, affiche: t };
  };
}

/** Case à cocher de facturation. */
const caseF = (cle: string) => (v: Valeur): Modif => ({ facturation: { [cle]: v === true ? true : null } });

/** Liste fermée de facturation ('' = clé retirée). */
function liste(cle: string, choix: readonly string[], vide = true) {
  return (v: Valeur): Modif | string => {
    const t = texte(v);
    if (!t && vide) return { facturation: { [cle]: null } };
    if (!choix.includes(t)) return 'Ce choix n’est pas possible.';
    return { facturation: { [cle]: t } };
  };
}

/** Nombre borné de facturation : vide = valeur par défaut. */
function borne(cle: string, [min, max]: readonly [number, number], defaut: number, message: string, prix = false) {
  return (v: Valeur): Modif | string => {
    if (!texte(v)) return { facturation: { [cle]: null }, affiche: nombreAffiche(defaut), message: prix ? 'Enregistré : les nouveaux devis l’utilisent' : undefined };
    const n = Math.round(nombre(v) * 100) / 100;
    if (!Number.isFinite(n) || n < min || n > max) return message;
    return { facturation: { [cle]: n }, affiche: nombreAffiche(n), message: prix ? 'Enregistré : les nouveaux devis l’utilisent' : undefined };
  };
}

/** Colonne texte de la table entreprises. */
function colonne(nom: string, max: number, opt: { email?: boolean; obligatoire?: string } = {}) {
  return (v: Valeur): Modif | string => {
    const t = texte(v);
    if (!t && opt.obligatoire) return opt.obligatoire;
    if (t.length > max) return `Ce texte est trop long (${max} caractères au plus).`;
    if (opt.email && t && !EMAIL.test(t)) return 'Cette adresse e-mail n’est pas valide.';
    return { colonnes: { [nom]: t || null }, affiche: t };
  };
}

const PRIX = 'Enregistré : les nouveaux devis l’utilisent';
const borneP = (k: keyof typeof BORNES_PRIX, message: string) => borne(k, BORNES_PRIX[k], REGLAGES_PRIX_DEFAUT[k], message, true);
const borneD = (k: keyof typeof BORNES_DEPANNAGE, message: string) => borne(k, BORNES_DEPANNAGE[k], REGLAGES_DEPANNAGE_DEFAUT[k], message, true);

/**
 * Liste blanche des réglages de l'entreprise : chaque clé, sa cible (facturation ou colonne) et sa validation.
 * Une clé absente de cette table est refusée.
 */
const CLES: Record<string, (v: Valeur, e: EntrepriseLue) => Modif | string> = {
  // Mon entreprise
  raison: libre('raison', 200),
  nom: colonne('nom', 120, { obligatoire: 'Le nom commercial ne peut pas être vide.' }),
  siret_attente: caseF('siret_attente'),
  forme_juridique: (v, e) => {
    const t = texte(v);
    if (t && !FORMES_JURIDIQUES.includes(t as (typeof FORMES_JURIDIQUES)[number]) && t !== e.forme_juridique) return 'Cette forme juridique n’est pas proposée.';
    return { colonnes: { forme_juridique: t || null }, facturation: { forme: t && t !== 'Autre' ? t : null } };
  },
  capital: (v) => {
    const t = texte(v).replace(/\s*€\s*$/, '');
    if (t.length > 30) return 'Ce texte est trop long (30 caractères au plus).';
    if (t && !/^[\d\s.,]+$/.test(t)) return 'Le capital social s’écrit en chiffres, par exemple 8 000.';
    return { facturation: { capital: t ? `${t} €` : null }, affiche: t };
  },
  tva_intracom: (v) => {
    const t = texte(v).replace(/\s+/g, ' ').toUpperCase();
    if (t.length > 20) return 'Ce numéro de TVA est trop long.';
    return { colonnes: { tva_intracom: t || null }, facturation: { tva_intra: t || null }, affiche: t };
  },
  rcs: libre('rcs', 120),
  activite: (v) => {
    const t = texte(v);
    if (t && !CODES_NAF.some(([c]) => c === t) && !/^\d{2}\.\d{2}[A-Z]$/.test(t)) return 'Ce secteur d’activité n’est pas proposé.';
    return { colonnes: { activite: t ? `NAF ${t}` : null } };
  },
  adresse: (v) => {
    const t = texte(v).replace(/\s+/g, ' ');
    if (t.length > 300) return 'Cette adresse est trop longue.';
    // L'adresse est gardée telle quelle (imprimée sur les documents) ; code postal et ville en sont tirés.
    const m = t.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
    return { colonnes: { adresse: t || null, code_postal: m ? m[2] : null, ville: m ? m[3].trim() : null }, affiche: t };
  },
  telephone: colonne('telephone', 30),
  email: colonne('email', 200, { email: true }),
  slogan: libre('slogan', 200),
  assureur: libre('assureur', 300),
  contrat: libre('contrat', 120),
  zone: libre('zone', 200),
  // E-mails
  mail_devis_objet: libreMail('mail_devis_objet', 300),
  mail_devis_texte: libreMail('mail_devis_texte', 3000),
  mail_facture_objet: libreMail('mail_facture_objet', 300),
  mail_facture_texte: libreMail('mail_facture_texte', 3000),
  mail_copie: caseF('mail_copie'),
  // Comptes bancaires
  titulaire: libre('titulaire', 200),
  banque: libre('banque', 200),
  iban: (v) => {
    const t = texte(v).replace(/\s+/g, '').toUpperCase();
    if (t && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t)) return 'Cet IBAN n’est pas valide : il commence par deux lettres (FR76…).';
    const lisible = t.replace(/(.{4})/g, '$1 ').trim();
    return { facturation: { iban: lisible || null }, affiche: lisible };
  },
  bic: (v) => {
    const t = texte(v).replace(/\s+/g, '').toUpperCase();
    if (t && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(t)) return 'Un BIC compte 8 ou 11 lettres et chiffres.';
    return { facturation: { bic: t || null }, affiche: t };
  },
  iban_factures: (v) => ({ facturation: { iban_factures: v === true ? 'oui' : 'non' } }),
  // Personnalisation
  couleur_doc: liste('couleur_doc', COULEURS_DOCUMENT.map((c) => c[0])),
  pied_page: libre('pied_page', 500),
  // Conditions générales
  validite: (v) => {
    const n = nombre(v);
    if (!Number.isInteger(n) || n < 1 || n > 12) return 'La validité d’un devis va de 1 à 12 mois.';
    return { facturation: { validite: `${n} mois` }, affiche: String(n) };
  },
  acompte: (v) => {
    const n = nombre(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) return 'L’acompte va de 0 à 100 %.';
    return { facturation: { acompte: String(n) }, affiche: String(n) };
  },
  conditions_particulieres: libre('conditions_particulieres', 1000),
  rge: libre('rge', 120),
  mediateur: libre('mediateur', 300),
  delai: (v) => {
    const n = nombre(v);
    if (!Number.isInteger(n) || n < 0) return 'Indiquez un nombre de jours, de 0 à 60.';
    if (n > 60) return 'Le délai de paiement ne peut pas dépasser 60 jours';
    return { facturation: { delai: n === 0 ? 'À réception de facture' : `${n} jours date de facture` }, affiche: String(n) };
  },
  // Prix et coefficients
  frais_generaux: borneP('frais_generaux', 'Frais généraux entre 0 et 300 %'),
  cout_horaire: borneP('cout_horaire', 'Coût horaire entre 0 et 1 000 €'),
  marge_min: borneP('marge_min', 'Marge nette minimale entre 0 et 90 %'),
  coefficient: borne('coefficient', [1, 3], REGLAGES_PRIX_DEFAUT.coefficient, 'Coefficient entre 1 et 3', true),
  taux_depannage: borneD('taux_depannage', 'Taux horaire entre 0 et 1 000 €'),
  deplacement: borneD('deplacement', 'Forfait déplacement entre 0 et 1 000 €'),
  maj_soir: borneD('maj_soir', 'Majoration entre 0 et 300 %'),
  maj_we: borneD('maj_we', 'Majoration entre 0 et 300 %'),
  chute: borneP('chute', 'Chute entre 0 et 100 %'),
  objectif_mensuel: (v) => {
    if (!texte(v)) return { facturation: { objectif_mensuel: null }, affiche: '', message: PRIX };
    const n = Math.round(nombre(v));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return 'Indiquez un montant en euros.';
    return { facturation: { objectif_mensuel: n || null }, affiche: n ? String(n) : '' };
  },
  // Tenue comptable
  comptable: libre('comptable', 200),
  comptable_email: libre('comptable_email', 200, { email: true }),
  logiciel_compta: liste('logiciel_compta', LOGICIELS_COMPTA),
  tva_regime: liste('tva_regime', ['encaissements', 'debits'], false),
};

/** Texte d'e-mail : identique au texte de Chantio (ou vide) = clé retirée. */
function libreMail(cle: keyof typeof MODELES_MAIL, max: number) {
  return (v: Valeur): Modif | string => {
    const t = texte(v);
    if (t.length > max) return `Ce texte est trop long (${max} caractères au plus).`;
    return { facturation: { [cle]: t && t !== MODELES_MAIL[cle] ? t : null }, affiche: t || MODELES_MAIL[cle] };
  };
}

type EntrepriseLue = {
  id: string;
  facturation: ReglagesFacturation | null;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  identite_statut: string;
};

/**
 * Enregistre un réglage de l'entreprise dès que le champ est quitté (dirigeant seulement).
 * Seule la clé reçue change : le reste de entreprises.facturation est relu puis gardé.
 */
export async function enregistrerReglage(cle: string, valeur: Valeur): Promise<Enregistrement> {
  const { supabase, entreprise, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { ok: false, erreur: ERREUR_DIRIGEANT };
  if (typeof valeur !== 'string' && typeof valeur !== 'boolean') return { ok: false, erreur: 'Valeur illisible.' };
  if (typeof valeur === 'string' && valeur.length > 5000) return { ok: false, erreur: 'Ce texte est trop long.' };

  const { data: e } = await supabase
    .from('entreprises')
    .select('id, facturation, siren, siret, forme_juridique, identite_statut')
    .eq('id', entreprise.id)
    .single<EntrepriseLue>();
  if (!e) return { ok: false, erreur: 'Entreprise introuvable.' };

  let modif: Modif | string;
  if (cle === 'siret') modif = modifSiret(valeur, e);
  else if (Object.hasOwn(CLES, cle)) modif = CLES[cle](valeur, e);
  else return { ok: false, erreur: 'Ce réglage n’existe pas.' };
  if (typeof modif === 'string') return { ok: false, erreur: modif };

  const maj: Record<string, unknown> = { ...(modif.colonnes ?? {}) };
  if (modif.facturation) {
    const f: Record<string, unknown> = { ...(e.facturation ?? {}) };
    for (const [k, v] of Object.entries(modif.facturation)) {
      if (v === null || v === undefined) delete f[k];
      else f[k] = v;
    }
    maj.facturation = f;
  }
  const { error } = await supabase.from('entreprises').update(maj).eq('id', entreprise.id);
  if (error) {
    if (error.code === '23505') return { ok: false, erreur: 'Ce SIREN est déjà inscrit sur Chantio.' };
    console.error('Réglage non enregistré', cle, error);
    return { ok: false, erreur: 'Le changement n’a pas pu être enregistré. Réessayez.' };
  }
  // Le nom est affiché dans le menu : la mise en page suit.
  if (cle === 'nom') revalidatePath('/', 'layout');
  return { ok: true, affiche: modif.affiche, message: modif.message };
}

/** SIRET : 14 chiffres, et le SIREN suit tant que l'identité n'est pas vérifiée. */
function modifSiret(v: Valeur, e: EntrepriseLue): Modif | string {
  const t = texte(v);
  const chiffres = t.replace(/\D/g, '');
  const verifiee = e.identite_statut === 'en_attente' || e.identite_statut === 'verifiee';
  if (!t) return { colonnes: verifiee ? { siret: null } : { siret: null, siren: null }, facturation: { siret: null }, affiche: '' };
  if (/[^\d\s]/.test(t)) return 'Un SIRET ne contient que des chiffres.';
  if (chiffres.length !== 14) return `Un SIRET compte 14 chiffres (celui-ci en a ${chiffres.length}).`;
  if (!numeroValide(chiffres)) return 'Ce SIRET n’est pas valide : vérifiez les chiffres.';
  const lisible = `${chiffres.slice(0, 3)} ${chiffres.slice(3, 6)} ${chiffres.slice(6, 9)} ${chiffres.slice(9)}`;
  if (verifiee && e.siren && !chiffres.startsWith(e.siren)) return 'Le SIRET doit commencer par le SIREN de l’entreprise, déjà vérifié.';
  return {
    colonnes: verifiee ? { siret: chiffres } : { siret: chiffres, siren: chiffres.slice(0, 9) },
    facturation: { siret: lisible },
    affiche: lisible,
  };
}

/** Mon profil : prénom, nom et téléphone de sa fiche dans l'entreprise ouverte. */
export async function modifierProfil(cle: string, valeur: string): Promise<Enregistrement> {
  const { supabase, membre } = await contexteBureau();
  if (cle !== 'prenom' && cle !== 'nom' && cle !== 'telephone') return { ok: false, erreur: 'Ce champ n’existe pas.' };
  // La règle de la base ne laisse modifier les fiches qu'au dirigeant.
  if (membre.role !== 'dirigeant') return { ok: false, erreur: 'Demandez à votre dirigeant de modifier vos informations dans Membres.' };
  const t = String(valeur ?? '').trim();
  if ((cle === 'prenom' || cle === 'nom') && !t) return { ok: false, erreur: 'Ce champ ne peut pas être vide' };
  if (t.length > (cle === 'telephone' ? 30 : 80)) return { ok: false, erreur: 'Ce texte est trop long.' };
  const { error } = await supabase
    .from('membres')
    .update({ [cle]: t || null })
    .eq('id', membre.id);
  if (error) {
    console.error('Profil non enregistré', error);
    return { ok: false, erreur: 'Le changement n’a pas pu être enregistré. Réessayez.' };
  }
  if (cle !== 'telephone') revalidatePath('/', 'layout');
  return { ok: true, affiche: t };
}

/** Changer le mot de passe : l'actuel est vérifié par une connexion à part, sans toucher à la session ouverte. */
export async function changerMotDePasse(actuel: string, nouveau: string): Promise<Enregistrement> {
  const { supabase, user } = await contexteBureau();
  if (!user.email) return { ok: false, erreur: 'Adresse e-mail introuvable.' };
  if (typeof nouveau !== 'string' || nouveau.length < 8 || !/\d/.test(nouveau) || !/[a-zA-Z]/.test(nouveau) || nouveau.length > 72)
    return { ok: false, erreur: '8 caractères minimum, dont un chiffre et une lettre' };
  const essai = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: errActuel } = await essai.auth.signInWithPassword({ email: user.email, password: String(actuel ?? '') });
  if (errActuel || !data.session) return { ok: false, erreur: 'Le mot de passe actuel n’est pas le bon' };
  await essai.auth.signOut().catch(() => {});
  const { error } = await supabase.auth.updateUser({ password: nouveau });
  if (error) {
    console.error('Mot de passe non changé', error);
    return { ok: false, erreur: /same|different/i.test(error.message) ? 'Le nouveau mot de passe doit être différent de l’actuel.' : 'Le mot de passe n’a pas pu être changé. Réessayez.' };
  }
  return { ok: true, message: 'Mot de passe changé' };
}

/** Mes notifications : rangées dans le compte (métadonnées Supabase Auth), pour tous les rôles. */
export async function enregistrerNotification(cle: string, valeur: boolean): Promise<Enregistrement> {
  const { supabase } = await contexteBureau();
  if (!Object.hasOwn(NOTIFICATIONS_DEFAUT, cle) || typeof valeur !== 'boolean') return { ok: false, erreur: 'Ce choix n’existe pas.' };
  const { data } = await supabase.auth.getUser();
  const avant = (data.user?.user_metadata?.notifications ?? {}) as Partial<Notifications>;
  const { error } = await supabase.auth.updateUser({ data: { notifications: { ...NOTIFICATIONS_DEFAUT, ...avant, [cle]: valeur } } });
  if (error) {
    console.error('Notifications non enregistrées', error);
    return { ok: false, erreur: 'Le changement n’a pas pu être enregistré. Réessayez.' };
  }
  return { ok: true };
}

/** Abonnement : change la formule de l'entreprise ouverte (dirigeant). */
export async function choisirFormule(formule: Formule): Promise<Enregistrement> {
  const { supabase, entreprise, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { ok: false, erreur: ERREUR_DIRIGEANT };
  if (!['solo', 'equipe', 'entreprise'].includes(formule)) return { ok: false, erreur: 'Cette formule n’existe pas.' };
  const { error } = await supabase.from('entreprises').update({ formule }).eq('id', entreprise.id);
  if (error) return { ok: false, erreur: 'La formule n’a pas pu être changée. Réessayez.' };
  revalidatePath('/parametres');
  revalidatePath('/entreprises');
  return { ok: true, message: 'Formule changée' };
}
