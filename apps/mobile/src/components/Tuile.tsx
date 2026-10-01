import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Icone, type NomIcone } from './Icone';

/** Réponse en grosse tuile : on touche au lieu de choisir dans une liste. */
export function Tuile({ texte, choisie, onPress, icone }: {
  texte: string;
  choisie: boolean;
  onPress: () => void;
  icone?: NomIcone;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: choisie }}
      onPress={onPress}
      style={({ pressed }) => [styles.tuile, choisie && styles.choisie, pressed && { opacity: 0.85 }]}
    >
      {icone && (
        <View style={[styles.icone, choisie && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
          <Icone nom={icone} taille={26} couleur={choisie ? c.blanc : c.marine} />
        </View>
      )}
      <Text style={[styles.texte, choisie && { color: c.blanc }]}>{texte}</Text>
      {choisie && (
        <View style={styles.coche}>
          <Icone nom="check" taille={16} epaisseur={3} couleur={c.marine} />
        </View>
      )}
    </Pressable>
  );
}

/** Grille de tuiles sur deux colonnes. */
export function GrilleTuiles({ children }: { children: ReactNode }) {
  const tuiles = Children.toArray(children);
  const lignes: ReactNode[][] = [];
  for (let i = 0; i < tuiles.length; i += 2) lignes.push(tuiles.slice(i, i + 2));
  return (
    <View style={styles.grille}>
      {lignes.map((ligne, i) => (
        <View key={i} style={styles.ligne}>
          {ligne}
          {ligne.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grille: { gap: 12 },
  ligne: { flexDirection: 'row', gap: 12 },
  tuile: {
    flex: 1,
    minHeight: 96,
    backgroundColor: c.blanc,
    borderRadius: 24,
    padding: 16,
    justifyContent: 'space-between',
    gap: 10,
  },
  choisie: { backgroundColor: c.marine },
  icone: { width: 48, height: 48, borderRadius: 15, backgroundColor: c.beton, alignItems: 'center', justifyContent: 'center' },
  texte: { fontFamily: polices.texte700, fontSize: 19, lineHeight: 22, color: c.marine, paddingRight: 28 },
  coche: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.jaune,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
