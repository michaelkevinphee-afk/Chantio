// Toutes les choses à faire, tous clients confondus (toutAFaire du bac, 40-bureau.js) :
// la liste « À faire » de l'Accueil, sa pastille dans le menu, et la phrase « On attend aussi ».
// Les phrases sont celles du bac, mot pour mot ; les liens mènent aux pages de la production.

import { achatEchu, resteAPayer, type StatutAchat } from './achats.ts';
import {
  chosesAFaire,
  devisEnAttente,
  eurBac,
  factureAEncaisser,
  factureEnRetard,
  jjmmaaaaBac,
  resteDu,
  type ChoseAFaire,
  type ClientSuivi,
  type ContratSuivi,
  type DocumentSuivi,
  type InterventionSuivi,
} from './suivi-client.ts';
import type { StatutIdentite } from './types.ts';

export interface ClientAFaire extends ClientSuivi {
  nom: string;
}

/** Facture fournisseur encore ouverte (reçue, à payer, paiement planifié). */
export interface AchatAFaire {
  id: string;
  numero: string | null;
  statut: StatutAchat;
  echeance: string | null;
  montant_ttc: number;
  /** Total des paiements déjà déclarés. */
  paye: number;
  /** Nom du fournisseur, null s'il n'est pas encore reconnu (« Fournisseur à vérifier »). */
  fournisseur: string | null;
}

/** L'entreprise, seulement pour un dirigeant : identité à vérifier et demandes d'accès en attente. */
export interface EntrepriseAFaire {
  nom: string;
  identite_statut?: StatutIdentite | null;
  demandes: { id: string; prenom: string; nom: string | null }[];
}

export interface DonneesAFaire {
  clients: ClientAFaire[];
  /** Rangés par client (chargerSuivi). */
  interventions: ReadonlyMap<string, InterventionSuivi[]>;
  documents: ReadonlyMap<string, DocumentSuivi[]>;
  contrats?: ReadonlyMap<string, ContratSuivi[]>;
  achats?: AchatAFaire[];
  /** null ou absent quand la personne connectée n'est pas dirigeant. */
  entreprise?: EntrepriseAFaire | null;
  aujourdhui: string;
}

/** « Sans client » : devis et factures dont le client n'a pas été choisi dans la liste (le bac en exige toujours un). */
export type ModuleAFaire = 'Achats' | 'Entreprise' | 'Sans client';

/** Clé des devis et factures sans client dans `documents` (chargerSuivi les y range). */
export const SANS_CLIENT = 'sans-client';

/**
 * Une ligne de la liste : à qui c'est (un client, ou « Achats » / « Entreprise » / « Sans client » en gras),
 * la phrase, et le bouton qui le règle (`bouton`, `lien`, `geste` : voir ChoseAFaire).
 * Le nom du client mène à sa fiche : /clients/<client.id>.
 */
