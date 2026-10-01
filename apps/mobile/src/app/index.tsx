import { adresseComplete, ajouterJours, aujourdhui, dateLongue, estBureau } from '@chantio/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Bandeau } from '@/components/Bandeau';
import { BandeauEnvoi } from '@/components/BandeauEnvoi';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Ecran } from '@/components/Ecran';
import { LigneIntervention, estTerminee } from '@/components/LigneIntervention';
import { PropulsePar } from '@/components/Logo';
import { BadgeUrgence } from '@/components/Puce';
import { Texte, Titre } from '@/components/Texte';
import type { InterventionVue } from '@/lib/donnees';
import { appeler } from '@/lib/liens';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

const capitaliser = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const parHeure = (a: InterventionVue, b: InterventionVue) =>
  (a.date_prevue ?? '').localeCompare(b.date_prevue ?? '') || (a.heure_prevue ?? '99').localeCompare(b.heure_prevue ?? '99');

export default function MaJournee() {
  const s = useSession();
  const { profil, interventions } = s;
  const bureau = estBureau(profil?.membre.role);
  const [equipe, setEquipe] = useState(false);
  const moi = profil?.membre.id;

  const t = aujourdhui();
  const demain = ajouterJours(t, 1);
  const visibles = interventions
    .filter((i) => (bureau && equipe) || i.intervenants.some((m) => m.id === moi))
    .sort(parHeure);
  // Une intervention démarrée un jour précédent reste dans la journée.
  const duJour = visibles.filter((i) => i.date_prevue === t || (i.statut === 'en_cours' && (i.date_prevue ?? '') < t));
  const ouvertes = duJour.filter((i) => !estTerminee(i));
  const faites = duJour.filter(estTerminee);
  const suivante = ouvertes.find((i) => i.statut === 'en_cours') ?? ouvertes[0];
  const ensuite = ouvertes.filter((i) => i !== suivante);
  const deDemain = visibles.filter((i) => i.date_prevue === demain);
  const plusTard = visibles.filter((i) => (i.date_prevue ?? '') > demain);

  const ouvrir = (i: InterventionVue) => router.push({ pathname: '/intervention/[id]', params: { id: i.id } });
  const demarrer = (i: InterventionVue) => {
    s.demarrer(i);
    router.push({ pathname: '/fiche/[id]', params: { id: i.id } });
  };

  const resume = duJour.length
    ? `${duJour.length} intervention${duJour.length > 1 ? 's' : ''} aujourd'hui, ${faites.length} terminée${faites.length > 1 ? 's' : ''}.`
    : equipe
      ? "Rien de prévu pour l'équipe aujourd'hui."
      : "Rien de prévu pour toi aujourd'hui.";

  return (
    <Ecran refreshControl={<RefreshControl refreshing={s.chargementListe} onRefresh={s.rafraichir} tintColor={c.marine} />}>
      <View style={styles.entete}>
        <Text style={styles.marque} numberOfLines={1}>{profil?.entreprise.nom}</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.date}>{capitaliser(dateLongue(t))}</Text>
        <Titre>Salut {profil?.membre.prenom}</Titre>
        <Texte variante="doux" style={{ fontSize: 18 }}>{resume}</Texte>
      </View>

      {s.source?.mode === 'demo' && (
        <Pressable onPress={s.quitterDemo}>
          <Bandeau jaune texte="Mode démo : rien n'est enregistré. Touche ici pour quitter." />
        </Pressable>
      )}
      <BandeauEnvoi />
      {s.erreurListe && (
        <Bandeau icone="horsLigne" texte={`Liste non mise à jour${s.majLe ? ` depuis ${new Date(s.majLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Tire vers le bas pour réessayer.`} />
      )}

      {bureau && (
        <View style={styles.bascule}>
          {[
            { v: false, l: 'Les miennes' },
            { v: true, l: "Toute l'équipe" },
          ].map((o) => (
            <Pressable
              key={o.l}
              accessibilityRole="tab"
              accessibilityState={{ selected: equipe === o.v }}
              onPress={() => setEquipe(o.v)}
              style={[styles.option, equipe === o.v && styles.optionOn]}
            >
              <Text style={[styles.optionTexte, equipe === o.v && { color: c.blanc }]}>{o.l}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {suivante ? (
        <Pressable onPress={() => ouvrir(suivante)}>
          <Carte sombre style={{ borderRadius: 30, padding: 20, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={styles.pilule}>{suivante.statut === 'en_cours' ? 'En cours' : 'À suivre'}</Text>
              <BadgeUrgence urgence={suivante.urgence} />
              <Text style={styles.motifSuivante} numberOfLines={1}>{suivante.motif}</Text>
            </View>
            <Text style={styles.grandeHeure}>{suivante.heure_prevue?.slice(0, 5) ?? '--:--'}</Text>
            <Text style={styles.clientSuivante}>{suivante.client?.nom}</Text>
            <Text style={styles.adresseSuivante}>{adresseComplete(suivante.site)}</Text>
            {equipe && <Text style={styles.adresseSuivante}>{suivante.intervenants.map((m) => m.prenom).join(', ') || 'Pas attribuée'}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Bouton
                titre={suivante.statut === 'en_cours' ? 'Reprendre la fiche' : 'Démarrer'}
                icone="droite"
                onPress={() => demarrer(suivante)}
                style={{ flex: 1 }}
              />
              {suivante.client?.telephone ? (
                <BoutonRond grand icone="telephone" label={`Appeler ${suivante.client.telephone}`} onPress={() => appeler(suivante.client!.telephone!)} fond="rgba(255,255,255,0.12)" couleur={c.blanc} />
              ) : null}
            </View>
          </Carte>
        </Pressable>
      ) : (
        <Carte style={{ padding: 22 }}>
          <Titre taille={26}>{duJour.length ? 'Tout est fait' : 'Journée libre'}</Titre>
          <Texte variante="doux">
            {duJour.length
              ? 'Toutes les fiches du jour sont envoyées.'
              : "Les interventions que le bureau te donne pour aujourd'hui s'afficheront ici."}
          </Texte>
        </Carte>
      )}

      <Section titre="Ensuite" liste={ensuite} ouvrir={ouvrir} equipe={equipe} />
      <Section titre="Terminées" liste={faites} ouvrir={ouvrir} equipe={equipe} />
      <Section titre="Demain" liste={deDemain} ouvrir={ouvrir} equipe={equipe} />
      <Section titre="Plus tard" liste={plusTard} ouvrir={ouvrir} equipe={equipe} avecJour />

      <View style={{ marginTop: 24, gap: 14, alignItems: 'center' }}>
        <Pressable onPress={s.deconnecter} hitSlop={10} disabled={s.enAttente.length > 0}>
          <Texte variante="doux" style={{ textDecorationLine: 'underline', opacity: s.enAttente.length ? 0.4 : 1 }}>
            {s.source?.mode === 'demo' ? 'Quitter le mode démo' : 'Se déconnecter'}
          </Texte>
        </Pressable>
        <PropulsePar />
      </View>
    </Ecran>
  );
}

function Section({ titre, liste, ouvrir, equipe, avecJour }: {
  titre: string;
  liste: InterventionVue[];
  ouvrir: (i: InterventionVue) => void;
  equipe: boolean;
  avecJour?: boolean;
}) {
  if (!liste.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Texte variante="section" style={{ marginTop: 10 }}>{titre}</Texte>
      {liste.map((i) => (
        <LigneIntervention key={i.id} intervention={i} onPress={() => ouvrir(i)} avecJour={avecJour} avecTechniciens={equipe} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  marque: { fontFamily: polices.titre, fontSize: 24, letterSpacing: 0.8, textTransform: 'uppercase', color: c.marine, flexShrink: 1 },
  date: { fontFamily: polices.texte600, fontSize: 18, color: c.texteDoux },
  bascule: { flexDirection: 'row', backgroundColor: c.blanc, borderRadius: 18, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionOn: { backgroundColor: c.marine },
  optionTexte: { fontFamily: polices.texte700, fontSize: 17, color: c.marine },
  pilule: {
    fontFamily: polices.texte700,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: c.jaune,
    color: c.marine,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  motifSuivante: { flex: 1, fontFamily: polices.texte600, fontSize: 16, color: c.marineSoft, textAlign: 'right' },
  grandeHeure: { fontFamily: polices.titre, fontSize: 64, lineHeight: 68, color: c.blanc, marginTop: 6 },
  clientSuivante: { fontFamily: polices.texte700, fontSize: 24, color: c.blanc },
  adresseSuivante: { fontFamily: polices.texte, fontSize: 17, color: c.marineSoft },
});
