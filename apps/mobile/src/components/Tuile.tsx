import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { c, ombres, polices } from '@/lib/theme';
import { Appui, Apparition, Pop } from './Anime';
import { Degrade } from './Degrade';
import { Icone, type NomIcone } from './Icone';

/** Réponse en grosse tuile : on touche au lieu de choisir dans une liste. */
export function Tuile({ texte, choisie, onPress, icone }: {
  texte: string;
  choisie: boolean;
  onPress: () => void;
  icone?: NomIcone;
}) {
  return (
    <Appui
      accessibilityRole="checkbox"
      accessibilityState={{ checked: choisie }}
      onPress={onPress}
      echelle={0.96}
      style={[styles.tuile, icone ? styles.avecIcone : styles.sansIcone, choisie && styles.choisie]}
    >
      {choisie && <Degrade rayon={RAYON - 1} />}
      {icone && (
        <View style={[styles.icone, choisie && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Icone nom={icone} taille={26} couleur={choisie ? c.blanc : c.cobalt} />
        </View>
      )}
      <Text style={[styles.texte, choisie && { color: c.blanc }]}>{texte}</Text>
      {choisie && (
        <Pop style={styles.coche}>
          <Icone nom="check" taille={18} epaisseur={3} couleur={c.cobalt} />
        </Pop>
      )}
    </Appui>
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
        <Apparition key={i} rang={i + 1} style={styles.ligne}>
          {ligne}
          {ligne.length === 1 && <View style={{ flex: 1 }} />}
        </Apparition>
      ))}
    </View>
  );
}

const RAYON = 20;

const styles = StyleSheet.create({
  grille: { gap: 12 },
  ligne: { flexDirection: 'row', gap: 12 },
  tuile: {
    flex: 1,
    backgroundColor: c.blanc,
    borderRadius: RAYON,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: c.trait,
    boxShadow: ombres.carte,
  },
  avecIcone: { minHeight: 118 },
  sansIcone: { minHeight: 76, justifyContent: 'center' },
  choisie: { backgroundColor: c.cobalt, borderColor: c.cobalt, boxShadow: ombres.bouton },
  icone: { width: 50, height: 50, borderRadius: 16, backgroundColor: c.doux, alignItems: 'center', justifyContent: 'center' },
  texte: { fontFamily: polices.texte700, fontSize: 17, lineHeight: 21, color: c.encre, paddingRight: 30 },
  coche: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.blanc,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
