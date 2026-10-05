import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MISSIONS, type IdMission } from './premiers-pas';

// Ce qui est fait dans « Mes premiers pas » : les missions terminées en visite guidée
// (mémorisées dans le compte, user_metadata.premiers_pas), et ce que l'entreprise a déjà fait
// pour de vrai (premier client, première intervention…). Les données d'exemple du compte de
// démonstration (clients notés « exemple-chantio ») ne comptent pas : là, seules les visites cochent.

export type PremiersPas = { faites: IdMission[]; masque: boolean };

const compte = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0;

export async function chargerPremiersPas(supabase: SupabaseClient, membreId: string): Promise<PremiersPas> {
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims?.user_metadata ?? {}) as { premiers_pas?: unknown; premiers_pas_masque?: unknown };
  const memorisees = new Set(Array.isArray(meta.premiers_pas) ? (meta.premiers_pas as string[]) : []);
  const masque = meta.premiers_pas_masque === true;
  if (masque) return { faites: [], masque };

  const tete = { count: 'exact' as const, head: true };
  const exemples = await compte(supabase.from('clients').select('id', tete).eq('notes', 'exemple-chantio'));
  if (!exemples) {
    const [client, inter, fiche, devis, facture, idee] = await Promise.all([
      compte(supabase.from('clients').select('id', tete)),
      compte(supabase.from('interventions').select('id', tete)),
      compte(supabase.from('fiches').select('id', tete).not('envoyee_le', 'is', null)),
      compte(supabase.from('documents').select('id', tete).eq('genre', 'devis').not('numero', 'is', null)),
      compte(supabase.from('documents').select('id', tete).eq('genre', 'facture').not('numero', 'is', null)),
      compte(supabase.from('retours').select('id', tete).eq('membre_id', membreId)),
    ]);
    const vrai: Record<IdMission, boolean> = { client, inter, fiche, devis, facture, idee };
    for (const m of MISSIONS) if (vrai[m.id]) memorisees.add(m.id);
  }
  return { faites: MISSIONS.filter((m) => memorisees.has(m.id)).map((m) => m.id), masque };
}
