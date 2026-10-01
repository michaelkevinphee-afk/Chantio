import { View, type ViewProps } from 'react-native';

import { c } from '@/lib/theme';

export function Carte({ style, sombre, ...props }: ViewProps & { sombre?: boolean }) {
  return (
    <View
      {...props}
      style={[{ backgroundColor: sombre ? c.marine : c.blanc, borderRadius: 24, padding: 18, gap: 10 }, style]}
    />
  );
}
