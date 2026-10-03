// Équipe en direct : position du téléphone pour le bureau.
// Le technicien active le partage dans l'écran Moi. L'appli envoie alors sa position
// toutes les 2 minutes, seulement pendant les heures de travail et tant qu'elle est ouverte
// (Expo Go ne permet pas l'envoi appli fermée ; il viendra avec la vraie appli).
import { enHeuresDeTravail, INTERVALLE_POSITION_MS } from '@chantio/shared';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { PositionTelephone, Profil, SourceDonnees } from './donnees';

/** Demande l'autorisation de localisation (« pendant l'utilisation de l'appli »). */
export async function autoriserPosition(): Promise<boolean> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Position actuelle, sans jamais afficher de demande d'autorisation.
 * null si la localisation n'est pas autorisée ou ne répond pas à temps.
 */
export async function positionActuelle(delaiMs = 8000): Promise<PositionTelephone | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), delaiMs)),
    ]);
    const q = p ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    return q ? { lat: q.coords.latitude, lon: q.coords.longitude, precision: q.coords.accuracy ?? null } : null;
  } catch {
    return null;
  }
}

/** Envoie la position pendant les heures de travail, quand le partage est activé et l'appli ouverte. */
export function usePartagePosition(profil: Profil | null, source: SourceDonnees | null) {
  const actif = !!profil?.membre.partage_position && source?.mode === 'supabase';
  const horaires = profil?.entreprise.geolocalisation ?? null;
  const cleHoraires = JSON.stringify(horaires);

  useEffect(() => {
    if (!actif || !source) return;
    let minuterie: ReturnType<typeof setInterval> | null = null;
    let enCours = false;

    const envoyer = async () => {
      if (enCours || !enHeuresDeTravail(horaires)) return;
      enCours = true;
      try {
        const p = await positionActuelle();
        if (p) await source.partagerPosition(p);
      } catch {
        // Pas de réseau : la prochaine position partira dans 2 minutes.
      } finally {
        enCours = false;
      }
    };
    const demarrer = () => {
      if (minuterie) return;
      envoyer();
      minuterie = setInterval(envoyer, INTERVALLE_POSITION_MS);
    };
    const arreter = () => {
      if (minuterie) clearInterval(minuterie);
      minuterie = null;
    };

    if (AppState.currentState === 'active') demarrer();
    const sub = AppState.addEventListener('change', (e) => (e === 'active' ? demarrer() : arreter()));
    return () => {
      arreter();
      sub.remove();
    };
  }, [actif, source, cleHoraires]);
}
