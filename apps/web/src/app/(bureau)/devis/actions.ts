'use server';

import { revalidatePath } from 'next/cache';
import {
  aDesImmeubles,
  annuleeParAvoirs,
  attacherForfaits,
  aujourdhui,
  avoirsSurFacture,
  calculer,
  clientDocumentDe,
  clientVide,
  completerClient,
  completerConditions,
  conditionsParDefaut,
  delaiDocument,
  echeanceValidation,
  familleIntervention,
  forfaitsDesLignes,
  LIBELLE_STATUT_DOC,
  libelleDocument,
  ligneForfait,
  lignesAvoir,
  lignesFactureDevis,
  lignesDeDepart,
  nombre,
  nombreBac,
  prixLigne,
  reglagesDepannage,
  reglagesPrix,
  texteDelai,
  TITRES_FACTURE,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type Metre,
  type Parcours,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import { lireDocument, type ChampsLus } from '@/lib/devis';
import { lireFichierImporte } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { lireFacturation } from './charger';
import { lireListeDocuments } from './liste-donnees';

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Bureau = Awaited<ReturnType<typeof contexteBureau>>;

export interface DocumentAEnregistrer {
  id?: string | null;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  client_id?: string | null;
  client: ClientDocument;
  objet: string;
  date_document: string;
  /** Date d'échéance d'une facture (absente : inchangée). */
  echeance?: string | null;
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
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    article_id: l.article_id && !String(l.article_id).startsWith('forfait-') ? l.article_id : null,
    achat: l.titre ? null : positifOuNul(l.achat, 10_000_000),
    heures: l.titre ? null : positifOuNul(l.heures, 100_000),
    coefficient: l.titre ? null : coefficientValide(l.coefficient),
    prix_calcule: !l.titre && !!l.prix_calcule,
    metre: l.titre ? null : nettoyerMetre(l.metre),
    reference: String(l.reference ?? '').trim().slice(0, 40) || null,
  }));
}

function messageErreur(m?: string): string {
  if (!m) return 'Enregistrement impossible. Réessayez.';
  if (/numérotée|ligne avant|Réservé|introuvable|autre entreprise/.test(m)) return m;
  return 'Enregistrement impossible. Réessayez.';
}

function revaliderVentes() {
  revalidatePath('/devis');
  revalidatePath('/factures');
}

/**
 * Écrit le document et ses lignes (et le valide si demandé : numéro définitif par finaliser_document).
 * Refuse de modifier une facture numérotée ou un devis signé, refusé ou annulé (comme le bac).
 */
