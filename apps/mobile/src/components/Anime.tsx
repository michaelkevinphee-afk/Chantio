// Petites animations communes (API Animated de React Native, sans bibliothèque).
// Toutes sont ignorées quand le téléphone demande de réduire les animations.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// Le pilote natif n'existe pas sur le web.
const natif = Platform.OS !== 'web';
const douceur = Easing.bezier(0.2, 0.8, 0.2, 1);

let reduitConnu = false;

/** Vrai si l'utilisateur a demandé de réduire les animations. */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(reduitConnu);
  useEffect(() => {
    let actif = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        reduitConnu = r;
        if (actif) setReduit(r);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (r) => {
      reduitConnu = r;
      setReduit(r);
    });
    return () => {
      actif = false;
      sub?.remove();
    };
  }, []);
  return reduit;
}

/** Apparition en fondu avec une petite montée ; `rang` décale le départ (effet cascade). */
export function Apparition({ children, rang = 0, style }: { children: ReactNode; rang?: number; style?: StyleProp<ViewStyle> }) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(reduitConnu ? 1 : 0)).current;
  useEffect(() => {
    if (reduitConnu) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, {
      toValue: 1,
      duration: 320,
      delay: Math.min(rang, 8) * 55,
      easing: douceur,
      useNativeDriver: natif,
    });
    a.start();
    return () => a.stop();
  }, []);
  if (reduit) return <View style={style}>{children}</View>;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Apparition « pop » (légèrement rebondie), pour une coche ou un grand rond. */
export function Pop({ children, delai = 0, style }: { children: ReactNode; delai?: number; style?: StyleProp<ViewStyle> }) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(reduitConnu ? 1 : 0)).current;
  useEffect(() => {
    if (reduitConnu) {
      v.setValue(1);
      return;
    }
    const a = Animated.spring(v, { toValue: 1, delay: delai, friction: 5, tension: 170, useNativeDriver: natif });
    a.start();
    return () => a.stop();
  }, []);
  if (reduit) return <View style={style}>{children}</View>;
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Halo qui s'élargit et s'efface (deux fois), derrière un grand rond. */
export function Onde({ taille, couleur, delai = 0 }: { taille: number; couleur: string; delai?: number }) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduitConnu) return;
    const a = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: natif }),
      { iterations: 2 },
    );
    const t = setTimeout(() => a.start(), delai);
    return () => {
      clearTimeout(t);
      a.stop();
    };
  }, []);
  if (reduit) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        borderWidth: 3,
        borderColor: couleur,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
      }}
    />
  );
}

const PressableAnime = Animated.createAnimatedComponent(Pressable);

/** Pressable qui s'enfonce légèrement sous le doigt. */
export function Appui({ style, echelle = 0.97, onPressIn, onPressOut, ...props }: PressableProps & { echelle?: number }) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(1)).current;
  const [presse, setPresse] = useState(false);
  const aller = (vers: number) => {
    if (reduit) return;
    Animated.spring(v, { toValue: vers, speed: 40, bounciness: vers === 1 ? 6 : 0, useNativeDriver: natif }).start();
  };
  const etat = { pressed: presse, hovered: false, focused: false } as PressableStateCallbackType;
  const base = typeof style === 'function' ? style(etat) : style;
  return (
    <PressableAnime
      {...props}
      onPressIn={(e: GestureResponderEvent) => {
        setPresse(true);
        aller(echelle);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPresse(false);
        aller(1);
        onPressOut?.(e);
      }}
      style={[base, { transform: [{ scale: v }] }]}
    />
  );
}

/** Segment de barre de progression qui se remplit en douceur. */
export function Segment({ rempli, fond, couleur, style }: { rempli: boolean; fond: string; couleur: string; style?: StyleProp<ViewStyle> }) {
  const reduit = useMouvementReduit();
  const v = useRef(new Animated.Value(rempli ? 1 : 0)).current;
  useEffect(() => {
    if (reduit) {
      v.setValue(rempli ? 1 : 0);
      return;
    }
    Animated.timing(v, { toValue: rempli ? 1 : 0, duration: 340, easing: douceur, useNativeDriver: false }).start();
  }, [rempli, reduit]);
  return (
    <View style={[{ backgroundColor: fond, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{ height: '100%', backgroundColor: couleur, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
      />
    </View>
  );
}
