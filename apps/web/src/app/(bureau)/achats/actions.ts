'use server';

import { revalidatePath } from 'next/cache';
import {
  ajouterJours,
  arrondi,
  aujourdhui,
  CATEGORIES_FOURNISSEUR,
  ecartJours,
  euro,
  MOYENS_PAIEMENT,
  nombre,
  TAUX_TVA_ACHAT,
  type Achat,
  type Fournisseur,
  type PieceAchat,
  type StatutAchat,
} from '@chantio/shared';
import { lireFactureFournisseur, type FactureLue } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const TAUX = TAUX_TVA_ACHAT.map(([t]) => t);
const texte = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const dateValide = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function rafraichir(id?: string) {
  revalidatePath('/achats', 'layout');
  if (id) revalidatePath(`/achats/${id}`);
}

async function lireAchat(id: string) {
  const ctx = await contexteBureau();
  const { data } = await ctx.supabase.from('achats').select('*').eq('id', id).maybeSingle<Achat>();
  return { ...ctx, achat: data };
}

// ---------------------------------------------------------------------------
// Import et lecture automatique
// ---------------------------------------------------------------------------

/** Enregistre les factures déposées (déjà envoyées dans le stockage « documents »). */
export async function enregistrerAchats(
  fichiers: { nom: string; chemin: string; taille: number; type: string }[],
  photo = false,
): Promise<Resultat<{ ids: string[] }>> {
  const { supabase, entreprise, membre } = await contexteBureau();
  const jour = aujourdhui();
  const propres = fichiers
    .slice(0, 50)
    .filter((f) => f.chemin.startsWith(`${entreprise.id}/achats/`))
    .map((f) => ({
      entreprise_id: entreprise.id,
      cree_par: membre.id,
      responsable_id: membre.id,
      reception: photo ? 'photo' : 'import',
      date_facture: jour,
      delai_paiement: 30,
      echeance: ajouterJours(jour, 30),
      fichier_chemin: f.chemin,
      fichier_nom: texte(f.nom, 200) || 'facture',
      fichier_type: texte(f.type, 100) || null,
      fichier_taille: Math.round(Number(f.taille) || 0),
    }));
  if (!propres.length) return { ok: false, erreur: 'Aucun fichier reçu.' };
  const { data, error } = await supabase.from('achats').insert(propres).select('id');
  if (error || !data) return { ok: false, erreur: 'Les factures n’ont pas pu être enregistrées.' };
  rafraichir();
  return { ok: true, ids: data.map((d) => d.id as string) };
}

/** Le fournisseur lu sur la facture : déjà connu (même SIREN ou même nom), sinon créé. */
async function fournisseurLu(supabase: Awaited<ReturnType<typeof contexteBureau>>['supabase'], entrepriseId: string, lu: FactureLue['fournisseur']) {
  const siret = lu.siret.replace(/\D/g, '');
  const nom = texte(lu.nom, 120);
  const { data } = await supabase.from('fournisseurs').select('*');
  const tous = (data ?? []) as Fournisseur[];
  const connu =
    (siret.length >= 9 ? tous.find((f) => (f.siret ?? '').replace(/\D/g, '').slice(0, 9) === siret.slice(0, 9)) : undefined) ??
    (sansAccent(nom).length > 2 ? tous.find((f) => sansAccent(f.nom) === sansAccent(nom)) : undefined);
  if (connu) {
    if (!connu.iban && lu.iban) await supabase.from('fournisseurs').update({ iban: texte(lu.iban, 40) }).eq('id', connu.id);
    return connu;
  }
  if (!nom) return null;
  const { data: cree } = await supabase
    .from('fournisseurs')
    .insert({
      entreprise_id: entrepriseId,
      nom,
      siret: siret.slice(0, 14) || null,
      tva_intracom: texte(lu.tva_intracom, 20) || null,
      adresse: texte(lu.adresse, 200) || null,
      iban: texte(lu.iban, 40) || null,
      categorie: CATEGORIES_FOURNISSEUR.includes(lu.categorie) ? lu.categorie : 'Autre',
      lu_sur_facture: true,
    })
    .select('*')
    .single<Fournisseur>();
  return cree;
}

