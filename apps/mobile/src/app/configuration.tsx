import { View } from 'react-native';

import { Bouton } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Ecran } from '@/components/Ecran';
import { PropulsePar } from '@/components/Logo';
import { Texte, Titre } from '@/components/Texte';
import { VARIABLES_MANQUANTES } from '@/lib/config';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

export default function Configuration() {
  const { activerDemo } = useSession();
  return (
    <Ecran barre={<Bouton titre="Essayer en mode démo" icone="droite" onPress={activerDemo} style={{ flex: 1 }} />}>
      <Titre style={{ marginTop: 24 }}>Configuration manquante</Titre>
      <Texte variante="doux">
        L'appli n'est pas encore reliée à ta base Chantio. Il manque {VARIABLES_MANQUANTES.length > 1 ? 'ces variables' : 'cette variable'} :
      </Texte>
      <Carte>
        {VARIABLES_MANQUANTES.map((v) => (
          <Texte key={v} style={{ fontFamily: polices.texte700, color: c.rouge }}>{v}</Texte>
        ))}
      </Carte>
      <Carte>
        <Texte variante="fort">Pour la relier</Texte>
        <Texte>1. Copie le fichier apps/mobile/.env.example en apps/mobile/.env</Texte>
        <Texte>2. Remplis l'adresse et la clé publique (anon) de ton projet Supabase (Project Settings › API).</Texte>
        <Texte>3. Relance l'appli avec : npx expo start -c</Texte>
      </Carte>
      <View style={{ gap: 6 }}>
        <Texte variante="doux">
          En attendant, le mode démo te laisse parcourir l'appli avec des exemples. Rien n'y est enregistré.
        </Texte>
      </View>
      <View style={{ marginTop: 12 }}>
        <PropulsePar />
      </View>
    </Ecran>
  );
}
