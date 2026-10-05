// Éditeur plein écran d'un devis, d'une facture ou d'un avoir, comme dans le bac à sable :
// état et actions selon le statut (barre du bas), délai de paiement et échéance, validité,
// forfaits de dépannage et majorations du soir et du week-end, recherche rapide dans les
// produits et services, part déjà facturée d'un devis, avoir d'une facture.

import { ajouterMois } from './contrats.ts';
import {
  arrondi,
  calculer,
  clientVide,
  estAppelOffres,
  titreDocument,
  type ClientDocument,
  type ConditionsDocument,
  type DocumentACalculer,
  type GenreDocument,
  type LigneDocument,
  type Parcours,
  type StatutDocument,
  type TypeFacture,
} from './devis.ts';
import { ajouterJours, payeurTexte } from './format.ts';
import type { Ton } from './libelles.ts';
import { prixLigne, type ReglagesDepannage, type ReglagesPrix } from './rentabilite.ts';

// ---------------------------------------------------------------------------
// Formats du bac (nb, pc, ddmm)
// ---------------------------------------------------------------------------

const fmtN = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fmt2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const insecable = (t: string) => t.replace(/[   ]/g, ' ');

/** nb() du bac : « 1,45 », « 30 », « 22,44 » (deux décimales au plus). */
export function nombreBac(n: number): string {
  return insecable(fmtN.format(Object.is(n, -0) ? 0 : n || 0));
}
/** pc() du bac : « 12,4 % » (une décimale). */
export function pourcentBac(n: number): string {
  return `${nombreBac(Math.round((n || 0) * 10) / 10)} %`;
}
/** eur() et eur0() du bac : « 1 180,35 € », « 1 850 € ». */
export function euroBac(n: number, decimales: 0 | 2 = 2): string {
  const v = Object.is(n, -0) || !n ? 0 : n;
  return `${insecable((decimales ? fmt2 : fmt0).format(v))} €`;
}
/** « 2026-10-04 » (ou un horodatage) → « 04/10/2026 » */
export function dateBac(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Minuscules sans accents, pour chercher « faience » dans « Faïence ». */
export function sansAccents(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Statut, état et actions (pillDoc, etatDocTexte, actionsDoc du bac)
// ---------------------------------------------------------------------------

export const LIBELLE_STATUT_DOC: Record<StatutDocument, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  signe: 'Signé',
  refuse: 'Refusé',
  a_encaisser: 'À encaisser',
  payee: 'Payée',
  annule: 'Annulée',
};
export const TON_STATUT_DOC: Record<StatutDocument, Ton> = {
  brouillon: 'gris',
  envoye: 'bleu',
  signe: 'vert',
  refuse: 'rouge',
  a_encaisser: 'violet',
  payee: 'vert',
  annule: 'gris',
};

/** Pastille de statut. Une facture annulée l'est toujours par un avoir. */
export function statutDocument(d: { genre: GenreDocument; statut: StatutDocument }): { libelle: string; ton: Ton } {
  if (d.genre === 'facture' && d.statut === 'annule') return { libelle: 'Annulée par un avoir', ton: 'gris' };
  return { libelle: LIBELLE_STATUT_DOC[d.statut], ton: TON_STATUT_DOC[d.statut] };
}

/** « Devis », « Facture d’acompte », « Avoir »… (libDoc du bac, sans n° de situation). */
export function libelleDocument(d: { genre: GenreDocument; type_facture: TypeFacture | null }): string {
  return titreDocument(d.genre, d.type_facture);
}

/** Un brouillon, ou un devis envoyé, se modifie encore ; le reste est en lecture seule. */
export function documentModifiable(d: { genre: GenreDocument; statut: StatutDocument }): boolean {
  return d.statut === 'brouillon' || (d.genre === 'devis' && d.statut === 'envoye');
}

/** Coefficients et rentabilité : devis et facture totale (sans ligne négative). */
export function montrerRentabilite(d: { genre: GenreDocument; type_facture: TypeFacture | null; lignes: LigneDocument[] }): boolean {
  return d.genre === 'devis' || (d.type_facture === 'totale' && !d.lignes.some((l) => !l.titre && l.prix_unitaire < 0));
}

export interface DocumentEtat {
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  statut: StatutDocument;
  date_document: string;
  echeance?: string | null;
  envoye_le?: string | null;
  finalise_le?: string | null;
  signe_le?: string | null;
  paye_le?: string | null;
  conditions?: Partial<ConditionsDocument> | null;
}

/** Texte d'état de la barre du bas (etatDocTexte du bac). `deja` : part du devis déjà facturée (%). */
export function etatDocumentTexte(d: DocumentEtat, deja: number, aujourdhui: string): string {
  const ao = estAppelOffres({ genre: d.genre, conditions: d.conditions ?? null });
  const c = d.conditions ?? {};
  if (d.statut === 'brouillon') return ao && c.aoLimite ? `Réponse à rendre avant le ${dateBac(c.aoLimite)}` : 'Brouillon enregistré automatiquement';
  if (d.genre === 'devis') {
    if (d.statut === 'envoye')
      return `${ao ? 'Réponse envoyée le ' : 'Envoyé le '}${dateBac(d.envoye_le || d.finalise_le || d.date_document)}${ao ? ' · résultat attendu' : ''}`;
    if (ao && d.statut === 'refuse') return 'Appel d’offres perdu';
    if (d.statut === 'signe') return `${ao ? 'Gagné' : 'Signé'}${d.signe_le ? ` le ${dateBac(d.signe_le)}` : ''} · facturé ${nombreBac(deja)} %`;
    return LIBELLE_STATUT_DOC[d.statut];
  }
  if (d.statut === 'annule') return 'Annulée par un avoir';
  if (d.statut === 'a_encaisser') {
    if (d.echeance && d.echeance < aujourdhui && d.type_facture !== 'avoir') return `En retard depuis le ${dateBac(d.echeance)}`;
    return d.echeance ? `À encaisser avant le ${dateBac(d.echeance)}` : 'À encaisser';
  }
  if (d.statut === 'payee') return d.type_facture === 'avoir' ? 'Avoir émis' : `Payée${d.paye_le ? ` le ${dateBac(d.paye_le)}` : ''}`;
  return LIBELLE_STATUT_DOC[d.statut];
}

export type CleAction =
  | 'valider'
  | 'signe'
  | 'refuse'
  | 'facturer'
  | 'appliquer'
  | 'intervention'
  | 'payee'
  | 'avoir'
  | 'envoyer'
  | 'relancer'
  | 'pdf'
  | 'attente'
  | 'encaissement'
  | 'dupliquer'
  | 'supprimer';

export interface ActionDocument {
  cle: CleAction;
  libelle: string;
  danger?: boolean;
}

/**
 * Le bouton principal selon l'état du document, le reste dans le menu « ⋮ » (actionsDoc du bac).
 * En plus du bac : envoi par e-mail, relance, PDF, remise en attente et annulation d'un encaissement.
 */
export function actionsDocument(
  d: DocumentEtat,
  o: { deja: number; parcours: Parcours; interventionLiee: boolean; contratLie: boolean },
): { principal: ActionDocument | null; menu: ActionDocument[] } {
  const ao = estAppelOffres({ genre: d.genre, conditions: d.conditions ?? null });
  const menu: ActionDocument[] = [];
  let principal: ActionDocument | null = null;
  if (d.statut === 'brouillon')
    principal = { cle: 'valider', libelle: d.genre === 'devis' ? 'Valider le devis' : d.type_facture === 'avoir' ? 'Valider l’avoir' : 'Valider la facture' };
  if (d.genre === 'devis') {
    if (d.statut === 'envoye') {
      principal = { cle: 'signe', libelle: ao ? 'Marquer gagné' : 'Marquer signé' };
      menu.push({ cle: 'refuse', libelle: ao ? 'Marquer perdu' : 'Marquer refusé' });
    }
    if (d.statut === 'signe') {
      if (o.deja < 100 - 1e-6) principal = { cle: 'facturer', libelle: 'Facturer' };
      if (o.parcours === 'contrat' && o.contratLie) menu.push({ cle: 'appliquer', libelle: 'Appliquer au contrat' });
    }
    if ((d.statut === 'signe' || d.statut === 'envoye') && !o.interventionLiee && o.parcours !== 'contrat')
      menu.push({ cle: 'intervention', libelle: 'Créer l’intervention' });
  } else {
    if (d.statut === 'a_encaisser') principal = { cle: 'payee', libelle: 'Marquer payée' };
    if ((d.statut === 'a_encaisser' || d.statut === 'payee') && d.type_facture !== 'avoir') menu.push({ cle: 'avoir', libelle: 'Créer un avoir' });
  }
  if (d.statut !== 'brouillon' && d.statut !== 'annule') menu.push({ cle: 'envoyer', libelle: 'Envoyer par e-mail' });
  if ((d.genre === 'devis' && d.statut === 'envoye') || (d.genre === 'facture' && d.statut === 'a_encaisser' && d.type_facture !== 'avoir'))
    menu.push({ cle: 'relancer', libelle: 'Relancer le client' });
  if (d.genre === 'devis' && d.statut === 'refuse') menu.push({ cle: 'attente', libelle: ao ? 'Remettre la réponse en attente' : 'Remettre en attente' });
  if (d.genre === 'facture' && d.statut === 'payee' && d.type_facture !== 'avoir') menu.push({ cle: 'encaissement', libelle: 'Annuler l’encaissement' });
  menu.push({ cle: 'pdf', libelle: 'Télécharger le PDF' });
  menu.push({ cle: 'dupliquer', libelle: 'Dupliquer' });
  if (d.statut === 'brouillon') menu.push({ cle: 'supprimer', libelle: 'Supprimer le brouillon', danger: true });
  return { principal, menu };
}

/** Type d'un document : celui choisi, sinon déduit (appel d'offres ou lots : chantier ; contrat lié : contrat). */
export function parcoursDocument(
  d: { conditions?: Partial<ConditionsDocument> | null; lignes?: LigneDocument[] },
  indice?: Parcours | null,
): Parcours {
  const c = d.conditions ?? {};
  if (c.parcours === 'depannage' || c.parcours === 'chantier' || c.parcours === 'contrat') return c.parcours;
  if (indice) return indice;
  if (c.contrat_id) return 'contrat';
  if (c.ao || d.lignes?.some((l) => l.titre)) return 'chantier';
  return 'depannage';
}

// ---------------------------------------------------------------------------
// Dates : délai de paiement, échéance, validité
// ---------------------------------------------------------------------------

export const DELAIS_PAIEMENT: [number, string][] = [
  [0, 'À réception'],
  [15, '15 jours'],
  [30, '30 jours'],
  [45, '45 jours'],
  [60, '60 jours'],
];
export const VALIDITES_MOIS = [1, 2, 3, 6] as const;

/** Délai de paiement en jours (lu dans conditions.delaiJours, sinon dans le texte du délai), ou « perso ». */
export function delaiDocument(c: Partial<Pick<ConditionsDocument, 'delai' | 'delaiJours'>>): number | 'perso' {
  if (typeof c.delaiJours === 'number' && Number.isFinite(c.delaiJours) && c.delaiJours >= 0) return Math.round(c.delaiJours);
  if (c.delaiJours === 'perso') return 'perso';
  const t = sansAccents(c.delai ?? '');
  if (/reception/.test(t)) return 0;
  const m = t.match(/(\d+)\s*jours?/);
  return m ? Number(m[1]) : 30;
}

/** Texte du délai imprimé dans les conditions : « À réception de facture », « 30 jours date de facture »… */
export function texteDelai(j: number | 'perso', echeance?: string | null): string {
  if (j === 'perso') return echeance ? `Au plus tard le ${dateBac(echeance)}` : 'À réception de facture';
  return j > 0 ? `${j} jours date de facture` : 'À réception de facture';
}

/** Échéance d'une facture en brouillon : la date choisie, sinon la date du document + le délai. */
export function echeanceDocument(date: string, c: Partial<Pick<ConditionsDocument, 'delai' | 'delaiJours'>>, echeance?: string | null): string {
  const j = delaiDocument(c);
  if (j === 'perso' && echeance) return echeance;
  return ajouterJours(date, j === 'perso' ? 30 : j);
}

/** Échéance donnée à la validation (finaliser du bac) : la date choisie si elle n'est pas passée, sinon aujourd'hui + délai. */
export function echeanceValidation(c: Partial<Pick<ConditionsDocument, 'delai' | 'delaiJours'>>, echeance: string | null | undefined, aujourdhui: string): string {
  const j = delaiDocument(c);
  if (j === 'perso' && echeance && echeance >= aujourdhui) return echeance;
  return ajouterJours(aujourdhui, j === 'perso' ? 30 : j);
}

/** « 3 mois » → 3 (0 si le texte n'est pas en mois). */
export function validiteMois(validite: string | null | undefined): number {
  const m = String(validite ?? '').match(/(\d+)\s*mois/i);
  return m ? Number(m[1]) : 0;
}

/** Fin de validité d'un devis : « 3 mois », « 30 jours » ou « 2 semaines » après la date. */
export function finValidite(date: string, validite: string | null | undefined): string {
  const m = String(validite ?? '').match(/(\d+)\s*(mois|semaines?|jours?)/i);
  if (!m) return ajouterMois(date, 1);
  const n = Number(m[1]);
  if (/mois/i.test(m[2])) return ajouterMois(date, n);
  return ajouterJours(date, /semaine/i.test(m[2]) ? n * 7 : n);
}

// ---------------------------------------------------------------------------
// Forfaits de dépannage et majorations
// ---------------------------------------------------------------------------

export type Majoration = NonNullable<ConditionsDocument['majoration']>;
export type ForfaitLigne = 'depl' | 'heure';

/** Coût d'un déplacement (véhicule), compté dans la rentabilité comme dans le bac. */
export const COUT_DEPLACEMENT = 12;

/** Majoration (%) des heures de dépannage. */
export function tauxMajoration(m: Majoration | null | undefined, rd: ReglagesDepannage): number {
  return m === 'soir' ? rd.maj_soir : m === 'we' ? rd.maj_we : 0;
}

/** Prix d'une ligne forfaitaire : forfait déplacement, ou taux horaire de dépannage majoré. */
export function prixForfait(f: ForfaitLigne, m: Majoration | null | undefined, rd: ReglagesDepannage): number {
  return f === 'depl' ? rd.deplacement : arrondi(rd.taux_depannage * (1 + tauxMajoration(m, rd) / 100));
}

/** Ligne « Déplacement Paris intra-muros » ou « Main d’œuvre dépannage ». */
export function ligneForfait(f: ForfaitLigne, o: { rd: ReglagesDepannage; majoration?: Majoration | null; tva: number; quantite?: number; designation?: string }): LigneDocument {
  const depl = f === 'depl';
  return {
    designation: o.designation ?? (depl ? 'Déplacement Paris intra-muros' : 'Main d’œuvre dépannage'),
    quantite: o.quantite ?? 1,
    unite: depl ? 'forfait' : 'h',
    prix_unitaire: prixForfait(f, o.majoration, o.rd),
    tva: o.tva,
    achat: depl ? COUT_DEPLACEMENT : null,
    heures: depl ? null : 1,
    coefficient: null,
    prix_calcule: false,
    forfait: f,
  };
}

/** Recalcule le prix des lignes forfaitaires (majoration ou réglages changés). */
export function appliquerForfaits<T extends LigneDocument>(lignes: T[], m: Majoration | null | undefined, rd: ReglagesDepannage): T[] {
  return lignes.map((l) => {
    if (!l.forfait || l.titre) return l;
    const p = prixForfait(l.forfait, m, rd);
    return p === l.prix_unitaire ? l : { ...l, prix_unitaire: p };
  });
}

/** Les forfaits des lignes, par position, pour conditions.forfaits (la table des lignes n'a pas de colonne). */
export function forfaitsDesLignes(lignes: LigneDocument[]): Record<string, ForfaitLigne> | undefined {
  const r: Record<string, ForfaitLigne> = {};
  lignes.forEach((l, i) => {
    if (!l.titre && (l.forfait === 'depl' || l.forfait === 'heure')) r[String(i)] = l.forfait;
  });
  return Object.keys(r).length ? r : undefined;
}

/** Remet sur chaque ligne lue son forfait (conditions.forfaits, par position). */
export function attacherForfaits<T extends LigneDocument>(lignes: T[], c?: { forfaits?: Record<string, string> | null } | null): T[] {
  const f = c?.forfaits;
  if (!f) return lignes;
  return lignes.map((l, i) => {
    const v = f[String(i)];
    return !l.titre && (v === 'depl' || v === 'heure') ? { ...l, forfait: v } : l;
  });
}

/** Lignes d'un nouveau brouillon selon le type (fenêtre « Nouveau document » du bac). */
export function lignesDeDepart(parcours: Parcours, o: { ao?: boolean; rd: ReglagesDepannage; tva: number }): LigneDocument[] {
  if (parcours === 'depannage') return [ligneForfait('depl', o), ligneForfait('heure', o)];
  if (parcours === 'chantier' && !o.ao) return [{ titre: true, designation: 'Lot 1 · Travaux', quantite: 0, unite: 'u', prix_unitaire: 0, tva: o.tva }];
  return [];
}

// ---------------------------------------------------------------------------
// Recherche rapide de produits et services
// ---------------------------------------------------------------------------

export type CategorieProduit = 'ouvrage' | 'fourniture' | 'mo' | 'forfait';
export const CATEGORIES_PRODUIT: Record<CategorieProduit, [string, string]> = {
  ouvrage: ['Ouvrage', 'O'],
  fourniture: ['Fourniture', 'F'],
  mo: ['Main d’œuvre', 'M'],
  forfait: ['Forfait', '€'],
};
export const FILTRES_PRODUITS: ['tout' | CategorieProduit, string][] = [
  ['tout', 'Tout'],
  ['ouvrage', 'Ouvrages'],
  ['fourniture', 'Fournitures'],
  ['mo', 'Main d’œuvre'],
  ['forfait', 'Forfaits'],
];

/** Catégorie du catalogue de la production → catégorie du bac. */
export function categorieProduit(categorie: string): CategorieProduit {
  const c = sansAccents(categorie);
  if (c.startsWith('ouvrage')) return 'ouvrage';
  if (c.startsWith('main')) return 'mo';
  if (c.startsWith('forfait') || c.startsWith('deplacement')) return 'forfait';
  return 'fourniture';
}

export interface ArticleCatalogue {
  id: string;
  designation: string;
  categorie: string;
  unite: string;
  reference?: string | null;
  prix_achat: number;
  prix_vente: number;
  heures: number;
  tva: number;
  utilisations: number;
}

export interface Produit {
  id: string;
  c: CategorieProduit;
  designation: string;
  unite: string;
  /** Coût d'une unité : fourniture achetée (€ HT) et temps de pose (h). */
  achat: number;
  heures: number;
  /** Article sans coût connu : son prix de vente reste tel quel. */
  prixFixe: number | null;
  forfait: ForfaitLigne | null;
  article_id: string | null;
  utilisations: number;
  mots: string;
}

/** Produits proposés : le catalogue de l'entreprise, plus le déplacement et l'heure de dépannage des réglages. */
export function produitsCatalogue(articles: ArticleCatalogue[]): Produit[] {
  const liste: Produit[] = articles.map((a) => {
    const c = categorieProduit(a.categorie);
    const heureMo = c === 'mo' && a.unite === 'h';
    const heures = Number(a.heures) || (heureMo && !Number(a.prix_achat) ? 1 : 0);
    const achat = Number(a.prix_achat) || 0;
    const aUnCout = achat > 0 || heures > 0;
    return {
      id: a.id,
      c,
      designation: a.designation,
      unite: a.unite || 'u',
      achat,
      heures,
      prixFixe: aUnCout ? null : Number(a.prix_vente) || 0,
      forfait: null,
      article_id: a.id,
      utilisations: Number(a.utilisations) || 0,
      mots: [a.reference, a.categorie].filter(Boolean).join(' '),
    };
  });
  // Les forfaits des réglages passent juste après les articles déjà utilisés.
  liste.push(
    { id: 'forfait-depl', c: 'forfait', designation: 'Déplacement Paris intra-muros', unite: 'forfait', achat: 0, heures: 0, prixFixe: null, forfait: 'depl', article_id: null, utilisations: 0.5, mots: 'deplacement' },
    { id: 'forfait-heure', c: 'forfait', designation: 'Main d’œuvre dépannage', unite: 'h', achat: 0, heures: 0, prixFixe: null, forfait: 'heure', article_id: null, utilisations: 0.4, mots: 'heure intervention urgence main d oeuvre' },
  );
  return liste;
}

/** chercher() du bac : tous les mots présents (sans accents), les plus utilisés sans recherche (6), sinon 8 résultats. */
export function chercherProduits(produits: Produit[], q: string, filtre: 'tout' | CategorieProduit = 'tout'): Produit[] {
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  return produits
    .filter((p) => {
      if (filtre !== 'tout' && p.c !== filtre) return false;
      const t = sansAccents(`${p.designation} ${p.mots}`);
      return mots.every((m) => t.includes(m));
    })
    .sort((a, b) => {
      if (!mots.length) return b.utilisations - a.utilisations || a.designation.localeCompare(b.designation, 'fr');
      const da = sansAccents(a.designation).indexOf(mots[0]);
      const db = sansAccents(b.designation).indexOf(mots[0]);
      return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
    })
    .slice(0, mots.length ? 8 : 6);
}

export interface ContextePrix {
  coef: number;
  rp: ReglagesPrix;
  rd: ReglagesDepannage;
  majoration?: Majoration | null;
}

/** Ligne ajoutée depuis la recherche : forfait des réglages, prix calculé (coût × coefficient) ou prix fixe. */
export function ligneProduit(p: Produit, o: ContextePrix & { tva: number }): LigneDocument {
  if (p.forfait) return ligneForfait(p.forfait, o);
  const l: LigneDocument = {
    designation: p.designation,
    quantite: 1,
    unite: p.unite,
    prix_unitaire: p.prixFixe ?? 0,
    tva: o.tva,
    article_id: p.article_id,
    achat: p.achat || null,
    heures: p.heures || null,
    coefficient: null,
    prix_calcule: p.prixFixe == null,
  };
  return { ...l, prix_unitaire: prixLigne(l, o.coef, o.rp) };
}

/** Prix HT d'une unité du produit, tel qu'il arrivera sur la ligne. */
export function prixProduit(p: Produit, o: ContextePrix): number {
  return ligneProduit(p, { ...o, tva: 10 }).prix_unitaire;
}

/** surligne() du bac : morceaux du texte, marqués quand ils correspondent à un mot cherché. */
export function morceauxSurlignes(texte: string, q: string): { t: string; m: boolean }[] {
  const t = sansAccents(texte);
  const marques: [number, number][] = [];
  for (const mot of sansAccents(q).split(/\s+/).filter(Boolean)) {
    const i = t.indexOf(mot);
    if (i >= 0) marques.push([i, i + mot.length]);
  }
  marques.sort((a, b) => a[0] - b[0]);
  const out: { t: string; m: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of marques) {
    if (a < pos) continue;
    if (a > pos) out.push({ t: texte.slice(pos, a), m: false });
    out.push({ t: texte.slice(a, b), m: true });
    pos = b;
  }
  if (pos < texte.length) out.push({ t: texte.slice(pos), m: false });
  return out;
}

// ---------------------------------------------------------------------------
// Déjà facturé, avoirs
// ---------------------------------------------------------------------------

export interface FactureDuDevis {
  id: string;
  type_facture: TypeFacture | null;
  statut: StatutDocument;
  total_ht: number;
  total_ttc: number;
}
export interface AvoirEmis {
  facture_id: string | null;
  numero: string | null;
  total_ttc: number;
}

/** Montant TTC des avoirs émis sur une facture (en positif). */
export function avoirsSurFacture(factureId: string, avoirs: AvoirEmis[]): number {
  return arrondi(avoirs.filter((a) => a.facture_id === factureId && a.numero).reduce((s, a) => s + Math.abs(Number(a.total_ttc) || 0), 0));
}

/** Facture entièrement annulée par ses avoirs. */
export function annuleeParAvoirs(totalTtc: number, avoirsTtc: number): boolean {
  return Math.abs(totalTtc) > 0.005 && Math.abs(totalTtc) - avoirsTtc <= 0.005;
}

/**
 * Part du devis déjà facturée (%), brouillons compris, déduction faite des avoirs (dejaFacture du bac) :
 * chaque facture compte pour son montant HT rapporté au marché, moins la part annulée par avoir.
 */
export function partDejaFacturee(marcheHT: number, factures: FactureDuDevis[], avoirs: AvoirEmis[], sauf?: string | null): number {
  if (!(marcheHT > 0)) return 0;
  const total = factures
    .filter((f) => f.type_facture !== 'avoir' && f.statut !== 'annule' && f.id !== sauf)
    .reduce((s, f) => {
      const part = ((Number(f.total_ht) || 0) / marcheHT) * 100;
      const ttc = Math.abs(Number(f.total_ttc) || 0);
      const reste = ttc > 0.005 ? Math.max(0, 1 - avoirsSurFacture(f.id, avoirs) / ttc) : 1;
      return s + part * reste;
    }, 0);
  return Math.round(total * 1000) / 1000;
}

/**
 * Lignes d'un avoir sur une facture : les mêmes lignes pour une facture totale ; pour un acompte,
 * une situation ou un solde, une ligne par taux de TVA du montant facturé (pas tout le marché).
 */
export function lignesAvoir(
  facture: DocumentACalculer & { numero: string | null; situation_numero?: number | null },
  lignes: LigneDocument[],
): { lignes: LigneDocument[]; remise: number } {
  const propres = lignes.map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 }));
  // Facture totale, ou facture préparée comme dans le bac (lignes au montant facturé) : mêmes lignes.
  if ((facture.type_facture ?? 'totale') === 'totale' || facture.conditions.lignesAuMontant) return { lignes: propres, remise: facture.remise };
  const T = calculer(facture);
  const titre = `${titreDocument('facture', facture.type_facture, facture.situation_numero)} ${facture.numero ?? ''}`.trim();
  const tvaBase = lignes.find((l) => !l.titre)?.tva ?? 10;
  const parts = T.tva.length ? T.tva.map((x) => ({ taux: x.taux, base: x.base })) : [{ taux: tvaBase, base: T.ht }];
  return {
    remise: 0,
    lignes: parts.map((x) => ({
      designation: parts.length > 1 ? `${titre} (TVA ${String(x.taux).replace('.', ',')} %)` : titre,
      quantite: 1,
      unite: 'forfait',
      prix_unitaire: arrondi(x.base),
      tva: x.taux,
      prix_calcule: false,
    })),
  };
}

