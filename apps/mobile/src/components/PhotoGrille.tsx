import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PhotoLocale } from '@/lib/brouillons';
import { c, polices } from '@/lib/theme';
import { Icone, type NomIcone } from './Icone';

function Ajout({ icone, texte, onPress }: { icone: NomIcone; texte: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.case, styles.ajout, pressed && { opacity: 0.7 }]}>
      <Icone nom={icone} taille={30} couleur={c.cobalt} />
      <Text style={styles.texteAjout}>{texte}</Text>
    </Pressable>
  );
}

/** Grille de photos sur 3 colonnes, avec les boutons Photo et Galerie. */
export function PhotoGrille({ photos, onAjouter, onRetirer, enCours = 0 }: {
  photos: PhotoLocale[];
  onAjouter: (origine: 'camera' | 'galerie') => void;
  onRetirer: (id: string) => void;
  enCours?: number;
}) {
  return (
    <View style={styles.grille}>
      <Ajout icone="photo" texte="Photo" onPress={() => onAjouter('camera')} />
      <Ajout icone="galerie" texte="Galerie" onPress={() => onAjouter('galerie')} />
      {photos.map((p) => (
        <View key={p.id} style={styles.case}>
          <Image source={{ uri: p.uri }} style={styles.image} accessibilityLabel="Photo du chantier" />
          <Pressable accessibilityRole="button" accessibilityLabel="Retirer la photo" hitSlop={8} onPress={() => onRetirer(p.id)} style={styles.retirer}>
            <Icone nom="x" taille={18} epaisseur={2.8} couleur={c.blanc} />
          </Pressable>
        </View>
      ))}
      {Array.from({ length: enCours }, (_, i) => (
        <View key={`attente-${i}`} style={[styles.case, styles.attente]}>
          <ActivityIndicator color={c.cobalt} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  case: { width: '31%', aspectRatio: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: c.doux },
  ajout: { backgroundColor: 'transparent', borderWidth: 2.5, borderStyle: 'dashed', borderColor: c.pervenche, alignItems: 'center', justifyContent: 'center', gap: 6 },
  texteAjout: { fontFamily: polices.texte700, fontSize: 15, color: c.cobalt },
  image: { width: '100%', height: '100%' },
  retirer: { position: 'absolute', right: 6, top: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(47,84,235,0.9)', alignItems: 'center', justifyContent: 'center' },
  attente: { alignItems: 'center', justifyContent: 'center' },
});
