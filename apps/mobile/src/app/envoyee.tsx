import { adresseComplete, aujourdhui } from '@chantio/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Apparition, Appui, Onde, Pop } from '@/components/Anime';
import { Bouton } from '@/components/Bouton';
import { Ecran } from '@/components/Ecran';
import { Icone } from '@/components/Icone';
import { estTerminee } from '@/components/LigneIntervention';
import { Titre } from '@/components/Texte';
import type { InterventionVue } from '@/lib/donnees';
import { heureCourte } from '@/lib/horaires';
import { ouvrirCarte } from '@/lib/liens';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

const parHeure = (a: InterventionVue, b: InterventionVue) => (a.heure_prevue ?? '99').localeCompare(b.heure_prevue ?? '99');

export default function Envoyee() {
  const { etat, client, resultat, id } = useLocalSearchParams<{ etat: string; client?: string; resultat?: string; id?: string }>();
  const s = useSession();
  const enAttente = etat === 'en_attente';
  const chez = client ? ` de ${client}` : '';

  // L'intervention suivante de ma journée, pour enchaîner.
  const moi = s.profil?.membre.id;
  const t = aujourdhui();
  const suivante = s.interventions
    .filter((i) => i.id !== id && i.intervenants.some((m) => m.id === moi) && !estTerminee(i))
    .filter((i) => i.date_prevue === t || i.statut === 'en_cours')
    .sort(parHeure)[0];
  const adresse = suivante ? adresseComplete(suivante.site) : '';
  const retour = () => router.dismissTo('/');

  const barre = suivante ? (
    <View style={{ flex: 1, gap: 4 }}>
      {adresse ? <Bouton titre="Y aller" iconeAvant="aller" onPress={() => ouvrirCarte(adresse)} /> : null}
      <Pressable accessibilityRole="button" onPress={retour} hitSlop={6} style={styles.lien}>
        <Text style={styles.lienTexte}>Retour à ma journée</Text>
      </Pressable>
    </View>
  ) : (
    <Bouton titre="Retour à ma journée" icone="droite" onPress={retour} style={{ flex: 1 }} />
  );

  return (
    <Ecran sombre barre={barre}>
      <StatusBar style="light" />
      <View style={styles.centre}>
        <View style={styles.rond}>
          <Onde taille={150} couleur={c.jaune} delai={450} />
          <Pop delai={80} style={[styles.halo, enAttente && { backgroundColor: 'rgba(253,243,208,0.14)' }]}>
            <View style={[styles.check, enAttente && { backgroundColor: c.jauneDoux }]}>
              <Pop delai={260}>
                <Icone nom={enAttente ? 'nuage' : 'check'} taille={76} epaisseur={3.4} couleur={c.marine} />
              </Pop>
            </View>
          </Pop>
        </View>
        <Apparition rang={3} style={{ gap: 14, alignItems: 'center' }}>
          <Titre taille={48} style={{ textAlign: 'center', color: c.blanc, lineHeight: 48 }}>
            {enAttente ? 'Fiche\nenregistrée' : 'Fiche\nenvoyée'}
          </Titre>
          <Text style={styles.texte}>
            {enAttente
              ? "Pas de réseau pour l'instant. La fiche est gardée sur ton téléphone, elle partira dès que le réseau revient."
              : resultat && resultat !== 'termine'
                ? `Le bureau voit la fiche${chez} et sait qu'il faudra y revenir.`
                : `Le bureau voit déjà la fiche${chez}.`}
          </Text>
        </Apparition>
      </View>

      {suivante ? (
        <Apparition rang={6}>
          <Appui
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/intervention/[id]', params: { id: suivante.id } })}
            echelle={0.98}
            style={styles.ensuite}
          >
            <Text style={styles.kicker}>Ensuite · {heureCourte(suivante.heure_prevue)}</Text>
            <Text style={styles.motif}>{suivante.motif}</Text>
            <Text style={styles.sous}>{[suivante.client?.nom, suivante.site?.ville].filter(Boolean).join(' · ')}</Text>
          </Appui>
        </Apparition>
      ) : null}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: 18, marginTop: 48, marginBottom: 28, paddingHorizontal: 10 },
  rond: { width: 182, height: 182, alignItems: 'center', justifyContent: 'center' },
  halo: { width: 182, height: 182, borderRadius: 91, backgroundColor: 'rgba(242,183,5,0.18)', alignItems: 'center', justifyContent: 'center' },
  check: { width: 150, height: 150, borderRadius: 75, backgroundColor: c.jaune, alignItems: 'center', justifyContent: 'center' },
  texte: { fontFamily: polices.texte, fontSize: 19, lineHeight: 24, color: '#E3E7F0', textAlign: 'center' },
  ensuite: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 26, padding: 18, gap: 4 },
  kicker: { fontFamily: polices.texte700, fontSize: 14, color: c.jaune, textTransform: 'uppercase', letterSpacing: 1 },
  motif: { fontFamily: polices.texte700, fontSize: 24, lineHeight: 28, color: c.blanc },
  lien: { alignItems: 'center', paddingVertical: 10 },
  lienTexte: { fontFamily: polices.texte700, fontSize: 17, color: c.blanc, textDecorationLine: 'underline' },
  sous: { fontFamily: polices.texte, fontSize: 17, color: c.marineSoft },
});
