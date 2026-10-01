import { Text, View } from 'react-native';

import { c, polices, tons } from '@/lib/theme';
import type { Ton } from '@chantio/shared';
import { Icone, type NomIcone } from './Icone';

export function Puce({ texte, ton = 'gris', icone }: { texte: string; ton?: Ton; icone?: NomIcone }) {
  const t = tons[ton];
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.fond, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }}>
      {icone && <Icone nom={icone} taille={14} epaisseur={3} couleur={t.texte} />}
      <Text style={{ fontFamily: polices.texte700, fontSize: 13, color: t.texte }}>{texte}</Text>
    </View>
  );
}

/** Pastille jaune ou rouge pour l'urgence. */
export function BadgeUrgence({ urgence }: { urgence: 'normale' | 'urgente' | 'astreinte' }) {
  if (urgence === 'normale') return null;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c.rouge, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }}>
      <Text style={{ fontFamily: polices.texte700, fontSize: 13, color: c.blanc, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {urgence === 'urgente' ? 'Urgent' : 'Astreinte'}
      </Text>
    </View>
  );
}
