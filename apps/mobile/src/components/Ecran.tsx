import type { ReactNode, Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { c } from '@/lib/theme';

/**
 * Mise en page commune : fond béton, colonne de 560 px max,
 * et une barre d'action toujours en bas (gros bouton jaune).
 */
export function Ecran({ children, barre, refreshControl, defilement = true, scrollRef }: {
  children: ReactNode;
  barre?: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  defilement?: boolean;
  scrollRef?: Ref<ScrollView>;
}) {
  const marges = useSafeAreaInsets();
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
          <View style={[styles.colonne, styles.ligneBarre]}>{barre}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: c.beton },
  contenu: { paddingHorizontal: 16 },
  colonne: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 14 },
  barre: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.beton, borderTopWidth: 1, borderTopColor: 'rgba(20,33,61,0.06)' },
  ligneBarre: { flexDirection: 'row', gap: 10 },
});
