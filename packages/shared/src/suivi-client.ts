// « Mes clients » : ce qu'il reste à faire pour chaque client, son état
// (Urgent, N choses à faire, À jour) et ses chiffres de l'année.
// Les règles et les phrases sont celles du bac à sable (aFaire, 42-clients-equipe.js),
// mot pour mot ; seuls les liens changent (adresses de la production).

import { ecartJours } from './achats.ts';
import { etatContrat, limitePreavis, periodeEnCours, visitesAPlanifier, visitesAVenir, type Contrat, type InterventionContrat } from './contrats.ts';
import type { GenreDocument, StatutDocument, TypeFacture } from './devis.ts';
import { TITRES_FACTURE } from './devis.ts';
import { ajouterJours } from './format.ts';
import { LIBELLE_RESULTAT, type Ton } from './libelles.ts';
import type { FacturationClient, ResultatFiche, StatutIntervention, TypeClient, TypeIntervention, Urgence } from './types.ts';

export type NiveauSuivi = 'urgent' | 'afaire' | 'attente';

/**
 * Boutons qui créent quelque chose dans le bac : la page peut les brancher sur
 * l'action serveur (dans un <form>) au lieu de suivre `lien`.
 * - renouveler : preparerRenouvellement(contrat) prépare le devis de renouvellement et l'ouvre ;
 * - planifier-visites : planifierVisites(contrat) crée les visites à placer au planning ;
 * - facturer-intervention : facture de l'intervention validée (devis signé, ou déplacement + main-d'œuvre + pièces) ;
 * - devis-intervention : devis demandé par le technicien après son passage.
 */
export type GesteAFaire = 'renouveler' | 'planifier-visites' | 'facturer-intervention' | 'devis-intervention';

export interface ChoseAFaire {
  /** Clé unique et stable (listes React) : « regle:id », par exemple « retard:<facture> », « valider:<intervention> ». */
  cle: string;
  niveau: NiveauSuivi;
  texte: string;
  /** Libellé exact du bouton du bac, et page de la production où il mène. */
  bouton: string;
  lien: string;
  /** `id` : contrat (renouveler, planifier-visites) ou intervention (facturer-intervention, devis-intervention). */
  geste?: { action: GesteAFaire; id: string };
}

export interface ClientSuivi {
  id: string;
  type: TypeClient;
  facturation?: FacturationClient | null;
  /** Nombre d'immeubles (adresses) du client. */
  immeubles: number;
}

export interface FicheSuivi {
  resultat: ResultatFiche | null;
  fin: string | null;
  /** Envoi de la fiche au bureau (« … aujourd’hui à 09:55 »). */
  envoyee_le?: string | null;
  /** Technicien qui a rempli la fiche, en nom court (« Karim B. »). */
  auteur?: string | null;
  /** Ce qu'il reste à faire, noté par le technicien (valeurs.a_prevoir, sinon réserves). */
  reste?: string | null;
  /** Arrivée sur place (« Sur place depuis 09:05 » sur la fiche client). */
  debut?: string | null;
}

export interface InterventionSuivi {
  id: string;
  motif: string;
  type: TypeIntervention;
  statut: StatutIntervention;
  urgence: Urgence;
  date_prevue: string | null;
  /** Dernier jour d'un chantier sur plusieurs jours. */
  date_fin?: string | null;
  /** Date souhaitée (visite d'entretien pas encore placée). */
  souhaitee_le?: string | null;
  cree_le: string;
  devis_id: string | null;
  /** Adresse de l'immeuble et occupant, pour les syndics et bailleurs. */
  adresse: string | null;
  occupant: string | null;
  /** Techniciens affectés, en nom court (« Karim B. »). */
  techniciens: string[];
  /** Dernière fiche envoyée. */
  fiche: FicheSuivi | null;
}

/**
 * Liens rangés dans documents.conditions (jsonb, pas de colonne en base) :
 * - intervention_id : intervention d'où vient le devis ou la facture (« Préparer le devis », « Créer la facture ») ;
 * - contrat_id : contrat dont le devis est le renouvellement (n'est jamais « signé sans intervention »).
 */
export interface ConditionsSuivi {
  ao?: boolean;
  aoLimite?: string;
  aoConsultation?: string;
  intervention_id?: string;
  contrat_id?: string;
}

export interface DocumentSuivi {
  id: string;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  numero: string | null;
  statut: StatutDocument;
  objet: string;
  date_document: string;
  echeance: string | null;
  envoye_le: string | null;
  /** Validation (un devis validé passe « envoyé ») : sert de date d'envoi à défaut d'envoye_le. */
  finalise_le?: string | null;
  signe_le: string | null;
  paye_le: string | null;
  total_ht: number;
  net_a_payer: number;
  devis_id: string | null;
  /** Avoir : facture d'origine, et son numéro (« L’avoir sur la facture FA-2026-0012 »). */
  facture_id?: string | null;
  facture_numero?: string | null;
  conditions?: ConditionsSuivi | null;
}

/** Un contrat d'entretien vu par les choses à faire (voir contratPourSuivi). */
export interface ContratSuivi {
  id: string;
  client_id: string;
  site_id: string | null;
  objet: string;
  /** Adresse de l'immeuble du contrat (sites.adresse). */
  adresse: string | null;
  /** Étiquette d'etatContrat : « Préavis dépassé », « À renouveler », « Renouvellement signé »… */
  etat: string;
  /** Fin de la période en cours et dernier jour pour envoyer la proposition (AAAA-MM-JJ). */
  fin: string;
  limite: string;
  /** Dates des visites sans intervention (et pas après la fin d'un contrat qui s'arrête). */
  visites: string[];
  /** Devis de renouvellement préparé. */
  renouvellement_id: string | null;
}

/** Contrat tel que le lit chargerContrats (apps/web/src/lib/contrats.ts). */
export type ContratAvecSuivi = Pick<
  Contrat,
  'id' | 'client_id' | 'site_id' | 'objet' | 'debut' | 'fin' | 'tacite' | 'preavis_mois' | 'visites_par_an' | 'derniere_visite'
> & {
  site?: { adresse: string } | null;
  interventions: InterventionContrat[];
  renouvellement: { id: string; numero: string | null; statut: StatutDocument } | null;
};

/** État du jour d'un contrat, visites à placer et devis de renouvellement. */
export function contratPourSuivi(c: ContratAvecSuivi, jour: string): ContratSuivi {
  const periode = periodeEnCours(c, jour);
  return {
    id: c.id,
    client_id: c.client_id,
    site_id: c.site_id,
    objet: c.objet,
    adresse: c.site?.adresse ?? null,
    etat: etatContrat(c, c.renouvellement, jour).etiquette,
    fin: periode.fin,
    limite: limitePreavis(periode.fin, c.preavis_mois),
    visites: visitesAPlanifier(visitesAVenir(c, c.interventions, jour)).map((v) => v.date),
    renouvellement_id: c.renouvellement?.id ?? null,
  };
}

