'use server';

import { revalidatePath } from 'next/cache';
import {
  aujourdhui,
  calculer,
  completerClient,
  completerConditions,
  nombre,
  reglagesPrix,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type Metre,
  type ReglagesFacturation,
  type TypeFacture,
} from '@chantio/shared';
import { lireDocument, lireHistoriqueDevis, type ChampsLus } from '@/lib/devis';
import { lireFichierImporte } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export interface DocumentAEnregistrer {
  id?: string | null;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  client_id?: string | null;
  client: ClientDocument;
  objet: string;
  date_document: string;
  conditions: ConditionsDocument;
  devis_id?: string | null;
  facture_id?: string | null;
  remise: number;
  pourcentage: number;
  avancement: number;
  avancement_precedent: number;
  situation_numero?: number | null;
  /** Coefficient global du document ; null pour celui des réglages. */
  coefficient?: number | null;
  lignes: LigneDocument[];
  origine?: 'saisie' | 'import';
  import_id?: string | null;
}

const borne = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number(n) || 0));
const TAUX = [0, 2.1, 5.5, 10, 20];

const coefficientValide = (v: unknown) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= 0.5 && n <= 10 ? Math.round(n * 1000) / 1000 : null;
};
const positifOuNul = (v: unknown, max: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? Math.min(max, n) : null;
};

function nettoyerMetre(m: unknown): Metre | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const n = (k: string) => Math.max(0, Math.min(1_000_000, Number(o[k]) || 0));
  return { longueur: n('longueur'), largeur: n('largeur'), hauteur: n('hauteur'), nombre: n('nombre') || 1, deduction: n('deduction'), chute: Math.min(100, n('chute')) };
}

/** Lignes propres. Le prix des lignes au prix calculé vient de l'éditeur, qui le calcule à la saisie. */
function nettoyerLignes(lignes: LigneDocument[]) {
  return lignes.map((l, position) => ({
    position,
    titre: !!l.titre,
    designation: String(l.designation ?? '').slice(0, 500),
    quantite: l.titre ? 0 : Number(l.quantite) || 0,
    unite: String(l.unite || 'u').slice(0, 20),
    prix_unitaire: l.titre ? 0 : Math.round((Number(l.prix_unitaire) || 0) * 100) / 100,
    tva: TAUX.includes(Number(l.tva)) ? Number(l.tva) : 10,
    avancement: borne(l.avancement ?? 0),
    avancement_precedent: borne(l.avancement_precedent ?? 0),
    article_id: l.article_id || null,
    achat: l.titre ? null : positifOuNul(l.achat, 10_000_000),
    heures: l.titre ? null : positifOuNul(l.heures, 100_000),
    coefficient: l.titre ? null : coefficientValide(l.coefficient),
    prix_calcule: !l.titre && !!l.prix_calcule,
    metre: l.titre ? null : nettoyerMetre(l.metre),
    reference: String(l.reference ?? '').trim().slice(0, 40) || null,
  }));
}

/** Enregistre un brouillon (et le valide si demandé : numéro définitif). */
export async function enregistrerDocument(
  doc: DocumentAEnregistrer,
  valider = false,
): Promise<Resultat<{ id: string; numero: string | null }>> {
  const { supabase, entreprise, membre } = await contexteBureau();
  const coefficient = coefficientValide(doc.coefficient);
  const lignes = nettoyerLignes(doc.lignes ?? []);
  const facture = doc.genre === 'facture';
  const base = {
    genre: doc.genre,
    type_facture: facture ? (doc.type_facture ?? 'totale') : null,
    client_id: doc.client_id || null,
    client: completerClient(doc.client),
    objet: String(doc.objet ?? '').slice(0, 300),
    date_document: /^\d{4}-\d{2}-\d{2}$/.test(doc.date_document) ? doc.date_document : aujourdhui(),
    conditions: completerConditions(doc.conditions),
    devis_id: doc.devis_id || null,
    facture_id: doc.facture_id || null,
    remise: borne(doc.remise),
    pourcentage: borne(doc.pourcentage),
    avancement: borne(doc.avancement),
    avancement_precedent: borne(doc.avancement_precedent),
    situation_numero: doc.situation_numero ?? null,
    coefficient,
  };
  // Les totaux sont recalculés ici, avec le même calcul que l'aperçu.
  const T = calculer({ ...base, lignes });
  const totaux = { total_ht: T.ht, total_tva: T.totalTva, total_ttc: T.ttc, net_a_payer: T.net };

  let id = doc.id ?? null;
  if (id) {
    const { error } = await supabase.from('documents').update({ ...base, ...totaux }).eq('id', id);
    if (error) return { ok: false, erreur: messageErreur(error.message) };
    const { error: e2 } = await supabase.from('lignes_document').delete().eq('document_id', id);
    if (e2) return { ok: false, erreur: messageErreur(e2.message) };
  } else {
    const { data, error } = await supabase
      .from('documents')
      .insert({ ...base, ...totaux, entreprise_id: entreprise.id, cree_par: membre.id, origine: doc.origine ?? 'saisie' })
      .select('id')
      .single();
    if (error || !data) return { ok: false, erreur: messageErreur(error?.message) };
    id = data.id as string;
  }
  if (lignes.length) {
    const { error } = await supabase
      .from('lignes_document')
      .insert(lignes.map((l) => ({ ...l, entreprise_id: entreprise.id, document_id: id })));
    if (error) return { ok: false, erreur: messageErreur(error.message) };
  }
  if (doc.import_id) {
    await supabase.from('imports').update({ statut: 'converti', document_id: id }).eq('id', doc.import_id);
  }

  let numero: string | null = null;
  if (valider) {
    const { data, error } = await supabase.rpc('finaliser_document', { p_document: id });
    if (error) return { ok: false, erreur: messageErreur(error.message) };
    numero = data as string;
  }
  revalidatePath('/devis');
  return { ok: true, id: id!, numero };
}

