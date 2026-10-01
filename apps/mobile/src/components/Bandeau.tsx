import { View } from 'react-native';

import { c, polices } from '@/lib/theme';
import { Icone, type NomIcone } from './Icone';
import { Texte } from './Texte';

export function Bandeau({ texte, icone = 'info', jaune }: { texte: string; icone?: NomIcone; jaune?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: jaune ? c.jauneDoux : c.blanc, borderRadius: 18, padding: 14 }}>
      <Icone nom={icone} taille={20} couleur={c.marine} />
      <Texte style={{ flex: 1, fontSize: 16, fontFamily: polices.texte600 }}>{texte}</Texte>
    </View>
  );
}

/** Petite étiquette « Hors ligne ». */
export function PastilleHorsLigne() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8E6DF', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 }}>
      <Icone nom="horsLigne" taille={15} couleur={c.texteDoux} />
      <Texte style={{ fontSize: 13, fontFamily: polices.texte700, color: c.texteDoux }}>Hors ligne</Texte>
    </View>
  );
}
