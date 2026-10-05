'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { annoncer } from '@/components/retour';
import { enregistrerReglage, type Enregistrement } from './actions';
import { Aide } from './elements';

// Enregistrement automatique, comme le bac : chaque champ est enregistré dès qu'on le quitte
// (liste, case, bouton radio : dès le clic), avec la bulle « Enregistré ». Pas de bouton « Enregistrer ».

type Envoi = (cle: string, valeur: string | boolean) => Promise<Enregistrement>;

// Les envois partent un par un : la colonne de réglages est relue puis réécrite à chaque fois,
// deux envois simultanés pourraient sinon perdre une valeur.
let file: Promise<unknown> = Promise.resolve();
function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const suite = file.then(travail, travail);
  file = suite.catch(() => undefined);
  return suite;
}

/** Envoie une valeur et annonce le résultat ; renvoie la réponse (ou une erreur réseau). */
export async function envoyer(envoi: Envoi, cle: string, valeur: string | boolean): Promise<Enregistrement> {
  let r: Enregistrement;
  try {
    r = await enFile(() => envoi(cle, valeur));
  } catch {
    r = { ok: false, erreur: 'Le changement n’a pas pu être enregistré. Vérifiez la connexion.' };
  }
  if (r.ok) annoncer(r.message ?? 'Enregistré');
  else annoncer(r.erreur, 'erreur');
  return r;
}

const CLASSE_LIBELLE = 'etiquette';

/**
 * Champ texte (ou zone de texte) enregistré à la sortie du champ, seulement s'il a changé.
 * Entrée valide le champ. En cas d'erreur, la valeur d'avant revient.
 */
export function ChampAuto({
  cle,
  libelle,
  valeur,
  aide,
  type = 'text',
  placeholder,
  large = false,
  unite,
  lignes,
  desactive = false,
  lectureSeule = false,
  inputMode,
  autoComplete,
  envoi = enregistrerReglage,
  onEnregistre,
  className = '',
}: {
  cle: string;
  libelle: ReactNode;
  valeur: string;
  aide?: ReactNode;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  large?: boolean;
  /** Unité affichée à droite d'un champ court (« € », « % », « mois »). */
  unite?: string;
  /** Zone de texte de N lignes. */
  lignes?: number;
  desactive?: boolean;
  lectureSeule?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel';
  autoComplete?: string;
  envoi?: Envoi;
  onEnregistre?: (affiche: string) => void;
  className?: string;
}) {
  const id = useId();
  const dernier = useRef(valeur);
  const [enCours, setEnCours] = useState(false);

  async function quitter(el: HTMLInputElement | HTMLTextAreaElement) {
    const v = el.value;
    if (lectureSeule || v === dernier.current) return;
    setEnCours(true);
    const r = await envoyer(envoi, cle, v);
    setEnCours(false);
    if (r.ok) {
      if (r.affiche !== undefined) el.value = r.affiche;
      dernier.current = el.value;
      onEnregistre?.(el.value);
    } else {
      el.value = dernier.current;
    }
  }

  const commun = {
    id,
    name: cle,
    defaultValue: valeur,
    placeholder,
    disabled: desactive,
    readOnly: lectureSeule,
    'aria-describedby': aide ? `${id}-aide` : undefined,
    'aria-busy': enCours || undefined,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => quitter(e.currentTarget),
  };
  const fond = `py-2.5 text-[15px] ${lectureSeule || desactive ? '!bg-gris-doux text-gris' : ''}`;

  return (
    <div className={`min-w-0 ${large ? 'col-span-full' : ''} ${className}`}>
      <label htmlFor={id} className={CLASSE_LIBELLE}>
        {libelle}
      </label>
      {lignes ? (
        <textarea {...commun} rows={lignes} className={`champ ${fond}`} />
      ) : unite ? (
        <span className="flex items-center gap-2">
          <input
            {...commun}
            type="text"
            inputMode={inputMode ?? 'decimal'}
            className={`champ !w-[110px] tabular-nums ${fond}`}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="text-sm font-semibold text-gris">{unite}</span>
        </span>
      ) : (
        <input
          {...commun}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          className={`champ ${fond}`}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}
      {aide && <Aide id={`${id}-aide`}>{aide}</Aide>}
    </div>
  );
}

/** Liste de choix enregistrée dès qu'on choisit. */
export function ListeAuto({
  cle,
  libelle,
  valeur,
  options,
  aide,
  large = false,
  desactive = false,
  envoi = enregistrerReglage,
}: {
  cle: string;
  libelle: ReactNode;
  valeur: string;
  options: readonly (readonly [string, string])[];
  aide?: ReactNode;
  large?: boolean;
  desactive?: boolean;
  envoi?: Envoi;
}) {
  const id = useId();
  const dernier = useRef(valeur);
  return (
    <div className={`min-w-0 ${large ? 'col-span-full' : ''}`}>
      <label htmlFor={id} className={CLASSE_LIBELLE}>
        {libelle}
      </label>
      <select
        id={id}
        name={cle}
        defaultValue={valeur}
        disabled={desactive}
        aria-describedby={aide ? `${id}-aide` : undefined}
        className="champ py-2.5 text-[15px] disabled:bg-gris-doux disabled:text-gris"
        onChange={async (e) => {
          const el = e.currentTarget;
          const r = await envoyer(envoi, cle, el.value);
          if (r.ok) dernier.current = el.value;
          else el.value = dernier.current;
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {aide && <Aide id={`${id}-aide`}>{aide}</Aide>}
    </div>
  );
}

/** Case à cocher enregistrée dès le clic. */
export function CaseAuto({
  cle,
  libelle,
  aide,
  coche,
  desactive = false,
  large = false,
  envoi = enregistrerReglage,
  onEnregistre,
}: {
  cle: string;
  libelle: ReactNode;
  aide?: ReactNode;
  coche: boolean;
  desactive?: boolean;
  large?: boolean;
  envoi?: Envoi;
  onEnregistre?: (coche: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-[14px] font-bold ${large ? 'col-span-full' : ''} ${desactive ? 'cursor-default opacity-70' : ''}`}>
      <input
        type="checkbox"
        name={cle}
        defaultChecked={coche}
        disabled={desactive}
        className="mt-0.5 h-4 w-4 shrink-0 accent-cobalt"
        onChange={async (e) => {
          const el = e.currentTarget;
          const voulu = el.checked;
          const r = await envoyer(envoi, cle, voulu);
          if (r.ok) onEnregistre?.(voulu);
          else el.checked = !voulu;
        }}
      />
      <span>
        {libelle}
        {aide && <span className="mt-0.5 block text-xs font-medium text-gris">{aide}</span>}
      </span>
    </label>
  );
}