function messageErreur(m?: string): string {
  if (!m) return 'Enregistrement impossible. Réessayez.';
  if (/numérotée|ligne avant|Réservé|introuvable|autre entreprise/.test(m)) return m;
  return 'Enregistrement impossible. Réessayez.';
}

/** Changement d'état depuis la liste ou le document : signé, refusé, encaissé, relancé. */
export async function changerEtat(
  id: string,
  action: 'signe' | 'refuse' | 'envoye' | 'payee' | 'a_encaisser' | 'relance',
): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const maintenant = new Date().toISOString();
  let maj: Record<string, unknown>;
  if (action === 'relance') {
    const { data } = await supabase.from('documents').select('relances').eq('id', id).maybeSingle();
    maj = { relances: Number(data?.relances ?? 0) + 1, relance_le: maintenant };
  } else if (action === 'signe') maj = { statut: 'signe', signe_le: maintenant };
  else if (action === 'payee') maj = { statut: 'payee', paye_le: maintenant };
  else if (action === 'a_encaisser') maj = { statut: 'a_encaisser', paye_le: null };
  else maj = { statut: action, signe_le: null };
  const { error } = await supabase.from('documents').update(maj).eq('id', id);
  if (error) return { ok: false, erreur: messageErreur(error.message) };
  revalidatePath('/devis');
  return { ok: true };
}

/** Copie un devis ou une facture en nouveau brouillon daté du jour. */
export async function dupliquer(id: string): Promise<Resultat<{ id: string }>> {
  const { supabase } = await contexteBureau();
  const lu = await lireDocument(supabase, id);
  if (!lu) return { ok: false, erreur: 'Document introuvable' };
  const d = lu.document;
  return enregistrerDocument({
    genre: d.genre,
    type_facture: d.type_facture === 'avoir' || d.type_facture === 'situation' ? 'totale' : d.type_facture,
    client_id: d.client_id,
    client: d.client,
    objet: d.objet,
    date_document: aujourdhui(),
    conditions: d.conditions,
    remise: d.remise,
    pourcentage: d.pourcentage,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: d.coefficient,
    lignes: lu.lignes.map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 })),
  });
}

/**
 * Prépare une facture à partir d'un devis : acompte, avancement, situation,
 * solde ou facture unique, en tenant compte de ce qui est déjà facturé.
 */
export async function facturerDevis(devisId: string, type: TypeFacture = 'totale'): Promise<Resultat<{ id: string }>> {
  const { supabase } = await contexteBureau();
  const lu = await lireDocument(supabase, devisId);
  if (!lu || lu.document.genre !== 'devis') return { ok: false, erreur: 'Devis introuvable' };
  const d = lu.document;

  const h = await lireHistoriqueDevis(supabase, devisId);
  const dejaPct = h?.dejaPct ?? 0;
  let lignes = lu.lignes.map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 }));
  let situationNumero: number | null = null;
  if (type === 'situation' && h) {
    situationNumero = h.situationNumero;
    lignes = lignes.map((l, i) => ({ ...l, avancement_precedent: h.avancementsSituation[i] ?? 0, avancement: h.avancementsSituation[i] ?? 0 }));
  }

  const res = await enregistrerDocument({
    genre: 'facture',
    type_facture: type,
    client_id: d.client_id,
    client: d.client,
    objet: type === 'acompte' ? `Acompte · ${d.objet}` : d.objet,
    date_document: aujourdhui(),
    conditions: d.conditions,
    devis_id: devisId,
    remise: d.remise,
    pourcentage: Number(d.conditions.acompte) || 30,
    avancement: Math.min(100, dejaPct + 10),
    avancement_precedent: type === 'avancement' || type === 'solde' ? dejaPct : 0,
    situation_numero: situationNumero,
    coefficient: d.coefficient,
    lignes,
  });
  return res.ok ? { ok: true, id: res.id } : res;
}

