'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import s from './annee.module.css';

// Petits outils partagés par Mon année et Paramètres › Pilotage.

/** Classes du module CSS à partir de noms séparés par des espaces (« hero simple »). */
export const c = (...noms: (string | false | null | undefined)[]) =>
  noms
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => s[n] ?? n)
    .join(' ');

const ESP = ' ';
export const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ESP)}${ESP}€`;
export const keur = (n: number) => {
  const v = n / 1000;
  return `${(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('fr-FR')}${ESP}k€`;
};
export const signe = (n: number) => `${n >= 0 ? '+' : '−'}${eur(Math.abs(n))}`;
export const pc = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}${ESP}%`;
export const fr = (n: number) => String(n).replace('.', ',');
/** Évolution en % face à une valeur de référence ; 0 quand la référence est nulle. */
export const evolution = (v: number, ref: number) => (ref ? (v / ref - 1) * 100 : 0);
/** Part en % ; 0 quand le total est nul. */
export const part = (v: number, total: number) => (total ? (v / total) * 100 : 0);

/** « ? » qui explique un chiffre, au survol ou au clavier. */
export function Info({ children }: { children: string }) {
  return (
    <span className={c('info')} tabIndex={0} aria-label={children}>
      ?
      <span className={c('info-b')} aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

const calme = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Chiffre qui défile de 0 à sa valeur quand il apparaît (pas quand il change ensuite : un curseur
 * qu'on bouge met le chiffre à jour aussitôt).
 */
export function Compte({ valeur, format = eur }: { valeur: number; format?: (n: number) => string }) {
  const [affiche, setAffiche] = useState<number | null>(null);
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current || calme()) return;
    fait.current = true;
    const debut = performance.now();
    let image = 0;
    const pas = (t: number) => {
      const k = Math.min(1, (t - debut) / 1300);
      setAffiche(k < 1 ? valeur * (1 - Math.pow(1 - k, 3)) : null);
      if (k < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
    // Seulement à l'apparition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{format(affiche ?? valeur)}</>;
}

/** Largeur d'un bloc, suivie quand la fenêtre change (les graphiques se dessinent à la bonne taille). */
export function useLargeur<T extends HTMLElement>(defaut = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [l, setL] = useState(defaut);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => setL(Math.max(300, Math.round(el.clientWidth)));
    mesurer();
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return [ref, l];
}

/** Pastille de source : automatique, importé, saisi, prévu. */
export function Source({ type, children }: { type: 'auto' | 'import' | 'saisi' | 'prev'; children: ReactNode }) {
  return <span className={c('source', `s-${type}`)}>{children}</span>;
}

/** Champ de montant ou de pourcentage enregistré quand on le quitte (Entrée aussi). */
export function ChampNombre({
  valeur,
  unite,
  decimales = 0,
  libelle,
  vide = false,
  enregistrer,
  className,
}: {
  valeur: number | null;
  unite: string;
  decimales?: number;
  libelle: string;
  /** Le champ peut rester vide (valeur null). */
  vide?: boolean;
  enregistrer: (v: number | null) => Promise<string | null> | void;
  className?: string;
}) {
  const ecrire = (v: number | null) => (v == null ? '' : v.toLocaleString('fr-FR', { maximumFractionDigits: decimales }));
  const [texte, setTexte] = useState(ecrire(valeur));
  const [erreur, setErreur] = useState<string | null>(null);
  const [vu, setVu] = useState(valeur);
  if (vu !== valeur) {
    setVu(valeur);
    setTexte(ecrire(valeur));
  }
  const valider = async () => {
    const t = texte.replace(/[\s  €%]/g, '').replace(',', '.');
    const v = t === '' ? null : Number(t);
    if (v == null && !vide) return setTexte(ecrire(valeur));
    if (v != null && !Number.isFinite(v)) return setErreur('Tapez un nombre.');
    if (v === valeur) return setTexte(ecrire(valeur));
    setErreur(null);
    setTexte(ecrire(v));
    const e = await enregistrer(v);
    if (e) {
      setErreur(e);
      setTexte(ecrire(valeur));
    }
  };
  return (
    <span className={className}>
      <span className={c('champ-eur')}>
        <input
          aria-label={libelle}
          inputMode="decimal"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-invalid={!!erreur}
        />
        {unite && <span>{unite}</span>}
      </span>
      {erreur && <span className={c('erreur')}>{erreur}</span>}
    </span>
  );
}