/** Syndics et bailleurs : on intervient dans leurs immeubles, chez leurs occupants. */
export function aDesImmeubles(type: TypeClient): boolean {
  return type === 'syndic' || type === 'bailleur';
}

// ---------- Formats du bac (dates jj/mm/aaaa, montants avec espaces insécables) ----------

const PARIS = 'Europe/Paris';
const fmtJour = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmt2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Jour (AAAA-MM-JJ) d'une date ou d'un horodatage, à l'heure de Paris. */
export function jourParis(v: string | null | undefined): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v.slice(0, 10) : fmtJour.format(t);
}
/** « 2026-09-24 » → « 24/09/2026 » (comme ddmm() du bac). */
export function jjmmaaaaBac(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
/** « 2 612,40 € », ou « 4 518 € » avec `decimales` = 0 (eur() et eur0() du bac, espaces insécables). */
export function eurBac(n: number, decimales: 0 | 2 = 2): string {
  const v = Object.is(n, -0) || !n ? 0 : n;
  return `${(decimales ? fmt2 : fmt0).format(v)}\u00a0€`;
}
/** « 1 chose », « 3 choses » */
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
/** « dans 13 jours » ou « aujourd’hui » */
const dansJours = (j: number) => (j > 0 ? `dans ${pluriel(j, 'jour', 'jours')}` : 'aujourd’hui');
/** « aujourd’hui à 09:55 » ou « le 02/10/2026 à 14:10 » (quandTexte du bac). */
function quand(ts: string, aujourdhui: string): string {
  const j = jourParis(ts);
  return `${j === aujourdhui ? 'aujourd’hui' : `le ${jjmmaaaaBac(j)}`} à ${fmtHeure.format(Date.parse(ts))}`;
}
const guill = (s: string) => `«\u00a0${s}\u00a0»`;
const sansPoint = (s: string) => s.trim().replace(/[.\s]+$/, '');

/** 1234.5 → « 1 235 € » */
export function euroRond(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} €`;
}

// ---------- Factures et devis (mêmes règles que le bac et l'écran Chiffres) ----------

/** Titre du document : « Devis », « Facture », « Facture d’acompte », « Avoir »… */
const libDoc = (d: Pick<DocumentSuivi, 'genre' | 'type_facture'>) => (d.genre === 'devis' ? 'Devis' : TITRES_FACTURE[d.type_facture ?? 'totale']);
/** Un document créé sans objet garde « Devis » ou « Facture » comme objet : on dit « sans titre ». */
const objetDoc = (d: DocumentSuivi) => (!d.objet.trim() || d.objet.trim() === libDoc(d) ? 'sans titre' : guill(d.objet.trim()));
/** Objet entre guillemets, « Devis » s'il est vide (le bac remplit toujours l'objet). */
const objetCite = (d: DocumentSuivi) => guill(d.objet.trim() || libDoc(d));
const laFacture = (d: DocumentSuivi) => (d.numero ? `La facture ${d.numero}` : 'La facture');

/** Facture ou avoir émis (validé), payé ou non. */
export const factureEmise = (d: Pick<DocumentSuivi, 'genre' | 'statut'>) => d.genre === 'facture' && (d.statut === 'a_encaisser' || d.statut === 'payee');
const avoirsSur = (f: DocumentSuivi, D: DocumentSuivi[]) => D.filter((a) => a.type_facture === 'avoir' && factureEmise(a) && a.facture_id === f.id);
/** Ce que le client doit encore sur une facture, avoirs émis déduits (TTC). */
export function resteDu(f: DocumentSuivi, D: DocumentSuivi[]): number {
  return Math.max(0, f.net_a_payer - avoirsSur(f, D).reduce((s, a) => s + Math.abs(a.net_a_payer), 0));
}
/** Facture validée qui attend son paiement. */
export function factureAEncaisser(f: DocumentSuivi, D: DocumentSuivi[]): boolean {
  return f.genre === 'facture' && f.type_facture !== 'avoir' && f.statut === 'a_encaisser' && resteDu(f, D) > 0.005;
}
export function factureEnRetard(f: DocumentSuivi, D: DocumentSuivi[], aujourdhui: string): boolean {
  return factureAEncaisser(f, D) && !!f.echeance && f.echeance < aujourdhui;
}
/** Jour d'envoi d'un devis : envoi par e-mail, sinon validation, sinon date du document. */
export const devisEnvoyeLe = (d: DocumentSuivi) => jourParis(d.envoye_le) || jourParis(d.finalise_le) || d.date_document;
/** Devis envoyé depuis 15 jours ou moins : on attend la réponse (au-delà, il faut relancer). */
export const devisEnAttente = (d: DocumentSuivi, aujourdhui: string) =>
  d.genre === 'devis' && d.statut === 'envoye' && ecartJours(devisEnvoyeLe(d), aujourdhui) <= 15;

/** Intervention d'où vient un devis ou une facture (documents.conditions.intervention_id). */
export function interventionDuDocument(d: Pick<DocumentSuivi, 'conditions'>): string | null {
  return d.conditions?.intervention_id ?? null;
}

/** Le document vient-il de cette intervention ? (dans le bac : document.interv) */
function vientDe(d: DocumentSuivi, i: InterventionSuivi, D: DocumentSuivi[]): boolean {
  if (interventionDuDocument(d) === i.id) return true;
  if (d.genre === 'devis') return i.devis_id === d.id;
  // Une facture faite depuis le devis de l'intervention.
  if (!d.devis_id) return false;
  return d.devis_id === i.devis_id || D.some((x) => x.id === d.devis_id && interventionDuDocument(x) === i.id);
}
/** Le devis de l'intervention : pas refusé, le signé d'abord. */
function devisDe(i: InterventionSuivi, D: DocumentSuivi[]): DocumentSuivi | undefined {
  return D.filter((d) => d.genre === 'devis' && d.statut !== 'refuse' && vientDe(d, i, D)).sort((a, b) => Number(b.statut === 'signe') - Number(a.statut === 'signe'))[0];
}
/** Part du devis (en %) déjà facturée par des factures émises, avoirs déduits. */
function partEmise(dv: DocumentSuivi, D: DocumentSuivi[]): number {
  const factures = D.filter((x) => factureEmise(x) && x.type_facture !== 'avoir' && x.devis_id === dv.id);
  if (dv.total_ht <= 0.005) return factures.length ? 100 : 0;
  const part = factures.reduce((s, x) => {
    const ht = Math.abs(x.total_ht);
    const avoirs = avoirsSur(x, D).reduce((t, a) => t + Math.abs(a.total_ht), 0);
    return s + (ht / dv.total_ht) * 100 * (ht > 0.005 ? Math.max(0, 1 - avoirs / ht) : 1);
  }, 0);
  return Math.round(part * 1000) / 1000;
}
/** Intervention déjà facturée en entier : son devis signé à 100 %, ou une facture faite directement. */
function dejaToutFacture(i: InterventionSuivi, D: DocumentSuivi[]): boolean {
  const dv = devisDe(i, D);
  if (dv && dv.statut === 'signe' && partEmise(dv, D) >= 99.99) return true;
  return D.some(
    (d) =>
      interventionDuDocument(d) === i.id &&
      factureEmise(d) &&
      d.type_facture !== 'acompte' &&
      d.type_facture !== 'avoir' &&
      !d.devis_id &&
      d.net_a_payer - avoirsSur(d, D).reduce((s, a) => s + Math.abs(a.net_a_payer), 0) > 0.005,
  );
}
/** Devis de renouvellement d'un contrat (dans le bac : parcours « contrat »). */
function estRenouvellement(d: DocumentSuivi, contrats: ContratSuivi[]): boolean {
  return !!d.conditions?.contrat_id || contrats.some((c) => c.renouvellement_id === d.id) || /^Renouvellement du contrat /.test(d.objet);
}

// ---------- Les choses à faire d'un client ----------

/**
 * Ce qu'il reste à faire pour un client (aFaire du bac) : l'urgent, puis le reste,
 * puis ce qu'on attend (« On attend », ne compte pas dans les choses à faire).
 * L'ordre est celui du bac, sans tri : un appel d'offres urgent reste parmi les « À faire ».
 *
 * Liens (à prendre en charge par les pages de destination) :
 * - /devis/<id> : voir la facture, le devis, terminer un brouillon, préparer la réponse ;
 * - /interventions?fiche=<id> : choisir une date ou un technicien, voir et valider, voir l'intervention ;
 *   &facturer=1 : « Créer la facture » ; &chiffrer=1 : « Préparer le devis » ;
 * - /clients/<id>?immeuble=nouveau : « Ajouter un immeuble » ;
 * - /clients/immeubles?site=<site>&contrat=<id> (?client=<id>&contrat=<id> sans immeuble) : contrat à renouveler, visites à planifier.
 */
export function chosesAFaire(
  c: ClientSuivi,
  interventions: InterventionSuivi[],
  documents: DocumentSuivi[],
  aujourdhui: string,
  contrats: ContratSuivi[] = [],
): ChoseAFaire[] {
  const L: ChoseAFaire[] = [];
  const ajoute = (cle: string, niveau: NiveauSuivi, texte: string, bouton: string, lien: string, geste?: ChoseAFaire['geste']) =>
    L.push({ cle, niveau, texte, bouton, lien, ...(geste ? { geste } : {}) });
  const imms = aDesImmeubles(c.type);
  const I = interventions;
  const D = documents;
  const jours = (iso: string) => ecartJours(aujourdhui, iso);
  const ddmm = (iso: string) => jjmmaaaaBac(jourParis(iso));
  const parDate =
    <T>(cle: (x: T) => string | null | undefined) =>
    (a: T, b: T) =>
      (cle(a) ?? '').localeCompare(cle(b) ?? '');

  /** « chez Mme Martin (12 rue de la Pompe) », seulement pour un syndic ou un bailleur. */
  const lieu = (i: InterventionSuivi) => {
    if (!imms || !i.adresse) return '';
    if (/parties communes/i.test(i.occupant ?? '')) return ` dans les parties communes du ${i.adresse}`;
    return i.occupant ? ` chez ${i.occupant} (${i.adresse})` : ` au ${i.adresse}`;
  };
  const qui = (i: InterventionSuivi) => {
    if (i.fiche?.auteur) return { t: i.fiche.auteur, n: 1 };
    const n = i.techniciens.length;
    return n ? { t: i.techniciens.join(', '), n } : { t: 'Le technicien', n: 1 };
  };
  const duBat = (ct: ContratSuivi) => (imms && ct.adresse ? ` du ${ct.adresse}` : '');
  const pasDeDate = (i: InterventionSuivi) =>
    i.date_prevue ? ` n’a pas encore de technicien (date prévue : ${ddmm(i.date_prevue)}).` : ` n’a pas encore de date${i.techniciens.length ? '.' : ' ni de technicien.'}`;
  const boutonDate = (i: InterventionSuivi) => (i.date_prevue ? 'Choisir un technicien' : 'Choisir une date');
  const fiche = (i: InterventionSuivi) => `/interventions?fiche=${i.id}`;
  const doc = (d: { id: string }) => `/devis/${d.id}`;
  const contrat = (ct: ContratSuivi) =>
    ct.site_id ? `/clients/immeubles?site=${ct.site_id}&contrat=${ct.id}` : `/clients/immeubles?client=${c.id}&contrat=${ct.id}`;

  // Urgent
  D.filter((f) => factureEnRetard(f, D, aujourdhui))
    .sort(parDate((f) => f.echeance))
    .forEach((f) => {
      const n = -jours(f.echeance!);
      ajoute(
        `retard:${f.id}`,
        'urgent',
        `${laFacture(f)} de ${eurBac(resteDu(f, D))}\u00a0TTC devait être payée le ${ddmm(f.echeance!)} : ${pluriel(n, 'jour', 'jours')} de retard.`,
        'Voir la facture',
        doc(f),
      );
    });
  I.filter((i) => i.statut === 'a_planifier' && i.urgence !== 'normale').forEach((i) => {
    const reste = i.date_prevue
      ? `prévue le ${ddmm(i.date_prevue)}, pas encore de technicien.`
      : `pas encore de date${i.techniciens.length ? '.' : ' ni de technicien.'}`;
    ajoute(
      `urgence:${i.id}`,
      'urgent',
      `${i.urgence === 'astreinte' ? 'Intervention d’astreinte ' : 'Intervention urgente '}${guill(i.motif)}${lieu(i)} : ${reste}`,
      boutonDate(i),
      fiche(i),
    );
  });
  contrats.forEach((ct) => {
    if (ct.etat !== 'Préavis dépassé') return;
    ajoute(
      `preavis:${ct.id}`,
      'urgent',
      `Le contrat d’entretien ${guill(ct.objet)}${duBat(ct)} s’arrête le ${ddmm(ct.fin)}, et la date pour le renouveler (${ddmm(ct.limite)}) est passée.`,
      'Proposer le renouvellement',
      contrat(ct),
      { action: 'renouveler', id: ct.id },
    );
  });

  // À faire
  if (imms && c.immeubles === 0) {
    ajoute(`immeubles:${c.id}`, 'afaire', 'Ajoutez ses immeubles pour pouvoir créer des interventions.', 'Ajouter un immeuble', `/clients/${c.id}?immeuble=nouveau`);
  }
  I.filter((i) => i.statut === 'terminee').forEach((i) => {
    const q = qui(i);
    ajoute(
      `valider:${i.id}`,
      'afaire',
      `${q.t}${q.n > 1 ? ' ont terminé ' : ' a terminé '}${guill(i.motif)}${lieu(i)}${i.fiche?.envoyee_le ? ` ${quand(i.fiche.envoyee_le, aujourdhui)}` : ''}. La fiche attend votre validation.`,
      'Voir et valider',
      fiche(i),
    );
  });
  I.filter(
    (i) => i.statut === 'validee' && !dejaToutFacture(i, D) && !D.some((d) => d.genre === 'facture' && d.statut === 'brouillon' && vientDe(d, i, D)),
  ).forEach((i) => {
    const fait = i.date_fin || i.date_prevue;
    const mensuel = c.facturation === 'mensuel';
    ajoute(
      `facturer:${i.id}`,
      'afaire',
      `${guill(i.motif)}${lieu(i)}${fait ? `, fait le ${ddmm(fait)},` : ''} est validé : il reste à ${mensuel ? 'le mettre sur le relevé du mois.' : 'le facturer.'}`,
      mensuel ? 'Voir l’intervention' : 'Créer la facture',
      mensuel ? fiche(i) : `${fiche(i)}&facturer=1`,
      mensuel ? undefined : { action: 'facturer-intervention', id: i.id },
    );
  });
  I.filter((i) => i.fiche?.resultat === 'devis_a_etablir' && i.statut !== 'terminee' && i.statut !== 'a_reprendre').forEach((i) => {
    if (D.some((d) => d.genre === 'devis' && vientDe(d, i, D))) return;
    // Devis fait à la main pour ce client depuis le passage, sans lien à une intervention : la demande est traitée.
    const passage = i.date_prevue || jourParis(i.fiche?.fin) || jourParis(i.cree_le);
    const libre = (d: DocumentSuivi) => !interventionDuDocument(d) && !I.some((j) => j.devis_id === d.id);
    if (D.some((d) => d.genre === 'devis' && libre(d) && d.date_document >= passage)) return;
    const q = qui(i);
    ajoute(
      `devis-demande:${i.id}`,
      'afaire',
      `${q.t}${q.n > 1 ? ' demandent un devis après leur passage' : ' demande un devis après son passage'}${i.date_prevue ? ` du ${ddmm(i.date_prevue)}` : ''} : ${sansPoint(i.fiche?.reste || i.motif)}.`,
      'Préparer le devis',
      `${fiche(i)}&chiffrer=1`,
      { action: 'devis-intervention', id: i.id },
    );
  });
  D.filter((d) => d.genre === 'devis' && d.statut === 'brouillon' && !d.conditions?.ao).forEach((d) => {
    ajoute(`devis-brouillon:${d.id}`, 'afaire', `Le devis ${objetDoc(d)} est commencé mais pas encore envoyé.`, 'Terminer le devis', doc(d));
  });
  D.filter((d) => d.genre === 'facture' && d.statut === 'brouillon').forEach((d) => {
    if (d.type_facture === 'avoir') {
      const numero = d.facture_numero ?? D.find((o) => o.id === d.facture_id)?.numero;
      ajoute(
        `facture-brouillon:${d.id}`,
        'afaire',
        `L’avoir ${numero ? `sur la facture ${numero}` : objetDoc(d)} est préparé mais pas encore validé.`,
        'Terminer l’avoir',
        doc(d),
      );
    } else {
      const iv = I.find((i) => vientDe(d, i, D));
      const de = iv ? `de ${guill(iv.motif)}${lieu(iv)}` : objetDoc(d) === 'sans titre' ? 'sans titre' : `de ${objetDoc(d)}`;
      ajoute(`facture-brouillon:${d.id}`, 'afaire', `La ${libDoc(d).toLowerCase()} ${de} est préparée mais pas encore envoyée.`, 'Terminer la facture', doc(d));
    }
  });
  D.filter((d) => d.genre === 'devis' && d.statut === 'envoye' && !devisEnAttente(d, aujourdhui)).forEach((d) => {
    ajoute(
      `relancer:${d.id}`,
      'afaire',
      `Le devis ${objetCite(d)} (${eurBac(d.total_ht, 0)}\u00a0HT) a été envoyé le ${ddmm(devisEnvoyeLe(d))} : pas encore de réponse. Pensez à relancer.`,
      'Voir le devis',
      doc(d),
    );
  });
  D.filter(
    (d) =>
      d.genre === 'devis' &&
      d.statut === 'signe' &&
      !estRenouvellement(d, contrats) &&
      !I.some((i) => i.devis_id === d.id || interventionDuDocument(d) === i.id) &&
      partEmise(d, D) < 100,
  ).forEach((d) => {
    ajoute(
      `devis-signe:${d.id}`,
      'afaire',
      `Le devis ${objetCite(d)} (${eurBac(d.total_ht, 0)}\u00a0HT) est signé, mais aucune intervention n’est encore prévue.`,
      'Voir le devis',
      doc(d),
    );
  });
  I.filter((i) => i.statut === 'a_planifier' && i.urgence === 'normale' && (!i.souhaitee_le || jours(i.souhaitee_le) <= 30))
    .sort(parDate((i) => i.souhaitee_le))
    .forEach((i) => {
      ajoute(
        `planifier:${i.id}`,
        'afaire',
        `${guill(i.motif)}${lieu(i)}${pasDeDate(i)}${i.souhaitee_le && !i.date_prevue ? ` Date souhaitée : vers le ${ddmm(i.souhaitee_le)}.` : ''}`,
        boutonDate(i),
        fiche(i),
      );
    });
  contrats.forEach((ct) => {
    const v = ct.visites.filter((d) => jours(d) <= 30);
    if (!v.length) return;
    ajoute(
      `visites:${ct.id}`,
      'afaire',
      `Une visite d’entretien du contrat ${guill(ct.objet)}${imms && ct.adresse ? ` (${ct.adresse})` : ''}${jours(v[0]) < 0 ? ' était prévue' : ' est prévue'} vers le ${ddmm(v[0])} et n’est pas encore au planning.`,
      'Planifier les visites',
      contrat(ct),
      { action: 'planifier-visites', id: ct.id },
    );
  });
  contrats.forEach((ct) => {
    if (ct.etat === 'À renouveler') {
      ajoute(
        `renouveler:${ct.id}`,
        'afaire',
        `Le contrat d’entretien ${guill(ct.objet)}${duBat(ct)} est à renouveler : envoyez la proposition avant le ${ddmm(ct.limite)} (${dansJours(jours(ct.limite))}).`,
        'Préparer le renouvellement',
        contrat(ct),
        { action: 'renouveler', id: ct.id },
      );
    } else if (ct.etat === 'Renouvellement signé' && ct.renouvellement_id) {
      ajoute(
        `renouvellement-signe:${ct.id}`,
        'afaire',
        `Le renouvellement du contrat ${guill(ct.objet)}${duBat(ct)} est signé : il reste à l’enregistrer sur le contrat.`,
        'Voir le devis',
        doc({ id: ct.renouvellement_id }),
      );
    }
  });
  D.filter((d) => d.genre === 'devis' && d.statut === 'brouillon' && !!d.conditions?.ao)
    .sort((a, b) => (a.conditions?.aoLimite || '9999').localeCompare(b.conditions?.aoLimite || '9999'))
    .forEach((d) => {
      const limite = /^\d{4}-\d{2}-\d{2}$/.test(d.conditions?.aoLimite ?? '') ? d.conditions!.aoLimite! : null;
      const j = limite ? jours(limite) : null;
      const nom = guill(d.objet.trim() || d.conditions?.aoConsultation || 'Devis');
      ajoute(
        `appel-offres:${d.id}`,
        j !== null && j <= 3 ? 'urgent' : 'afaire',
        `Appel d’offres ${nom}${
          j === null
            ? ' : réponse à préparer.'
            : j < 0
              ? ` : la date limite du ${ddmm(limite!)} est passée.`
              : ` : réponse à rendre avant le ${ddmm(limite!)} (${dansJours(j)}).`
        }`,
        'Préparer la réponse',
        doc(d),
      );
    });

  // On attend (ne compte pas dans les choses à faire)
  D.filter((f) => factureAEncaisser(f, D) && !factureEnRetard(f, D, aujourdhui))
    .sort(parDate((f) => f.echeance))
    .forEach((f) => {
      ajoute(
        `attente-paiement:${f.id}`,
        'attente',
        `${laFacture(f)} de ${eurBac(resteDu(f, D))}\u00a0TTC ${f.echeance ? `est à payer avant le ${ddmm(f.echeance)}.` : 'attend son paiement.'}`,
        'Voir la facture',
        doc(f),
      );
    });
  D.filter((d) => devisEnAttente(d, aujourdhui)).forEach((d) => {
    ajoute(
      `attente-reponse:${d.id}`,
      'attente',
      `Le devis ${objetCite(d)} (${eurBac(d.total_ht, 0)}\u00a0HT) a été envoyé le ${ddmm(devisEnvoyeLe(d))} : pas encore de réponse.`,
      'Voir le devis',
      doc(d),
    );
  });
  I.filter((i) => i.statut === 'a_reprendre').forEach((i) => {
    // Le motif du renvoi : le résultat de la fiche et ce qu'il reste à faire (le bac note « À reprendre : … »).
    const r = i.fiche?.resultat;
    const motif = r && r !== 'termine' && i.fiche?.reste?.trim() ? `${LIBELLE_RESULTAT[r]} : ${i.fiche.reste}` : '';
    ajoute(
      `renvoyee:${i.id}`,
      'attente',
      `La fiche ${guill(i.motif)}${lieu(i)} a été renvoyée à ${i.techniciens.length ? i.techniciens.join(', ') : 'son technicien'} pour être complétée${motif ? ` (${sansPoint(motif)})` : ''}.`,
      'Voir l’intervention',
      fiche(i),
    );
  });
  return L;
}

export type TonSuivi = 'rouge' | 'cobalt' | 'vert' | 'gris';

/** Le même résumé sert à la liste « Mes clients » et à la fiche (resumeClient du bac). */
export function resumeClient(liste: ChoseAFaire[], actif: boolean): { urgent: number; afaire: number; ton: TonSuivi; etiquette: string } {
  const urgent = liste.filter((x) => x.niveau === 'urgent').length;
  const afaire = liste.filter((x) => x.niveau === 'afaire').length;
  const total = urgent + afaire;
  if (urgent) return { urgent, afaire, ton: 'rouge', etiquette: `Urgent · ${pluriel(total, 'chose', 'choses')} à faire` };
  if (afaire) return { urgent, afaire, ton: 'cobalt', etiquette: `${pluriel(afaire, 'chose', 'choses')} à faire` };
  return { urgent, afaire, ton: actif ? 'vert' : 'gris', etiquette: actif ? 'À jour' : 'Rien encore' };
}

const aEncaisserSimple = (d: DocumentSuivi) => d.genre === 'facture' && d.type_facture !== 'avoir' && d.statut === 'a_encaisser' && d.net_a_payer > 0.005;
const jour = (iso: string | null | undefined) => (iso ?? '').slice(0, 10);

/** Chiffres de l'année pour un client : facturé, encaissé, reste à encaisser. */
export function chiffresClient(documents: DocumentSuivi[], interventions: InterventionSuivi[], aujourdhui: string) {
  const debut = `${aujourdhui.slice(0, 4)}-01-01`;
  const emises = documents.filter(factureEmise);
  const ouvertes = emises.filter(aEncaisserSimple);
  return {
    // Les avoirs sont déjà comptés en négatif.
    factureHT: emises.filter((d) => d.date_document >= debut).reduce((s, d) => s + d.total_ht, 0),
    encaisse: emises
      .filter((d) => d.type_facture !== 'avoir' && d.statut === 'payee' && jour(d.paye_le || d.date_document) >= debut)
      .reduce((s, d) => s + d.net_a_payer, 0),
    aEncaisser: ouvertes.reduce((s, d) => s + d.net_a_payer, 0),
    enRetard: ouvertes.filter((d) => d.echeance && d.echeance < aujourdhui).reduce((s, d) => s + d.net_a_payer, 0),
    interventions: interventions.filter((i) => (i.date_prevue ?? jour(i.cree_le)) >= debut).length,
  };
}

// ---------- Cartes « Mes clients » et fiche client ----------
// Mêmes règles que le bac (initiales, contient, trouveDans, prochainesDe, historiqueDe, chiffres de la fiche :
// 30-outils.js et 42-clients-equipe.js), sur les données de la production.

/** « DG » pour Cabinet Dupré Gestion, « SM » pour Mme Sophie Martin, « RD » pour « rue de la Pompe » (initiales() du bac). */
export function initialesClient(nom: string): string {
  const mots = (nom || '?')
    .trim()
    .replace(/^(M\. et Mme|Mme|M\.|Cabinet|Hôtel|Boulangerie)\s+/, '')
    .split(/\s+/)
    .filter((m) => /^[\p{L}\p{N}]/u.test(m));
  return mots
    .slice(0, 2)
    .map((m) => m[0] ?? '')
    .join('')
    .toUpperCase() || '?';
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Chaque mot cherché est dans le texte, sans tenir compte des accents ni des majuscules (contient() du bac). */
export function contientMots(texte: string, q: string): boolean {
  const t = sansAccents(texte);
  return sansAccents(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((m) => t.includes(m));
}

/** Un immeuble vu par la recherche de « Mes clients ». */
export interface ImmeubleRecherche {
  adresse: string;
  code_postal?: string | null;
  ville?: string | null;
  occupants?: { nom: string; lot: string | null }[] | null;
}
const villeDe = (imm: ImmeubleRecherche) => [imm.code_postal, imm.ville].filter(Boolean).join(' ');
/** Texte où chercher dans les immeubles d'un client : adresse, ville, occupants (texteImmeubles du bac). */
export function texteImmeubles(immeubles: ImmeubleRecherche[]): string {
  return immeubles.map((imm) => `${imm.adresse} ${villeDe(imm)} ${(imm.occupants ?? []).map((o) => `${o.nom} ${o.lot ?? ''}`).join(' ')}`).join(' ');
}
/**
 * Quand la recherche trouve le client par un occupant ou un immeuble, on dit lequel (trouveDans du bac) :
 * « Trouvé : Mme Martin, 3e gauche, 12 rue de la Pompe » ou « Trouvé : immeuble 48 avenue Mozart ».
 * `texteClient` : nom, contact, adresse, SIREN, téléphone, e-mail du client.
 */
export function trouveDans(texteClient: string, immeubles: ImmeubleRecherche[], q: string): string {
  if (!q.trim() || contientMots(texteClient, q)) return '';
  const occ = (imm: ImmeubleRecherche, avecImm: boolean) =>
    (imm.occupants ?? []).find((o) => contientMots(`${o.nom} ${o.lot ?? ''}${avecImm ? ` ${imm.adresse}` : ''}`, q));
  const dit = (o: { nom: string; lot: string | null }, imm: ImmeubleRecherche) => `Trouvé : ${o.nom}${o.lot ? `, ${o.lot}` : ''}, ${imm.adresse}`;
  for (const imm of immeubles) {
    const o = occ(imm, false);
    if (o) return dit(o, imm);
  }
  for (const imm of immeubles) if (contientMots(`${imm.adresse} ${villeDe(imm)}`, q)) return `Trouvé : immeuble ${imm.adresse}`;
  for (const imm of immeubles) {
    const o = occ(imm, true);
    if (o) return dit(o, imm);
  }
  return '';
}

/** Intervention telle que l'affiche la fiche client (prochaines interventions, historique). */
export interface InterventionFiche extends InterventionSuivi {
  /** DEP-2026-0145 (ou l'ancien numéro). */
  reference: string | null;
  numero?: number | null;
  heure_prevue: string | null;
  ordre_service: string | null;
  site_id: string | null;
}

const JOURS_L = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const majuscule = (s: string) => s.replace(/^./, (x) => x.toUpperCase());
/** « mardi 6 octobre », « jeudi 1er octobre », avec l'année si ce n'est pas celle d'aujourd'hui (dateLongueA du bac). */
function dateLongueA(iso: string, aujourdhui: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const jour = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return `${JOURS_L[jour]} ${j}${j === 1 ? 'er' : ''} ${MOIS_L[m - 1]}${a !== Number(aujourdhui.slice(0, 4)) ? ` ${a}` : ''}`;
}
/** « 09:00:00 » → « 09:00 » */
const hhmm = (h: string | null | undefined) => (h ? h.slice(0, 5) : '');
/** Heure d'un horodatage, à l'heure de Paris (« 09:05 »). */
export function heureParis(ts: string): string {
  const t = Date.parse(ts);
  return Number.isNaN(t) ? '' : fmtHeure.format(t);
}

/** Les interventions à venir d'un client : en cours, puis datées, puis sans date (par date souhaitée) — prochainesDe du bac. */
export function prochainesDe<T extends InterventionFiche>(I: T[]): T[] {
  const rang = (i: T) => (i.statut === 'en_cours' ? 0 : i.date_prevue ? 1 : 2);
  const cle = (i: T) => (rang(i) === 2 ? i.souhaitee_le || '9999' : `${i.date_prevue ?? ''} ${hhmm(i.heure_prevue) || '08:00'}`);
  return I.filter((i) => i.statut === 'en_cours' || i.statut === 'planifiee' || i.statut === 'a_planifier').sort(
    (a, b) => rang(a) - rang(b) || cle(a).localeCompare(cle(b)) || (a.reference ?? '').localeCompare(b.reference ?? ''),
  );
}

/** « Aujourd’hui, 09:00 », « Du mardi 6 octobre au mercredi 7 octobre », « Souhaitée vers le 20/10/2026 », « Date à choisir » (quandInterv du bac). */
export function quandIntervention(i: Pick<InterventionFiche, 'date_prevue' | 'date_fin' | 'heure_prevue' | 'souhaitee_le'>, aujourdhui: string): string {
  if (!i.date_prevue) return i.souhaitee_le ? `Souhaitée vers le ${jjmmaaaaBac(i.souhaitee_le)}` : 'Date à choisir';
  if (i.date_fin && i.date_fin !== i.date_prevue) return `Du ${dateLongueA(i.date_prevue, aujourdhui)} au ${dateLongueA(i.date_fin, aujourdhui)}`;
  const jour =
    i.date_prevue === aujourdhui ? 'Aujourd’hui' : i.date_prevue === ajouterJours(aujourdhui, 1) ? 'Demain' : majuscule(dateLongueA(i.date_prevue, aujourdhui));
  return `${jour}, ${hhmm(i.heure_prevue) || 'matin'}`;
}

/** « aujourd’hui à 09:00 », « le 06/10/2026 dans la matinée », « chantier en cours jusqu’au 07/10/2026 » (quandPhrase du bac). */
export function quandPhrase(i: Pick<InterventionFiche, 'date_prevue' | 'date_fin' | 'heure_prevue'>, aujourdhui: string): string {
  if (!i.date_prevue) return '';
  if (i.date_fin && i.date_fin !== i.date_prevue)
    return i.date_prevue <= aujourdhui ? `chantier en cours jusqu’au ${jjmmaaaaBac(i.date_fin)}` : `du ${jjmmaaaaBac(i.date_prevue)} au ${jjmmaaaaBac(i.date_fin)}`;
  const jour = i.date_prevue === aujourdhui ? 'aujourd’hui' : i.date_prevue === ajouterJours(aujourdhui, 1) ? 'demain' : `le ${jjmmaaaaBac(i.date_prevue)}`;
  return jour + (i.heure_prevue ? ` à ${hhmm(i.heure_prevue)}` : ' dans la matinée');
}

/** Étiquette d'une intervention à venir : « Sur place depuis 09:05 », « Prévue », « Technicien à choisir »… (etatProchaine du bac). */
export function etatProchaine(i: InterventionFiche, aujourdhui: string): { ton: Ton; texte: string } {
  if (i.statut === 'en_cours') return { ton: 'cobalt', texte: i.fiche?.debut ? `Sur place depuis ${heureParis(i.fiche.debut)}` : 'Sur place' };
  if (i.statut === 'a_planifier' || !i.date_prevue) return { ton: 'gris', texte: i.date_prevue ? 'Technicien à choisir' : 'Pas encore de date' };
  if (i.date_fin && i.date_fin !== i.date_prevue && i.date_prevue <= aujourdhui && aujourdhui <= i.date_fin) return { ton: 'cobalt', texte: 'Chantier en cours' };
  if ((i.date_fin || i.date_prevue) < aujourdhui) return { ton: 'gris', texte: 'Date passée' };
  return { ton: 'bleu', texte: 'Prévue' };
}

/** Montant HT d'une liste de factures, avoirs déduits. */
const sommeHT = (liste: DocumentSuivi[]) => liste.reduce((s, d) => s + (d.type_facture === 'avoir' ? -Math.abs(d.total_ht) : d.total_ht), 0);
const fmtPart = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Ligne d'argent d'une intervention à venir : « Devis signé : 5 267 € HT · déjà facturé 30 % (1 580 € HT), payé » (argentProchaine du bac). */
export function argentProchaine(i: InterventionSuivi, D: DocumentSuivi[]): string {
  const dv = devisDe(i, D);
  if (dv && dv.statut === 'signe') {
    const fd = D.filter((x) => factureEmise(x) && x.type_facture !== 'avoir' && x.devis_id === dv.id);
    const avs = D.filter((a) => a.type_facture === 'avoir' && factureEmise(a) && fd.some((f) => f.id === a.facture_id));
    const net = sommeHT([...fd, ...avs]);
    let t = `Devis signé : ${eurBac(dv.total_ht, 0)} HT`;
    if (net >= 0.5)
      t += ` · déjà facturé ${fmtPart.format(partEmise(dv, D))} % (${eurBac(net, 0)} HT${avs.length ? ', avoir déduit' : ''}), ${
        fd.every((f) => !factureAEncaisser(f, D)) ? 'payé' : 'pas encore payé'
      }`;
    else if (avs.length) t += ' · facture annulée par un avoir';
    return t;
  }
  if (dv && dv.statut === 'envoye') return `Devis ${eurBac(dv.total_ht, 0)} HT envoyé, en attente de réponse`;
  const fx = D.filter((d) => d.genre === 'facture' && factureEmise(d) && vientDe(d, i, D));
  return fx.length ? `Déjà facturé : ${eurBac(sommeHT(fx), 0)} HT` : '';
}

/** Une ligne de l'historique : une intervention passée, ou un devis ou une facture qui ne vient d'aucune intervention. */
export type LigneHistorique<T extends InterventionFiche = InterventionFiche> =
  | { cle: string; date: string; intervention: T; document?: undefined }
  | { cle: string; date: string; document: DocumentSuivi; intervention?: undefined };

/** Historique d'un client, du plus récent au plus ancien (historiqueDe du bac). */
export function historiqueDe<T extends InterventionFiche>(I: T[], D: DocumentSuivi[]): LigneHistorique<T>[] {
  const lignes: (LigneHistorique<T> & { n: string })[] = [];
  for (const i of I) {
    if (!/^(terminee|a_reprendre|validee|facturee)$/.test(i.statut)) continue;
    lignes.push({ cle: `i:${i.id}`, date: i.date_fin || i.date_prevue || jourParis(i.cree_le), intervention: i, n: i.reference ?? '' });
  }
  for (const d of D) {
    if (d.statut === 'brouillon' || d.statut === 'annule' || I.some((i) => vientDe(d, i, D))) continue;
    lignes.push({ cle: `d:${d.id}`, date: d.date_document || '', document: d, n: d.numero ?? '' });
  }
  return lignes.sort((a, b) => b.date.localeCompare(a.date) || b.n.localeCompare(a.n)).map(({ n: _n, ...l }) => l as LigneHistorique<T>);
}

/** Factures émises de l'intervention (sans les avoirs). */
const facturesDe = (i: InterventionSuivi, D: DocumentSuivi[]) => D.filter((d) => d.genre === 'facture' && d.type_facture !== 'avoir' && factureEmise(d) && vientDe(d, i, D));
const avoirsDe = (f: DocumentSuivi, D: DocumentSuivi[]) => avoirsSur(f, D).reduce((s, a) => s + Math.abs(a.net_a_payer), 0);

/** État d'une intervention passée : « Fiche à valider », « À facturer », « Payée »… (etatHisto du bac). */
export function etatHistorique(i: InterventionSuivi, D: DocumentSuivi[], facturation: FacturationClient | null | undefined, aujourdhui: string): { ton: Ton; texte: string } {
  if (i.statut === 'terminee') return { ton: 'violet', texte: 'Fiche à valider' };
  if (i.statut === 'a_reprendre') return { ton: 'rouge', texte: 'Renvoyée au technicien' };
  if (i.statut === 'validee' && !dejaToutFacture(i, D)) return { ton: 'bleu', texte: facturation === 'mensuel' ? 'À mettre sur le relevé du mois' : 'À facturer' };
  const fx = facturesDe(i, D);
  if (!fx.length) return { ton: 'gris', texte: 'Facturée' };
  if (fx.some((f) => factureEnRetard(f, D, aujourdhui))) return { ton: 'rouge', texte: 'Paiement en retard' };
  if (fx.some((f) => factureAEncaisser(f, D))) return { ton: 'violet', texte: 'Facturée, pas encore payée' };
  if (fx.every((f) => avoirsDe(f, D) >= f.net_a_payer - 0.005)) return { ton: 'gris', texte: 'Annulée par un avoir' };
  return { ton: 'vert', texte: 'Payée' };
}

/** Montant d'une intervention passée : « 243 € HT », ou « Devis 1 250 € HT, signé » (montantHisto du bac). */
export function montantHistorique(i: InterventionSuivi, D: DocumentSuivi[]): string {
  const fx = facturesDe(i, D);
  if (fx.length) {
    const s = sommeHT([...fx, ...D.filter((a) => a.type_facture === 'avoir' && factureEmise(a) && fx.some((f) => f.id === a.facture_id))]);
    return Math.abs(s) >= 0.5 ? `${eurBac(s, 0)} HT` : '';
  }
  const dv = devisDe(i, D);
  if (dv && dv.statut !== 'brouillon')
    return `Devis ${eurBac(dv.total_ht, 0)} HT${dv.statut === 'envoye' ? ', en attente de réponse' : dv.statut === 'signe' ? ', signé' : ''}`;
  return '';
}

/** État d'un devis ou d'une facture seuls dans l'historique (etatDocSeul du bac). */
export function etatDocumentSeul(d: DocumentSuivi, D: DocumentSuivi[], aujourdhui: string): { ton: Ton; texte: string } {
  if (d.genre === 'facture' && d.type_facture !== 'avoir' && factureEmise(d) && d.net_a_payer - avoirsDe(d, D) <= 0.005 && avoirsSur(d, D).length)
    return { ton: 'gris', texte: 'Annulée par un avoir' };
  if (d.genre === 'devis')
    return d.statut === 'envoye'
      ? { ton: 'bleu', texte: 'Envoyé, en attente de réponse' }
      : d.statut === 'signe'
        ? { ton: 'vert', texte: 'Devis signé' }
        : { ton: 'gris', texte: d.statut === 'refuse' ? 'Devis refusé' : 'Devis' };
  if (d.type_facture === 'avoir') return { ton: 'gris', texte: 'Avoir' };
  if (d.statut === 'payee') return { ton: 'vert', texte: 'Payée' };
  if (factureEnRetard(d, D, aujourdhui)) return { ton: 'rouge', texte: 'Paiement en retard' };
  if (factureAEncaisser(d, D)) return { ton: 'violet', texte: 'Pas encore payée' };
  return { ton: 'gris', texte: 'Annulée par un avoir' };
}

/** Titre d'un document de l'historique : « Facture « Réparation de fuite » », « Devis sans titre », ou l'objet d'un avoir. */
export function titreHistorique(d: DocumentSuivi): string {
  return d.type_facture === 'avoir' ? d.objet.trim() || 'Avoir' : `${libDoc(d)} ${objetDoc(d)}`;
}

/** Devis de renouvellement d'un contrat (affiché « Contrat d’entretien »). */
export function estDevisRenouvellement(d: DocumentSuivi, contrats: Pick<ContratSuivi, 'renouvellement_id'>[] = []): boolean {
  return d.genre === 'devis' && estRenouvellement(d, contrats as ContratSuivi[]);
}

/**
 * Immeuble (site) d'un devis ou d'une facture : celui de l'intervention d'où il vient,
 * ou celui du contrat qu'il renouvelle. `null` si on ne sait pas.
 */
export function siteDuDocument(
  d: DocumentSuivi,
  I: Pick<InterventionFiche, 'id' | 'devis_id' | 'site_id'>[],
  D: DocumentSuivi[],
  contrats: { id: string; site_id: string | null; renouvellement_id?: string | null }[] = [],
): string | null {
  const iv = I.find((i) => i.site_id && vientDe(d, i as unknown as InterventionSuivi, D));
  if (iv) return iv.site_id;
  const avoirDe = d.facture_id ? D.find((f) => f.id === d.facture_id) : null;
  if (avoirDe && avoirDe !== d) {
    const s = siteDuDocument(avoirDe, I, D, contrats);
    if (s) return s;
  }
  const ct = contrats.find((c) => c.id === d.conditions?.contrat_id || (c.renouvellement_id && c.renouvellement_id === d.id));
  return ct?.site_id ?? null;
}

/** Les chiffres de l'année sur la fiche client (bloc « Les chiffres de 2026 » du bac). */
export interface ChiffresFiche {
  annee: number;
  /** Facturé HT dans l'année (avoirs déduits), nombre de factures et d'avoirs. */
  facture: number;
  factures: number;
  avoirs: number;
  /** Facturé HT l'année précédente (montré en janvier, ou si rien cette année). */
  factureAvant: number;
  montrerAvant: boolean;
  /** Reste à nous payer (TTC, avoirs déduits), dont en retard, et prochaine échéance. */
  reste: number;
  enRetard: number;
  prochaineEcheance: string | null;
  /** Une facture a déjà été émise (« Tout est payé » plutôt que « Rien à payer »). */
  dejaEmis: boolean;
  /** Devis envoyés en attente de réponse (HT). */
  devisEnvoyes: number;
  nbDevisEnvoyes: number;
  /** Devis signés (hors renouvellements de contrat) pas encore facturés (HT). */
  travauxAFacturer: number;
  /** Au moins un devis ou une facture qui n'est ni brouillon ni annulé. */
  actif: boolean;
}

export function chiffresFiche(D: DocumentSuivi[], aujourdhui: string, contrats: Pick<ContratSuivi, 'renouvellement_id'>[] = []): ChiffresFiche {
  const annee = Number(aujourdhui.slice(0, 4));
  const emisesAn = (a: number) => D.filter((d) => factureEmise(d) && d.date_document.startsWith(String(a)));
  const fAn = emisesAn(annee);
  const facture = sommeHT(fAn);
  const factureAvant = sommeHT(emisesAn(annee - 1));
  const factures = fAn.filter((d) => d.type_facture !== 'avoir').length;
  const dues = D.filter((f) => factureAEncaisser(f, D));
  const retard = dues.filter((f) => factureEnRetard(f, D, aujourdhui));
  const envoyes = D.filter((d) => d.genre === 'devis' && d.statut === 'envoye');
  const signes = D.filter((d) => d.genre === 'devis' && d.statut === 'signe' && !estRenouvellement(d, contrats as ContratSuivi[]));
  return {
    annee,
    facture,
    factures,
    avoirs: fAn.length - factures,
    factureAvant,
    montrerAvant: (Math.abs(facture) < 0.5 || aujourdhui.slice(5, 7) === '01') && Math.abs(factureAvant) >= 0.5,
    reste: dues.reduce((s, f) => s + resteDu(f, D), 0),
    enRetard: retard.reduce((s, f) => s + resteDu(f, D), 0),
    prochaineEcheance:
      dues
        .filter((f) => !retard.includes(f) && f.echeance)
        .map((f) => f.echeance!)
        .sort()[0] ?? null,
    dejaEmis: D.some((d) => factureEmise(d) && d.type_facture !== 'avoir'),
    devisEnvoyes: sommeHT(envoyes),
    nbDevisEnvoyes: envoyes.length,
    travauxAFacturer: signes.reduce((s, dv) => s + (dv.total_ht * Math.max(0, 100 - partEmise(dv, D))) / 100, 0),
    actif: D.some((d) => d.statut !== 'brouillon' && d.statut !== 'annule'),
  };
}
