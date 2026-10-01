// Variables d'environnement lues au moment du build (préfixe EXPO_PUBLIC_).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_CLE =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const VARIABLES_MANQUANTES = [
  !SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL',
  !SUPABASE_CLE && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
].filter(Boolean) as string[];

export const configurationOk = VARIABLES_MANQUANTES.length === 0;
