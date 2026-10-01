import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Bouton } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Champ } from '@/components/Champ';
import { Ecran } from '@/components/Ecran';
import { PropulsePar } from '@/components/Logo';
import { Texte, Titre } from '@/components/Texte';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

export default function CreerEntreprise() {
  const { creerEntreprise, rechargerProfil, deconnecter } = useSession();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = async () => {
    setAttente(true);
    setErreur(null);
    try {
      await creerEntreprise(nom.trim(), prenom.trim());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setAttente(false);
    }
  };

  return (
    <Ecran
      barre={
        <Bouton
          titre="C'est parti"
          icone="droite"
          onPress={creer}
          desactive={!nom.trim() || !prenom.trim()}
          chargement={attente}
          style={{ flex: 1 }}
        />
      }
    >
      <View style={{ marginTop: 24, gap: 10 }}>
        <Titre>Créer mon entreprise</Titre>
        <Texte variante="doux" style={{ fontSize: 18 }}>
          Deux questions, et tu peux commencer tes fiches. Tu pourras inviter ton équipe ensuite.
        </Texte>
      </View>
      <Champ label="Nom de l'entreprise" value={nom} onChangeText={setNom} placeholder="Plomberie Verger" autoCapitalize="words" />
      <Champ label="Ton prénom" value={prenom} onChangeText={setPrenom} placeholder="Christophe" autoCapitalize="words" autoComplete="given-name" />
      {erreur ? (
        <Carte style={{ backgroundColor: c.rougeDoux }}>
          <Texte style={{ color: c.rouge, fontFamily: polices.texte700 }}>{erreur}</Texte>
        </Carte>
      ) : null}
      <Carte>
        <Texte variante="fort">Ton patron t'a invité ?</Texte>
        <Texte variante="doux">
          Ne crée pas d'entreprise : demande-lui de t'inviter avec cette adresse e-mail, puis touche « Vérifier ».
        </Texte>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={rechargerProfil} hitSlop={8}>
            <Texte variante="fort" style={{ textDecorationLine: 'underline' }}>Vérifier</Texte>
          </Pressable>
          <Pressable onPress={deconnecter} hitSlop={8}>
            <Texte variante="fort" style={{ textDecorationLine: 'underline' }}>Changer de compte</Texte>
          </Pressable>
        </View>
      </Carte>
      <View style={{ marginTop: 12 }}>
        <PropulsePar />
      </View>
    </Ecran>
  );
}
