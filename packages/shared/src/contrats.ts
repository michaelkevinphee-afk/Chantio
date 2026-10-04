// Contrats d'entretien : période en cours (reconduction tacite), date limite
// de préavis, état à afficher, visites de l'année et devis de renouvellement.

import { ajouterJours } from './format.ts';
import type { LigneDocument, StatutDocument } from './devis.ts';
import type { StatutIntervention } from './types.ts';

export interface Contrat {
  id: string;
  entreprise_id: string;
  client_id: string;
  site_id: string | null;
  /** CT-2026-0001 */
  reference: string | null;
  objet: string;
  debut: string;
  fin: string;
  preavis_mois: number;
  /** Reconduction tacite ; sinon le client signe chaque renouvellement. */
  tacite: boolean;
  /** Montant HT par an. */
  montant_ht: number;
  visites_par_an: number;
  /** Coût des fournitures et temps d'une visite, pour chiffrer le renouvellement. */
  fournitures_visite: number;
  heures_visite: number;
  derniere_visite: string | null;
  /** Devis de renouvellement préparé. */
  renouvellement_id: string | null;
  notes: string | null;
  cree_le: string;
  modifie_le: string;
}

type Periode = Pick<Contrat, 'debut' | 'fin' | 'tacite'>;

/** Ajoute des mois à une date AAAA-MM-JJ (le 31 devient le dernier jour du mois). */
export function ajouterMois(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m - 1 + n + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(a, m - 1 + n, Math.min(j, fin)));
  return d.toISOString().slice(0, 10);
}

/** Mois entiers entre deux dates (au moins 1). */
function moisEntre(de: string, a: string): number {
  const [y1, m1] = de.split('-').map(Number);
  const [y2, m2] = a.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1));
}

/**
 * Période en cours : un contrat à reconduction tacite dont la fin est passée
 * repart pour la même durée, autant de fois qu'il le faut.
 */
export function periodeEnCours(c: Periode, jour: string): { debut: string; fin: string; reconduit: number } {
  let { debut, fin } = c;
  let reconduit = 0;
  if (c.tacite) {
    const duree = moisEntre(debut, ajouterJours(fin, 1));
    while (fin < jour && reconduit < 100) {
      debut = ajouterJours(fin, 1);
      fin = ajouterJours(ajouterMois(debut, duree), -1);
      reconduit++;
    }
  }
  return { debut, fin, reconduit };
}

/** Dernier jour pour envoyer la proposition (ou la résiliation) : la veille de « fin + 1 jour − préavis ». */
export function limitePreavis(fin: string, preavisMois: number): string {
  return ajouterJours(ajouterMois(ajouterJours(fin, 1), -preavisMois), -1);
}

const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export type TonContrat = 'rouge' | 'violet' | 'bleu' | 'vert' | 'gris';

export interface EtatContrat {
  ton: TonContrat;
  etiquette: string;
  detail: string;
  /** Il faut agir : préavis proche ou dépassé sans reconduction. */
  aRenouveler: boolean;
}

/** Ce qu'on affiche d'un contrat, du plus urgent au plus tranquille. */
export function etatContrat(
  c: Pick<Contrat, 'debut' | 'fin' | 'tacite' | 'preavis_mois'>,
  renouvellement: { statut: StatutDocument; numero: string | null } | null,
  jour: string,
): EtatContrat {
  const p = periodeEnCours(c, jour);
  const limite = limitePreavis(p.fin, c.preavis_mois);
  if (renouvellement?.statut === 'signe') {
    return { ton: 'vert', etiquette: 'Renouvellement signé', detail: `Devis ${renouvellement.numero ?? ''} signé : reportez les nouvelles dates sur le contrat.`, aRenouveler: false };
  }
  if (renouvellement && renouvellement.statut !== 'refuse' && renouvellement.statut !== 'annule') {
    return {
      ton: 'bleu',
      etiquette: 'Renouvellement proposé',
      detail: renouvellement.numero ? `Devis ${renouvellement.numero} envoyé, en attente de signature.` : 'Proposition en brouillon, à finaliser et envoyer.',
      aRenouveler: false,
    };
  }
  if (p.fin < jour) return { ton: 'gris', etiquette: 'Terminé', detail: `Terminé le ${jjmm(p.fin)}.`, aRenouveler: false };
  const j = ecart(jour, limite);
  if (j < 0) {
    return c.tacite
      ? { ton: 'vert', etiquette: 'Reconduit', detail: `Reconduction tacite le ${jjmm(ajouterJours(p.fin, 1))}.`, aRenouveler: false }
      : { ton: 'rouge', etiquette: 'Préavis dépassé', detail: `Sans renouvellement signé, le contrat s’arrête le ${jjmm(p.fin)}.`, aRenouveler: true };
  }
  if (j <= 90) {
    return { ton: 'violet', etiquette: 'À renouveler', detail: `Envoyez la proposition avant le ${jjmm(limite)} (dans ${j} jour${j > 1 ? 's' : ''}).`, aRenouveler: true };
  }
  return {
    ton: 'vert',
    etiquette: p.reconduit ? 'Reconduit' : 'Actif',
    detail: `${p.reconduit ? `Reconduit jusqu’au ${jjmm(p.fin)}. ` : ''}Date limite de préavis : ${jjmm(limite)}.`,
    aRenouveler: false,
  };
}

