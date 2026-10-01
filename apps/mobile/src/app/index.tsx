import { adresseComplete, ajouterJours, aujourdhui, dateLongue, estBureau } from '@chantio/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Apparition, Appui } from '@/components/Anime';
import { Avatar } from '@/components/Avatar';
import { Bandeau } from '@/components/Bandeau';
import { BandeauEnvoi } from '@/components/BandeauEnvoi';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Degrade } from '@/components/Degrade';
import { Ecran } from '@/components/Ecran';
import { Icone } from '@/components/Icone';
import { LigneIntervention, estTerminee } from '@/components/LigneIntervention';
import { PropulsePar } from '@/components/Logo';
import { BadgeUrgence } from '@/components/Puce';
import { Texte, Titre } from '@/components/Texte';
import { Tournee } from '@/components/Tournee';
import type { InterventionVue } from '@/lib/donnees';
import { delai, heureCourte, minutesAvant } from '@/lib/horaires';
import { appeler } from '@/lib/liens';
import { useSession } from '@/lib/session';
import { c, ombres, polices } from '@/lib/theme';

const capitaliser = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const parHeure = (a: InterventionVue, b: InterventionVue) =>
  (a.date_prevue ?? '').localeCompare(b.date_prevue ?? '') || (a.heure_prevue ?? '99').localeCompare(b.heure_prevue ?? '99');

