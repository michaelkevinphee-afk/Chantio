import { liensNavigation, type Point } from '@chantio/shared';
import { Alert, Linking, Platform } from 'react-native';

export function ouvrirCarte(adresse: string) {
  const q = encodeURIComponent(adresse);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(url).catch(() => {});
}

export function appeler(telephone: string) {
  Linking.openURL(`tel:${telephone.replace(/[^\d+]/g, '')}`).catch(() => {});
}

/** Propose Plans, Google Maps ou Waze pour aller jusqu'au chantier. */
export function naviguer(p: Point, titre: string) {
  const l = liensNavigation(p);
  const ouvrir = (url: string) => () => Linking.openURL(url).catch(() => {});
  if (Platform.OS === 'web') return ouvrir(l.googleMaps)();
  Alert.alert(titre, 'Avec quelle appli ?', [
    ...(Platform.OS === 'ios' ? [{ text: 'Plans', onPress: ouvrir(l.plans) }] : []),
    { text: 'Google Maps', onPress: ouvrir(l.googleMaps) },
    { text: 'Waze', onPress: ouvrir(l.waze) },
    { text: 'Annuler', style: 'cancel' as const },
  ]);
}
