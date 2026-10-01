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

/** Longueur minimale du mot de passe (Supabase en exige 6 par défaut). */
const MDP_MIN = 8;

function messageErreur(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/rate|too many|security purposes/i.test(m)) return 'Trop de demandes. Attends une minute avant de redemander un code.';
  if (/password/i.test(m)) return 'Mot de passe refusé. Choisis-en un plus long ou moins facile à deviner.';
  if (/expired|invalid|token/i.test(m)) return 'Code incorrect ou expiré. Vérifie le dernier e-mail reçu.';
  if (/network|fetch/i.test(m)) return 'Pas de réseau. Vérifie ta connexion et réessaie.';
  return m;
}

/**
 * - `connexion` : e-mail + mot de passe (l'usage de tous les jours) ;
 * - `email` puis `code` : première connexion ou mot de passe oublié. Le code reçu par
 *   e-mail valide l'adresse, et le technicien choisit son mot de passe en même temps.
 */
type Etape = 'connexion' | 'email' | 'code';

export default function Connexion() {
  const { connecter, envoyerCode, verifierCode, activerDemo } = useSession();
  const [etape, setEtape] = useState<Etape>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voir, setVoir] = useState(false);
  const [code, setCode] = useState('');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const adresse = email.trim().toLowerCase();
  const emailOk = /^\S+@\S+\.\S+$/.test(adresse);
  const mdpOk = motDePasse.length >= MDP_MIN;

  const aller = (e: Etape) => {
    setErreur(null);
    setEtape(e);
  };

  const executer = async (action: () => Promise<void>) => {
    setAttente(true);
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setAttente(false);
    }
  };

  // La suite (profil, entreprise) est gérée par la session une fois connecté.
  const seConnecter = () => executer(() => connecter(adresse, motDePasse));
  const demanderCode = () =>
    executer(async () => {
      await envoyerCode(adresse);
      setCode('');
      setMotDePasse('');
      setEtape('code');
    });
  const valider = () => executer(() => verifierCode(adresse, code, motDePasse));

  const barre =
    etape === 'connexion' ? (
      <Bouton titre="Se connecter" icone="droite" onPress={seConnecter} desactive={!emailOk || !motDePasse} chargement={attente} style={{ flex: 1 }} />
    ) : etape === 'email' ? (
      <Bouton titre="Recevoir mon code" icone="droite" onPress={demanderCode} desactive={!emailOk} chargement={attente} style={{ flex: 1 }} />
    ) : (
      <Bouton titre="Valider" icone="check" onPress={valider} desactive={code.length < 6 || !mdpOk} chargement={attente} style={{ flex: 1 }} />
    );

  const champEmail = (
    <Champ
      label="Ton e-mail"
      value={email}
      onChangeText={setEmail}
      placeholder="prenom@entreprise.fr"
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="username"
      returnKeyType={etape === 'connexion' ? 'next' : 'send'}
      onSubmitEditing={() => etape === 'email' && emailOk && demanderCode()}
      style={{ fontSize: 20, minHeight: 64 }}
    />
  );

  const champMotDePasse = (
    <View style={{ gap: 4 }}>
      <Champ
        label={etape === 'code' ? 'Choisis ton mot de passe' : 'Ton mot de passe'}
        indice={etape === 'code' ? `(${MDP_MIN} caractères minimum)` : undefined}
        value={motDePasse}
        onChangeText={setMotDePasse}
        secureTextEntry={!voir}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={etape === 'code' ? 'new-password' : 'current-password'}
        textContentType={etape === 'code' ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={() => {
          if (etape === 'connexion' && emailOk && motDePasse) seConnecter();
          if (etape === 'code' && code.length >= 6 && mdpOk) valider();
        }}
        style={{ fontSize: 20, minHeight: 64 }}
      />
      <View style={{ alignItems: 'flex-end' }}>
        <Lien texte={voir ? 'Masquer' : 'Afficher'} onPress={() => setVoir((v) => !v)} />
      </View>
    </View>
  );

  return (
    <Ecran barre={barre}>
      <View style={{ marginTop: 24, gap: 10 }}>
        <Titre>{etape === 'connexion' ? 'Connexion' : etape === 'email' ? 'Mot de passe' : 'Ton code'}</Titre>
        <Texte variante="doux" style={{ fontSize: 18 }}>
          {etape === 'connexion'
            ? 'Entre ton e-mail et ton mot de passe.'
            : etape === 'email'
              ? "Première connexion ou mot de passe oublié ? Entre ton e-mail : on t'envoie un code pour le valider."
              : `On a envoyé un code à ${adresse}. Il arrive en général en moins d'une minute.`}
        </Texte>
      </View>

      {etape !== 'code' && champEmail}
      {etape === 'connexion' && champMotDePasse}

      {etape === 'code' && (
        <>
          <TextInput
            accessibilityLabel="Code reçu par e-mail"
            value={code}
            onChangeText={(s) => setCode(s.replace(/\D/g, '').slice(0, 8))}
            placeholder="••••••"
            placeholderTextColor={c.grisClair}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            style={{
              fontFamily: polices.titre,
              fontSize: 48,
              letterSpacing: 10,
              textAlign: 'center',
              color: c.encre,
              backgroundColor: c.blanc,
              borderWidth: 2,
              borderColor: c.cobalt,
              borderRadius: 18,
              outlineWidth: 0,
              paddingVertical: 16,
            }}
          />
          {champMotDePasse}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Lien texte="Changer d'e-mail" onPress={() => aller('email')} />
            <Lien texte="Renvoyer le code" onPress={demanderCode} />
          </View>
        </>
      )}

      {erreur ? (
        <Carte alerte>
          <Texte style={{ color: c.rouge, fontFamily: polices.texte700 }}>{erreur}</Texte>
        </Carte>
      ) : null}

      <View style={{ marginTop: 28, gap: 18, alignItems: 'center' }}>
        {etape === 'connexion' ? (
          <Lien texte="Première connexion ou mot de passe oublié" onPress={() => aller('email')} />
        ) : (
          <Lien texte="J'ai déjà un mot de passe" onPress={() => aller('connexion')} />
        )}
        <Lien texte="Essayer sans compte (mode démo)" onPress={activerDemo} />
        <PropulsePar />
      </View>
    </Ecran>
  );
}

function Lien({ texte, onPress }: { texte: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={{ paddingVertical: 8 }}>
      <Texte variante="fort" style={{ fontSize: 17, color: c.cobalt, textDecorationLine: 'underline' }}>{texte}</Texte>
    </Pressable>
  );
}