/** Prépare un avoir sur une facture validée (mêmes lignes, montants en négatif). */
export async function creerAvoir(factureId: string): Promise<Resultat<{ id: string }>> {
  const { supabase } = await contexteBureau();
  const lu = await lireDocument(supabase, factureId);
  if (!lu || lu.document.genre !== 'facture' || !lu.document.numero) return { ok: false, erreur: 'Facture introuvable' };
  const d = lu.document;
  const res = await enregistrerDocument({
    genre: 'facture',
    type_facture: 'avoir',
    client_id: d.client_id,
    client: d.client,
    objet: `Avoir sur la facture ${d.numero}`,
    date_document: aujourdhui(),
    conditions: d.conditions,
    devis_id: d.devis_id,
    facture_id: factureId,
    remise: d.remise,
    pourcentage: 0,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: d.coefficient,
    lignes: lu.lignes.map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 })),
  });
  return res.ok ? { ok: true, id: res.id } : res;
}

export async function supprimerDocument(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) return { ok: false, erreur: messageErreur(error.message) };
  revalidatePath('/devis');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface ArticleAEnregistrer {
  id?: string | null;
  designation: string;
  categorie: string;
  unite: string;
  reference: string;
  prix_achat: number;
  prix_vente: number;
  /** Temps de pose par unité (ouvrages). */
  heures?: number;
  tva: number;
}

export async function enregistrerArticle(a: ArticleAEnregistrer): Promise<Resultat<{ id: string }>> {
  const { supabase, entreprise } = await contexteBureau();
  const designation = String(a.designation ?? '').trim();
  if (!designation) return { ok: false, erreur: 'Donnez un nom à l’article.' };
  const ligne = {
    designation: designation.slice(0, 300),
    categorie: String(a.categorie || 'Fournitures').slice(0, 60),
    unite: String(a.unite || 'u').slice(0, 20),
    reference: String(a.reference ?? '').trim().slice(0, 80) || null,
    prix_achat: Math.max(0, Math.round(nombre(a.prix_achat) * 100) / 100),
    prix_vente: Math.max(0, Math.round(nombre(a.prix_vente) * 100) / 100),
    heures: Math.max(0, Math.min(100_000, nombre(a.heures))),
    tva: TAUX.includes(Number(a.tva)) ? Number(a.tva) : 10,
  };
  const requete = a.id
    ? supabase.from('articles').update(ligne).eq('id', a.id).select('id').single()
    : supabase.from('articles').insert({ ...ligne, entreprise_id: entreprise.id }).select('id').single();
  const { data, error } = await requete;
  if (error || !data) return { ok: false, erreur: 'L’article n’a pas pu être enregistré.' };
  revalidatePath('/devis/catalogue');
  return { ok: true, id: data.id as string };
}

export async function retirerArticle(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('articles').update({ actif: false }).eq('id', id);
  if (error) return { ok: false, erreur: 'L’article n’a pas pu être retiré.' };
  revalidatePath('/devis/catalogue');
  return { ok: true };
}

/** Import d'un tarif (CSV : désignation ; unité ; prix d'achat ; prix de vente ; TVA ; référence ; catégorie). */
export async function importerTarif(lignes: ArticleAEnregistrer[]): Promise<Resultat<{ nombre: number }>> {
  const { supabase, entreprise } = await contexteBureau();
  const propres = lignes
    .filter((l) => String(l.designation ?? '').trim())
    .slice(0, 5000)
    .map((a) => ({
      entreprise_id: entreprise.id,
      designation: String(a.designation).trim().slice(0, 300),
      categorie: String(a.categorie || 'Fournitures').slice(0, 60),
      unite: String(a.unite || 'u').slice(0, 20),
      reference: String(a.reference ?? '').trim().slice(0, 80) || null,
      prix_achat: Math.max(0, Math.round(nombre(a.prix_achat) * 100) / 100),
      prix_vente: Math.max(0, Math.round(nombre(a.prix_vente) * 100) / 100),
      heures: Math.max(0, Math.min(100_000, nombre(a.heures))),
      tva: TAUX.includes(Number(a.tva)) ? Number(a.tva) : 10,
    }));
  if (!propres.length) return { ok: false, erreur: 'Aucun article reconnu dans le fichier.' };
  const { error } = await supabase.from('articles').insert(propres);
  if (error) return { ok: false, erreur: 'Le tarif n’a pas pu être importé.' };
  revalidatePath('/devis/catalogue');
  return { ok: true, nombre: propres.length };
}

