import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

// Clé secrète du projet Supabase (« service_role » ou « sb_secret_… »), facultative.
// À régler dans Vercel : SUPABASE_SERVICE_ROLE_KEY. Sert uniquement à confirmer
// d'office l'identité d'un dirigeant dont le nom figure au registre ; sans elle,
// la demande attend le contrôle de Chantio.
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const serviceActif = Boolean(CLE && SUPABASE_URL);

export function supabaseService() {
  return createClient(SUPABASE_URL, CLE, { auth: { persistSession: false, autoRefreshToken: false } });
}
