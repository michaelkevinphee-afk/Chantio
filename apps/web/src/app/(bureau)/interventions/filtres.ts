import { ajouterJours, familleIntervention, jjmmaaaaBac, jourParis, lundiDe, type FamilleIntervention, type StatutIntervention } from '@chantio/shared';
import type { TonCompteur } from '@/components/compteurs-onglets';

// Règles de l'écran Interventions, lues à la fois par la page serveur (?statut=, ?type=, ?periode=),
// par la liste dans le navigateur et par le volet d'une intervention.

/** Les six compteurs-onglets du bac (FILTRES_I) : clé dans l'adresse, libellé, couleur, états compris. */
export const FILTRES = [
  { cle: 'toutes', libelle: 'Toutes', ton: 'gris', statuts: null },
  { cle: 'a_planifier', libelle: 'À planifier', ton: 'cobalt', statuts: ['a_planifier'] },
  { cle: 'planifiees', libelle: 'Planifiées', ton: 'cobalt', statuts: ['planifiee', 'en_cours'] },
  { cle: 'a_valider', libelle: 'À valider', ton: 'violet', statuts: ['terminee'] },
  { cle: 'a_reprendre', libelle: 'Renvoyées', ton: 'rouge', statuts: ['a_reprendre'] },
  { cle: 'terminees', libelle: 'Terminées', ton: 'vert', statuts: ['validee', 'facturee'] },
] as const satisfies readonly { cle: string; libelle: string; ton: TonCompteur; statuts: readonly StatutIntervention[] | null }[];

export type CleFiltre = (typeof FILTRES)[number]['cle'];

/** Anciennes adresses (liens de l'Accueil, favoris) : ?statut=terminee, validee, en_cours… */
const ALIAS: Record<string, CleFiltre> = {
  tous: 'toutes',
  planifiee: 'planifiees',
  en_cours: 'planifiees',
  terminee: 'a_valider',
  renvoyees: 'a_reprendre',
  validee: 'terminees',
  facturee: 'terminees',
  finies: 'terminees',
};

export function lireFiltre(v: unknown): CleFiltre {
  if (typeof v !== 'string') return 'toutes';
  if (FILTRES.some((f) => f.cle === v)) return v as CleFiltre;
  return ALIAS[v] ?? 'toutes';
}

export function dansFiltre(statut: StatutIntervention, filtre: CleFiltre): boolean {
  const f = FILTRES.find((x) => x.cle === filtre);
  return !f?.statuts || (f.statuts as readonly string[]).includes(statut);
}

/** « Tous les types » : les trois familles du bac, au pluriel. */
export const TYPES = [
  ['tous', 'Tous les types'],
  ['depannage', 'Dépannages'],
  ['chantier', 'Chantiers'],
  ['entretien', 'Entretiens'],
] as const;

export type CleType = FamilleIntervention | 'tous';

/** ?type= : une famille, ou un ancien type (sav, installation…) ramené à sa famille. */
export function lireType(v: unknown): CleType {
  if (typeof v !== 'string' || !v || v === 'tous') return 'tous';
  return familleIntervention(v);
}

export const PERIODES = [
  ['toutes', 'Toutes les dates'],
  ['aujourdhui', 'Aujourd’hui'],
  ['semaine', 'Cette semaine'],
  ['avenir', 'À venir'],
  ['passees', 'Passées'],
] as const;

export type Periode = (typeof PERIODES)[number][0];

export function lirePeriode(v: unknown): Periode {
  return PERIODES.find(([p]) => p === v)?.[0] ?? 'toutes';
}

/**
 * L'intervention tombe-t-elle dans la période choisie (jour = date du jour, AAAA-MM-JJ) ?
 * Un chantier sur plusieurs jours compte tant qu'il n'est pas fini.
 */
export function dansPeriode(date: string | null, periode: Periode, jour: string, fin?: string | null): boolean {
  if (periode === 'toutes') return true;
  if (!date) return false;
  const dernier = fin && fin > date ? fin : date;
  if (periode === 'aujourdhui') return date <= jour && jour <= dernier;
  if (periode === 'avenir') return dernier >= jour;
  if (periode === 'passees') return dernier < jour;
  const lundi = lundiDe(jour);
  return date <= ajouterJours(lundi, 6) && dernier >= lundi;
}

// ---------- Renvoi au technicien ----------

/** Le renvoi du bureau est noté en tête du mot du bureau, comme dans le bac : « À reprendre : … ». */
export const PREFIXE_RENVOI = 'À reprendre : ';

/** Le message du bureau lors du dernier renvoi (première ligne du mot du bureau), ou null. */
export function messageRenvoi(description: string | null | undefined): string | null {
  const premiere = description?.split('\n')[0] ?? '';
  return premiere.startsWith(PREFIXE_RENVOI) ? premiere.slice(PREFIXE_RENVOI.length).trim() || null : null;
}

/**
 * État affiché d'une intervention. La base repasse une fiche renvoyée par le bureau « à planifier »
 * ou « planifiée » (fonction renvoyer_intervention) : tant que le technicien n'a pas renvoyé de
 * nouvelle fiche, on l'affiche « À reprendre » (compteur « Renvoyées »), comme le bac.
 */
export function etatAffiche(i: {
  statut: StatutIntervention;
  description: string | null;
  fiches?: { envoyee_le: string | null }[] | null;
}): StatutIntervention {
  if ((i.statut === 'a_planifier' || i.statut === 'planifiee') && messageRenvoi(i.description) && i.fiches?.some((f) => f.envoyee_le))
    return 'a_reprendre';
  return i.statut;
}

// ---------- Dates et heures des horodatages (heure de Paris) ----------

const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** Horodatage → « 09:55 » (heure de Paris). */
export function heureParis(ts: string | null | undefined): string {
  if (!ts) return '';
  const t = Date.parse(ts);
  return Number.isNaN(t) ? '' : fmtHeure.format(t);
}

/** « aujourd’hui à 09:55 » ou « le 02/10/2026 à 10:40 » (quandTexte du bac). */
export function quandTexte(ts: string | null | undefined, jour: string): string {
  if (!ts) return '';
  const j = jourParis(ts);
  return `${j === jour ? 'aujourd’hui' : `le ${jjmmaaaaBac(j)}`} à ${heureParis(ts)}`;
}