// ---------------------------------------------------------------------------
// Réglages de facturation (dirigeant)
// ---------------------------------------------------------------------------

const PRIX = ['cout_horaire', 'frais_generaux', 'coefficient', 'marge_min', 'chute'] as const;

export async function enregistrerReglages(r: ReglagesFacturation): Promise<Resultat> {
  const { supabase, entreprise, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { ok: false, erreur: 'Réservé au dirigeant.' };
  const propre: ReglagesFacturation = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'objectif_mensuel') propre.objectif_mensuel = Math.max(0, Math.round(nombre(v)));
    else if (PRIX.includes(k as (typeof PRIX)[number])) {
      // Prix et coefficients : un nombre, ou rien pour revenir à la valeur par défaut.
      if (v !== '' && v != null && Number.isFinite(nombre(v))) (propre as Record<string, number>)[k] = nombre(v);
    } else (propre as Record<string, string>)[k] = String(v ?? '').trim().slice(0, 300);
  }
  const verifie = reglagesPrix(propre);
  for (const k of PRIX) if (propre[k] !== undefined) propre[k] = verifie[k];
  const { error } = await supabase.from('entreprises').update({ facturation: propre }).eq('id', entreprise.id);
  if (error) return { ok: false, erreur: 'Les réglages n’ont pas pu être enregistrés.' };
  revalidatePath('/devis', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents importés
// ---------------------------------------------------------------------------

/** Enregistre les fichiers déposés (déjà envoyés dans le stockage « documents »). */
export async function enregistrerImports(
  fichiers: { nom: string; chemin: string; taille: number; type: string }[],
): Promise<Resultat<{ ids: string[] }>> {
  const { supabase, entreprise, membre } = await contexteBureau();
  const propres = fichiers
    .filter((f) => f.chemin.startsWith(`${entreprise.id}/imports/`))
    .map((f) => ({
      entreprise_id: entreprise.id,
      cree_par: membre.id,
      nom_fichier: String(f.nom).slice(0, 200),
      chemin: f.chemin,
      taille: Math.round(Number(f.taille) || 0),
      type_mime: String(f.type || '').slice(0, 100),
    }));
  if (!propres.length) return { ok: false, erreur: 'Aucun fichier reçu.' };
  const { data, error } = await supabase.from('imports').insert(propres).select('id');
  if (error || !data) return { ok: false, erreur: 'Les fichiers n’ont pas pu être enregistrés.' };
  revalidatePath('/devis');
  return { ok: true, ids: data.map((d) => d.id as string) };
}

/** Lecture automatique d'un document importé (si la clé de lecture est configurée). */
export async function lireImport(id: string): Promise<Resultat<{ champs: ChampsLus }>> {
  const { supabase } = await contexteBureau();
  const { data: imp } = await supabase.from('imports').select('*').eq('id', id).maybeSingle();
  if (!imp) return { ok: false, erreur: 'Document introuvable' };
  const { data: fichier, error } = await supabase.storage.from('documents').download(imp.chemin);
  if (error || !fichier) {
    await supabase.from('imports').update({ statut: 'erreur', champs: { message: 'Fichier illisible' } }).eq('id', id);
    return { ok: false, erreur: 'Le fichier n’a pas pu être ouvert.' };
  }
  const champs = await lireFichierImporte(Buffer.from(await fichier.arrayBuffer()), imp.type_mime ?? '', imp.nom_fichier);
  const doutes = Object.values(champs.confiance ?? {}).some((v) => v < 80);
  const statut = champs.message && !champs.lignes?.length && !champs.client ? 'a_verifier' : doutes ? 'a_verifier' : 'pret';
  await supabase.from('imports').update({ statut, champs }).eq('id', id);
  revalidatePath('/devis');
  return { ok: true, champs };
}

export async function enregistrerChampsImport(id: string, champs: ChampsLus): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('imports').update({ champs, statut: 'pret' }).eq('id', id);
  if (error) return { ok: false, erreur: 'Les champs n’ont pas pu être enregistrés.' };
  return { ok: true };
}

export async function supprimerImport(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('imports').delete().eq('id', id);
  if (error) return { ok: false, erreur: 'Le document n’a pas pu être retiré.' };
  revalidatePath('/devis');
  return { ok: true };
}

