import { LIBELLE_STATUT_TERRAIN, TON_STATUT, dateCourte } from '@chantio/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InterventionVue } from '@/lib/donnees';
import { c, polices } from '@/lib/theme';
import { Icone } from './Icone';
import { BadgeUrgence, Puce } from './Puce';

export const estTerminee = (i: InterventionVue) => ['terminee', 'validee', 'facturee', 'a_reprendre'].includes(i.statut);

/** Ligne de liste : heure en gros, statut, motif, client et ville. */
export function LigneIntervention({ intervention: i, onPress, avecJour, avecTechniciens }: {
  intervention: InterventionVue;
  onPress: () => void;
  avecJour?: boolean;
  avecTechniciens?: boolean;
}) {
  const sous = [i.client?.nom, i.site?.ville].filter(Boolean).join(' · ');
  const techs = avecTechniciens ? i.intervenants.map((t) => t.prenom).join(', ') || 'Pas attribuée' : '';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.85 }]}>
      <View style={styles.temps}>
        <Text style={styles.heure}>{i.heure_prevue?.slice(0, 5) ?? '--:--'}</Text>
        {avecJour ? <Text style={styles.jour}>{dateCourte(i.date_prevue)}</Text> : null}
      </View>
      <View style={styles.texte}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Puce
            texte={LIBELLE_STATUT_TERRAIN[i.statut]}
            ton={TON_STATUT[i.statut]}
            icone={estTerminee(i) && i.statut !== 'a_reprendre' ? 'check' : undefined}
          />
          <BadgeUrgence urgence={i.urgence} />
        </View>
        <Text style={styles.motif} numberOfLines={1}>{i.motif}</Text>
        <Text style={styles.sous} numberOfLines={1}>{[sous, techs].filter(Boolean).join(' · ')}</Text>
      </View>
      <Icone nom="droite" taille={22} couleur="#9AA2B3" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { backgroundColor: c.blanc, borderRadius: 22, padding: 14, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  temps: { minWidth: 66 },
  heure: { fontFamily: polices.titre, fontSize: 28, color: c.marine },
  jour: { fontFamily: polices.texte700, fontSize: 13, color: c.texteDoux, marginTop: 2 },
  texte: { flex: 1, minWidth: 0, gap: 4 },
  motif: { fontFamily: polices.texte700, fontSize: 18, color: c.marine },
  sous: { fontFamily: polices.texte, fontSize: 15, color: c.texteDoux },
});
