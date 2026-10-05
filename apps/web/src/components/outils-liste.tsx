'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Icone } from './icones';

// Outils au-dessus des listes du bureau (« Mes devis », « Mes clients », « Dépenses fournisseurs »…) :
// recherche, menus déroulants et puces de filtre.
// Chaque outil marche de deux façons :
// - « mode adresse » (prop `param`) : le filtre vit dans l'adresse (?filtre=, ?type=, ?q=…) ; utilisable
//   tel quel depuis une page serveur, qui relit searchParams. Un changement retire aussi ?page=.
// - « mode client » (props `onChange` / `onChoisir`) : la liste est filtrée dans le navigateur, sans recharger.

/** Un choix de filtre : [valeur, libellé] comme options() du bac, ou un objet (avec un nombre, un lien). */
export type Choix = readonly [valeur: string, libelle: string] | { valeur: string; libelle: ReactNode; nombre?: number; href?: string };

type ChoixLu = { valeur: string; libelle: ReactNode; nombre?: number; href?: string };
const lire = (c: Choix): ChoixLu => (Array.isArray(c) ? { valeur: c[0], libelle: c[1] } : (c as ChoixLu));

/**
 * Adresse de la page courante avec des paramètres changés (null, undefined ou '' = retiré).
 * Les paramètres de `reinitialiser` (par défaut la pagination) sont retirés à chaque changement.
 */
export function useAdresseFiltre() {
  const chemin = usePathname();
  const params = useSearchParams();
  return (changements: Record<string, string | null | undefined>, reinitialiser: readonly string[] = ['page']) => {
    const p = new URLSearchParams(params.toString());
    for (const cle of reinitialiser) p.delete(cle);
    for (const [cle, v] of Object.entries(changements)) {
      if (v) p.set(cle, v);
      else p.delete(cle);
    }
    const s = p.toString();
    return s ? `${chemin}?${s}` : chemin;
  };
}

