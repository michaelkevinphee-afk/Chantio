import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SUPABASE_CLE, SUPABASE_URL, configurationOk } from './config';

let client: SupabaseClient | null = null;

/** Client Supabase, créé seulement si la configuration est présente. */
export function supabase(): SupabaseClient {
  if (!configurationOk) throw new Error('Configuration Supabase manquante');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_CLE, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Sur mobile, on ne rafraîchit le jeton que lorsque l'appli est au premier plan.
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (etat) => {
        if (etat === 'active') client?.auth.startAutoRefresh();
        else client?.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
