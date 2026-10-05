'use server';

import { revalidatePath } from 'next/cache';
import type { BudgetPilotage, Douze, FamilleImportee, FraisBudget } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';

// Enregistrements du pilotage de l'année (Chiffres › Mon année, Paramètres › Pilotage) : réservés au dirigeant,
// comme les tables budgets et production_importee (la base refuse aussi les autres).

export type Resultat = { ok: true } | { ok: false; erreur: string };

const ERREUR_DIRIGEANT = 'Seul le dirigeant peut modifier le pilotage de l’année.';
const ERREUR_BASE = 'L’enregistrement n’a pas abouti. Réessayez dans un instant.';

/** Champs du budget qu'on accepte, avec leurs bornes (celles de la table). */
const BORNES: Partial<Record<keyof BudgetPilotage, [number, number]>> = {
  objectif_depannage: [0, 1e10],
  objectif_chantier: [0, 1e10],
  achats_pc: [0, 100],
  sous_traitance: [0, 1e10],
  salaires: [0, 1e10],
  charges_pc: [0, 200],
  coef_depannage: [1, 10],
  coef_chantier: [1, 10],
  impot_pc: [0, 100],
  carnet_accepte: [0, 1e12],
  carnet_facture: [0, 1e12],
};

type ModifBudget = Partial<Omit<BudgetPilotage, 'annee'>>;

/** Garde les champs connus et des valeurs dans les bornes ; renvoie un message sinon. */
function nettoyer(m: ModifBudget): Record<string, unknown> | string {
  const sortie: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(m)) {
    const bornes = BORNES[cle as keyof BudgetPilotage];
    if (bornes) {
      if (v == null && (cle === 'carnet_accepte' || cle === 'carnet_facture')) sortie[cle] = null;
      else {
        const n = Number(v);
        if (!Number.isFinite(n) || n < bornes[0] || n > bornes[1]) return `Cette valeur n’est pas possible (entre ${bornes[0]} et ${bornes[1].toLocaleString('fr-FR')}).`;
        sortie[cle] = Math.round(n * 1000) / 1000;
      }
    } else if (cle === 'frais') {
      if (!Array.isArray(v) || v.length > 100) return 'La liste des frais n’est pas valide.';
      const frais: FraisBudget[] = [];
      for (const f of v as FraisBudget[]) {
        const libelle = String(f?.libelle ?? '').trim().slice(0, 120);
        const montant = Number(f?.montant);
        if (!Number.isFinite(montant) || montant < 0 || montant > 1e10) return `Le montant de « ${libelle || 'frais'} » n’est pas valide.`;
        frais.push({ libelle, montant: Math.round(montant * 100) / 100 });
      }
      sortie.frais = frais;
    } else if (cle === 'aide') {
      if (v == null) sortie.aide = null;
      else {
        const a = v as unknown as Record<string, unknown>;
        const aide: Record<string, number> = {};
        for (const k of ['compagnons', 'heures', 'taux', 'part_pc', 'fournitures_pc']) {
          const n = Number(a[k]);
          if (!Number.isFinite(n) || n < 0 || n > 1e6) return 'L’aide au calcul de l’objectif n’est pas valide.';
          aide[k] = n;
        }
        sortie.aide = aide;
      }
    } else if (cle === 'carnet_le') {
      if (v != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'La date du carnet n’est pas valide.';
      sortie.carnet_le = v ?? null;
    }
  }
  return sortie;
}

async function dirigeant() {
  const ctx = await contexteBureau();
  return ctx.membre.role === 'dirigeant' ? ctx : null;
}

const anneeValide = (a: number) => Number.isInteger(a) && a >= 2000 && a <= 2100;

async function ecrireBudget(ctx: NonNullable<Awaited<ReturnType<typeof dirigeant>>>, annee: number, champs: Record<string, unknown>) {
  if (!Object.keys(champs).length) return null;
  const { error } = await ctx.supabase
    .from('budgets')
    .upsert({ entreprise_id: ctx.entreprise.id, annee, ...champs }, { onConflict: 'entreprise_id,annee' });
  return error;
}

