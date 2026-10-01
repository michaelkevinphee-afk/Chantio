import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { c, degrade } from '@/lib/theme';

/**
 * Dégradé du site (cobalt → cobalt vif → pervenche, en diagonale), posé en fond
 * absolu d'un bouton ou d'un bloc arrondi. Le cobalt uni reste dessous si le SVG
 * ne s'affiche pas. `halo` ajoute les lueurs lavande et pervenche des blocs du site.
 */
export function Degrade({ rayon = 0, halo }: { rayon?: number; halo?: boolean }) {
  // Identifiant unique : plusieurs dégradés restent montés à l'écran.
  const id = `degrade-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: rayon, overflow: 'hidden', backgroundColor: c.cobalt }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={degrade[0]} />
            <Stop offset={halo ? '0.7' : '0.55'} stopColor={degrade[1]} />
            <Stop offset="1" stopColor={halo ? degrade[1] : degrade[2]} />
          </LinearGradient>
          {halo && (
            <RadialGradient id={`${id}-a`} cx="1" cy="0" rx="0.55" ry="0.7" fx="1" fy="0">
              <Stop offset="0" stopColor={c.lavande} stopOpacity={0.55} />
              <Stop offset="1" stopColor={c.lavande} stopOpacity={0} />
            </RadialGradient>
          )}
          {halo && (
            <RadialGradient id={`${id}-b`} cx="0" cy="1" rx="0.6" ry="0.75" fx="0" fy="1">
              <Stop offset="0" stopColor={c.pervenche} stopOpacity={0.7} />
              <Stop offset="1" stopColor={c.pervenche} stopOpacity={0} />
            </RadialGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-l)`} />
        {halo && <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-a)`} />}
        {halo && <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-b)`} />}
      </Svg>
    </View>
  );
}
