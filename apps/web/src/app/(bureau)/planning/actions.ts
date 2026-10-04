'use server';

import { revalidatePath } from 'next/cache';
import { contexteBureau } from '@/lib/session';

/** Heures par semaine d'un technicien et demi-journées gardées pour les urgences (dirigeant seulement). */
export async function reglerDisponibilite(membreId: string, heures: number, reserve: number[]): Promise<{ erreur: string | null }> {
  const { supabase, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { erreur: 'Seul le dirigeant règle les disponibilités.' };
  const h = Math.round(Number(heures) * 10) / 10;
  if (!Number.isFinite(h) || h < 0 || h > 80) return { erreur: 'Indiquez entre 0 et 80 heures par semaine.' };
  const demis = [...new Set(reserve.map(Number))].filter((k) => Number.isInteger(k) && k >= 0 && k <= 13).sort((a, b) => a - b);
  const { error, count } = await supabase
    .from('membres')
    .update({ heures_semaine: h, reserve_urgences: demis }, { count: 'exact' })
    .eq('id', membreId);
  if (error || !count) return { erreur: 'Les disponibilités n’ont pas pu être enregistrées.' };
  revalidatePath('/planning');
  return { erreur: null };
}