/** Enregistre un ou plusieurs champs du budget de l'année (le budget est créé au premier enregistrement). */
export async function enregistrerBudget(annee: number, modif: ModifBudget): Promise<Resultat> {
  const ctx = await dirigeant();
  if (!ctx) return { ok: false, erreur: ERREUR_DIRIGEANT };
  if (!anneeValide(annee)) return { ok: false, erreur: ERREUR_BASE };
  const champs = nettoyer(modif);
  if (typeof champs === 'string') return { ok: false, erreur: champs };
  if (await ecrireBudget(ctx, annee, champs)) return { ok: false, erreur: ERREUR_BASE };
  revalidatePath('/chiffres');
  return { ok: true };
}

/** Un mois facturé hors Chantio : montant HT, ou null pour l'effacer (Chantio reprend alors ses factures). */
export async function enregistrerMois(annee: number, mois: number, famille: FamilleImportee, montant: number | null): Promise<Resultat> {
  const ctx = await dirigeant();
  if (!ctx) return { ok: false, erreur: ERREUR_DIRIGEANT };
  if (!anneeValide(annee) || !Number.isInteger(mois) || mois < 0 || mois > 11 || !['depannage', 'chantier', 'total'].includes(famille))
    return { ok: false, erreur: ERREUR_BASE };
  const date = `${annee}-${String(mois + 1).padStart(2, '0')}-01`;
  if (montant == null) {
    const { error } = await ctx.supabase.from('production_importee').delete().eq('mois', date).eq('famille', famille);
    if (error) return { ok: false, erreur: ERREUR_BASE };
  } else {
    if (!Number.isFinite(montant) || Math.abs(montant) > 1e10) return { ok: false, erreur: 'Ce montant n’est pas valide.' };
    const { error } = await ctx.supabase
      .from('production_importee')
      .upsert(
        { entreprise_id: ctx.entreprise.id, mois: date, famille, montant_ht: Math.round(montant * 100) / 100, source: 'manuel', importe_le: new Date().toISOString() },
        { onConflict: 'entreprise_id,mois,famille' },
      );
    if (error) return { ok: false, erreur: ERREUR_BASE };
  }
  revalidatePath('/chiffres');
  return { ok: true };
}

/**
 * Enregistre ce qu'on a lu dans un fichier de pilotage : les champs du budget trouvés (les autres ne
 * bougent pas), les mois de l'année (dépannages, chantiers) et ceux de l'année précédente (total).
 * Un mois vide dans le fichier ne remplace rien.
 */
export async function importerPilotage(annee: number, lu: { budget: ModifBudget; dep: Douze; cha: Douze; n1: Douze }): Promise<Resultat> {
  const ctx = await dirigeant();
  if (!ctx) return { ok: false, erreur: ERREUR_DIRIGEANT };
  if (!anneeValide(annee)) return { ok: false, erreur: ERREUR_BASE };
  const champs = nettoyer(lu.budget ?? {});
  if (typeof champs === 'string') return { ok: false, erreur: champs };

  const lignes: { entreprise_id: string; mois: string; famille: FamilleImportee; montant_ht: number; source: 'excel'; importe_le: string }[] = [];
  const maintenant = new Date().toISOString();
  const ajouter = (t: Douze | undefined, a: number, famille: FamilleImportee) => {
    if (!Array.isArray(t)) return;
    t.slice(0, 12).forEach((v, m) => {
      if (v == null || !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 1e10) return;
      lignes.push({ entreprise_id: ctx.entreprise.id, mois: `${a}-${String(m + 1).padStart(2, '0')}-01`, famille, montant_ht: Math.round(Number(v) * 100) / 100, source: 'excel', importe_le: maintenant });
    });
  };
  ajouter(lu.dep, annee, 'depannage');
  ajouter(lu.cha, annee, 'chantier');
  ajouter(lu.n1, annee - 1, 'total');
  if (!lignes.length && !Object.keys(champs).length) return { ok: false, erreur: 'Rien à enregistrer : aucun chiffre n’a été trouvé dans ce fichier.' };

  if (await ecrireBudget(ctx, annee, champs)) return { ok: false, erreur: ERREUR_BASE };
  if (lignes.length) {
    const { error } = await ctx.supabase.from('production_importee').upsert(lignes, { onConflict: 'entreprise_id,mois,famille' });
    if (error) return { ok: false, erreur: ERREUR_BASE };
  }
  revalidatePath('/chiffres');
  revalidatePath('/parametres');
  return { ok: true };
}
