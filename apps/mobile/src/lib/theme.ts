import type { Ton } from '@chantio/shared';

// Couleurs de l'appli mobile (style v2 validé : marine + jaune chantier, fond béton).
// Le site interne suit la charte du site Chantio (palette commune de @chantio/shared).
export const couleurs = {
  marine: '#14213D',
  marineClair: '#2A3B5F',
  jaune: '#F2B705',
  jauneDoux: '#FDF3D0',
  beton: '#F2F1EC',
  blanc: '#FFFFFF',
  encre: '#14213D',
  gris: '#6B7280',
  grisClair: '#E5E3DC',
  vert: '#1F8A4C',
  vertDoux: '#DDF3E5',
  rouge: '#C0392B',
  rougeDoux: '#FBE3E0',
  bleu: '#2563EB',
  bleuDoux: '#E0EAFD',
} as const;

const jaune = { fond: couleurs.jauneDoux, texte: '#8A6100' };

export const tons: Record<Ton, { fond: string; texte: string }> = {
  gris: { fond: '#ECEBE6', texte: '#4B5563' },
  bleu: { fond: couleurs.bleuDoux, texte: '#1E40AF' },
  cobalt: jaune,
  violet: jaune,
  vert: { fond: couleurs.vertDoux, texte: couleurs.vert },
  rouge: { fond: couleurs.rougeDoux, texte: couleurs.rouge },
};

/** Compléments propres au mobile (style v2). */
export const c = {
  ...couleurs,
  texteDoux: '#5E6678',
  ligne: '#E4E2DA',
  marineSoft: '#C9D0E0',
  ombre: '#DDDAD0',
};

export const polices = {
  titre: 'BarlowCondensed_800ExtraBold',
  titre700: 'BarlowCondensed_700Bold',
  texte: 'Barlow_500Medium',
  texte600: 'Barlow_600SemiBold',
  texte700: 'Barlow_700Bold',
};
