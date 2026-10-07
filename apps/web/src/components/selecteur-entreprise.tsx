'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { libelleAcces, type RoleMembre } from '@chantio/shared';
import { deconnecter } from '@/app/actions-session';
import { choisirEntreprise } from '@/app/(bureau)/entreprises/actions';
import { Icone } from './icones';
import { Roue } from './retour';

type Choix = { id: string; nom: string; role: RoleMembre; active: boolean };

/** 'menu' : carte en haut du menu ; 'barre' : bouton compact de la barre du haut (téléphone) ; 'reduit' : carré seul (menu réduit). */
export type VarianteSelecteur = 'menu' | 'barre' | 'reduit';

// Couleur stable de chaque entreprise (carré avec l'initiale), dans la charte.
const COULEURS = ['#2F54EB', '#5925DC', '#12B76A', '#7C93F5', '#2442C4', '#101A3D'];
function couleurDe(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COULEURS[Math.abs(h) % COULEURS.length];
}

/** Carré de l'entreprise : son logo, ou son initiale sur sa couleur. */
function Carre({ id, nom, logo, taille }: { id: string; nom: string; logo?: string | null; taille: number }) {
  const style = { width: taille, height: taille, borderRadius: Math.round(taille * 0.26) };
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" style={style} className="shrink-0 border border-trait bg-white object-contain" />
  ) : (
    <span
      aria-hidden="true"
      style={{ ...style, background: couleurDe(id), fontSize: Math.round(taille * 0.45) }}
      className="grid shrink-0 place-items-center font-extrabold text-white"
    >
      {(nom || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

const LIGNE = 'flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition hover:bg-fond focus-visible:bg-fond';

/**
 * Sélecteur d'entreprise du bac à sable : carte (initiale ou logo, nom, e-mail du compte).
 * Un clic ouvre la liste : prénom nom et e-mail, entreprises du compte (rôle, coche), invitations en attente,
 * Ajouter une entreprise, Gérer vos entreprises, Se déconnecter. Clavier : flèches, Échap, Tab.
 */
export function SelecteurEntreprise({
  nom,
  logo,
  entreprises,
  email,
  prenomNom,
  invitations = 0,
  console: equipeChantio = false,
  variante = 'menu',
}: {
  nom: string;
  logo: string | null;
  entreprises: Choix[];
  email?: string | null;
  prenomNom?: string;
  invitations?: number;
  /** Membre de l'équipe Chantio : lien vers la console. */
  console?: boolean;
  variante?: VarianteSelecteur;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [bascule, setBascule] = useState<string | null>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const idActive = entreprises.find((e) => e.active)?.id ?? nom;

  // Après un changement d'entreprise, la liste se referme.
  const [nomVu, setNomVu] = useState(nom);
  if (nomVu !== nom) {
    setNomVu(nom);
    setOuvert(false);
    setBascule(null);
  }

  const fermer = (rendreFocus = false) => {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  };

  const basculer = () => {
    if (ouvert) return fermer();
    const r = bouton.current!.getBoundingClientRect();
    // La liste a au moins la largeur de la carte du menu (sur ordinateur).
    setPlace({ top: Math.round(r.bottom + 6), left: Math.round(r.left), minWidth: variante === 'menu' && window.innerWidth > 820 ? Math.round(r.width) : undefined });
    setOuvert(true);
  };

  // La liste reste dans l'écran ; le focus va sur l'entreprise ouverte.
  useLayoutEffect(() => {
    const l = liste.current;
    if (!ouvert || !l) return;
    const gauche = Math.min(Math.max(8, Number(place.left ?? 8)), window.innerWidth - l.offsetWidth - 8);
    l.style.left = `${Math.max(8, gauche)}px`;
    (l.querySelector<HTMLElement>('[aria-checked="true"]') ?? l.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  }, [ouvert, place]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (!liste.current?.contains(cible) && !bouton.current?.contains(cible)) setOuvert(false);
    };
    const taille = () => setOuvert(false);
    document.addEventListener('mousedown', dehors);
    window.addEventListener('resize', taille);
    return () => {
      document.removeEventListener('mousedown', dehors);
      window.removeEventListener('resize', taille);
    };
  }, [ouvert]);

  const clavier = (e: KeyboardEvent) => {
    const items = [...(liste.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      fermer(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pas = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + pas + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // Tab referme la liste et reprend la suite du menu après le bouton.
      fermer(true);
    }
  };

  const reduit = variante === 'reduit';
  const barre = variante === 'barre';

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={basculer}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title={`${nom} · changer d’entreprise`}
        className={
          reduit
            ? 'grid w-full place-items-center rounded-[12px] py-1 transition hover:bg-fond'
            : barre
              ? 'inline-flex max-w-full min-w-0 items-center gap-2 rounded-[12px] border border-trait bg-white py-1 pr-2 pl-1 text-left transition hover:bg-fond'
              : 'flex w-full min-w-0 items-center gap-2.5 rounded-[14px] border border-trait bg-white px-2.5 py-2 text-left transition hover:bg-fond'
        }
      >
        <Carre id={idActive} nom={nom} logo={logo} taille={barre ? 28 : 34} />
        {reduit ? (
          <span className="sr-only">{nom}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <b className={`truncate font-extrabold ${barre ? 'text-sm' : 'text-[15px]'}`}>{nom}</b>
            {!barre && email && <small className="truncate text-[11.5px] font-semibold text-gris">{email}</small>}
          </span>
        )}
        {!reduit && <Icone nom="haut_bas" taille={barre ? 15 : 18} className="shrink-0 text-gris" />}
      </button>

      {ouvert &&
        createPortal(
          <div
            ref={liste}
            role="menu"
            aria-label="Vos entreprises"
            onKeyDown={clavier}
            style={place}
            className="carte apparition fixed z-[60] w-max max-w-[calc(100vw-16px)] min-w-[270px] rounded-[16px] p-1.5 shadow-[0_18px_40px_-18px_rgb(16_26_61/0.45)]"
          >
            {(prenomNom || email) && (
              <div className="mb-1.5 flex min-w-0 flex-col border-b border-trait px-2.5 pt-2 pb-2.5">
                {prenomNom && <b className="truncate font-extrabold">{prenomNom}</b>}
                {email && <small className="truncate text-[13px] text-gris">{email}</small>}
              </div>
            )}
            {entreprises.map((e) => (
              <button
                key={e.id}
                type="button"
                role="menuitemradio"
                aria-checked={e.active}
                onClick={() => {
                  if (e.active) return fermer(true);
                  if (bascule) return;
                  setBascule(e.id);
                  void choisirEntreprise(e.id);
                }}
                className={`${LIGNE} ${e.active ? 'bg-doux hover:bg-doux' : ''}`}
              >
                <Carre id={e.id} nom={e.nom} logo={e.active ? logo : null} taille={30} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <b className="truncate font-bold">{e.nom}</b>
                  <small className="text-xs text-gris">{libelleAcces(e.role)}</small>
                </span>
                {bascule === e.id ? <Roue /> : e.active && <Icone nom="coche" taille={18} className="shrink-0 text-cobalt" />}
              </button>
            ))}
            {invitations > 0 && (
              <Link role="menuitem" href="/entreprises" onClick={() => fermer()} className={`${LIGNE} font-bold text-violet`}>
                <Icone nom="enveloppe" taille={18} className="shrink-0" />
                {invitations} invitation{invitations > 1 ? 's' : ''} en attente
              </Link>
            )}
            <hr className="my-1.5 border-trait" />
            <Link role="menuitem" href="/entreprises/nouvelle" onClick={() => fermer()} className={`${LIGNE} font-bold text-gris`}>
              <Icone nom="plus" taille={18} className="shrink-0" /> Ajouter une entreprise
            </Link>
            <Link role="menuitem" href="/entreprises" onClick={() => fermer()} className={`${LIGNE} font-bold text-gris`}>
              <Icone nom="curseurs" taille={18} className="shrink-0" /> Gérer vos entreprises
            </Link>
            {equipeChantio && (
              <Link role="menuitem" href="/console" onClick={() => fermer()} className={`${LIGNE} font-bold text-cobalt`}>
                <Icone nom="bouclier" taille={18} className="shrink-0" /> Console Chantio
              </Link>
            )}
            <hr className="my-1.5 border-trait" />
            <form action={deconnecter}>
              <button role="menuitem" className={`${LIGNE} font-bold text-gris`}>
                <Icone nom="sortie" taille={18} className="shrink-0" /> Se déconnecter
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
