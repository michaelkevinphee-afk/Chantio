import { useId, type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { c } from '@/lib/theme';

/**
 * Mise en page commune : fond bleuté clair du site, colonne de 560 px max,
 * et une barre d'action toujours en bas (gros bouton cobalt).
 */
export function Ecran({ children, barre, refreshControl, defilement = true, scrollRef }: {
  children: ReactNode;
  barre?: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  defilement?: boolean;
  scrollRef?: Ref<ScrollView>;
}) {
  const marges = useSafeAreaInsets();
  // Identifiant unique : plusieurs écrans restent montés dans la pile.
  const idFondu = `fondu-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <KeyboardAvoidingView style={styles.fond} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={defilement}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: marges.top + 8, paddingBottom: (barre ? 120 : 32) + marges.bottom },
        ]}
      >
        <View style={styles.colonne}>{children}</View>
      </ScrollView>
      {barre ? (
        <View style={[styles.barre, { paddingBottom: marges.bottom + 14 }]}>
          {/* Fondu au-dessus de la barre : le contenu passe dessous en douceur. */}
          <View pointerEvents="none" style={styles.fondu}>
          <Svg width="100%" height={22}>
            <Defs>
              <LinearGradient id={idFondu} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.fond} stopOpacity={0} />
                <Stop offset="1" stopColor={c.fond} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="22" fill={`url(#${idFondu})`} />
          </Svg>
          </View>
          <View style={[styles.colonne, styles.ligneBarre]}>{barre}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: c.fond },
  contenu: { paddingHorizontal: 16 },
  colonne: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 14 },
  barre: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: c.fond },
  fondu: { position: 'absolute', left: 0, right: 0, top: -22, height: 22 },
  ligneBarre: { flexDirection: 'row', gap: 10 },
});