/** Lecture automatique d'une facture importée : remplit la fiche et crée le fournisseur au besoin. */
export async function lireFacture(id: string): Promise<Resultat<{ resume: string }>> {
  const { supabase, entreprise, achat } = await lireAchat(id);
  if (!achat?.fichier_chemin) return { ok: false, erreur: 'Facture introuvable' };
  const { data: fichier, error } = await supabase.storage.from('documents').download(achat.fichier_chemin);
  if (error || !fichier) return { ok: false, erreur: 'Le fichier n’a pas pu être ouvert.' };
  const lu = await lireFactureFournisseur(Buffer.from(await fichier.arrayBuffer()), achat.fichier_type ?? '', achat.fichier_nom ?? '');

  if ('message' in lu) {
    await supabase.from('achats').update({ lecture: 'manuel', lecture_message: lu.message }).eq('id', id);
    rafraichir(id);
    return { ok: true, resume: 'à compléter' };
  }
  if (!lu.facture) {
    await supabase.from('achats').update({ lecture: 'pas_facture', lecture_message: null }).eq('id', id);
    rafraichir(id);
    return { ok: true, resume: 'ne ressemble pas à une facture' };
  }

  const f = await fournisseurLu(supabase, entreprise.id, lu.fournisseur);
  const date = dateValide(lu.date) ?? achat.date_facture;
  const echeanceLue = dateValide(lu.echeance);
  const delai = echeanceLue ? Math.max(0, ecartJours(date, echeanceLue)) : (f?.delai_paiement ?? 30);
  let ht = Math.abs(nombre(lu.montant_ht));
  const tvaLue = Math.abs(nombre(lu.montant_tva));
  const ttc = Math.abs(nombre(lu.montant_ttc));
  if (!ht && ttc && tvaLue) ht = ttc - tvaLue;
  if (!ht && ttc) ht = ttc / (1 + (TAUX.includes(lu.taux_tva) ? lu.taux_tva : 20) / 100);
  ht = arrondi(ht);
  // Le taux imprimé s'il est connu ; sinon celui qui colle le mieux à TVA / HT.
  const taux = TAUX.includes(lu.taux_tva)
    ? lu.taux_tva
    : ht && tvaLue
      ? [...TAUX].sort((a, b) => Math.abs((tvaLue / ht) * 100 - a) - Math.abs((tvaLue / ht) * 100 - b))[0]
      : 20;
  const tva = arrondi(tvaLue || (ttc ? ttc - ht : (ht * taux) / 100));

  await supabase
    .from('achats')
    .update({
      fournisseur_id: f?.id ?? achat.fournisseur_id,
      numero: texte(lu.numero, 60) || achat.numero,
      date_facture: date,
      delai_paiement: Math.min(365, delai),
      echeance: echeanceLue ?? ajouterJours(date, delai),
      montant_ht: ht,
      taux_tva: taux,
      montant_tva: Math.max(0, tva),
      ttc_lu: ttc ? arrondi(ttc) : null,
      avoir: lu.avoir === true,
      lignes: (lu.lignes ?? [])
        .filter((l) => texte(l.designation))
        .slice(0, 12)
        .map((l) => ({
          designation: texte(l.designation, 200),
          quantite: l.quantite || null,
          prix_unitaire_ht: l.prix_unitaire_ht || null,
          total_ht: l.total_ht || null,
        })),
      lecture: 'ia',
      lecture_message: null,
    })
    .eq('id', id);
  rafraichir(id);
  return { ok: true, resume: [f?.nom, ttc ? `${euro(ttc)} TTC` : null].filter(Boolean).join(' · ') || 'lue' };
}

// ---------------------------------------------------------------------------
// Fiche de la facture
// ---------------------------------------------------------------------------

