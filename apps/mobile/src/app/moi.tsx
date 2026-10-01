import { LIBELLE_ROLE } from '@chantio/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Apparition, Appui, Pop } from '@/components/Anime';
import { Avatar } from '@/components/Avatar';
import { Bandeau } from '@/components/Bandeau';
import { Bouton, BoutonRond } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Ecran } from '@/components/Ecran';
import { Icone, type NomIcone } from '@/components/Icone';
import { PropulsePar } from '@/components/Logo';
import { Texte, Titre } from '@/components/Texte';
import { choisirPhotoProfil } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { c, ombres, polices, serre } from '@/lib/theme';

export default function Moi() {
  const s = useSession();
  const [choix, setChoix] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const profil = s.profil;
  if (!profil) return null;
  const { membre, entreprise } = profil;
  const demo = s.source?.mode === 'demo';
  const nomComplet = [membre.prenom, membre.nom].filter(Boolean).join(' ');

  const changer = async (origine: 'camera' | 'galerie') => {
    setMessage(null);
    setEnvoi(true);
    try {
      const uri = await choisirPhotoProfil(origine);
      if (uri) {
        await s.changerPhoto(uri);
        setChoix(false);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La photo n'a pas pu être changée.");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    setMessage(null);
    setEnvoi(true);
    try {
      await s.retirerPhoto();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La photo n'a pas pu être retirée.");
    } finally {
      setEnvoi(false);
    }
  };

  const bloque = s.enAttente.length > 0;

  return (
    <Ecran>
      <View style={styles.haut}>
        <BoutonRond rond icone="gauche" label="Retour" onPress={() => router.back()} />
        <Text style={styles.titreHaut}>Moi</Text>
        <View style={{ width: 52 }} />
      </View>

      <Apparition style={styles.identite}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Changer ma photo"
          onPress={() => setChoix((x) => !x)}
          disabled={envoi}
        >
          <Pop>
            <Avatar uri={s.photo} prenom={membre.prenom} nom={membre.nom} taille={132} espace={6} anneau={3} />
          </Pop>
          <View style={styles.pastillePhoto}>
            {envoi ? <ActivityIndicator color={c.blanc} /> : <Icone nom="photo" taille={22} couleur={c.blanc} epaisseur={2.5} />}
          </View>
        </Pressable>
        <Titre taille={32} style={{ textAlign: 'center', marginTop: 10 }}>{nomComplet}</Titre>
        <Texte variante="doux" style={{ fontSize: 18, textAlign: 'center' }}>
          {LIBELLE_ROLE[membre.role]} · {entreprise.nom}
        </Texte>
        {membre.email ? <Texte variante="doux" style={{ fontSize: 15, textAlign: 'center' }}>{membre.email}</Texte> : null}
      </Apparition>

      {message ? (
        <Carte alerte>
          <Texte style={{ color: c.rouge, fontFamily: polices.texte700 }}>{message}</Texte>
        </Carte>
      ) : null}

      <Apparition rang={1}>
        {choix ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Choix icone="photo" texte="Prendre une photo" onPress={() => changer('camera')} desactive={envoi} rang={0} />
              <Choix icone="galerie" texte="Choisir dans la galerie" onPress={() => changer('galerie')} desactive={envoi} rang={1} />
            </View>
            <Bouton titre="Annuler" variante="secondaire" petit onPress={() => setChoix(false)} desactive={envoi} />
          </View>
        ) : (
          <Bouton
            titre={s.photo ? 'Changer ma photo' : 'Ajouter ma photo'}
            iconeAvant="photo"
            onPress={() => setChoix(true)}
            chargement={envoi}
          />
        )}
      </Apparition>

      {s.photo && !choix ? (
        <View style={{ alignItems: 'center' }}>
          <Pressable accessibilityRole="button" onPress={retirer} hitSlop={10} disabled={envoi} style={{ paddingVertical: 6 }}>
            <Texte variante="fort" style={{ fontSize: 16, textDecorationLine: 'underline', color: c.gris }}>Retirer ma photo</Texte>
          </Pressable>
        </View>
      ) : null}

      <Apparition rang={2}>
        <Carte style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={styles.ti}>
            <Icone nom="info" taille={24} couleur={c.cobalt} />
          </View>
          <Texte style={{ flex: 1, fontSize: 16 }}>
            Ta photo aide le bureau et l'équipe à te reconnaître. {demo ? 'En démo, elle reste sur ce téléphone.' : ''}
          </Texte>
        </Carte>
      </Apparition>

      <Apparition rang={3} style={{ gap: 12, marginTop: 18 }}>
        {demo && <Bandeau bleu texte="Mode démo : rien n'est enregistré." />}
        <Bouton
          titre={demo ? 'Quitter le mode démo' : 'Se déconnecter'}
          iconeAvant="sortie"
          variante="secondaire"
          petit
          desactive={bloque}
          onPress={s.deconnecter}
        />
        {bloque ? (
          <Texte variante="doux" style={{ fontSize: 15, textAlign: 'center' }}>
            Attends que les fiches en attente soient parties avant de te déconnecter.
          </Texte>
        ) : null}
      </Apparition>

      <View style={{ marginTop: 18 }}>
        <PropulsePar />
      </View>
    </Ecran>
  );
}

function Choix({ icone, texte, onPress, desactive, rang }: { icone: NomIcone; texte: string; onPress: () => void; desactive?: boolean; rang: number }) {
  return (
    <Apparition rang={rang} style={{ flex: 1 }}>
      <Appui accessibilityRole="button" onPress={onPress} disabled={desactive} echelle={0.96} style={[styles.choix, desactive && { opacity: 0.5 }]}>
        <View style={styles.tiPlein}>
          <Icone nom={icone} taille={26} couleur={c.blanc} />
        </View>
        <Text style={styles.texteChoix}>{texte}</Text>
      </Appui>
    </Apparition>
  );
}

const styles = StyleSheet.create({
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titreHaut: { fontFamily: polices.titre, fontSize: 22, letterSpacing: serre(22), color: c.encre },
  identite: { alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 6 },
  pastillePhoto: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.cobalt,
    borderWidth: 4,
    borderColor: c.fond,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ti: { width: 48, height: 48, borderRadius: 16, backgroundColor: c.doux, alignItems: 'center', justifyContent: 'center' },
  choix: {
    minHeight: 118,
    backgroundColor: c.blanc,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: c.trait,
    boxShadow: ombres.carte,
  },
  tiPlein: { width: 50, height: 50, borderRadius: 14, backgroundColor: c.cobalt, alignItems: 'center', justifyContent: 'center' },
  texteChoix: { fontFamily: polices.texte700, fontSize: 17, lineHeight: 22, color: c.encre },
});
