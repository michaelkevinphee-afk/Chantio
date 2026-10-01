import { View } from 'react-native';

import { c, polices, tons } from '@/lib/theme';
import { Icone, type NomIcone } from './Icone';
import { Texte } from './Texte';

/** Bandeau d'information ; `bleu` le met en avant (mode démo, fiches en attente). */
export function Bandeau({ texte, icone = 'info', bleu }: { texte: string; icone?: NomIcone; bleu?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        backgroundColor: bleu ? c.puce : c.blanc,
        borderWidth: 1,
        borderColor: bleu ? c.puce : c.trait,
        borderRadius: 18,
        padding: 14,
      }}
    >
      <Icone nom={icone} taille={20} couleur={c.cobalt} />
      <Texte style={{ flex: 1, fontSize: 16, fontFamily: polices.texte600 }}>{texte}</Texte>
    </View>
  );
}

/** Petite étiquette « Hors ligne ». */
export function PastilleHorsLigne() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tons.gris.fond, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
      <Icone nom="horsLigne" taille={15} couleur={c.gris} />
      <Texte style={{ fontSize: 13, fontFamily: polices.texte700, color: c.gris }}>Hors ligne</Texte>
    </View>
  );
}
