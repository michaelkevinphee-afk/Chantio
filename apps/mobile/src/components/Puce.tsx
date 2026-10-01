import { Text, View } from 'react-native';

import { c, polices, tons } from '@/lib/theme';
import type { Ton } from '@chantio/shared';
import { Icone, type NomIcone } from './Icone';

export function Puce({ texte, ton = 'gris', icone }: { texte: string; ton?: Ton; icone?: NomIcone }) {
  const t = tons[ton];
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.fond, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}>
      {icone && <Icone nom={icone} taille={14} epaisseur={3} couleur={t.texte} />}
      <Text style={{ fontFamily: polices.texte700, fontSize: 13, color: t.texte }}>{texte}</Text>
    </View>
  );
}

/** Pastille rouge pâle pour l'urgence (« Urgent », « Astreinte »). */
export function BadgeUrgence({ urgence }: { urgence: 'normale' | 'urgente' | 'astreinte' }) {
  if (urgence === 'normale') return null;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c.rougeDoux, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontFamily: polices.texte700, fontSize: 13, color: c.rouge }}>
        {urgence === 'urgente' ? 'Urgent' : 'Astreinte'}
      </Text>
    </View>
  );
}
