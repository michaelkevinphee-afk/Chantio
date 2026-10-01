import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { c, ombres, polices } from '@/lib/theme';
import { Appui } from './Anime';
import { Degrade } from './Degrade';
import { Icone, type NomIcone } from './Icone';

/**
 * - `principal` : dégradé cobalt, texte blanc (l'action de l'écran) ;
 * - `secondaire` : blanc bordé de bleu clair, texte encre ;
 * - `clair` : blanc, texte cobalt, posé sur un bloc cobalt.
 */
type Variante = 'principal' | 'secondaire' | 'clair';

const FOND: Record<Variante, string> = { principal: c.cobalt, secondaire: c.blanc, clair: c.blanc };
const ENCRE: Record<Variante, string> = { principal: c.blanc, secondaire: c.encre, clair: c.cobalt };
const RAYON = 18;
const RAYON_PETIT = 16;

export function Bouton({
  titre,
  onPress,
  variante = 'principal',
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
    <Appui
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactif }}
      disabled={inactif}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bouton,
        petit && styles.petit,
        { backgroundColor: FOND[variante], opacity: inactif ? 0.5 : pressed ? 0.88 : 1 },
        variante === 'principal' && !inactif && styles.halo,
        variante === 'secondaire' && styles.bord,
        style,
      ]}
    >
      {variante === 'principal' && <Degrade rayon={petit ? RAYON_PETIT : RAYON} />}
      {chargement ? (
        <ActivityIndicator color={encre} />
      ) : (
        <View style={styles.ligne}>
          {iconeAvant && <Icone nom={iconeAvant} couleur={encre} taille={petit ? 22 : 24} />}
          <Text style={[styles.texte, petit && styles.textePetit, { color: encre }]} numberOfLines={1}>
            {titre}
          </Text>
          {icone && <Icone nom={icone} couleur={encre} taille={petit ? 22 : 24} epaisseur={2.8} />}
        </View>
      )}
    </Appui>
  );
}

/** Bouton carré (retour, appeler…) ou rond (fermer, retour en haut d'écran). */
export function BoutonRond({ icone, onPress, label, grand, rond, fond = c.blanc, couleur = c.encre }: {
  icone: NomIcone;
  onPress: () => void;
  label: string;
  grand?: boolean;
  /** Cercle de 52 px, comme en haut des écrans de la maquette. */
  rond?: boolean;
  fond?: string;
  couleur?: string;
}) {
  const t = grand ? 68 : rond ? 52 : 56;
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      echelle={0.92}
      style={({ pressed }) => [
        { width: t, height: t, borderRadius: rond ? t / 2 : grand ? RAYON : 16, backgroundColor: fond, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 },
        fond === c.blanc && styles.rondBlanc,
        fond === c.cobalt && styles.halo,
      ]}
    >
      <Icone nom={icone} couleur={couleur} taille={grand ? 28 : rond ? 24 : 26} epaisseur={2.6} />
    </Appui>
  );
}

const styles = StyleSheet.create({
  bouton: { minHeight: 68, borderRadius: RAYON, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  petit: { minHeight: 56, borderRadius: RAYON_PETIT },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  texte: { fontFamily: polices.texte800, fontSize: 19, letterSpacing: -0.2 },
  textePetit: { fontSize: 17 },
  halo: { boxShadow: ombres.bouton },
  bord: { borderWidth: 2, borderColor: c.trait },
  rondBlanc: { borderWidth: 1, borderColor: c.trait, boxShadow: ombres.carte },
});
