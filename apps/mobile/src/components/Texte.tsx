import { Text, type TextProps, type TextStyle } from 'react-native';

import { c, polices, serre } from '@/lib/theme';

/** Titre du site : Plus Jakarta Sans ExtraBold, en minuscules, lettres resserrées. */
export function Titre({ taille = 34, style, ...props }: TextProps & { taille?: number }) {
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[{ fontFamily: polices.titre, fontSize: taille, lineHeight: Math.round(taille * 1.12), letterSpacing: serre(taille), color: c.encre }, style]}
    />
  );
}

type Variante = 'corps' | 'doux' | 'fort' | 'etiquette' | 'section';

const VARIANTES: Record<Variante, TextStyle> = {
  corps: { fontFamily: polices.texte, fontSize: 17, color: c.encre },
  doux: { fontFamily: polices.texte, fontSize: 17, color: c.gris },
  fort: { fontFamily: polices.texte700, fontSize: 18, color: c.encre },
  etiquette: { fontFamily: polices.texte700, fontSize: 16, color: c.encre },
  // « Surtitre » du site : petites capitales cobalt espacées.
  section: { fontFamily: polices.texte700, fontSize: 14, color: c.cobalt, textTransform: 'uppercase', letterSpacing: 1.1 },
};

export function Texte({ variante = 'corps', style, ...props }: TextProps & { variante?: Variante }) {
  return <Text {...props} style={[VARIANTES[variante], style]} />;
}