/** Enregistre les champs d'une facture « Reçu » (ou « À payer » sans paiement). */
export async function enregistrerAchat(id: string, d: FormData): Promise<Resultat> {
  const { supabase, achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  if (achat.statut !== 'recu') return { ok: false, erreur: 'Repassez la facture en « Reçu » (Modifier) pour la corriger.' };
  const date = dateValide(d.get('date_facture')) ?? achat.date_facture;
  const delai = Math.min(365, Math.max(0, Math.round(nombre(d.get('delai_paiement')))));
  const ht = Math.max(0, arrondi(nombre(d.get('montant_ht'))));
  const taux = TAUX.includes(nombre(d.get('taux_tva'))) ? nombre(d.get('taux_tva')) : 20;
  const tva = Math.max(0, arrondi(nombre(d.get('montant_tva'))));
  const { error } = await supabase
    .from('achats')
    .update({
      fournisseur_id: texte(d.get('fournisseur_id')) || null,
      numero: texte(d.get('numero'), 60) || null,
      date_facture: date,
      delai_paiement: delai,
      echeance: dateValide(d.get('echeance')) ?? ajouterJours(date, delai),
      montant_ht: ht,
      taux_tva: taux,
      montant_tva: tva,
      avoir: d.get('avoir') === 'on',
      responsable_id: texte(d.get('responsable_id')) || null,
      intervention_id: texte(d.get('intervention_id')) || null,
    })
    .eq('id', id);
  if (error) return { ok: false, erreur: 'La facture n’a pas pu être enregistrée.' };
  rafraichir(id);
  return { ok: true };
}

/** Enregistre puis approuve : la facture passe dans « À payer ». */
export async function approuverAchat(id: string, d: FormData): Promise<Resultat> {
  const r = await enregistrerAchat(id, d);
  if (!r.ok) return r;
  const { supabase, achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  const manque = !achat.fournisseur_id
    ? 'Choisissez le fournisseur.'
    : !achat.numero
      ? 'Indiquez le numéro de la facture.'
      : !(Number(achat.montant_ht) > 0)
        ? 'Indiquez le total HT.'
        : null;
  if (manque) return { ok: false, erreur: manque };
  const { error } = await supabase
    .from('achats')
    .update({ statut: 'a_payer', approuvee_le: aujourdhui(), echeance: achat.echeance ?? ajouterJours(achat.date_facture, achat.delai_paiement ?? 0) })
    .eq('id', id);
  if (error) return { ok: false, erreur: 'La facture n’a pas pu être approuvée.' };
  rafraichir(id);
  return { ok: true };
}

async function commenter(id: string, message: string) {
  const { supabase, entreprise, membre } = await contexteBureau();
  await supabase.from('commentaires_achats').insert({ entreprise_id: entreprise.id, achat_id: id, membre_id: membre.id, texte: message });
}

async function changerStatut(id: string, statut: StatutAchat, autres: Partial<Achat> = {}, depuis?: StatutAchat[]): Promise<Resultat> {
  const { supabase, achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  if (depuis && !depuis.includes(achat.statut)) return { ok: false, erreur: 'Cette action n’est plus possible sur cette facture.' };
  const { error } = await supabase.from('achats').update({ statut, ...autres }).eq('id', id);
  if (error) return { ok: false, erreur: 'La facture n’a pas pu être mise à jour.' };
  rafraichir(id);
  return { ok: true };
}

export async function contesterAchat(id: string, motif: string): Promise<Resultat> {
  const m = texte(motif, 500);
  if (!m) return { ok: false, erreur: 'Dites ce qui ne va pas.' };
  const { achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  const r = await changerStatut(id, 'suspendu', { motif: m, avant_contestation: achat.statut }, ['recu', 'a_payer', 'planifie']);
  if (r.ok) await commenter(id, `Facture contestée : ${m}`);
  return r;
}

export async function leverContestation(id: string): Promise<Resultat> {
  const { achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  const retour = achat.avant_contestation && achat.avant_contestation !== 'suspendu' ? achat.avant_contestation : 'recu';
  const r = await changerStatut(id, retour, { motif: null, avant_contestation: null }, ['suspendu']);
  if (r.ok) await commenter(id, 'Contestation levée.');
  return r;
}

export async function refuserAchat(id: string): Promise<Resultat> {
  const r = await changerStatut(id, 'refusee', {}, ['suspendu', 'recu']);
  if (r.ok) await commenter(id, 'Facture refusée.');
  return r;
}

export async function rouvrirAchat(id: string): Promise<Resultat> {
  return changerStatut(id, 'recu', { motif: null, avant_contestation: null }, ['refusee']);
}

/** Repasse une facture approuvée (sans paiement) en « Reçu » pour la corriger. */
export async function modifierAchat(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { count } = await supabase.from('paiements_achats').select('id', { count: 'exact', head: true }).eq('achat_id', id);
  if (count) return { ok: false, erreur: 'Un paiement est déjà déclaré : la facture ne se modifie plus.' };
  return changerStatut(id, 'recu', { approuvee_le: null }, ['a_payer']);
}

export async function planifierPaiement(id: string, date: string, moyen: string): Promise<Resultat> {
  const jour = dateValide(date);
  if (!jour) return { ok: false, erreur: 'Indiquez la date du paiement.' };
  return changerStatut(id, 'planifie', { planifie_le: jour, moyen_prevu: MOYENS_PAIEMENT.includes(moyen) ? moyen : 'Virement' }, ['a_payer']);
}

export async function annulerPlanification(id: string): Promise<Resultat> {
  return changerStatut(id, 'a_payer', { planifie_le: null }, ['planifie']);
}

export async function declarerPaiement(id: string, moyen: string, montant: string, date: string): Promise<Resultat<{ statut: StatutAchat }>> {
  const { supabase } = await contexteBureau();
  const { data, error } = await supabase.rpc('declarer_paiement_achat', {
    p_achat: id,
    p_moyen: MOYENS_PAIEMENT.includes(moyen) ? moyen : 'Virement',
    p_montant: arrondi(nombre(montant)),
    p_date: dateValide(date) ?? aujourdhui(),
  });
  if (error) return { ok: false, erreur: error.message };
  rafraichir(id);
  return { ok: true, statut: data as StatutAchat };
}

export async function ajouterCommentaire(id: string, message: string): Promise<Resultat> {
  const t = texte(message, 1000);
  if (!t) return { ok: false, erreur: 'Écrivez votre commentaire.' };
  await commenter(id, t);
  rafraichir(id);
  return { ok: true };
}

/** Ajoute un document lié (bon de livraison…) déjà déposé dans le stockage. */
export async function joindrePiece(id: string, piece: PieceAchat): Promise<Resultat> {
  const { supabase, entreprise, achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  if (!piece.chemin.startsWith(`${entreprise.id}/achats/`)) return { ok: false, erreur: 'Fichier refusé.' };
  const pieces = [...(achat.pieces ?? []), { chemin: piece.chemin, nom: texte(piece.nom, 200), taille: Math.round(Number(piece.taille) || 0) }];
  const { error } = await supabase.from('achats').update({ pieces }).eq('id', id);
  if (error) return { ok: false, erreur: 'Le fichier n’a pas pu être lié.' };
  rafraichir(id);
  return { ok: true };
}

/** Supprime une facture reçue ou refusée (ses fichiers restent dans le stockage, comme pour les imports). */
export async function supprimerAchat(id: string): Promise<Resultat> {
  const { supabase, achat } = await lireAchat(id);
  if (!achat) return { ok: false, erreur: 'Facture introuvable' };
  if (achat.statut !== 'recu' && achat.statut !== 'refusee') return { ok: false, erreur: 'Seule une facture reçue ou refusée se supprime.' };
  const { error } = await supabase.from('achats').delete().eq('id', id);
  if (error) return { ok: false, erreur: 'La facture n’a pas pu être supprimée.' };
  rafraichir();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export async function enregistrerFournisseur(_: unknown, d: FormData): Promise<Resultat<{ id: string }>> {
  const { supabase, entreprise } = await contexteBureau();
  const id = texte(d.get('id'));
  const nom = texte(d.get('nom'), 120);
  const siret = texte(d.get('siret')).replace(/\s/g, '');
  if (!nom) return { ok: false, erreur: 'Indiquez le nom du fournisseur.' };
  if (siret && !/^(\d{9}|\d{14})$/.test(siret)) return { ok: false, erreur: 'Le SIRET compte 14 chiffres (ou 9 pour un SIREN).' };
  const champs = {
    nom,
    siret: siret || null,
    categorie: CATEGORIES_FOURNISSEUR.includes(texte(d.get('categorie'))) ? texte(d.get('categorie')) : 'Autre',
    tva_intracom: texte(d.get('tva_intracom'), 20) || null,
    adresse: texte(d.get('adresse'), 200) || null,
    email: texte(d.get('email'), 120) || null,
    telephone: texte(d.get('telephone'), 30) || null,
    iban: texte(d.get('iban'), 40) || null,
    delai_paiement: texte(d.get('delai_paiement')) ? Math.min(365, Math.max(0, Math.round(nombre(d.get('delai_paiement'))))) : 30,
    lu_sur_facture: false,
  };
  const requete = id
    ? supabase.from('fournisseurs').update(champs).eq('id', id).select('id').single()
    : supabase.from('fournisseurs').insert({ ...champs, entreprise_id: entreprise.id }).select('id').single();
  const { data, error } = await requete;
  if (error || !data) return { ok: false, erreur: 'Le fournisseur n’a pas pu être enregistré.' };
  rafraichir();
  return { ok: true, id: data.id as string };
}
