'use server';

import { revalidatePath } from 'next/cache';
import { mission } from '@/lib/premiers-pas';
import { contexte } from '@/lib/session';

// « Mes premiers pas » : la mission terminée en visite guidée, ou la carte masquée, se notent
// dans le compte (user_metadata), puis la session est rafraîchie pour que l'Accueil le relise.

async function noter(maj: (meta: Record<string, unknown>) => Record<string, unknown>) {
  const { supabase } = await contexte();
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.auth.updateUser({ data: maj(data.user?.user_metadata ?? {}) });
  if (error) return { ok: false as const };
  await supabase.auth.refreshSession();
  revalidatePath('/');
  return { ok: true as const };
}

export async function terminerMission(id: string) {
  if (!mission(id)) return { ok: false as const };
  return noter((meta) => {
    const avant = Array.isArray(meta.premiers_pas) ? (meta.premiers_pas as string[]) : [];
    return { premiers_pas: avant.includes(id) ? avant : [...avant, id] };
  });
}

export async function masquerPremiersPas(masque: boolean) {
  return noter(() => ({ premiers_pas_masque: masque }));
}
