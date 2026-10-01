import { adresseComplete, aujourdhui } from '@chantio/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Apparition, Appui, Onde, Pop } from '@/components/Anime';
import { Bouton } from '@/components/Bouton';
import { Degrade } from '@/components/Degrade';
import { Ecran } from '@/components/Ecran';
import { Icone } from '@/components/Icone';
import { estTerminee } from '@/components/LigneIntervention';
import { Titre } from '@/components/Texte';
import type { InterventionVue } from '@/lib/donnees';
import { heureCourte } from '@/lib/horaires';
import { ouvrirCarte } from '@/lib/liens';
import { useSession } from '@/lib/session';
import { c, ombres, polices } from '@/lib/theme';

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
    <Ecran barre={barre}>
      <View style={styles.centre}>
        <View style={styles.rond}>
          <Onde taille={150} couleur={c.pervenche} delai={450} />
          <Pop delai={80} style={[styles.halo, enAttente && { backgroundColor: 'rgba(185,198,251,0.3)' }]}>
            <View style={[styles.check, enAttente ? styles.checkAttente : styles.checkHalo]}>
              {!enAttente && <Degrade rayon={75} />}
              <Pop delai={260}>
                <Icone nom={enAttente ? 'nuage' : 'check'} taille={76} epaisseur={3.4} couleur={enAttente ? c.cobalt : c.blanc} />
              </Pop>
            </View>
          </Pop>
        </View>
        <Apparition rang={3} style={{ gap: 14, alignItems: 'center' }}>
          <Titre taille={42} style={{ textAlign: 'center', lineHeight: 46 }}>
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
  halo: { width: 182, height: 182, borderRadius: 91, backgroundColor: 'rgba(124,147,245,0.22)', alignItems: 'center', justifyContent: 'center' },
  check: { width: 150, height: 150, borderRadius: 75, backgroundColor: c.cobalt, alignItems: 'center', justifyContent: 'center' },
  checkHalo: { boxShadow: ombres.bloc },
  checkAttente: { backgroundColor: c.puce },
  texte: { fontFamily: polices.texte, fontSize: 18, lineHeight: 25, color: c.gris, textAlign: 'center' },
  ensuite: { backgroundColor: c.blanc, borderWidth: 1, borderColor: c.trait, borderRadius: 24, padding: 18, gap: 4, boxShadow: ombres.carte },
  kicker: { fontFamily: polices.texte700, fontSize: 13, color: c.cobalt, textTransform: 'uppercase', letterSpacing: 1.05 },
  motif: { fontFamily: polices.texte800, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: c.encre },
  lien: { alignItems: 'center', paddingVertical: 10 },
  lienTexte: { fontFamily: polices.texte700, fontSize: 17, color: c.cobalt, textDecorationLine: 'underline' },
  sous: { fontFamily: polices.texte, fontSize: 16, color: c.gris },
});