/** Rangée des outils d'une liste (recherche, menus) : passe à la ligne sur petit écran. */
export function BarreOutils({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

/**
 * Champ de recherche.
 * - Mode client : `valeur` + `onChange` (filtre instantané).
 * - Mode adresse : `param` (souvent 'q') + `valeur` lue dans searchParams ; l'adresse suit la frappe.
 * `loupe` (par défaut) : grande case avec loupe des tableaux (Mes devis) ; sinon case simple (Mes clients).
 */
export function ChampRecherche({
  etiquette,
  placeholder,
  valeur = '',
  onChange,
  param,
  loupe = true,
  autoFocus,
  className = '',
}: {
  /** Nom lu par les lecteurs d'écran (« Rechercher un devis »). */
  etiquette: string;
  placeholder?: string;
  valeur?: string;
  onChange?: (v: string) => void;
  param?: string;
  loupe?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const adresse = useAdresseFiltre();
  const [, demarrer] = useTransition();
  const [texte, setTexte] = useState(valeur);
  const [vu, setVu] = useState(valeur);
  // Dernière recherche mise dans l'adresse : quand la page revient avec, on ne touche pas à la frappe en cours.
  const [envoye, setEnvoye] = useState<string | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  // La valeur reçue change d'ailleurs (navigation, bouton « effacer » de la page) : la case la reprend.
  if (valeur !== vu) {
    setVu(valeur);
    if (valeur !== envoye) setTexte(valeur);
  }
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const envoyer = (v: string) => {
    clearTimeout(minuterie.current);
    if (!param) return;
    setEnvoye(v.trim());
    demarrer(() => router.replace(adresse({ [param]: v.trim() }), { scroll: false }));
  };
  const changer = (v: string) => {
    setTexte(v);
    onChange?.(v);
    if (param) {
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => envoyer(v), 300);
    }
  };

  const champ = (
    <input
      type="search"
      value={texte}
      onChange={(e) => changer(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && envoyer(texte)}
      placeholder={placeholder}
      aria-label={etiquette}
      autoFocus={autoFocus}
      enterKeyHint="search"
      className={
        loupe
          ? 'champ min-h-11 py-2.5 pr-3 pl-10 text-[15px]'
          : `champ min-w-0 flex-[1_1_220px] py-2 text-[15px] ${className}`
      }
    />
  );
  if (!loupe) return champ;
  return (
    <span className={`relative flex min-w-0 flex-[1_1_280px] ${className}`}>
      <Icone nom="recherche" taille={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gris" />
      {champ}
    </span>
  );
}

/**
 * Menu déroulant de filtre (« Tous les types », « Toutes les dates »…).
 * - Mode client : `valeur` + `onChange`.
 * - Mode adresse : `param` ; la valeur `parDefaut` (1er choix si absent) retire le paramètre.
 */
export function MenuFiltre({
  etiquette,
  choix,
  valeur,
  onChange,
  param,
  parDefaut,
  className = '',
}: {
  /** Nom lu par les lecteurs d'écran (« Date d’émission »). */
  etiquette: string;
  choix: readonly Choix[];
  valeur: string;
  onChange?: (v: string) => void;
  param?: string;
  parDefaut?: string;
  className?: string;
}) {
  const router = useRouter();
  const adresse = useAdresseFiltre();
  const [, demarrer] = useTransition();
  const liste = choix.map(lire);
  const defaut = parDefaut ?? liste[0]?.valeur;
  // Affiche tout de suite le choix, sans attendre la page suivante.
  const [choisi, setChoisi] = useState(valeur);
  const [vu, setVu] = useState(valeur);
  if (valeur !== vu) {
    setVu(valeur);
    setChoisi(valeur);
  }
  return (
    <select
      value={choisi}
      aria-label={etiquette}
      onChange={(e) => {
        const v = e.target.value;
        setChoisi(v);
        onChange?.(v);
        if (param) demarrer(() => router.push(adresse({ [param]: v === defaut ? null : v }), { scroll: false }));
      }}
      className={`champ min-h-11 w-auto min-w-0 py-2 pr-9 pl-3.5 text-[15px] font-bold max-[700px]:flex-[1_1_140px] ${className}`}
    >
      {liste.map((c) => (
        <option key={c.valeur} value={c.valeur}>
          {c.libelle}
        </option>
      ))}
    </select>
  );
}

const PUCE = 'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-bold whitespace-nowrap transition max-sm:py-2';
const PUCE_ACTIVE = 'border-cobalt bg-cobalt text-white';
const PUCE_REPOS = 'border-trait bg-white text-gris hover:border-cobalt hover:text-encre';

/**
 * Puces de filtre (« Tous · Syndics · Bailleurs… », « Tout · Ouvrages · Fournitures… »).
 * - Mode adresse : `param` → chaque puce est un lien (aria-current) ; `parDefaut` (1re puce si absent) retire le paramètre.
 * - Lien explicite : `href` sur un choix.
 * - Mode client : `onChoisir` → chaque puce est un bouton (aria-pressed).
 */
export function PucesFiltre({
  etiquette,
  choix,
  actif,
  param,
  parDefaut,
  onChoisir,
  className = '',
}: {
  /** Nom du groupe pour les lecteurs d'écran (« Type de client »). */
  etiquette: string;
  choix: readonly Choix[];
  actif: string;
  param?: string;
  parDefaut?: string;
  onChoisir?: (v: string) => void;
  className?: string;
}) {
  const adresse = useAdresseFiltre();
  const liste = choix.map(lire);
  const defaut = parDefaut ?? liste[0]?.valeur;
  return (
    <div role="group" aria-label={etiquette} className={`flex flex-wrap gap-1.5 ${className}`}>
      {liste.map((c) => {
        const on = c.valeur === actif;
        const contenu = (
          <>
            {c.libelle}
            {c.nombre != null && <span className="ml-0.5 font-extrabold tabular-nums opacity-75">{c.nombre}</span>}
          </>
        );
        const classe = `${PUCE} ${on ? PUCE_ACTIVE : PUCE_REPOS}`;
        const href = c.href ?? (param ? adresse({ [param]: c.valeur === defaut ? null : c.valeur }) : null);
        if (href && !onChoisir)
          return (
            <Link key={c.valeur} href={href} scroll={false} aria-current={on ? 'true' : undefined} className={classe}>
              {contenu}
            </Link>
          );
        return (
          <button key={c.valeur} type="button" aria-pressed={on} onClick={() => onChoisir?.(c.valeur)} className={classe}>
            {contenu}
          </button>
        );
      })}
    </div>
  );
}