export interface ElementAFaire extends ChoseAFaire {
  client?: { id: string; nom: string };
  module?: ModuleAFaire;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const RANG: Record<ElementAFaire['niveau'], number> = { urgent: 0, afaire: 1, attente: 2 };
const clientsTries = (clients: ClientAFaire[]) => [...clients].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

/**
 * Toutes les choses à faire : client par client (par ordre alphabétique), puis les devis et
 * factures sans client, les factures fournisseurs échues, l'entreprise (dirigeant) et les factures fournisseurs reçues ;
 * enfin l'urgent d'abord, puis le reste, puis ce qu'on attend (tri stable).
 *
 * Liens en plus de ceux de chosesAFaire :
 * - /achats/<id>?payer=1 : « Déclarer un paiement » ouvre directement le paiement ;
 * - /achats?filtre=a_payer : « Voir les factures » ; /achats?filtre=recu : « Vérifier » ;
 * - /entreprises/identite : « Vérifier » (identité du dirigeant) ; /entreprises : « Répondre ».
 */
export function toutAFaire(d: DonneesAFaire): ElementAFaire[] {
  const L: ElementAFaire[] = [];
  for (const c of clientsTries(d.clients)) {
    const liste = chosesAFaire(c, d.interventions.get(c.id) ?? [], d.documents.get(c.id) ?? [], d.aujourdhui, d.contrats?.get(c.id) ?? []);
    for (const x of liste) L.push({ ...x, client: { id: c.id, nom: c.nom } });
  }
  const orphelins = d.documents.get(SANS_CLIENT) ?? [];
  if (orphelins.length) {
    const liste = chosesAFaire({ id: SANS_CLIENT, type: 'particulier', immeubles: 0 }, [], orphelins, d.aujourdhui);
    for (const x of liste) L.push({ ...x, module: 'Sans client' });
  }

  const achats = d.achats ?? [];
  const reste = (a: AchatAFaire) => resteAPayer(a, a.paye);
  const echues = achats.filter((a) => achatEchu(a, a.paye, d.aujourdhui));
  if (echues.length === 1) {
    const a = echues[0];
    L.push({
      cle: `achat-echu:${a.id}`,
      niveau: 'urgent',
      module: 'Achats',
      texte: `${a.numero ? `La facture n° ${a.numero}` : 'La facture'} de ${a.fournisseur || 'Fournisseur à vérifier'} (${eurBac(reste(a))} TTC) devait être payée le ${jjmmaaaaBac(a.echeance!)}.`,
      bouton: 'Déclarer un paiement',
      lien: `/achats/${a.id}?payer=1`,
      montant: reste(a),
    });
  } else if (echues.length) {
    L.push({
      cle: 'achats-echus',
      niveau: 'urgent',
      module: 'Achats',
      texte: `${echues.length} factures fournisseurs ont dépassé leur échéance (${eurBac(echues.reduce((s, a) => s + reste(a), 0))} TTC).`,
      bouton: 'Voir les factures',
      lien: '/achats?filtre=a_payer',
      montant: echues.reduce((s, a) => s + reste(a), 0),
    });
  }

  // L'entreprise : identité du dirigeant à vérifier (ou à refaire après un refus), demandes d'accès à traiter.
  const e = d.entreprise;
  if (e) {
    if (!e.identite_statut || e.identite_statut === 'a_verifier' || e.identite_statut === 'refusee') {
      L.push({
        cle: 'identite',
        niveau: 'afaire',
        module: 'Entreprise',
        texte: 'Vérifiez votre identité de dirigeant : c’est nécessaire pour activer la facturation électronique.',
        bouton: 'Vérifier',
        lien: '/entreprises/identite',
      });
    }
    for (const x of e.demandes) {
      L.push({
        cle: `demande:${x.id}`,
        niveau: 'afaire',
        module: 'Entreprise',
        texte: `${[x.prenom, x.nom].filter(Boolean).join(' ')} demande l’accès à ${e.nom}.`,
        bouton: 'Répondre',
        lien: '/entreprises',
      });
    }
  }

  const recues = achats.filter((a) => a.statut === 'recu');
  if (recues.length) {
    L.push({
      cle: 'achats-recus',
      niveau: 'afaire',
      module: 'Achats',
      texte: `${pluriel(recues.length, 'facture fournisseur reçue', 'factures fournisseurs reçues')} à vérifier puis approuver.`,
      bouton: 'Vérifier',
      lien: '/achats?filtre=recu',
    });
  }
  return L.map((x, n) => ({ x, n }))
    .sort((a, b) => RANG[a.x.niveau] - RANG[b.x.niveau] || a.n - b.n)
    .map(({ x }) => x);
}

// ---------- Les cases « En un coup d'œil » de l'Accueil ----------

/**
 * Les cases de l'Accueil : les paiements clients en retard (en grand), puis six cases.
 * Chaque chose à faire va dans une seule case, selon le début de sa clé ; une clé inconnue va dans « Le reste ».
 */
export type CaseAFaire = 'retards' | 'placer' | 'fiches' | 'facturer' | 'devis' | 'achats' | 'reste';

const RANGEMENT: [CaseAFaire, RegExp][] = [
  ['retards', /^retard:/],
  ['placer', /^(urgence|planifier|visites):/],
  ['fiches', /^(valider|renvoyee):/],
  ['facturer', /^(facturer|facture-brouillon):/],
  ['devis', /^(relancer|devis-brouillon|devis-signe|devis-demande|appel-offres):/],
  ['achats', /^achat/],
];

export function caseAFaire(x: Pick<ElementAFaire, 'cle'>): CaseAFaire {
  return RANGEMENT.find(([, motif]) => motif.test(x.cle))?.[0] ?? 'reste';
}

export interface CaseResumee {
  cle: CaseAFaire;
  titre: string;
  /** La phrase sous le titre. */
  phrase: string;
  lignes: ElementAFaire[];
  /** Au moins une ligne urgente. */
  urgent: boolean;
  /** Somme des montants connus (0 s'il n'y en a pas). */
  montant: number;
}

const CASES: { cle: CaseAFaire; titre: string; phrase: string }[] = [
  { cle: 'retards', titre: 'Paiements clients en retard', phrase: 'Factures dont l’échéance est passée.' },
  { cle: 'placer', titre: 'Interventions à placer', phrase: 'Sans date ou sans technicien.' },
  { cle: 'fiches', titre: 'Fiches à valider', phrase: 'Terminées par les techniciens, à relire.' },
  { cle: 'facturer', titre: 'À facturer', phrase: 'Validées, pas encore facturées.' },
  { cle: 'devis', titre: 'Devis', phrase: 'À relancer, terminer ou planifier.' },
  { cle: 'achats', titre: 'Factures fournisseurs', phrase: 'À vérifier ou à payer.' },
  { cle: 'reste', titre: 'Le reste', phrase: 'Contrats, immeubles, accès à l’entreprise.' },
];

/** Range les choses à faire (sans « On attend ») dans les cases de l'Accueil, dans l'ordre de la liste. */
export function rangerAFaire(L: ElementAFaire[]): CaseResumee[] {
  const faire = L.filter((x) => x.niveau !== 'attente');
  return CASES.map((c) => {
    const lignes = faire.filter((x) => caseAFaire(x) === c.cle);
    return {
      ...c,
      lignes,
      urgent: lignes.some((x) => x.niveau === 'urgent'),
      montant: lignes.reduce((s, x) => s + (x.montant ?? 0), 0),
    };
  });
}

export interface ResumeAFaire {
  /** Choses urgentes. */
  u: number;
  /** Choses à faire, urgentes comprises (« On attend » ne compte pas). */
  n: number;
  /** « 15 choses à faire, dont 2 urgentes », « 1 chose à faire » ou « rien à faire pour l’instant ». */
  texte: string;
}

/** Le résumé de l'en-tête de l'Accueil et de la pastille du menu (resumeAFaire du bac). */
export function resumeAFaire(L: Pick<ChoseAFaire, 'niveau'>[]): ResumeAFaire {
  const u = L.filter((x) => x.niveau === 'urgent').length;
  const n = u + L.filter((x) => x.niveau === 'afaire').length;
  return {
    u,
    n,
    texte: n ? `${pluriel(n, 'chose', 'choses')} à faire${u ? `, dont ${pluriel(u, 'urgente', 'urgentes')}` : ''}` : 'rien à faire pour l’instant',
  };
}

export interface AttenteAFaire {
  /**
   * La phrase qui suit « On attend aussi » (en gras dans le bac), point final compris :
   * « le paiement de 1 facture (4 518 € TTC, pas encore en retard) et la réponse à 1 devis envoyé il y a moins de 15 jours. »
   */
  texte: string;
  factures: number;
  devis: number;
  renvoyees: number;
  /** Liens après la phrase : « Voir les factures à encaisser », « Voir les fiches renvoyées ». */
  liens: { libelle: string; lien: string }[];
}

/**
 * Ce qui ne dépend pas de nous, en une phrase (phraseAttente du bac) : factures à encaisser
 * pas encore en retard, devis envoyés il y a 15 jours ou moins, fiches renvoyées à un technicien.
 * null s'il n'y a rien. Liens : /factures?filtre=a_encaisser, /interventions?statut=a_reprendre.
 */
export function phraseAttente(d: DonneesAFaire): AttenteAFaire | null {
  let factures = 0;
  let total = 0;
  let devis = 0;
  let renvoyees = 0;
  for (const c of [...d.clients, { id: SANS_CLIENT }]) {
    const D = d.documents.get(c.id) ?? [];
    for (const f of D) {
      if (factureAEncaisser(f, D) && !factureEnRetard(f, D, d.aujourdhui)) {
        factures++;
        total += resteDu(f, D);
      }
      if (devisEnAttente(f, d.aujourdhui)) devis++;
    }
    renvoyees += (d.interventions.get(c.id) ?? []).filter((i) => i.statut === 'a_reprendre').length;
  }
  const p: string[] = [];
  if (factures) p.push(`le paiement de ${pluriel(factures, 'facture', 'factures')} (${eurBac(total, 0)} TTC, pas encore en retard)`);
  if (devis) p.push(`la réponse à ${pluriel(devis, 'devis envoyé', 'devis envoyés')} il y a moins de 15 jours`);
  if (renvoyees) p.push(`${pluriel(renvoyees, 'fiche renvoyée', 'fiches renvoyées')} à un technicien pour être complétée${renvoyees > 1 ? 's' : ''}`);
  if (!p.length) return null;
  const liens: AttenteAFaire['liens'] = [];
  if (factures) liens.push({ libelle: 'Voir les factures à encaisser', lien: '/factures?filtre=a_encaisser' });
  if (renvoyees) liens.push({ libelle: 'Voir les fiches renvoyées', lien: '/interventions?statut=a_reprendre' });
  return {
    texte: `${p.length > 1 ? `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}` : p[0]}.`,
    factures,
    devis,
    renvoyees,
    liens,
  };
}
