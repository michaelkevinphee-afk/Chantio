// Couleurs de Chantio (style v2 validé : marine + jaune chantier, fond béton).

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

export const tons = {
  gris: { fond: '#ECEBE6', texte: '#4B5563' },
  bleu: { fond: couleurs.bleuDoux, texte: '#1E40AF' },
  jaune: { fond: couleurs.jauneDoux, texte: '#8A6100' },
  vert: { fond: couleurs.vertDoux, texte: couleurs.vert },
  rouge: { fond: couleurs.rougeDoux, texte: couleurs.rouge },
} as const;
