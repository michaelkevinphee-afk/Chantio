import { Text, type TextProps, type TextStyle } from 'react-native';

import { c, polices } from '@/lib/theme';

/** Titre « panneau de chantier » : Barlow Condensed 800, majuscules. */
export function Titre({ taille = 40, style, ...props }: TextProps & { taille?: number }) {
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[{ fontFamily: polices.titre, fontSize: taille, lineHeight: taille * 1.02, textTransform: 'uppercase', color: c.encre }, style]}
    />
  );
}

type Variante = 'corps' | 'doux' | 'fort' | 'etiquette' | 'section';

const VARIANTES: Record<Variante, TextStyle> = {
  corps: { fontFamily: polices.texte, fontSize: 17, color: c.encre },
  doux: { fontFamily: polices.texte, fontSize: 17, color: c.texteDoux },
  fort: { fontFamily: polices.texte700, fontSize: 18, color: c.encre },
  etiquette: { fontFamily: polices.texte700, fontSize: 16, color: c.encre },
  section: { fontFamily: polices.texte700, fontSize: 14, color: c.texteDoux, textTransform: 'uppercase', letterSpacing: 1.1 },
};

export function Texte({ variante = 'corps', style, ...props }: TextProps & { variante?: Variante }) {
  return <Text {...props} style={[VARIANTES[variante], style]} />;
}
