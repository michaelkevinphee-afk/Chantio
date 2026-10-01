import { StyleSheet, Text, View } from 'react-native';

import type { Etape } from '@/lib/tournee';
import { c, polices } from '@/lib/theme';
import type { Point } from '@chantio/shared';

/** Dans le navigateur (simulateur), la carte n'existe pas : on garde la liste numérotée. */
export function CarteTournee(_: { etapes: Etape[]; depart: Point | null; onChoisir: (e: Etape) => void }) {
  return (
    <View style={styles.cadre}>
      <Text style={styles.texte}>La carte s'affiche sur le téléphone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { height: 120, borderRadius: 22, borderWidth: 1, borderColor: c.trait, backgroundColor: c.doux, alignItems: 'center', justifyContent: 'center' },
  texte: { fontFamily: polices.texte600, fontSize: 15, color: c.gris },
});
