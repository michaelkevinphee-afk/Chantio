import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { c, polices } from '@/lib/theme';
import { Texte } from './Texte';

/** Logo Chantio : le « C en blocs ». */
export function LogoChantio({ taille = 22 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 96 96">
      <Rect x={14} y={14} width={24} height={68} rx={10} fill={c.cobalt} />
      <Rect x={44} y={14} width={38} height={24} rx={10} fill={c.pervenche} />
      <Rect x={44} y={58} width={38} height={24} rx={10} fill={c.lavande} />
    </Svg>
  );
}

/** Mention discrète « Propulsé par chantio ». */
export function PropulsePar() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Texte variante="doux" style={{ fontSize: 14 }}>Propulsé par</Texte>
      <LogoChantio taille={18} />
      <Texte style={{ fontFamily: polices.texte800, fontSize: 16, letterSpacing: -0.7, color: c.encre }}>chantio</Texte>
    </View>
  );
}
