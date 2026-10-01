import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Icone, type NomIcone } from './Icone';

type Variante = 'jaune' | 'marine' | 'blanc';

const FOND: Record<Variante, string> = { jaune: c.jaune, marine: c.marine, blanc: c.blanc };
const ENCRE: Record<Variante, string> = { jaune: c.marine, marine: c.blanc, blanc: c.marine };

export function Bouton({
  titre,
  onPress,
  variante = 'jaune',
  icone,
  iconeAvant,
  petit,
  desactive,
  chargement,
  style,
}: {
  titre: string;
  onPress?: () => void;
  variante?: Variante;
  icone?: NomIcone;
  iconeAvant?: NomIcone;
  petit?: boolean;
  desactive?: boolean;
  chargement?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const encre = ENCRE[variante];
  const inactif = desactive || chargement;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactif }}
      disabled={inactif}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        petit && styles.petit,
        { backgroundColor: FOND[variante], opacity: inactif ? 0.5 : pressed ? 0.85 : 1 },
        variante === 'blanc' && styles.ombre,
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {chargement ? (
        <ActivityIndicator color={encre} />
      ) : (
        <View style={styles.ligne}>
          {iconeAvant && <Icone nom={iconeAvant} couleur={encre} taille={petit ? 22 : 24} />}
          <Text style={[styles.texte, petit && styles.textePetit, { color: encre }]} numberOfLines={1}>
            {titre}
          </Text>
          {icone && <Icone nom={icone} couleur={encre} taille={petit ? 22 : 26} epaisseur={2.8} />}
        </View>
      )}
    </Pressable>
  );
}

/** Bouton carré (retour, fermer, appeler…). */
export function BoutonRond({ icone, onPress, label, grand, fond = c.blanc, couleur = c.marine }: {
  icone: NomIcone;
  onPress: () => void;
  label: string;
  grand?: boolean;
  fond?: string;
  couleur?: string;
}) {
  const t = grand ? 68 : 56;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: t, height: t, borderRadius: grand ? 22 : 20, backgroundColor: fond, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 },
        fond === c.blanc && styles.ombre,
      ]}
    >
      <Icone nom={icone} couleur={couleur} taille={grand ? 28 : 26} epaisseur={2.6} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bouton: { minHeight: 68, borderRadius: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  petit: { minHeight: 56, borderRadius: 18 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  texte: { fontFamily: polices.texte700, fontSize: 22 },
  textePetit: { fontSize: 19 },
  ombre: { borderBottomWidth: 1, borderBottomColor: c.ombre },
});
