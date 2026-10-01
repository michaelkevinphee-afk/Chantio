import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Liens temporaires vers les photos de profil et le logo (stockage privé « profils »). */
export async function liensProfils(supabase: SupabaseClient, chemins: (string | null | undefined)[]) {
  const uniques = [...new Set(chemins.filter((c): c is string => !!c))];
  const liens = new Map<string, string>();
  if (!uniques.length) return liens;
  const { data } = await supabase.storage.from('profils').createSignedUrls(uniques, 60 * 60);
  for (const l of data ?? []) if (l.path && l.signedUrl) liens.set(l.path, l.signedUrl);
  return liens;
}
