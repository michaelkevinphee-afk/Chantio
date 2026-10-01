import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Icone } from './Icone';

const arrondir = (v: number, pas: number) => {
  const decimales = pas < 1 ? String(pas).split('.')[1]?.length ?? 1 : 0;
  return Number(v.toFixed(decimales));
};
const afficher = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

/** Gros boutons − / + (64 px) autour d'un nombre saisissable. */
export function Stepper({ valeur, onChange, pas = 1, min = 0, unite, depart = 0, label, petit }: {
  valeur: number | null | undefined;
  onChange: (v: number | null) => void;
  pas?: number;
  min?: number;
  unite?: string;
  /** Valeur prise au premier appui si le champ est vide. */
  depart?: number;
  label: string;
  petit?: boolean;
}) {
  const [texte, setTexte] = useState(afficher(valeur));
  useEffect(() => {
    const actuel = Number(texte.replace(',', '.'));
    if (valeur == null ? texte !== '' : actuel !== valeur) setTexte(afficher(valeur));
  }, [valeur]);

  const changer = (sens: 1 | -1) => {
    const base = valeur ?? depart;
    const suivant = valeur == null ? base : base + sens * pas;
    onChange(Math.max(min, arrondir(suivant, pas)));
  };

  const t = petit ? 48 : 64;
  return (
    <View style={styles.ligne}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Moins, ${label}`} onPress={() => changer(-1)} style={({ pressed }) => [styles.bouton, { width: t, height: t, borderRadius: petit ? 15 : 20 }, pressed && styles.presse]}>
        <Icone nom="moins" taille={petit ? 22 : 28} epaisseur={3} couleur={c.marine} />
      </Pressable>
      <View style={styles.centre}>
        <TextInput
          accessibilityLabel={label}
          value={texte}
          placeholder="—"
          placeholderTextColor={c.texteDoux}
          keyboardType="decimal-pad"
          onChangeText={(s) => {
            setTexte(s);
            const n = Number(s.replace(',', '.'));
            if (s.trim() === '') onChange(null);
            else if (!Number.isNaN(n)) onChange(n);
          }}
          style={[styles.nombre, petit && { fontSize: 28 }, !unite && { textAlign: 'center' }]}
        />
        {unite ? <Text style={styles.unite}>{unite}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Plus, ${label}`} onPress={() => changer(1)} style={({ pressed }) => [styles.bouton, { width: t, height: t, borderRadius: petit ? 15 : 20 }, pressed && styles.presse]}>
        <Icone nom="plus" taille={petit ? 22 : 28} epaisseur={3} couleur={c.marine} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bouton: { backgroundColor: c.beton, alignItems: 'center', justifyContent: 'center' },
  presse: { backgroundColor: c.grisClair },
  centre: { flex: 1, flexDirection: 'row', alignItems: 'baseline', minWidth: 0 },
  nombre: { flex: 1, minWidth: 0, fontFamily: polices.titre, fontSize: 44, color: c.marine, textAlign: 'right', padding: 0 },
  unite: { flex: 1, marginLeft: 6, fontFamily: polices.texte700, fontSize: 18, color: c.texteDoux },
});