export interface InterventionContrat {
  id: string;
  reference: string | null;
  date_prevue: string | null;
  souhaitee_le: string | null;
  statut: StatutIntervention;
}

export interface Visite {
  date: string;
  /** Tombe après la fin d'un contrat sans reconduction tacite. */
  apresFin: boolean;
  intervention: InterventionContrat | null;
  faite: boolean;
}

const FAITE: StatutIntervention[] = ['terminee', 'validee', 'facturee'];

/** Dernière visite connue : celle notée sur le contrat, ou la dernière intervention faite. */
export function derniereVisite(c: Pick<Contrat, 'debut' | 'derniere_visite'>, interventions: InterventionContrat[]): string {
  return interventions.reduce(
    (d, i) => (i.date_prevue && FAITE.includes(i.statut) && i.date_prevue > d ? i.date_prevue : d),
    c.derniere_visite ?? c.debut,
  );
}

/**
 * Visites des douze prochains mois (et du mois écoulé), à intervalles réguliers
 * depuis la dernière visite. Chacune est rapprochée de l'intervention du
 * contrat la plus proche (quelques jours d'écart au plus).
 */
export function visitesAVenir(
  c: Pick<Contrat, 'debut' | 'fin' | 'tacite' | 'visites_par_an' | 'derniere_visite'>,
  interventions: InterventionContrat[],
  jour: string,
): Visite[] {
  const n = Math.max(1, Math.min(52, Math.round(c.visites_par_an)));
  const mois = 12 % n === 0 ? 12 / n : null;
  const pasJours = Math.round(365 / n);
  const fenetre = Math.min(20, Math.floor(pasJours / 2));
  const debutFenetre = ajouterMois(jour, -1);
  const finFenetre = ajouterMois(jour, 12);
  const finContrat = c.tacite ? '9999-12-31' : c.fin;
  const pris = new Set<string>();
  const out: Visite[] = [];
  let d = derniereVisite(c, interventions);
  for (let k = 0; k < 120; k++) {
    d = mois ? ajouterMois(d, mois) : ajouterJours(d, pasJours);
    if (d > finFenetre) break;
    if (d < debutFenetre) continue;
    const proche = interventions
      .filter((i) => !pris.has(i.id))
      .map((i) => ({ i, e: Math.abs(ecart(i.date_prevue ?? i.souhaitee_le ?? '1970-01-01', d)) }))
      .filter((x) => x.e <= fenetre)
      .sort((a, b) => a.e - b.e)[0]?.i;
    if (proche) pris.add(proche.id);
    out.push({ date: d, apresFin: d > finContrat, intervention: proche ?? null, faite: !!proche && FAITE.includes(proche.statut) });
  }
  return out;
}

/** Visites à créer : sans intervention, et pas après la fin d'un contrat qui s'arrête. */
export const visitesAPlanifier = (v: Visite[]) => v.filter((x) => !x.intervention && !x.apresFin);

/** Lignes du devis de renouvellement : les visites, l'attestation, et les dépannages inclus dès 2 visites par an. */
export function lignesRenouvellement(c: Pick<Contrat, 'objet' | 'visites_par_an' | 'fournitures_visite' | 'heures_visite'>, tva: number): LigneDocument[] {
  const n = c.visites_par_an;
  const ligne = (designation: string, unite: string, quantite: number, achat: number, heures: number): LigneDocument => ({
    designation,
    quantite,
    unite,
    prix_unitaire: 0,
    tva,
    achat,
    heures,
    prix_calcule: true,
  });
  return [
    { designation: `Visites d’entretien (${n} par an)`, quantite: 0, unite: '', prix_unitaire: 0, tva, titre: true },
    ligne(`Visite d’entretien : ${c.objet.charAt(0).toLowerCase()}${c.objet.slice(1)}`, 'visite', n, Number(c.fournitures_visite) || 0, Number(c.heures_visite) || 0),
    ligne('Attestation d’entretien et rapport de visite', 'u', n, 0, 0.25),
    ...(n >= 2
      ? [
          { designation: 'Dépannages inclus', quantite: 0, unite: '', prix_unitaire: 0, tva, titre: true },
          ligne('Main-d’œuvre de dépannage en heures ouvrées (forfait annuel)', 'forfait', 1, 0, Math.max(2, Math.round(n * 0.75))),
        ]
      : []),
  ];
}
