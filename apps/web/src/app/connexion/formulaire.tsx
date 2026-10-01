'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bouton } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';

// Connexion habituelle : e-mail + mot de passe.
// Première connexion ou mot de passe oublié : un code arrive par e-mail (6 à 8 chiffres
// selon le réglage « Email OTP Length » de Supabase). Il valide l'adresse, et la personne
// choisit son mot de passe en même temps.

/** Longueur minimale du mot de passe (Supabase en exige 6 par défaut). */
const MDP_MIN = 8;

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

  const adresse = email.trim().toLowerCase();

  function aller(e: Etape) {
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
    router.replace('/');
    router.refresh();
  }

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.signInWithPassword({ email: adresse, password: motDePasse });
    setEnCours(false);
    if (error) {
      return setErreur(
        /invalid login credentials/i.test(error.message)
          ? 'E-mail ou mot de passe incorrect. Pas encore de mot de passe ? Utilisez « Première connexion ou mot de passe oublié ».'
          : 'Connexion impossible pour le moment. Réessayez dans un instant.',
      );
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
        return setErreur('Code incorrect ou expiré.');
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
          disabled={enCours || (!codeValide && code.length < 6) || motDePasse.length < MDP_MIN}
        >
          {enCours ? 'Vérification…' : 'Valider et se connecter'}
        </Bouton>
        <div className="mt-4 flex justify-between text-sm text-gris">
          <button type="button" className="underline" onClick={() => aller('email')}>
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
        <h1 className="text-4xl font-extrabold text-encre">Mot de passe</h1>
        <p className="mt-2 text-gris">
          Première connexion ou mot de passe oublié ? Recevez un code par e-mail pour valider votre adresse et choisir
          votre mot de passe.
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
      <Bouton className="mt-6 w-full py-3.5 text-base" disabled={enCours}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </Bouton>
      <button type="button" className="mt-4 w-full text-sm text-gris underline" onClick={() => aller('email')}>
        Première connexion ou mot de passe oublié
      </button>
    </form>
  );
}
