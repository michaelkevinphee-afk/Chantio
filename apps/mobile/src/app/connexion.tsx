import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Bouton } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { Champ } from '@/components/Champ';
import { Ecran } from '@/components/Ecran';
import { PropulsePar } from '@/components/Logo';
import { Texte, Titre } from '@/components/Texte';
import { useSession } from '@/lib/session';
import { c, polices } from '@/lib/theme';

function messageErreur(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/rate|too many|security purposes/i.test(m)) return 'Trop de demandes. Attends une minute avant de redemander un code.';
  if (/expired|invalid|token/i.test(m)) return 'Code incorrect ou expiré. Vérifie le dernier e-mail reçu.';
  if (/network|fetch/i.test(m)) return 'Pas de réseau. Vérifie ta connexion et réessaie.';
  return m;
}

export default function Connexion() {
  const { envoyerCode, verifierCode, activerDemo } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  const demander = async () => {
    setAttente(true);
    setErreur(null);
    try {
      await envoyerCode(email.trim().toLowerCase());
      setEtape('code');
      setCode('');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAttente(false);
    }
  };

  const valider = async (valeur = code) => {
    setAttente(true);
    setErreur(null);
    try {
      await verifierCode(email.trim().toLowerCase(), valeur);
      // La suite (profil, entreprise) est gérée par la session.
    } catch (e) {
      setErreur(messageErreur(e));
      setAttente(false);
    }
  };

  const barre =
    etape === 'email' ? (
      <Bouton titre="Recevoir mon code" icone="droite" onPress={demander} desactive={!emailOk} chargement={attente} style={{ flex: 1 }} />
    ) : (
      <Bouton titre="Valider" icone="check" onPress={() => valider()} desactive={code.length < 6} chargement={attente} style={{ flex: 1 }} />
    );

  return (
    <Ecran barre={barre}>
      <View style={{ marginTop: 24, gap: 10 }}>
        <Titre>{etape === 'email' ? 'Connexion' : 'Ton code'}</Titre>
        <Texte variante="doux" style={{ fontSize: 18 }}>
          {etape === 'email'
            ? "Entre ton e-mail. On t'envoie un code, pas besoin de mot de passe."
            : `On a envoyé un code à ${email.trim()}. Il arrive en général en moins d'une minute.`}
        </Texte>
      </View>

      {etape === 'email' ? (
        <Champ
          label="Ton e-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="prenom@entreprise.fr"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => emailOk && demander()}
          style={{ fontSize: 20, minHeight: 64 }}
        />
      ) : (
        <>
          <TextInput
            accessibilityLabel="Code reçu par e-mail"
            value={code}
            onChangeText={(s) => {
              const chiffres = s.replace(/\D/g, '').slice(0, 8);
              setCode(chiffres);
            }}
            placeholder="••••••"
            placeholderTextColor="#B9BDC6"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            style={{
              fontFamily: polices.titre,
              fontSize: 48,
              letterSpacing: 10,
              textAlign: 'center',
              color: c.marine,
              backgroundColor: c.blanc,
              borderRadius: 22,
              paddingVertical: 16,
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Lien texte="Changer d'e-mail" onPress={() => setEtape('email')} />
            <Lien texte="Renvoyer le code" onPress={demander} />
          </View>
        </>
      )}

      {erreur ? (
        <Carte style={{ backgroundColor: c.rougeDoux }}>
          <Texte style={{ color: c.rouge, fontFamily: polices.texte700 }}>{erreur}</Texte>
        </Carte>
      ) : null}

      <View style={{ marginTop: 28, gap: 18, alignItems: 'center' }}>
        <Lien texte="Essayer sans compte (mode démo)" onPress={activerDemo} />
        <PropulsePar />
      </View>
    </Ecran>
  );
}

function Lien({ texte, onPress }: { texte: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={{ paddingVertical: 8 }}>
      <Texte variante="fort" style={{ fontSize: 17, textDecorationLine: 'underline' }}>{texte}</Texte>
    </Pressable>
  );
}
