'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bouton } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';

// Connexion habituelle : e-mail + mot de passe.
// Première connexion ou mot de passe oublié : un code arrive par e-mail (6 à 8 chiffres
// selon le réglage « Email OTP Length » de Supabase). Il valide l'adresse, et la personne
// choisit son mot de passe en même temps.

/** Longueur minimale du mot de passe (Supabase en exige 6 par défaut). */
const MDP_MIN = 8;
/** Après 5 essais ratés, le formulaire se bloque une minute. */
const ESSAIS_MAX = 5;
const BLOCAGE_MS = 60_000;

function messageEnvoi(m: string): string {
  if (/rate|too many|security purposes/i.test(m)) return 'Trop de demandes. Attendez une minute avant de redemander un code.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide.';
  return "Impossible d'envoyer le code pour le moment. Réessayez dans un instant.";
}

type Etape = 'connexion' | 'email' | 'code';

export default function FormulaireConnexion() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Code déjà validé : si le mot de passe est refusé, on ne redemande que le mot de passe.
  const [codeValide, setCodeValide] = useState(false);
  // « Créer un compte » : même parcours que la première connexion, avec d'autres mots.
  const [creation, setCreation] = useState(false);
  const [echecs, setEchecs] = useState(0);
  const [bloqueJusqua, setBloqueJusqua] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const resteBlocage = Math.max(0, Math.ceil((bloqueJusqua - maintenant) / 1000));

  useEffect(() => {
    if (!bloqueJusqua) return;
    const t = setInterval(() => {
      setMaintenant(Date.now());
      if (Date.now() >= bloqueJusqua) {
        setBloqueJusqua(0);
        setEchecs(0);
        setErreur('');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [bloqueJusqua]);

  /** Compte un essai raté ; au 5e, bloque le formulaire une minute. */
  function echec(message: string) {
    const n = echecs + 1;
    setEchecs(n);
    if (n >= ESSAIS_MAX) {
      setMaintenant(Date.now());
      setBloqueJusqua(Date.now() + BLOCAGE_MS);
      return setErreur('Trop d’essais. Patientez une minute avant de réessayer.');
    }
    setErreur(message);
  }

  const adresse = email.trim().toLowerCase();

  function aller(e: Etape, pourCreer = false) {
    setCreation(pourCreer);
    setErreur('');
    setInfo('');
    if (etape === 'code') {
      // Le nouveau mot de passe n'a pas été enregistré : on ne le garde pas.
      setMotDePasse('');
      // Code déjà utilisé mais mot de passe abandonné : on referme la session ouverte par le code.
      if (codeValide) supabaseNavigateur().auth.signOut().catch(() => {});
      setCodeValide(false);
    }
    setEtape(e);
  }

  function entrer() {
    // Retour à la console si on venait de là (seule destination acceptée, jamais une adresse extérieure).
    const suite = new URLSearchParams(window.location.search).get('suite') ?? '';
    router.replace(/^\/console(\/[\w-]*)*$/.test(suite) ? suite : '/');
    router.refresh();
  }

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.signInWithPassword({ email: adresse, password: motDePasse });
    setEnCours(false);
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        return echec('E-mail ou mot de passe incorrect. Pas encore de mot de passe ? Utilisez « Première connexion ou mot de passe oublié ».');
      }
      return setErreur('Connexion impossible pour le moment. Réessayez dans un instant.');
    }
    entrer();
  }

  async function envoyerCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (enCours) return;
    setErreur('');
    setInfo('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: true },
    });
    setEnCours(false);
    if (error) return setErreur(messageEnvoi(error.message));
    setCode('');
    setCodeValide(false);
    if (etape === 'code') {
      setInfo(`Un nouveau code a été envoyé à ${adresse}.`);
    } else {
      setMotDePasse('');
      setEtape('code');
    }
  }

  async function verifierCode(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const sb = supabaseNavigateur();
    if (!codeValide) {
      const { error } = await sb.auth.verifyOtp({ email: adresse, token: code.trim(), type: 'email' });
      if (error) {
        setEnCours(false);
        return echec('Code incorrect ou expiré.');
      }
      setCodeValide(true);
    }
    const { error: errMdp } = await sb.auth.updateUser({ password: motDePasse });
    setEnCours(false);
    // Remettre le même mot de passe n'est pas une erreur.
    if (errMdp && errMdp.code !== 'same_password') {
      return setErreur(
        /fetch|network/i.test(errMdp.message)
          ? 'Adresse validée, mais la connexion a échoué. Réessayez.'
          : 'Adresse validée, mais ce mot de passe est refusé. Choisissez-en un plus long ou moins facile à deviner.',
      );
    }
    entrer();
  }

  const champMotDePasse = (nouveau: boolean) => (
    <>
      <label className="etiquette mt-5" htmlFor="mot-de-passe">
        {nouveau ? 'Choisissez votre mot de passe' : 'Mot de passe'}
        {nouveau && <span className="font-normal text-gris">{`  (${MDP_MIN} caractères minimum)`}</span>}
      </label>
      <input
        id="mot-de-passe"
        className="champ"
        type="password"
        autoComplete={nouveau ? 'new-password' : 'current-password'}
        minLength={nouveau ? MDP_MIN : undefined}
        required
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
      />
    </>
  );

  const champEmail = (
    <>
      <label className="etiquette mt-6" htmlFor="email">
        Adresse e-mail
      </label>
      <input
        id="email"
        className="champ"
        type="email"
        autoComplete="username"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@entreprise.fr"
      />
    </>
  );

  const message = (
    <>
      {info && <p className="mt-3 text-sm font-semibold text-encre">{info}</p>}
      {erreur && <p className="mt-3 text-sm font-semibold text-rouge">{erreur}</p>}
    </>
  );

  if (etape === 'code') {
    return (
      <form onSubmit={verifierCode} className="mt-10">
        {/* Pour que le gestionnaire de mots de passe enregistre le bon identifiant. */}
        <input type="email" name="username" autoComplete="username" value={adresse} readOnly hidden />
        <h1 className="text-4xl font-extrabold text-encre">Votre code</h1>
        <p className="mt-2 text-gris">
          Un code vient d’être envoyé à <b className="text-encre">{adresse}</b>.
        </p>
        <input
          className="champ mt-6 text-center text-3xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          autoFocus
          required
          readOnly={codeValide}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-label="Code reçu par e-mail"
        />
        {champMotDePasse(true)}
        {message}
        <Bouton
          className="mt-6 w-full py-3.5 text-base"
          disabled={enCours || resteBlocage > 0 || (!codeValide && code.length < 6) || motDePasse.length < MDP_MIN}
        >
          {resteBlocage > 0 ? `Réessayez dans ${resteBlocage} s` : enCours ? 'Vérification…' : creation ? 'Valider et créer mon compte' : 'Valider et se connecter'}
        </Bouton>
        <div className="mt-4 flex justify-between text-sm text-gris">
          <button type="button" className="underline" onClick={() => aller('email', creation)}>
            Changer d’adresse e-mail
          </button>
          {!codeValide && (
            <button type="button" className="underline" onClick={() => envoyerCode()} disabled={enCours}>
              Renvoyer le code
            </button>
          )}
        </div>
      </form>
    );
  }

  if (etape === 'email') {
    return (
      <form onSubmit={envoyerCode} className="mt-10">
        <h1 className="text-4xl font-extrabold text-encre">{creation ? 'Créer mon compte' : 'Mot de passe'}</h1>
        <p className="mt-2 text-gris">
          {creation
            ? 'Un code part par e-mail pour valider votre adresse (une seule fois). Vous choisissez ensuite votre mot de passe, puis vous inscrivez votre entreprise.'
            : 'Première connexion ou mot de passe oublié ? Recevez un code par e-mail pour valider votre adresse et choisir votre mot de passe.'}
        </p>
        {champEmail}
        {message}
        <Bouton className="mt-6 w-full py-3.5 text-base" disabled={enCours}>
          {enCours ? 'Envoi…' : 'Recevoir mon code'}
        </Bouton>
        <button type="button" className="mt-4 w-full text-sm text-gris underline" onClick={() => aller('connexion')}>
          J’ai déjà un mot de passe
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={seConnecter} className="mt-10">
      <h1 className="text-4xl font-extrabold text-encre">Connexion</h1>
      <p className="mt-2 text-gris">Entrez votre e-mail et votre mot de passe.</p>
      {champEmail}
      {champMotDePasse(false)}
      {message}
      <Bouton className="mt-6 w-full py-3.5 text-base" disabled={enCours || resteBlocage > 0}>
        {resteBlocage > 0 ? `Réessayez dans ${resteBlocage} s` : enCours ? 'Connexion…' : 'Se connecter'}
      </Bouton>
      <button type="button" className="mt-4 w-full text-sm text-gris underline" onClick={() => aller('email')}>
        Première connexion ou mot de passe oublié
      </button>
      <p className="mt-6 border-t border-trait pt-5 text-center text-sm text-gris">
        Pas encore de compte ?{' '}
        <button type="button" className="font-bold text-cobalt hover:underline" onClick={() => aller('email', true)}>
          Créer un compte
        </button>
      </p>
    </form>
  );
}
