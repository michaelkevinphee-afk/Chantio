import { Linking, Platform } from 'react-native';

export function ouvrirCarte(adresse: string) {
  const q = encodeURIComponent(adresse);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(url).catch(() => {});
}

export function appeler(telephone: string) {
  Linking.openURL(`tel:${telephone.replace(/[^\d+]/g, '')}`).catch(() => {});
}
