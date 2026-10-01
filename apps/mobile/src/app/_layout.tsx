import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { Barlow_700Bold } from '@expo-google-fonts/barlow/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Bouton } from '@/components/Bouton';
import { Texte, Titre } from '@/components/Texte';
import { SessionProvider, useSession } from '@/lib/session';
import { c } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Racine() {
  const [polices, erreur] = useFonts({
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  const pret = polices || !!erreur;

  useEffect(() => {
    if (pret) SplashScreen.hideAsync().catch(() => {});
  }, [pret]);

  if (!pret) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Navigation />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { etat, erreurProfil, rechargerProfil, deconnecter } = useSession();

  if (etat === 'chargement') {
    return (
      <View style={{ flex: 1, backgroundColor: c.beton, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        {erreurProfil ? (
          <>
            <Titre taille={32} style={{ textAlign: 'center' }}>Pas de connexion</Titre>
            <Texte variante="doux" style={{ textAlign: 'center' }}>
              Impossible de charger ton profil. Vérifie le réseau et réessaie.
            </Texte>
            <Bouton titre="Réessayer" onPress={rechargerProfil} style={{ alignSelf: 'stretch' }} />
            <Bouton titre="Se déconnecter" variante="blanc" petit onPress={deconnecter} style={{ alignSelf: 'stretch' }} />
          </>
        ) : (
          <ActivityIndicator size="large" color={c.marine} />
        )}
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.beton }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={etat === 'pret'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="moi" />
        <Stack.Screen name="intervention/[id]" />
        <Stack.Screen name="fiche/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="envoyee" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={etat === 'configuration'}>
        <Stack.Screen name="configuration" />
      </Stack.Protected>
      <Stack.Protected guard={etat === 'connexion'}>
        <Stack.Screen name="connexion" />
      </Stack.Protected>
      <Stack.Protected guard={etat === 'entreprise'}>
        <Stack.Screen name="entreprise" />
      </Stack.Protected>
    </Stack>
  );
}