export default function MaJournee() {
  const s = useSession();
  const { profil, interventions } = s;
  const bureau = estBureau(profil?.membre.role);
  const [equipe, setEquipe] = useState(false);
  const [carte, setCarte] = useState(false);
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

  const titre = duJour.length ? `${duJour.length} chantier${duJour.length > 1 ? 's' : ''}` : 'Journée libre';
  const avant = suivante ? minutesAvant(suivante.date_prevue, suivante.heure_prevue) : null;
  const pilule = suivante?.statut === 'en_cours' ? 'En cours' : avant == null || avant <= 90 ? 'Maintenant' : 'À suivre';
  const lieu = suivante ? [suivante.client?.nom, adresseCourte(suivante)].filter(Boolean).join(' · ') : '';
  let rang = 0;

  return (
    <Ecran refreshControl={<RefreshControl refreshing={s.chargementListe} onRefresh={s.rafraichir} tintColor={c.cobalt} />}>
      <Apparition rang={rang++} style={styles.entete}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.date} numberOfLines={1}>{capitaliser(dateLongue(t))}</Text>
          <Titre numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 2 }}>{titre}</Titre>
        </View>
        <Appui accessibilityRole="button" accessibilityLabel="Mon profil" onPress={() => router.push('/moi')} hitSlop={8} echelle={0.92}>
          {profil && <Avatar uri={s.photo} prenom={profil.membre.prenom} nom={profil.membre.nom} taille={60} anneau={3} />}
        </Appui>
      </Apparition>

      {s.source?.mode === 'demo' && (
        <Apparition rang={rang++}>
          <Pressable onPress={s.quitterDemo}>
            <Bandeau bleu texte="Mode démo : rien n'est enregistré. Touche ici pour quitter." />
          </Pressable>
        </Apparition>
      )}
      <BandeauEnvoi />
      {s.erreurListe && (
        <Bandeau icone="horsLigne" texte={`Liste non mise à jour${s.majLe ? ` depuis ${new Date(s.majLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Tire vers le bas pour réessayer.`} />
      )}

      {bureau && (
        <Apparition rang={rang++} style={styles.bascule}>
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
        </Apparition>
      )}

      <Apparition rang={rang++} style={styles.bascule}>
        {[
          { v: false, l: 'Liste' },
          { v: true, l: 'Carte' },
        ].map((o) => (
          <Pressable
            key={o.l}
            accessibilityRole="tab"
            accessibilityState={{ selected: carte === o.v }}
            onPress={() => setCarte(o.v)}
            style={[styles.option, carte === o.v && styles.optionOn]}
          >
            <Text style={[styles.optionTexte, carte === o.v && { color: c.blanc }]}>{o.l}</Text>
          </Pressable>
        ))}
      </Apparition>

      {carte ? (
        <Apparition rang={rang++}>
          <Tournee liste={ouvertes} optimiser={!equipe} ouvrir={ouvrir} />
        </Apparition>
      ) : suivante ? (
        <Apparition rang={rang++} key={suivante.id}>
          <Appui accessibilityRole="button" onPress={() => ouvrir(suivante)} echelle={0.985} style={styles.carteSuivante}>
            <Degrade rayon={RAYON_SUIVANTE} halo />
            <View style={styles.ligneHaut}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text style={styles.pilule}>{pilule}</Text>
                <BadgeUrgence urgence={suivante.urgence} />
              </View>
              {avant != null && avant > 0 && suivante.statut !== 'en_cours' ? (
                <View style={styles.eta}>
                  <Icone nom="horloge" taille={18} couleur={c.surCobalt} />
                  <Text style={styles.etaTexte}>{delai(avant)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.grandeHeure}>{heureCourte(suivante.heure_prevue)}</Text>
            <Text style={styles.motifSuivante}>{suivante.motif}</Text>
            {lieu ? <Text style={styles.adresseSuivante}>{lieu}</Text> : null}
            {equipe && <Text style={styles.adresseSuivante}>{suivante.intervenants.map((m) => m.prenom).join(', ') || 'Pas attribuée'}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Bouton
                titre={suivante.statut === 'en_cours' ? 'Reprendre la fiche' : 'Démarrer'}
                icone="droite"
                variante="clair"
                onPress={() => demarrer(suivante)}
                style={{ flex: 1 }}
              />
              {suivante.client?.telephone ? (
                <BoutonRond grand icone="telephone" label={`Appeler ${suivante.client.telephone}`} onPress={() => appeler(suivante.client!.telephone!)} fond="rgba(255,255,255,0.18)" couleur={c.blanc} />
              ) : null}
            </View>
          </Appui>
        </Apparition>
      ) : (
        <Apparition rang={rang++}>
          <Carte style={{ padding: 22 }}>
            <Titre taille={24}>{duJour.length ? 'Tout est fait' : 'Rien de prévu'}</Titre>
            <Texte variante="doux">
              {duJour.length
                ? 'Toutes les fiches du jour sont envoyées.'
                : equipe
                  ? "Rien de prévu pour l'équipe aujourd'hui."
                  : "Les interventions que le bureau te donne pour aujourd'hui s'afficheront ici."}
            </Texte>
          </Carte>
        </Apparition>
      )}

      {!carte && (
        <>
          <Section titre="Ensuite" liste={ensuite} ouvrir={ouvrir} equipe={equipe} rang={rang} />
          <Section titre="Terminées" liste={faites} ouvrir={ouvrir} equipe={equipe} rang={rang + ensuite.length + 1} />
          <Section titre="Demain" liste={deDemain} ouvrir={ouvrir} equipe={equipe} rang={rang + ensuite.length + faites.length + 2} />
          <Section titre="Plus tard" liste={plusTard} ouvrir={ouvrir} equipe={equipe} avecJour rang={8} />
        </>
      )}

      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <PropulsePar />
      </View>
    </Ecran>
  );
}

/** « 12 rue des Tilleuls, Paris » : sans le code postal, pour tenir sur la carte. */
function adresseCourte(i: InterventionVue): string {
  if (!i.site) return '';
  return [i.site.adresse, i.site.ville].filter(Boolean).join(', ') || adresseComplete(i.site);
}

function Section({ titre, liste, ouvrir, equipe, avecJour, rang }: {
  titre: string;
  liste: InterventionVue[];
  ouvrir: (i: InterventionVue) => void;
  equipe: boolean;
  avecJour?: boolean;
  rang: number;
}) {
  if (!liste.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Apparition rang={rang}>
        <Texte variante="section" style={{ marginTop: 6, fontSize: 15 }}>{titre}</Texte>
      </Apparition>
      {liste.map((i, n) => (
        <Apparition key={i.id} rang={rang + n + 1}>
          <LigneIntervention intervention={i} onPress={() => ouvrir(i)} avecJour={avecJour} avecTechniciens={equipe} />
        </Apparition>
      ))}
    </View>
  );
}

const RAYON_SUIVANTE = 28;

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  date: { fontFamily: polices.texte600, fontSize: 17, color: c.gris },
  carteSuivante: { backgroundColor: c.cobalt, borderRadius: RAYON_SUIVANTE, padding: 20, gap: 4, boxShadow: ombres.bloc },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etaTexte: { fontFamily: polices.texte600, fontSize: 16, color: c.surCobalt },
  bascule: { flexDirection: 'row', backgroundColor: c.blanc, borderWidth: 1, borderColor: c.trait, borderRadius: 18, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionOn: { backgroundColor: c.cobalt, boxShadow: ombres.bouton },
  optionTexte: { fontFamily: polices.texte700, fontSize: 16, color: c.encre },
  pilule: {
    fontFamily: polices.texte800,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    backgroundColor: c.blanc,
    color: c.cobalt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  grandeHeure: { fontFamily: polices.titre, fontSize: 58, lineHeight: 64, letterSpacing: -2, color: c.blanc, marginTop: 6 },
  motifSuivante: { fontFamily: polices.texte800, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: c.blanc },
  adresseSuivante: { fontFamily: polices.texte, fontSize: 16, lineHeight: 21, color: c.surCobalt },
});
