import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { InterventionVue } from '@/lib/donnees';
import { heureCourte } from '@/lib/horaires';
import { naviguer } from '@/lib/liens';
import { c, ombres, polices } from '@/lib/theme';
import { useTournee, type Etape } from '@/lib/tournee';
import { Appui } from './Anime';
import { Bouton, BoutonRond } from './Bouton';
import { Carte } from './Carte';
import { CarteTournee } from './CarteTournee';
import { Texte, Titre } from './Texte';

const km = (n: number) => (n < 10 ? n.toFixed(1).replace('.', ',') : String(Math.round(n)));

/**
 * Vue « Carte » de Ma journée : les chantiers qui restent, numérotés dans
 * l'ordre qui fait rouler le moins, et un bouton pour lancer le GPS.
 */
export function Tournee({ liste, optimiser, ouvrir }: { liste: InterventionVue[]; optimiser: boolean; ouvrir: (i: InterventionVue) => void }) {
  const t = useTournee(liste, optimiser);
  const premiere = t.etapes[0];
  const titreEtape = (e: Etape) => e.intervention.client?.nom ?? e.intervention.motif;
  const aller = (e: Etape) => naviguer(e.point, titreEtape(e));

  if (!liste.length) {
    return (
      <Carte style={{ padding: 22 }}>
        <Titre taille={24}>Aucun trajet</Titre>
        <Texte variante="doux">Il ne reste aucun chantier à faire aujourd'hui.</Texte>
      </Carte>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {t.chargement ? (
        <View style={styles.attente}>
          <ActivityIndicator color={c.cobalt} />
          <Text style={styles.attenteTexte}>Placement des adresses…</Text>
        </View>
      ) : (
        <CarteTournee etapes={t.etapes} depart={t.depart} onChoisir={(e) => ouvrir(e.intervention)} />
      )}

      {!t.chargement && t.etapes.length > 1 && (
        <Text style={styles.resume}>
          {optimiser
            ? `Ordre conseillé : environ ${km(t.km)} km à vol d'oiseau${t.gainKm >= 1 ? `, ${km(t.gainKm)} km de moins qu'en suivant les heures` : ''}. Pense aux rendez-vous fixés avec les clients.`
            : `Environ ${km(t.km)} km à vol d'oiseau, dans l'ordre des heures.`}
        </Text>
      )}

      {premiere && (
        <Bouton titre={`Y aller : ${titreEtape(premiere)}`} iconeAvant="aller" onPress={() => aller(premiere)} />
      )}

      {t.etapes.map((e) => (
        <Appui key={e.intervention.id} accessibilityRole="button" onPress={() => ouvrir(e.intervention)} echelle={0.98} style={styles.etape}>
          <View style={[styles.rang, e.intervention.statut === 'en_cours' && { backgroundColor: c.menthe }]}>
            <Text style={styles.rangTexte}>{e.rang}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.motif} numberOfLines={1}>{titreEtape(e)}</Text>
            <Text style={styles.sous} numberOfLines={2}>
              {[heureCourte(e.intervention.heure_prevue), e.intervention.motif, e.intervention.site?.ville].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <BoutonRond icone="aller" label={`Y aller : ${titreEtape(e)}`} onPress={() => aller(e)} fond={c.doux} couleur={c.cobalt} />
        </Appui>
      ))}

      {t.introuvables.length > 0 && (
        <Carte style={{ gap: 4 }}>
          <Texte variante="section">Pas placées sur la carte</Texte>
          {t.introuvables.map((i) => (
            <Text key={i.id} style={styles.sous}>
              {[i.client?.nom, i.site?.adresse ?? 'pas d’adresse'].filter(Boolean).join(' · ')}
            </Text>
          ))}
        </Carte>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  attente: { height: 340, borderRadius: 22, borderWidth: 1, borderColor: c.trait, backgroundColor: c.doux, alignItems: 'center', justifyContent: 'center', gap: 10 },
  attenteTexte: { fontFamily: polices.texte600, fontSize: 15, color: c.gris },
  resume: { fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: c.gris },
  etape: {
    backgroundColor: c.blanc,
    borderWidth: 1,
    borderColor: c.trait,
    borderRadius: 20,
    padding: 12,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: ombres.carte,
  },
  rang: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.cobalt, alignItems: 'center', justifyContent: 'center' },
  rangTexte: { fontFamily: polices.texte800, fontSize: 18, color: c.blanc },
  motif: { fontFamily: polices.texte800, fontSize: 18, color: c.encre },
  sous: { fontFamily: polices.texte, fontSize: 15, lineHeight: 20, color: c.gris },
});
