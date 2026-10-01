import { View, type ViewProps } from 'react-native';

import { c, ombres } from '@/lib/theme';

/** Carte blanche du site : bord bleu clair, coins arrondis, halo bleu discret. `alerte` : fond rouge pâle. */
export function Carte({ style, alerte, ...props }: ViewProps & { alerte?: boolean }) {
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: alerte ? c.rougeDoux : c.blanc,
          borderWidth: 1,
          borderColor: alerte ? c.rougeDoux : c.trait,
          borderRadius: 22,
          padding: 18,
          gap: 10,
        },
        !alerte && { boxShadow: ombres.carte },
        style,
      ]}
    />
  );
}
