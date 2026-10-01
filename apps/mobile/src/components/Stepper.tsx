import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Appui, useMouvementReduit } from './Anime';
import { Icone } from './Icone';

const arrondir = (v: number, pas: number) => {
  const decimales = pas < 1 ? String(pas).split('.')[1]?.length ?? 1 : 0;
  return Number(v.toFixed(decimales));
};
const afficher = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

/** Petit rebond du nombre quand il change avec − / +. */
function useRebond(valeur: unknown) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(1)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    if (reduit) return;
    v.setValue(1.12);
    Animated.spring(v, { toValue: 1, friction: 5, tension: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [valeur]);
  return v;
}

function BoutonPm({ sens, label, onPress, taille }: { sens: 1 | -1; label: string; onPress: () => void; taille: number }) {
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={`${sens > 0 ? 'Plus' : 'Moins'}, ${label}`}
      onPress={onPress}
      echelle={0.9}
      style={({ pressed }) => [
        styles.bouton,
        { width: taille, height: taille, borderRadius: taille > 56 ? 20 : 16 },
        pressed && styles.presse,
      ]}
    >
      <Icone nom={sens > 0 ? 'plus' : 'moins'} taille={taille > 56 ? 28 : 22} epaisseur={3} couleur={c.marine} />
    </Appui>
  );
}

/** Gros boutons − / + (64 px) autour d'un nombre saisissable, en gros chiffres centrés. */
export function Stepper({ valeur, onChange, pas = 1, min = 0, unite, depart = 0, label }: {
  valeur: number | null | undefined;
  onChange: (v: number | null) => void;
  pas?: number;
  min?: number;
  unite?: string;
  /** Valeur prise au premier appui si le champ est vide. */
  depart?: number;
  label: string;
}) {
  const [texte, setTexte] = useState(afficher(valeur));
  const [largeur, setLargeur] = useState(0);
  const rebond = useRebond(valeur);
  useEffect(() => {
    const actuel = Number(texte.replace(',', '.'));
    if (valeur == null ? texte !== '' : actuel !== valeur) setTexte(afficher(valeur));
  }, [valeur]);

  const changer = (sens: 1 | -1) => {
    const base = valeur ?? depart;
    const suivant = valeur == null ? base : base + sens * pas;
    onChange(Math.max(min, arrondir(suivant, pas)));
  };

  return (
    <View style={styles.ligne}>
      <BoutonPm sens={-1} label={label} onPress={() => changer(-1)} taille={64} />
      <View style={styles.centre}>
        {/* Texte invisible pour mesurer la largeur du nombre : le groupe « 38 ppm » reste centré. */}
        <Text style={[styles.nombre, styles.mesure]} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} accessible={false}>
          {texte || '—'}
        </Text>
        <Animated.View style={{ transform: [{ scale: rebond }] }}>
          <TextInput
            accessibilityLabel={label}
            value={texte}
            placeholder="—"
            placeholderTextColor={c.texteDoux}
            keyboardType="decimal-pad"
            selectTextOnFocus
            onChangeText={(s) => {
              setTexte(s);
              const n = Number(s.replace(',', '.'));
              if (s.trim() === '') onChange(null);
              else if (!Number.isNaN(n)) onChange(n);
            }}
            style={[styles.nombre, { width: Math.max(28, Math.ceil(largeur) + 4) }]}
          />
        </Animated.View>
        {unite ? <Text style={styles.unite}>{unite}</Text> : null}
      </View>
      <BoutonPm sens={1} label={label} onPress={() => changer(1)} taille={64} />
    </View>
  );
}

/** Quantité compacte (48 px) : « − 2 + », pour les pièces posées. */
export function Quantite({ valeur, onChange, label, min = 0 }: {
  valeur: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
}) {
  const rebond = useRebond(valeur);
  return (
    <View style={[styles.ligne, { gap: 8 }]}>
      <BoutonPm sens={-1} label={label} onPress={() => onChange(Math.max(min, valeur - 1))} taille={48} />
      <Animated.Text style={[styles.quantite, { transform: [{ scale: rebond }] }]} accessibilityLabel={`${label} : ${valeur}`}>
        {valeur}
      </Animated.Text>
      <BoutonPm sens={1} label={label} onPress={() => onChange(valeur + 1)} taille={48} />
    </View>
  );
}

/** Bouton texte souligné, utile à côté d'un stepper. */
export function Vider({ onPress }: { onPress: () => void }) {
  return (
    <Pressable hitSlop={8} onPress={onPress} accessibilityRole="button">
      <Text style={{ fontFamily: polices.texte700, fontSize: 15, color: c.marine, textDecorationLine: 'underline' }}>Vider</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bouton: { backgroundColor: c.beton, alignItems: 'center', justifyContent: 'center' },
  presse: { backgroundColor: c.grisClair },
  centre: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', minWidth: 0, gap: 6 },
  nombre: { fontFamily: polices.titre, fontSize: 54, lineHeight: 60, color: c.marine, textAlign: 'center', padding: 0, margin: 0 },
  mesure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  unite: { fontFamily: polices.texte600, fontSize: 20, color: c.texteDoux },
  quantite: { fontFamily: polices.titre, fontSize: 28, color: c.marine, minWidth: 26, textAlign: 'center' },
});
