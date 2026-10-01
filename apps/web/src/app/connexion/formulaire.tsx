'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bouton } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';

// Connexion sans mot de passe : un code arrive par e-mail (6 à 8 chiffres
// selon le réglage « Email OTP Length » de Supabase).
function messageEnvoi(m: string): string {
  if (/rate|too many|security purposes/i.test(m)) return 'Trop de demandes. Attendez une minute avant de redemander un code.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide.';
  return "Impossible d'envoyer le code pour le moment. Réessayez dans un instant.";
}

export default function FormulaireConnexion() {
  const router = useRouter();
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function envoyerCode(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setEnCours(false);
    if (error) return setErreur(messageEnvoi(error.message));
    setEtape('code');
  }

  async function verifierCode(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setEnCours(false);
    if (error) return setErreur('Code incorrect ou expiré.');
    router.replace('/');
    router.refresh();
  }

  if (etape === 'code') {
    return (
      <form onSubmit={verifierCode} className="mt-10">
        <h1 className="text-4xl font-extrabold text-encre">Votre code</h1>
        <p className="mt-2 text-gris">
          Un code vient d’être envoyé à <b className="text-encre">{email}</b>.
        </p>
        <input
          className="champ mt-6 text-center text-3xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-label="Code reçu par e-mail"
        />
        {erreur && <p className="mt-3 text-sm font-semibold text-rouge">{erreur}</p>}
        <Bouton className="mt-6 w-full py-3.5 text-base" disabled={enCours || code.length < 6}>
          {enCours ? 'Vérification…' : 'Se connecter'}
        </Bouton>
        <button type="button" className="mt-4 w-full text-sm text-gris underline" onClick={() => setEtape('email')}>
          Changer d’adresse e-mail
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={envoyerCode} className="mt-10">
      <h1 className="text-4xl font-extrabold text-encre">Connexion</h1>
      <p className="mt-2 text-gris">Pas de mot de passe : on vous envoie un code par e-mail.</p>
      <label className="etiquette mt-6" htmlFor="email">
        Adresse e-mail
      </label>
      <input
        id="email"
        className="champ"
        type="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@entreprise.fr"
      />
      {erreur && <p className="mt-3 text-sm font-semibold text-rouge">{erreur}</p>}
      <Bouton className="mt-6 w-full py-3.5 text-base" disabled={enCours}>
        {enCours ? 'Envoi…' : 'Recevoir mon code'}
      </Bouton>
    </form>
  );
}
