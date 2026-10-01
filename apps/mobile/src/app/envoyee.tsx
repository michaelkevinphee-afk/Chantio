import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Bouton } from '@/components/Bouton';
import { Ecran } from '@/components/Ecran';
import { Icone } from '@/components/Icone';
import { Texte, Titre } from '@/components/Texte';
import { c } from '@/lib/theme';

export default function Envoyee() {
  const { etat, client, resultat } = useLocalSearchParams<{ etat: string; client?: string; resultat?: string }>();
  const enAttente = etat === 'en_attente';
  const chez = client ? ` de ${client}` : '';

  return (
    <Ecran barre={<Bouton titre="Retour à ma journée" icone="droite" onPress={() => router.dismissTo('/')} style={{ flex: 1 }} />}>
      <View style={{ alignItems: 'center', gap: 18, marginTop: 64 }}>
        <View
          style={{
            width: 132,
            height: 132,
            borderRadius: 66,
            backgroundColor: enAttente ? c.jauneDoux : c.jaune,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nom={enAttente ? 'nuage' : 'check'} taille={72} epaisseur={3.2} couleur={c.marine} />
        </View>
        <Titre taille={52} style={{ textAlign: 'center', lineHeight: 52 }}>
          {enAttente ? 'Enregistrée' : 'Fiche\nenvoyée'}
        </Titre>
        <Texte variante="doux" style={{ fontSize: 19, textAlign: 'center' }}>
          {enAttente
            ? "Pas de réseau pour l'instant. La fiche est gardée sur ton téléphone, elle partira dès que le réseau revient."
            : resultat && resultat !== 'termine'
              ? `Le bureau voit la fiche${chez} et sait qu'il faudra y revenir.`
              : `Le bureau voit déjà la fiche${chez}.`}
        </Texte>
      </View>
    </Ecran>
  );
}
