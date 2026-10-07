import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/config';

// Envoie un code de connexion par e-mail. Renvoie le message d'erreur, ou null.
// Client sans session : l'envoi ne touche pas à la connexion de la personne qui l'envoie.
export async function envoyerCode(email: string) {
  const envoi = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await envoi.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return null;
  console.error('Envoi du code impossible', error);
  return /rate|limit|seconds/i.test(error.message) ? 'trop d’envois rapprochés, réessayez dans une minute' : error.message;
}
