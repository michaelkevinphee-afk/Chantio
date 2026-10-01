import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Texte } from './Texte';

/** Champ de saisie large, avec son étiquette au-dessus. */
export function Champ({ label, indice, multiligne, style, ...props }: TextInputProps & {
  label?: string;
  indice?: string;
  multiligne?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Texte variante="etiquette">
          {label}
          {indice ? <Texte variante="doux" style={{ fontSize: 14 }}>{`  ${indice}`}</Texte> : null}
        </Texte>
      ) : null}
      <TextInput
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
          props.onBlur?.(e);
        }}
        style={[styles.champ, multiligne && styles.multi, focus && { borderColor: c.cobalt }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  multi: { minHeight: 110, lineHeight: 24 },
});