async function ecrireDocument(
  { supabase, entreprise, membre }: Bureau,
  doc: DocumentAEnregistrer,
  valider = false,
): Promise<Resultat<{ id: string; numero: string | null }>> {
  const coefficient = coefficientValide(doc.coefficient);
  const lignes = nettoyerLignes(doc.lignes ?? []);
  const facture = doc.genre === 'facture';
  const echeance = doc.echeance === undefined ? undefined : doc.echeance && DATE.test(doc.echeance) ? doc.echeance : null;
  const conditions = completerConditions(doc.conditions);
  const forfaits = forfaitsDesLignes(doc.lignes ?? []);
  if (forfaits) conditions.forfaits = forfaits;
  else delete conditions.forfaits;
  const base = {
    genre: doc.genre,
    type_facture: facture ? (doc.type_facture ?? 'totale') : null,
    client_id: doc.client_id || null,
    client: completerClient(doc.client),
    objet: String(doc.objet ?? '').slice(0, 300),
    date_document: DATE.test(doc.date_document) ? doc.date_document : aujourdhui(),
    conditions,
    devis_id: doc.devis_id || null,
    facture_id: doc.facture_id || null,
    remise: borne(doc.remise),
    pourcentage: borne(doc.pourcentage),
    avancement: borne(doc.avancement),
    avancement_precedent: borne(doc.avancement_precedent),
    situation_numero: doc.situation_numero ?? null,
    coefficient,
    ...(echeance !== undefined ? { echeance } : {}),
  };
  // Les totaux sont recalculés ici, avec le même calcul que l'aperçu.
  const T = calculer({ ...base, lignes });
  const totaux = { total_ht: T.ht, total_tva: T.totalTva, total_ttc: T.ttc, net_a_payer: T.net };

  let id = doc.id ?? null;
  if (id) {
    const { data: avant } = await supabase.from('documents').select('genre, statut, numero').eq('id', id).maybeSingle();
    if (!avant) return { ok: false, erreur: 'Document introuvable' };
    if (avant.genre === 'facture' && avant.numero) return { ok: false, erreur: 'Une facture émise ne se modifie plus : faites un avoir si besoin.' };
    if (avant.genre === 'devis' && avant.statut !== 'brouillon' && avant.statut !== 'envoye')
      return { ok: false, erreur: `Devis ${LIBELLE_STATUT_DOC[avant.statut as StatutDocument].toLowerCase()} : dupliquez-le pour faire une variante.` };
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
    const { error } = await supabase.from('lignes_document').insert(lignes.map((l) => ({ ...l, entreprise_id: entreprise.id, document_id: id })));
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
  return { ok: true, id: id!, numero };
}

/** Enregistre un brouillon (et le valide si demandé : numéro définitif). Utilisé aussi par les interventions et les contrats. */
export async function enregistrerDocument(doc: DocumentAEnregistrer, valider = false): Promise<Resultat<{ id: string; numero: string | null }>> {
  const r = await ecrireDocument(await contexteBureau(), doc, valider);
  if (r.ok) revaliderVentes();
  return r;
}

/** Enregistrement automatique de l'éditeur (sans rafraîchir les pages). */
export async function enregistrerBrouillon(doc: DocumentAEnregistrer): Promise<Resultat<{ id: string }>> {
  if (!doc.id) return { ok: false, erreur: 'Document introuvable' };
  const r = await ecrireDocument(await contexteBureau(), doc, false);
  return r.ok ? { ok: true, id: r.id } : r;
}

/** Une facture entièrement couverte par ses avoirs passe en « annulée par un avoir ». */
async function annulerSiCouverte(supabase: Bureau['supabase'], factureId: string) {
  const [{ data: f }, { data: avoirs }] = await Promise.all([
    supabase.from('documents').select('id, statut, total_ttc').eq('id', factureId).maybeSingle(),
    supabase.from('documents').select('facture_id, numero, total_ttc').eq('facture_id', factureId).eq('type_facture', 'avoir'),
  ]);
  if (!f || (f.statut !== 'a_encaisser' && f.statut !== 'payee')) return;
  const couvert = avoirsSurFacture(
    factureId,
    (avoirs ?? []).map((a) => ({ facture_id: a.facture_id as string, numero: a.numero as string | null, total_ttc: Number(a.total_ttc) })),
  );
  if (annuleeParAvoirs(Number(f.total_ttc), couvert)) await supabase.from('documents').update({ statut: 'annule' }).eq('id', factureId);
}

/**
 * « Valider le devis / la facture / l'avoir » (finaliser du bac) : au moins une ligne, date du jour,
 * échéance (date choisie si elle n'est pas passée, sinon aujourd'hui + délai), numéro définitif.
 * Un devis passe en envoyé, une facture à encaisser, un avoir en émis (et annule sa facture s'il la couvre).
 * L'intervention validée d'où vient la facture passe en facturée quand le devis est entièrement facturé.
 */
export async function validerDocument(doc: DocumentAEnregistrer): Promise<Resultat<{ id: string; numero: string; message: string }>> {
  if (!doc.id) return { ok: false, erreur: 'Document introuvable' };
  if (!(doc.lignes ?? []).some((l) => !l.titre)) return { ok: false, erreur: 'Ajoutez au moins une ligne avant de finaliser' };
  const ctx = await contexteBureau();
  const { supabase } = ctx;
  const ajd = aujourdhui();
  const facture = doc.genre === 'facture';
  const avoir = facture && doc.type_facture === 'avoir';
  const echeance = facture && !avoir ? echeanceValidation(doc.conditions, doc.echeance, ajd) : null;
  const conditions =
    facture && !avoir && delaiDocument(doc.conditions) === 'perso' ? { ...doc.conditions, delai: texteDelai('perso', echeance) } : doc.conditions;
  const r = await ecrireDocument(ctx, { ...doc, conditions, date_document: ajd, echeance }, true);
  if (!r.ok) return r;
  const id = r.id;
  const numero = r.numero ?? '';
  const maintenant = new Date().toISOString();
  if (!facture) await supabase.from('documents').update({ envoye_le: maintenant }).eq('id', id);
  if (avoir) {
    await supabase.from('documents').update({ statut: 'payee' }).eq('id', id);
    if (doc.facture_id) await annulerSiCouverte(supabase, doc.facture_id);
  }
  const interventionId = doc.conditions.intervention_id;
  if (facture && !avoir && doc.type_facture !== 'acompte' && interventionId) {
    const { data: i } = await supabase.from('interventions').select('statut').eq('id', interventionId).maybeSingle();
    const toutFacture = !doc.devis_id || ((await lireFacturation(supabase, doc.devis_id))?.deja ?? 0) >= 100 - 1e-6;
    if (i?.statut === 'validee' && toutFacture) {
      await supabase.rpc('marquer_facturee', { p_intervention: interventionId, p_facturee: true });
      revalidatePath('/interventions');
    }
  }
  revaliderVentes();
  const libelle = libelleDocument({ genre: doc.genre, type_facture: facture ? (doc.type_facture ?? 'totale') : null });
  const message = !facture ? `${libelle} ${numero} validé` : avoir ? `${libelle} ${numero} émis` : `${libelle} ${numero} émise`;
  return { ok: true, id, numero, message };
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
  revaliderVentes();
  return { ok: true };
}

/** Le document vient d'être envoyé par e-mail (date d'envoi). */
export async function marquerEnvoye(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('documents').update({ envoye_le: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, erreur: messageErreur(error.message) };
  revaliderVentes();
  return { ok: true };
}

/** Clés propres à un document qui ne passent pas à la facture, l'avoir ou la copie. */
function conditionsReprises(c: ConditionsDocument, sans: (keyof ConditionsDocument)[]): ConditionsDocument {
  const r = { ...c };
  for (const k of sans) delete r[k];
  return r;
}

/** Copie un devis ou une facture en nouveau brouillon daté du jour (« Copie en brouillon »). */
export async function dupliquer(id: string): Promise<Resultat<{ id: string }>> {
  const ctx = await contexteBureau();
  const lu = await lireDocument(ctx.supabase, id);
  if (!lu) return { ok: false, erreur: 'Document introuvable' };
  const d = lu.document;
  // Comme le bac (copie du document) : la copie d'un avoir reste un avoir sur la même facture.
  const avoir = d.type_facture === 'avoir';
  const res = await ecrireDocument(ctx, {
    genre: d.genre,
    type_facture: d.type_facture === 'situation' ? 'totale' : d.type_facture,
    client_id: d.client_id,
    client: d.client,
    objet: d.objet,
    date_document: aujourdhui(),
    echeance: null,
    conditions: conditionsReprises(d.conditions, d.conditions.delaiJours === 'perso' ? ['forfaits', 'delaiJours'] : ['forfaits']),
    devis_id: d.devis_id,
    facture_id: avoir ? d.facture_id : null,
    remise: d.remise,
    pourcentage: d.pourcentage,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: d.coefficient,
    lignes: attacherForfaits(lu.lignes, d.conditions).map((l) => ({ ...l, avancement: 0, avancement_precedent: 0 })),
  });
  if (!res.ok) return res;
  // Copie d'une proposition de renouvellement refusée : c'est la copie qui devient la proposition du contrat.
  if (d.genre === 'devis' && d.statut === 'refuse')
    await ctx.supabase.from('contrats').update({ renouvellement_id: res.id }).eq('renouvellement_id', d.id);
  revaliderVentes();
  return { ok: true, id: res.id };
}

/**
 * Prépare une facture à partir d'un devis (fenêtre « Facturer le devis » du bac) : facture totale,
 * acompte (pourcentage du devis), situation (avancement cumulé du chantier) ou solde (le reste),
 * en tenant compte de ce qui est déjà facturé, brouillons compris et avoirs déduits.
 * `pourcentage` : acompte en % du devis, ou avancement cumulé pour une situation.
 */
export async function facturerDevis(
  devisId: string,
  type: TypeFacture = 'totale',
  pourcentage?: number,
): Promise<Resultat<{ id: string; message: string }>> {
  const ctx = await contexteBureau();
  const f = await lireFacturation(ctx.supabase, devisId);
  if (!f) return { ok: false, erreur: 'Devis introuvable' };
  const d = f.devis;
  const deja = f.deja;
  const reste = Math.max(0, Math.round((100 - deja) * 1000) / 1000);
  const p = pourcentage === undefined ? undefined : nombre(pourcentage);
  const cumulatif = type === 'situation' || type === 'avancement';
  let part: number;
  let cumul = 0;
  if (type === 'totale') part = 100;
  else if (type === 'solde') part = reste;
  else if (type === 'acompte') part = p ?? Math.min(reste, Number(d.conditions.acompte) || 30);
  else if (cumulatif) {
    cumul = p ?? Math.min(100, deja + 30);
    part = cumul - deja;
  } else return { ok: false, erreur: 'Type de facture inconnu' };
  if (!(part > 0) || deja + part > 100.001)
    return { ok: false, erreur: cumulatif ? `L’avancement doit être entre ${nombreBac(deja)} et 100 %` : `Pourcentage entre 0 et ${nombreBac(reste)} %` };

  // Comme le bac : la facture porte des lignes au montant facturé (acompte, situation cumulée,
  // ou les lignes du devis avec la remise et la déduction du déjà facturé pour un solde).
  part = Math.round(part * 100) / 100;
  const lignesDevis = attacherForfaits(f.lignes, d.conditions);
  const lignes = lignesFactureDevis(d, lignesDevis, type, part, deja);
  const res = await ecrireDocument(ctx, {
    genre: 'facture',
    type_facture: type,
    client_id: d.client_id,
    client: d.client,
    objet: d.objet,
    date_document: aujourdhui(),
    echeance: null,
    conditions: {
      ...conditionsReprises(d.conditions, ['forfaits', 'description', 'dateExec', 'bc', 'ao', 'aoLimite', 'aoConsultation', 'aoQuantites', 'delaiJours']),
      lignesAuMontant: true,
    },
    devis_id: devisId,
    remise: 0,
    pourcentage: type === 'acompte' ? part : 0,
    avancement: cumulatif ? cumul : 0,
    avancement_precedent: cumulatif || type === 'solde' ? deja : 0,
    situation_numero: type === 'situation' ? f.situations + 1 : null,
    coefficient: d.coefficient,
    lignes,
  });
  if (!res.ok) return res;
  revaliderVentes();
  return { ok: true, id: res.id, message: `${TITRES_FACTURE[type]} préparée en brouillon` };
}

/** Devis signés qui restent à facturer (fenêtre « Nouvelle facture » : acompte, avancement, situation, solde). */
export async function devisAFacturer(): Promise<{ id: string; numero: string | null; objet: string; clientId: string | null; ht: number; facturePct: number }[]> {
  const ctx = await contexteBureau();
  const lignes = await lireListeDocuments(ctx.supabase, 'devis', aujourdhui());
  return lignes
    .filter((l) => l.statut === 'signe' && (l.facturePct ?? 0) < 100 - 1e-6)
    .map((l) => ({ id: l.id, numero: l.numero, objet: l.objet, clientId: l.clientId, ht: l.ht, facturePct: l.facturePct ?? 0 }));
}

/** Prépare un avoir sur une facture émise : mêmes lignes (facture totale) ou montant facturé par taux de TVA. */
export async function creerAvoir(factureId: string): Promise<Resultat<{ id: string }>> {
  const ctx = await contexteBureau();
  const lu = await lireDocument(ctx.supabase, factureId);
  if (!lu || lu.document.genre !== 'facture' || !lu.document.numero || lu.document.type_facture === 'avoir') return { ok: false, erreur: 'Facture introuvable' };
  const d = lu.document;
  if (d.statut === 'annule') return { ok: false, erreur: 'Cette facture est déjà annulée par un avoir.' };
  const lignesFacture = attacherForfaits(lu.lignes, d.conditions);
  const a = lignesAvoir({ ...d, lignes: lignesFacture }, lignesFacture);
  const res = await ecrireDocument(ctx, {
    genre: 'facture',
    type_facture: 'avoir',
    client_id: d.client_id,
    client: d.client,
    objet: `Avoir sur la facture ${d.numero}`,
    date_document: aujourdhui(),
    echeance: null,
    conditions: conditionsReprises(d.conditions, ['forfaits', 'delaiJours', 'lignesAuMontant']),
    devis_id: d.devis_id,
    facture_id: factureId,
    remise: a.remise,
    pourcentage: 0,
    avancement: 0,
    avancement_precedent: 0,
    coefficient: d.coefficient,
    lignes: a.lignes,
  });
  if (!res.ok) return res;
  revaliderVentes();
  return { ok: true, id: res.id };
}

/** Supprime un brouillon (il n'a pas de numéro : rien ne manque dans la numérotation). */
export async function supprimerDocument(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { data: d } = await supabase.from('documents').select('numero').eq('id', id).maybeSingle();
  if (!d) return { ok: false, erreur: 'Document introuvable' };
  if (d.numero) return { ok: false, erreur: 'Un document numéroté ne se supprime pas.' };
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) return { ok: false, erreur: messageErreur(error.message) };
  revaliderVentes();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Nouveaux brouillons (fenêtre « Nouveau document », /devis/nouveau)
// ---------------------------------------------------------------------------

/** TVA de départ : 10 % (logement), 20 % pour une entreprise ou une collectivité. */
const tvaDepart = (type: string | null | undefined) => (type === 'entreprise' || type === 'collectivite' ? 20 : 10);

export interface BrouillonACreer {
  genre: GenreDocument;
  type_facture?: TypeFacture | null;
  parcours: Parcours;
  client_id: string;
  /** Syndic ou bailleur : immeuble (sites.id) et occupant (nom). */
  site_id?: string | null;
  occupant?: string | null;
  ordre_service?: string | null;
  objet?: string;
  /** Devis de chantier qui répond à un appel d'offres. */
  ao?: { limite?: string | null; consultation?: string | null } | null;
  intervention_id?: string | null;
  contrat_id?: string | null;
}

async function documentNeuf(ctx: Bureau, o: BrouillonACreer): Promise<Resultat<{ doc: DocumentAEnregistrer }>> {
  const { supabase, entreprise } = ctx;
  const reglages = entreprise.facturation ?? {};
  const [{ data: k }, { data: site }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', o.client_id).maybeSingle(),
    o.site_id ? supabase.from('sites').select('id, client_id, adresse, code_postal, ville, copropriete').eq('id', o.site_id).maybeSingle() : { data: null },
  ]);
  if (!k) return { ok: false, erreur: 'Client introuvable' };
  const immeuble = site && site.client_id === k.id ? site : null;
  const tva = tvaDepart(k.type);
  const facture = o.genre === 'facture';
  const ao = !facture && o.parcours === 'chantier' && !!o.ao;
  const conditions: ConditionsDocument = {
    ...conditionsParDefaut(reglages),
    parcours: o.parcours,
    tva,
    majoration: 'normale',
    ...(immeuble ? { siteId: immeuble.id, occupant: o.occupant?.trim() || null } : {}),
    ...(o.ordre_service?.trim() ? { ordreService: o.ordre_service.trim() } : {}),
    ...(o.intervention_id ? { intervention_id: o.intervention_id } : {}),
    ...(o.contrat_id ? { contrat_id: o.contrat_id } : {}),
    ...(ao ? { ao: true, aoLimite: o.ao?.limite || '', aoConsultation: String(o.ao?.consultation ?? '').trim(), aoQuantites: true } : {}),
  };
  if (k.type !== 'particulier') conditions.retenue = false;
  const client = clientDocumentDe(k, aDesImmeubles(k.type) ? immeuble : (immeuble ?? null));
  return {
    ok: true,
    doc: {
      genre: o.genre,
      type_facture: facture ? (o.type_facture ?? 'totale') : null,
      client_id: k.id,
      client,
      objet: String(o.objet ?? '').trim() || (facture ? 'Facture' : 'Devis'),
      date_document: aujourdhui(),
      conditions,
      remise: 0,
      pourcentage: Number(conditions.acompte) || 30,
      avancement: 0,
      avancement_precedent: 0,
      coefficient: null,
      lignes: lignesDeDepart(o.parcours, { ao, rd: reglagesDepannage(reglages), tva }),
    },
  };
}

/** Crée le brouillon choisi dans la fenêtre « Nouveau devis » / « Nouvelle facture » et renvoie son id. */
export async function creerBrouillon(o: BrouillonACreer): Promise<Resultat<{ id: string; message: string }>> {
  const ctx = await contexteBureau();
  const neuf = await documentNeuf(ctx, o);
  if (!neuf.ok) return neuf;
  const r = await ecrireDocument(ctx, neuf.doc);
  if (!r.ok) return r;
  revaliderVentes();
  const ao = !!neuf.doc.conditions.ao;
  return {
    ok: true,
    id: r.id,
    message: ao ? 'Appel d’offres créé : importez le cadre du client ou ajoutez vos ouvrages' : 'Brouillon créé : cherchez vos ouvrages dans la recherche rapide',
  };
}

/** « 14/09/2026 » → « 2026-09-14 » */
const versIso = (d?: string) => {
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : aujourdhui();
};
const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export interface Preremplissage {
  client?: string;
  site?: string;
  genre?: string;
  type?: string;
  parcours?: string;
  intervention?: string;
  import?: string;
}

/**
 * /devis/nouveau : brouillon prérempli selon l'adresse (contrat n° 4) — client (et immeuble), genre,
 * type de facture, type de devis, intervention (client, objet, déplacement et main d'œuvre selon la fiche,
 * pièces aux prix du catalogue) ou document importé (champs lus).
 */
export async function creerDocumentPrerempli(p: Preremplissage): Promise<Resultat<{ id: string; message: string }>> {
  const ctx = await contexteBureau();
  const { supabase, entreprise } = ctx;
  const reglages = entreprise.facturation ?? {};
  const rd = reglagesDepannage(reglages);
  const rp = reglagesPrix(reglages);
  const genre: GenreDocument = p.genre === 'facture' ? 'facture' : 'devis';
  const typeFacture = (['totale', 'acompte', 'avancement', 'situation', 'solde', 'avoir'] as const).find((t) => t === p.type) ?? 'totale';
  const parcoursDemande = (['depannage', 'chantier', 'contrat'] as const).find((x) => x === p.parcours);
  let doc: DocumentAEnregistrer;
  let message = 'Brouillon créé : cherchez vos ouvrages dans la recherche rapide';

  if (p.import) {
    const { data: imp } = await supabase.from('imports').select('champs').eq('id', p.import).maybeSingle();
    if (!imp) return { ok: false, erreur: 'Document importé introuvable' };
    const c = (imp.champs ?? {}) as ChampsLus;
    const g = c.genre ?? genre;
    const pro = /\b(SAS|SARL|SCI|SA|EURL|syndic|cabinet|soci[ée]t[ée])\b/i.test(c.client ?? '') || !!c.siret;
    const m = (c.client ?? '').match(/^(Mme et M\.|Mme|M\.|Monsieur|Madame)\s+(.*)$/i);
    const base = clientVide();
    const client: ClientDocument = {
      ...base,
      type: pro ? 'pro' : 'particulier',
      civ: m ? (/^(Madame|Mme)$/i.test(m[1]) ? 'Mme' : /^Mme et/i.test(m[1]) ? 'Mme et M.' : 'M.') : base.civ,
      nom: pro ? '' : (m?.[2] ?? c.client ?? '').replace(/\b(\p{Lu})(\p{Lu}+)\b/gu, (_, a: string, b: string) => a + b.toLowerCase()),
      raison: pro ? (c.client ?? '') : '',
      siret: c.siret ?? '',
      tel: c.telephone ?? '',
      email: c.email ?? '',
      adresse: [c.adresse, c.ville].filter(Boolean).join(', '),
    };
    const conditions = conditionsParDefaut(reglages);
    if (c.acompte) conditions.acompte = String(Math.round(nombre(c.acompte)) || 30);
    if (c.validite) conditions.validite = c.validite;
    doc = {
      genre: g,
      type_facture: g === 'facture' ? 'totale' : null,
      client,
      objet: c.objet ?? '',
      date_document: versIso(c.date),
      conditions,
      remise: 0,
      pourcentage: 30,
      avancement: 0,
      avancement_precedent: 0,
      coefficient: null,
      lignes: (c.lignes ?? []).map((l) => ({
        designation: l.designation,
        quantite: Number(l.quantite) || 1,
        unite: l.unite || 'u',
        prix_unitaire: Number(l.prix_unitaire) || 0,
        tva: [5.5, 10, 20].includes(Number(l.tva)) ? Number(l.tva) : Number(c.tva) || 10,
      })),
      origine: 'import',
      import_id: p.import,
    };
    message = 'Prérempli depuis le document importé : vérifiez les lignes et les prix';
  } else if (p.intervention) {
    const { data: i } = await supabase
      .from('interventions')
      .select(
        'id, type, motif, ordre_service, duree_prevue, client_id, site_id, contrat_id, occupant:occupants(nom), fiches(envoyee_le, duree_minutes, valeurs, cree_le, fournitures(designation, reference, quantite, unite))',
      )
      .eq('id', p.intervention)
      .maybeSingle();
    if (!i) return { ok: false, erreur: 'Intervention introuvable' };
    const famille = familleIntervention(i.type as string);
    const parcours: Parcours = parcoursDemande ?? (i.contrat_id ? 'contrat' : famille === 'chantier' ? 'chantier' : 'depannage');
    type Fiche = { envoyee_le: string | null; duree_minutes: number | null; valeurs: { travaux?: string; a_prevoir?: string } | null; cree_le: string; fournitures: { designation: string; reference: string | null; quantite: number; unite: string | null }[] };
    const fiches = ((i.fiches ?? []) as Fiche[]).sort((a, b) => a.cree_le.localeCompare(b.cree_le));
    const envoyees = fiches.filter((f) => f.envoyee_le);
    const neuf = await documentNeuf(ctx, {
      genre,
      type_facture: typeFacture,
      parcours,
      client_id: i.client_id as string,
      site_id: i.site_id as string | null,
      occupant: (i.occupant as unknown as { nom: string } | null)?.nom ?? null,
      ordre_service: i.ordre_service as string | null,
      intervention_id: i.id as string,
      contrat_id: i.contrat_id as string | null,
    });
    if (!neuf.ok) return neuf;
    doc = neuf.doc;
    const tva = doc.conditions.tva ?? 10;
    if (genre === 'facture') {
      // Facture depuis la fiche : déplacement et main d'œuvre (durée de la fiche), puis les pièces notées.
      const minutes = envoyees.reduce((t, f) => t + (f.duree_minutes ?? 0), 0);
      const heures = minutes ? Math.max(0.25, Math.round((minutes / 60) * 4) / 4) : Number(i.duree_prevue) || 1;
      const lignes: LigneDocument[] = famille === 'chantier' ? [] : [ligneForfait('depl', { rd, tva }), ligneForfait('heure', { rd, tva, quantite: heures })];
      const pieces = envoyees.flatMap((f) => f.fournitures ?? []);
      if (pieces.length) {
        const { data: catalogue } = await supabase.from('articles').select('id, designation, reference, unite, prix_vente, prix_achat').eq('actif', true);
        for (const piece of pieces) {
          const a = (catalogue ?? []).find(
            (x) =>
              (piece.reference?.trim() && x.reference && sansAccent(x.reference) === sansAccent(piece.reference)) ||
              sansAccent(x.designation) === sansAccent(piece.designation),
          );
          const achat = a ? Number(a.prix_achat) || 0 : 0;
          const l: LigneDocument = {
            designation: piece.designation,
            quantite: Number(piece.quantite) || 1,
            unite: a?.unite ?? piece.unite ?? 'u',
            prix_unitaire: a && !achat ? Number(a.prix_vente) || 0 : 0,
            tva,
            article_id: a?.id ?? null,
            achat: achat || null,
            heures: null,
            prix_calcule: achat > 0,
            reference: piece.reference ?? null,
          };
          lignes.push({ ...l, prix_unitaire: prixLigne(l, rp.coefficient, rp) });
        }
      }
      if (lignes.length) doc.lignes = lignes;
      const travaux = envoyees.map((f) => f.valeurs?.travaux?.trim()).filter(Boolean).at(-1);
      doc.objet = `${i.motif}${travaux ? ` · ${travaux}` : ''}`.slice(0, 300);
      message = 'Facture préparée depuis la fiche : durée et pièces reprises';
    } else {
      const reste = [...fiches].reverse().find((f) => f.valeurs?.a_prevoir?.trim())?.valeurs?.a_prevoir?.trim();
      doc.objet = (reste || (i.motif as string)).slice(0, 300);
      message = 'Devis préparé depuis l’intervention';
    }
  } else if (p.client) {
    const neuf = await documentNeuf(ctx, { genre, type_facture: typeFacture, parcours: parcoursDemande ?? 'depannage', client_id: p.client, site_id: p.site ?? null });
    if (!neuf.ok) return neuf;
    doc = neuf.doc;
  } else {
    const conditions: ConditionsDocument = { ...conditionsParDefaut(reglages), parcours: parcoursDemande ?? 'depannage', tva: 10, majoration: 'normale' };
    doc = {
      genre,
      type_facture: genre === 'facture' ? typeFacture : null,
      client: clientVide(),
      objet: genre === 'facture' ? 'Facture' : 'Devis',
      date_document: aujourdhui(),
      conditions,
      remise: 0,
      pourcentage: 30,
      avancement: 0,
      avancement_precedent: 0,
      coefficient: null,
      lignes: lignesDeDepart(conditions.parcours!, { rd, tva: 10 }),
    };
  }
  const r = await ecrireDocument(ctx, doc);
  if (!r.ok) return r;
  revaliderVentes();
  return { ok: true, id: r.id, message };
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
  revalidatePath('/produits-services');
  return { ok: true, id: data.id as string };
}

export async function retirerArticle(id: string): Promise<Resultat> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('articles').update({ actif: false }).eq('id', id);
  if (error) return { ok: false, erreur: 'L’article n’a pas pu être retiré.' };
  revalidatePath('/devis/catalogue');
  revalidatePath('/produits-services');
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
  revalidatePath('/produits-services');
  return { ok: true, nombre: propres.length };
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

