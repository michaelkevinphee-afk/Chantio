// Couleurs de Chantio : la charte du site (bleu cobalt, pervenche, lavande du logo),
// fond bleuté clair, dégradés vifs. Le bleu encre sert au texte, jamais en aplat,
// et pas d'orange.

export const couleurs = {
  encre: '#101A3D',
  cobalt: '#2F54EB',
  cobaltVif: '#4467FA',
  pervenche: '#7C93F5',
  lavande: '#B9C6FB',
  fond: '#F4F6FF',
  doux: '#E9EEFF',
  trait: '#D9E0F7',
  blanc: '#FFFFFF',
  gris: '#5B6480',
  menthe: '#12B76A',
  vert: '#067647',
  vertDoux: '#DCFAE6',
  violet: '#5925DC',
  violetDoux: '#ECE9FE',
  rouge: '#D92D20',
  rougeDoux: '#FEE4E2',
} as const;

/** Dégradé des boutons et bandeaux du site (120°, du cobalt à la pervenche). */
export const degrade = [couleurs.cobalt, couleurs.cobaltVif, couleurs.pervenche] as const;

export const tons = {
  gris: { fond: '#EEF1FB', texte: couleurs.gris },
  bleu: { fond: '#E3E9FF', texte: '#2442C4' },
  cobalt: { fond: couleurs.cobalt, texte: couleurs.blanc },
  violet: { fond: couleurs.violetDoux, texte: couleurs.violet },
  vert: { fond: couleurs.vertDoux, texte: couleurs.vert },
  rouge: { fond: couleurs.rougeDoux, texte: couleurs.rouge },
} as const;