/** Bases HT d'un devis par taux de TVA : avant remise (brut) et après remise. */
function basesParTaux(lignes: LigneDocument[], remise: number): { taux: number; brut: number; net: number }[] {
  const r = 1 - Math.min(100, Math.max(0, Number(remise) || 0)) / 100;
  const m = new Map<number, number>();
  for (const l of lignes) if (!l.titre) m.set(l.tva, (m.get(l.tva) ?? 0) + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0));
  const t = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([taux, brut]) => ({ taux, brut, net: brut * r }));
  return t.length ? t : [{ taux: lignes.find((l) => !l.titre)?.tva ?? 10, brut: 0, net: 0 }];
}

/**
 * Lignes d'une facture préparée depuis un devis (lignesFacture du bac) : une ligne « Acompte de 30 % sur le devis … »,
 * une ligne « Situation de travaux : avancement cumulé … », ou, pour une facture totale ou de solde, les lignes du devis,
 * la remise en ligne et, pour un solde, le lot « Déjà facturé » qui déduit les acomptes et situations.
 * Un devis à plusieurs taux de TVA donne une ligne par taux (« (TVA 10 %) »). `part` et `deja` en % du devis.
 */
export function lignesFactureDevis(
  devis: { numero: string | null; objet: string; remise: number },
  lignes: LigneDocument[],
  type: TypeFacture,
  part: number,
  deja: number,
): LigneDocument[] {
  const nomDv = devis.numero || 'brouillon';
  const bases = basesParTaux(lignes, devis.remise);
  const suffixe = (taux: number) => (bases.length > 1 ? ` (TVA ${nombreBac(taux)} %)` : '');
  const fixe = (designation: string, prix: number, tva: number): LigneDocument => ({
    designation,
    quantite: 1,
    unite: 'forfait',
    prix_unitaire: arrondi(prix),
    tva,
    achat: null,
    heures: null,
    coefficient: null,
    prix_calcule: false,
  });
  if (type === 'acompte')
    return bases.map((b) => fixe(`Acompte de ${nombreBac(part)} % sur le devis ${nomDv} · ${devis.objet}${suffixe(b.taux)}`, (b.net * part) / 100, b.taux));
  if (type === 'situation' || type === 'avancement')
    return bases.map((b) =>
      fixe(`Situation de travaux : avancement cumulé ${nombreBac(deja + part)} % du devis ${nomDv}, déjà facturé ${nombreBac(deja)} %${suffixe(b.taux)}`, (b.net * part) / 100, b.taux),
    );
  const copie: LigneDocument[] = lignes.map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 }));
  const remise = Math.min(100, Number(devis.remise) || 0);
  if (remise > 0) for (const b of bases) copie.push(fixe(`Remise ${nombreBac(remise)} % sur le total HT${suffixe(b.taux)}`, -((b.brut * remise) / 100), b.taux));
  if (deja > 0) {
    copie.push({ titre: true, designation: 'Déjà facturé', quantite: 0, unite: 'u', prix_unitaire: 0, tva: bases[0].taux });
    for (const b of bases) copie.push(fixe(`Acomptes et situations déjà facturés (${nombreBac(deja)} % du devis ${nomDv})${suffixe(b.taux)}`, -((b.net * deja) / 100), b.taux));
  }
  return copie;
}

