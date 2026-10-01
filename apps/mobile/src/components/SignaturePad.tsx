import { useRef, useState } from 'react';
import { PanResponder, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { c } from '@/lib/theme';

// Repère commun avec le bureau web : <svg viewBox="0 0 300 150">.
export const LARGEUR_SIGNATURE = 300;
export const HAUTEUR_SIGNATURE = 150;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Zone de signature au doigt. Le tracé est un chemin SVG dans un repère 300 × 150.
 * Pour l'effacer, le parent change la `key` du composant.
 */
export function SignaturePad({ valeur, onChange, onDebut, onFin }: {
  valeur: string | null;
  onChange: (trace: string | null) => void;
  onDebut?: () => void;
  onFin?: () => void;
}) {
  const [largeur, setLargeur] = useState(0);
  const [trace, setTrace] = useState(valeur ?? '');
  const traceRef = useRef(trace);
  const dims = useRef({ l: 1, h: 1 });

  const point = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = Math.min(LARGEUR_SIGNATURE, Math.max(0, (locationX / dims.current.l) * LARGEUR_SIGNATURE));
    const y = Math.min(HAUTEUR_SIGNATURE, Math.max(0, (locationY / dims.current.h) * HAUTEUR_SIGNATURE));
    return `${r1(x)} ${r1(y)}`;
  };
  const maj = (t: string) => {
    traceRef.current = t;
    setTrace(t);
  };

  const gestes = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDebut?.();
        maj(`${traceRef.current}${traceRef.current ? ' ' : ''}M${point(e)}`);
      },
      onPanResponderMove: (e) => maj(`${traceRef.current} L${point(e)}`),
      onPanResponderRelease: () => {
        onFin?.();
        onChange(traceRef.current || null);
      },
      onPanResponderTerminate: () => {
        onFin?.();
        onChange(traceRef.current || null);
      },
    }),
  ).current;

  const hauteur = largeur / 2;
  return (
    <View
      onLayout={(e) => {
        const l = e.nativeEvent.layout.width;
        setLargeur(l);
        dims.current = { l, h: l / 2 };
      }}
      style={{ width: '100%', aspectRatio: 2, borderBottomWidth: 2, borderBottomColor: c.ligne }}
      accessibilityLabel="Zone de signature"
      {...gestes.panHandlers}
    >
      {largeur > 0 && (
        <Svg width={largeur} height={hauteur} viewBox={`0 0 ${LARGEUR_SIGNATURE} ${HAUTEUR_SIGNATURE}`} pointerEvents="none">
          <Path d={trace || 'M0 0'} stroke={c.marine} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}
