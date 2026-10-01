'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Bouton } from './ui';

// Retours visuels immédiats : bouton qui tourne pendant l'envoi, et bulle « Enregistré » en bas d'écran.

const EVENEMENT = 'chantio:annonce';

/** Affiche une bulle de confirmation (« Enregistré », « Fiche validée »…) en bas de l'écran. */
export function annoncer(message: string, ton: 'ok' | 'erreur' = 'ok') {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { message, ton } }));
}

export function Roue({ taille = 16 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Coche qui se dessine (confirmation). */
export function Coche({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" className="coche">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Bouton d'un formulaire relié à une action serveur : il réagit dès le clic
 * (roue + bouton grisé) au lieu d'attendre la réponse sans rien montrer.
 */
export function BoutonEnvoi({
  children,
  enCours,
  ...props
}: ComponentProps<typeof Bouton> & { enCours?: string }) {
  const { pending } = useFormStatus();
  return (
    <Bouton {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending && <Roue />}
      {pending && enCours ? enCours : children}
    </Bouton>
  );
}

/** Lien-bouton discret d'un formulaire (« Désactiver », « Renvoyer l'e-mail »), avec roue pendant l'envoi. */
export function LienEnvoi({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className={`inline-flex items-center gap-1.5 disabled:opacity-60 ${className}`}>
      {pending && <Roue taille={14} />}
      {children}
    </button>
  );
}

/** Zone des bulles de confirmation, posée une fois dans la mise en page. */
export function ZoneAnnonces() {
  const [annonces, setAnnonces] = useState<{ id: number; message: string; ton: 'ok' | 'erreur' }[]>([]);
  useEffect(() => {
    let n = 0;
    const recevoir = (e: Event) => {
      const { message, ton } = (e as CustomEvent<{ message: string; ton: 'ok' | 'erreur' }>).detail;
      const id = ++n;
      setAnnonces((a) => [...a.slice(-2), { id, message, ton }]);
      setTimeout(() => setAnnonces((a) => a.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener(EVENEMENT, recevoir);
    return () => window.removeEventListener(EVENEMENT, recevoir);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[1000] flex flex-col items-center gap-2 px-4">
      {annonces.map((a) => (
        <p
          key={a.id}
          className={`annonce flex items-center gap-2.5 rounded-full bg-white py-2.5 pr-5 pl-3 text-[15px] font-bold shadow-[0_18px_40px_-14px_rgb(16_26_61/0.35)] ring-1 ${
            a.ton === 'ok' ? 'text-vert ring-[#ABEFC6]' : 'text-rouge ring-[#FECDCA]'
          }`}
        >
          {a.ton === 'ok' ? <Coche taille={22} /> : <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-rouge text-sm text-white">!</span>}
          <span className="text-encre">{a.message}</span>
        </p>
      ))}
    </div>
  );
}
