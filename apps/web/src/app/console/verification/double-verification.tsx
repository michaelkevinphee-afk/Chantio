'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';

// Première fois : on inscrit l'application d'authentification (QR code à scanner).
// Ensuite : on demande simplement le code à 6 chiffres qu'elle affiche.

type Etat =
  | { etape: 'chargement' }
  | { etape: 'code'; facteur: string }
  | { etape: 'inscription'; facteur: string; qr: string; secret: string }
  | { etape: 'impossible'; message: string };

export function DoubleVerification({ prenom, email }: { prenom: string; email: string }) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ etape: 'chargement' });
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const lance = useRef(false);

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    (async () => {
      const auth = supabaseNavigateur().auth;
      const { data, error } = await auth.mfa.listFactors();
      if (error) return setEtat({ etape: 'impossible', message: 'La vérification ne se charge pas. Rechargez la page.' });
      const pret = data.totp[0];
      if (pret) return setEtat({ etape: 'code', facteur: pret.id });
      // Une inscription commencée puis abandonnée bloquerait la nouvelle : on la retire.
      for (const f of data.all.filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) await auth.mfa.unenroll({ factorId: f.id });
      const { data: e, error: err } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Console Chantio', issuer: 'Chantio' });
      if (err || !e) {
        return setEtat({
          etape: 'impossible',
          message:
            'La double vérification n’est pas encore activée dans Supabase. Dans le tableau de bord Supabase : Authentication › Multi-Factor, activez « TOTP (App Authenticator) », puis rechargez cette page.',
        });
      }
      setEtat({ etape: 'inscription', facteur: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
    })();
  }, []);

  async function verifier(ev: React.FormEvent) {
    ev.preventDefault();
    if (etat.etape !== 'code' && etat.etape !== 'inscription') return;
    setErreur('');
    setEnCours(true);
    const { error } = await supabaseNavigateur().auth.mfa.challengeAndVerify({ factorId: etat.facteur, code: code.replace(/\s/g, '') });
    if (error) {
      setEnCours(false);
      setCode('');
      return setErreur('Code refusé. Prenez le code affiché en ce moment (il change toutes les 30 secondes) et vérifiez que l’heure du téléphone est juste.');
    }
    router.replace('/console');
    router.refresh();
  }

  if (etat.etape === 'chargement')
    return (
      <p className="flex items-center gap-2 text-gris">
        <Roue /> Préparation…
      </p>
    );
  if (etat.etape === 'impossible') return <p className="rounded-[14px] bg-rouge-doux px-4 py-3 font-semibold text-rouge">{etat.message}</p>;

  return (
    <form onSubmit={verifier} className="grid gap-4">
      <div>
        <h1 className="text-[24px] leading-tight font-extrabold">Bonjour {prenom}</h1>
        <p className="mt-1 text-[15px] text-gris">
          {etat.etape === 'inscription'
            ? 'La console protège les comptes de tous vos clients : elle demande, en plus du mot de passe, un code de votre téléphone. À faire une seule fois :'
            : 'Saisissez le code à 6 chiffres affiché par votre application d’authentification (« Chantio »).'}
        </p>
      </div>
      {etat.etape === 'inscription' && (
        <ol className="grid gap-3 text-[14.5px]">
          <li>
            <b>1.</b> Installez <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> sur votre téléphone.
          </li>
          <li>
            <b>2.</b> Dans l’application, touchez « + » puis scannez ce code :
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={etat.qr} alt="QR code à scanner avec l’application d’authentification" width={180} height={180} className="mx-auto mt-3 rounded-[12px] border border-trait bg-white p-2" />
            <details className="mt-2 text-[13px] text-gris">
              <summary className="cursor-pointer font-bold">Impossible de scanner ?</summary>
              Choisissez « Saisir une clé » et tapez : <code className="font-bold break-all text-encre select-all">{etat.secret}</code>
            </details>
          </li>
          <li>
            <b>3.</b> Saisissez le code à 6 chiffres qu’elle affiche :
          </li>
        </ol>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        aria-label="Code à 6 chiffres"
        placeholder="123 456"
        className="champ text-center text-[22px] font-extrabold tracking-[0.3em] tabular-nums"
      />
      {erreur && (
        <p role="alert" className="rounded-[14px] bg-rouge-doux px-4 py-3 text-[14.5px] font-semibold text-rouge">
          {erreur}
        </p>
      )}
      <Bouton disabled={enCours || code.replace(/\s/g, '').length !== 6}>
        {enCours && <Roue />}
        {enCours ? 'Vérification…' : 'Ouvrir la console'}
      </Bouton>
      <p className="text-[13px] text-gris">
        Connecté avec {email}. Téléphone perdu ? La double vérification se remet à zéro dans Supabase (Authentication › Users › votre compte › supprimer le facteur).
      </p>
    </form>
  );
}
