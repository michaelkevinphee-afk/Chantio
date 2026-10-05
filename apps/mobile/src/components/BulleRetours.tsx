import Constants from 'expo-constants';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { c, ombres } from '@/lib/theme';
import { Appui } from './Anime';
import { Bouton } from './Bouton';
import { Champ } from './Champ';
import { Icone } from './Icone';
import { Texte, Titre } from './Texte';

// Bulle « Une idée pour Chantio ? » : petit rond au-dessus de la barre d'action, qui ouvre une
// feuille où l'on dicte ce qu'on voudrait améliorer. Le retour part avec l'écran où l'on était.

const ECRANS: Record<string, string> = {
  '/': 'Ma journée',
  '/moi': 'Mon profil',
  '/envoyee': 'Fiche envoyée',
};

export function BulleRetours() {
  const s = useSession();
  const marges = useSafeAreaInsets();
  const chemin = usePathname();
  const parametres = useGlobalSearchParams();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoyes, setEnvoyes] = useState(0);

  if (!s.source || !s.profil) return null;
  const { membre } = s.profil;

  // L'écran affiché, en clair : « Intervention · DEP-2026-0012 · Mme Laurent ».
  const id = typeof parametres.id === 'string' ? parametres.id : null;
  const inter = id ? s.interventions.find((i) => i.id === id) : undefined;
  const base = chemin.startsWith('/intervention/') ? 'Intervention' : chemin.startsWith('/fiche/') ? 'Fiche d’intervention' : (ECRANS[chemin] ?? chemin);
  const titrePage = [base, inter?.reference, inter?.client?.nom].filter(Boolean).join(' · ');
  const page = chemin + (id ? `?id=${id}` : '');

  const envoyer = async () => {
    const message = texte.trim();
    if (!message || envoi || !s.source) return;
    setEnvoi(true);
    setErreur('');
    try {
      await s.source.envoyerRetour({
        auteur: [membre.prenom, membre.nom].filter(Boolean).join(' '),
        texte: message,
        page,
        titrePage,
        appareil: `appli ${Platform.OS} ${Platform.Version} · Chantio ${Constants.expoConfig?.version ?? ''}`.trim(),
      });
      setTexte('');
      setEnvoyes((n) => n + 1);
    } catch {
      setErreur('Le message n’est pas parti. Vérifie le réseau et réessaie.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Appui
        accessibilityRole="button"
        accessibilityLabel="Une idée pour améliorer Chantio ?"
        onPress={() => setOuvert(true)}
        style={({ pressed }) => [styles.rond, { bottom: marges.bottom + 132 }, pressed && { opacity: 0.85 }]}
      >
        <Icone nom="bulle" taille={24} couleur={c.blanc} />
      </Appui>

      <Modal visible={ouvert} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOuvert(false)}>
        <ScrollView style={{ backgroundColor: c.fond }} contentContainerStyle={styles.feuille} keyboardShouldPersistTaps="handled">
          <View style={styles.entete}>
            <Titre taille={26} style={{ flex: 1 }}>Une idée pour Chantio ?</Titre>
            <Appui accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setOuvert(false)} style={styles.fermer}>
              <Icone nom="x" taille={22} couleur={c.encre} />
            </Appui>
          </View>
          <View style={styles.bulle}>
            <Texte>
              {`Bonjour ${membre.prenom}, dis-nous ce que tu voudrais améliorer : un bouton mal placé, une info qui manque, une idée…\nAppuie sur Dicter et parle, puis envoie.`}
            </Texte>
          </View>
          <View style={styles.page}>
            <Icone nom="repere" taille={16} couleur={c.gris} />
            <Texte variante="doux" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
              {`Écran : ${titrePage}`}
            </Texte>
          </View>
          <Champ
            label="Ton message"
            dictee
            multiligne
            value={texte}
            onChangeText={setTexte}
            maxLength={5000}
            placeholder="Écris ou dicte ton idée…"
          />
          {erreur ? <Texte style={{ color: c.rouge }}>{erreur}</Texte> : null}
          {envoyes > 0 && !texte ? (
            <View style={styles.merci}>
              <Icone nom="check" taille={20} couleur={c.vert} />
              <Texte style={{ flex: 1 }}>{`Merci ${membre.prenom}, c’est noté ! Tu peux en envoyer un autre.`}</Texte>
            </View>
          ) : null}
          <Bouton titre="Envoyer" icone="envoyer" onPress={envoyer} chargement={envoi} desactive={!texte.trim()} />
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rond: {
    position: 'absolute',
    right: 14,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.encre,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: ombres.bouton,
  },
  feuille: { padding: 20, gap: 16, paddingBottom: 48 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fermer: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.blanc, alignItems: 'center', justifyContent: 'center' },
  bulle: { backgroundColor: c.blanc, borderRadius: 18, borderTopLeftRadius: 6, padding: 16 },
  page: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  merci: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.blanc, borderRadius: 14, padding: 12 },
});