// ---------------------------------------------------------------------------
// Client du document
// ---------------------------------------------------------------------------

export interface ClientSource {
  nom: string;
  type: string;
  civilite?: string | null;
  contact?: string | null;
  telephone?: string | null;
  mobile?: string | null;
  email?: string | null;
  adresse_facturation?: string | null;
  siret?: string | null;
  siren?: string | null;
  tva_intracom?: string | null;
  forme_juridique?: string | null;
  activite?: string | null;
}
export interface SiteSource {
  adresse: string;
  code_postal?: string | null;
  ville?: string | null;
  copropriete?: string | null;
}

const adresseSite = (s: SiteSource | null | undefined) => (s ? [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '');

/**
 * Le client tel qu'il figure sur le document, d'après la fiche : un particulier, ou un professionnel
 * (pour un syndic ou un bailleur, la copropriété de l'immeuble « représentée par » le client).
 */
export function clientDocumentDe(k: ClientSource, site?: SiteSource | null): ClientDocument {
  const base = clientVide();
  const chantier = adresseSite(site);
  const adresse = k.adresse_facturation?.trim() || chantier;
  const lieu = { adresse, identique: !chantier || adresse === chantier, adresseChantier: chantier && adresse !== chantier ? chantier : '' };
  const tel = k.mobile || k.telephone || '';
  if (k.type === 'particulier') {
    const m = k.nom.match(/^(Mme et M\.|M\. et Mme|Mme|M\.)\s+(.*)$/);
    return { ...base, ...lieu, type: 'particulier', civ: m?.[1] ?? k.civilite ?? base.civ, nom: m?.[2] ?? k.nom, tel, email: k.email ?? '' };
  }
  return {
    ...base,
    ...lieu,
    type: 'pro',
    raison: payeurTexte(k, site ?? null) || k.nom,
    siret: k.siret || k.siren || '',
    tvaIntra: k.tva_intracom ?? '',
    forme: k.forme_juridique ?? '',
    naf: k.activite ?? '',
    contact: k.contact ?? '',
    tel,
    email: k.email ?? '',
  };
}
