import { LIBELLE_STATUT_TERRAIN, TON_STATUT, dateCourte } from '@chantio/shared';
import { StyleSheet, Text, View } from 'react-native';

import type { InterventionVue } from '@/lib/donnees';
import { heureCourte } from '@/lib/horaires';
import { c, ombres, polices } from '@/lib/theme';
import { Appui } from './Anime';
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
  // Comme la maquette : pas d'étiquette pour une intervention simplement planifiée.
  const avecStatut = i.statut !== 'planifiee';
  const avecPuces = avecStatut || i.urgence !== 'normale';
  return (
    <Appui accessibilityRole="button" onPress={onPress} echelle={0.98} style={styles.ligne}>
      <View style={styles.temps}>
        <Text style={styles.heure}>{heureCourte(i.heure_prevue)}</Text>
        {avecJour ? <Text style={styles.jour}>{dateCourte(i.date_prevue)}</Text> : null}
      </View>
      <View style={styles.texte}>
        {avecPuces && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            {avecStatut && (
              <Puce
                texte={LIBELLE_STATUT_TERRAIN[i.statut]}
                ton={TON_STATUT[i.statut]}
                icone={estTerminee(i) && i.statut !== 'a_reprendre' ? 'check' : undefined}
              />
            )}
            <BadgeUrgence urgence={i.urgence} />
          </View>
        )}
        <Text style={styles.motif} numberOfLines={1}>{i.motif}</Text>
        <Text style={styles.sous} numberOfLines={2}>{[sous, techs].filter(Boolean).join(' · ')}</Text>
      </View>
      <Icone nom="droite" taille={22} couleur={c.grisClair} />
    </Appui>
  );
}

const styles = StyleSheet.create({
  ligne: {
    backgroundColor: c.blanc,
    borderWidth: 1,
    borderColor: c.trait,
    borderRadius: 20,
    padding: 14,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: ombres.carte,
  },
  temps: { minWidth: 62 },
  heure: { fontFamily: polices.titre, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: c.encre },
  jour: { fontFamily: polices.texte700, fontSize: 13, color: c.gris, marginTop: 2 },
  texte: { flex: 1, minWidth: 0 },
  motif: { fontFamily: polices.texte700, fontSize: 17, lineHeight: 22, color: c.encre },
  sous: { fontFamily: polices.texte, fontSize: 15, color: c.gris },
});
