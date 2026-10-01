import { useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Appui } from './Anime';
import { Icone } from './Icone';
import { Texte } from './Texte';

/**
 * Champ de saisie large, avec son étiquette au-dessus.
 * `dictee` ajoute un bouton « Dicter » : il ouvre le clavier et rappelle où se trouve
 * le micro du clavier (dictée de l'iPhone ou d'Android, en français, sans rien installer).
 */
export function Champ({ label, indice, multiligne, dictee, style, ref, ...props }: TextInputProps & {
  label?: string;
  indice?: string;
  multiligne?: boolean;
  dictee?: boolean;
  ref?: Ref<TextInput>;
}) {
  const [focus, setFocus] = useState(false);
  const [aideDictee, setAideDictee] = useState(false);
  const champ = useRef<TextInput | null>(null);
  // Garde la référence interne (bouton Dicter) et transmet celle de l'écran (passer au champ suivant).
  const relier = (noeud: TextInput | null) => {
    champ.current = noeud;
    if (typeof ref === 'function') ref(noeud);
    else if (ref) ref.current = noeud;
  };
  const avecDictee = dictee && Platform.OS !== 'web';
  return (
    <View style={{ gap: 6 }}>
      {label || avecDictee ? (
        <View style={styles.entete}>
          <Texte variante="etiquette" style={{ flex: 1 }}>
            {label}
            {indice ? <Texte variante="doux" style={{ fontSize: 14 }}>{`  ${indice}`}</Texte> : null}
          </Texte>
          {avecDictee ? (
            <Appui
              accessibilityRole="button"
              accessibilityLabel={`Dicter ${label ?? ''}`.trim()}
              onPress={() => {
                setAideDictee(true);
                champ.current?.focus();
              }}
              style={({ pressed }) => [styles.dicter, pressed && { opacity: 0.8 }]}
            >
              <Icone nom="micro" taille={20} couleur={c.cobalt} />
              <Texte style={styles.texteDicter}>Dicter</Texte>
            </Appui>
          ) : null}
        </View>
      ) : null}
      <TextInput
        ref={relier}
        placeholderTextColor={c.grisClair}
        multiline={multiligne}
        textAlignVertical={multiligne ? 'top' : 'center'}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          setAideDictee(false);
          props.onBlur?.(e);
        }}
        style={[styles.champ, multiligne && styles.multi, focus && { borderColor: c.cobalt }, style]}
      />
      {aideDictee && focus ? (
        <View style={styles.aide}>
          <Icone nom="micro" taille={22} couleur={c.cobalt} />
          <Texte style={styles.texteAide}>
            Touche le micro en bas à droite du clavier, puis parle. Touche le texte ou le micro pour arrêter.
          </Texte>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dicter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.doux,
  },
  texteDicter: { fontFamily: polices.titre, fontSize: 16, color: c.cobalt },
  aide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: c.doux,
  },
  texteAide: { flex: 1, fontSize: 15, lineHeight: 21, color: c.encre },
  champ: {
    fontFamily: polices.texte,
    fontSize: 18,
    color: c.encre,
    backgroundColor: c.blanc,
    borderWidth: 2,
    borderColor: c.trait,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 58,
    // Sur le web : pas de contour du navigateur, le bord passe en cobalt (comme le site).
    outlineWidth: 0,
  },
  multi: { minHeight: 110, lineHeight: 24 },
});
