// Cadre de réponse d'un appel d'offres (DPGF, DQE, BPU) : le tableau du client,
// lu depuis Excel ou CSV, devient les lignes du devis. Les quantités du
// client sont gardées ; chaque poste retrouve si possible un ouvrage de la
// bibliothèque (fourniture et temps de pose) pour que le coefficient calcule
// le prix.

import type { LigneDocument } from './devis.ts';

export interface OuvrageConnu {
  id: string;
  designation: string;
  unite: string;
  prix_achat: number;
  heures: number;
}

export interface LectureDpgf {
  lignes: LigneDocument[];
  postes: number;
  retrouves: number;
}

const sansAccent = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'pour', 'avec', 'sur', 'un', 'une', 'y', 'compris', 'yc']);

/** Mots significatifs d'une désignation (« Colonne montante cuivre Ø28 » → colonne, montante, cuivre, ø28). */
export function motsDesignation(t: string): string[] {
  return sansAccent(t)
    .replace(/[^\p{L}\p{N}ø.]+/gu, ' ')
    .split(/\s+/)
    .map((m) => m.replace(/^\.+|\.+$/g, ''))
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/** L'ouvrage de la bibliothèque le plus proche d'un poste, s'il lui ressemble assez. */
export function retrouverOuvrage<T extends OuvrageConnu>(designation: string, unite: string, ouvrages: T[]): T | null {
  const mots = new Set(motsDesignation(designation));
  if (!mots.size) return null;
  let meilleur: T | null = null;
  let score = 0;
  for (const o of ouvrages) {
    const autres = motsDesignation(o.designation);
    if (!autres.length) continue;
    const communs = autres.filter((m) => mots.has(m)).length;
    // Part des mots communs, des deux côtés ; même unité en bonus.
    const s = (communs / mots.size + communs / autres.length) / 2 + (normaliserUnite(o.unite) === normaliserUnite(unite) ? 0.1 : 0);
    if (communs >= 2 && s > score) {
      score = s;
      meilleur = o;
    }
  }
  return score >= 0.6 ? meilleur : null;
}

/** « M2 », « m² », « ML », « ens » → l'unité de Chantio. */
export function normaliserUnite(u: string): string {
  const t = sansAccent(String(u ?? '').trim()).replace(/\s+/g, '').replace(/\.$/, '');
  if (!t) return 'u';
  if (/^(m2|m²)$/.test(t)) return 'm²';
  if (/^(m3|m³)$/.test(t)) return 'm³';
  if (/^(ml|mlin|metrelineaire)$/.test(t)) return 'ml';
  if (/^(m|metre)$/.test(t)) return 'm';
  if (/^(u|un|unite|pce|piece|pc|nb|nombre)$/.test(t)) return 'u';
  if (/^(ens|ensemble)$/.test(t)) return 'ens.';
  if (/^(ft|f|forf|forfait|fft)$/.test(t)) return 'forfait';
  if (/^(h|heure|heures)$/.test(t)) return 'h';
  if (/^(kg)$/.test(t)) return 'kg';
  return String(u).trim().slice(0, 20);
}

/** « 1 234,5 » ou « 1234.5 » → 1234.5 ; vide ou texte → null. */
function quantite(v: string): number | null {
  const t = String(v ?? '').replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Repère les colonnes dans la ligne d'en-tête du tableau. */
function colonnes(rangees: string[][]) {
  for (let i = 0; i < Math.min(rangees.length, 30); i++) {
    const r = rangees[i].map((c) => sansAccent(String(c ?? '')));
    const des = r.findIndex((c) => /designation|libelle|description|ouvrage|intitule|prestation/.test(c));
    const qte = r.findIndex((c) => /^(qte|qt|quantite|quantites|q)\b|quantit/.test(c));
    if (des < 0 || qte < 0) continue;
    return {
      entete: i,
      des,
      qte,
      unite: r.findIndex((c) => /^u\.?$|^unite|unit/.test(c)),
      ref: r.findIndex((c, k) => k !== des && /^(n|no|num|numero|n°|ref|reference|article|art|code|poste|item|repere)\b|^n°|^n\s?°/.test(c)),
    };
  }
  return null;
}

/**
 * Le tableau du client (rangées de cellules) devient des lignes de devis :
 * une rangée sans quantité devient un titre de lot, une rangée avec une
 * quantité devient un poste chiffré par le coefficient.
 */
export function lireDpgf(rangees: string[][], ouvrages: OuvrageConnu[], tva: number): LectureDpgf | null {
  const c = colonnes(rangees);
  if (!c) return null;
  const lignes: LigneDocument[] = [];
  let postes = 0;
  let retrouves = 0;
  for (const r of rangees.slice(c.entete + 1)) {
    const designation = String(r[c.des] ?? '').trim();
    const ref = c.ref >= 0 ? String(r[c.ref] ?? '').trim() : '';
    if (!designation) continue;
    if (/^(total|sous[- ]total|montant|tva|ttc|report)/i.test(sansAccent(designation))) continue;
    const q = quantite(String(r[c.qte] ?? ''));
    const unite = c.unite >= 0 ? String(r[c.unite] ?? '').trim() : '';
    if (q === null && !unite) {
      lignes.push({ titre: true, designation: [ref, designation].filter(Boolean).join(' · ').slice(0, 500), quantite: 0, unite: 'u', prix_unitaire: 0, tva });
      continue;
    }
    const u = normaliserUnite(unite);
    const o = retrouverOuvrage(designation, u, ouvrages);
    postes++;
    if (o) retrouves++;
    lignes.push({
      designation: designation.slice(0, 500),
      quantite: q ?? 0,
      unite: u,
      prix_unitaire: 0,
      tva,
      reference: ref.slice(0, 40) || null,
      achat: o ? o.prix_achat : null,
      heures: o ? o.heures : null,
      prix_calcule: true,
      article_id: o?.id ?? null,
    });
  }
  return postes ? { lignes, postes, retrouves } : null;
}
