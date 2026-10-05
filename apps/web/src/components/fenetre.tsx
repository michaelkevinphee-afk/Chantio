'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icone } from './icones';
import { Bouton } from './ui';

// Fenêtre centrée par-dessus la page, comme ouvrirFenetre() du bac : voile, titre, contenu, boutons en bas.
// Elle s'appuie sur <dialog> : le reste de la page devient inactif, Tab reste dans la fenêtre,
// Échap ou un clic sur le voile la ferment, et le focus revient où il était à la fermeture.

/**
 * Fenêtre centrée. On l'affiche seulement quand elle est ouverte (rendu conditionnel).
 * - `fermer` : adresse de la page sans la fenêtre (utilisable depuis une page serveur, ex. ?nouvelle=1)
 *   ou fonction (composant client).
 * - Tout élément marqué `data-fermer` à l'intérieur la ferme aussi (bouton « Annuler »).
 * - À l'ouverture, le focus va sur le champ `autoFocus`, sinon le premier champ, sinon la fenêtre.
 * - `large` : 820 px au lieu de 620 px ; `pied` : boutons alignés à droite.
 */
export function Fenetre({
  titre,
  texte,
  fermer,
  pied,
  large = false,
  sansCroix = false,
  children,
}: {
  titre: ReactNode;
  /** Phrase grise sous le titre. */
  texte?: ReactNode;
  fermer: string | (() => void);
  pied?: ReactNode;
  large?: boolean;
  sansCroix?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const id = useId();
  const boite = useRef<HTMLDialogElement>(null);
  const contenu = useRef<HTMLDivElement>(null);
  const appuiSurVoile = useRef(false);
  const fermeture = useRef(false);
  // L'élément qui avait le focus avant l'ouverture (lu au premier rendu, avant tout autoFocus).
  const [ouvreur] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));

  const refermer = () => {
    if (fermeture.current) return;
    fermeture.current = true;
    if (typeof fermer === 'string') router.push(fermer, { scroll: false });
    else fermer();
    // Si la fenêtre reste affichée (fermeture refusée par la page), elle doit pouvoir se refermer plus tard.
    setTimeout(() => (fermeture.current = false), 400);
  };

  useEffect(() => {
    const d = boite.current;
    if (!d) return;
    // Rendue ouverte (pour l'affichage serveur et autoFocus), elle passe en fenêtre modale.
    const dedans = d.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    if (!d.matches(':modal')) {
      if (d.open) d.close();
      d.showModal();
    }
    const champ =
      dedans ??
      d.querySelector<HTMLElement>(
        '[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
    (champ ?? contenu.current)?.focus();
    // Échap ne ferme que la fenêtre, pas le volet ou la page qui écoutent le clavier en dessous.
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && e.stopPropagation();
    d.addEventListener('keydown', echap);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      d.removeEventListener('keydown', echap);
      document.body.style.overflow = debordement;
      if (ouvreur instanceof HTMLElement && ouvreur.isConnected) ouvreur.focus();
    };
  }, [ouvreur]);

  return (
    <dialog
      ref={boite}
      open
      aria-labelledby={`${id}-titre`}
      // Échap : on garde la main pour remettre l'adresse à jour.
      onCancel={(e) => {
        e.preventDefault();
        refermer();
      }}
      // Fermée par le navigateur malgré tout : on suit (sauf pendant le passage en modale, où elle est déjà rouverte).
      onClose={() => !boite.current?.open && refermer()}
      onMouseDown={(e) => (appuiSurVoile.current = e.target === e.currentTarget)}
      onClick={(e) => {
        const cible = e.target as HTMLElement;
        if ((appuiSurVoile.current && cible === e.currentTarget) || cible.closest('[data-fermer]')) refermer();
      }}
      className={`fenetre-entree fixed inset-0 z-[60] m-auto h-fit max-h-[92dvh] overflow-hidden rounded-[20px] border-0 bg-white p-0 text-encre shadow-[0_30px_60px_-20px_rgb(16_26_61/0.45)] backdrop:bg-encre/40 backdrop:backdrop-blur-[2px] ${
        large ? 'w-[min(820px,calc(100%-32px))]' : 'w-[min(620px,calc(100%-32px))]'
      }`}
    >
      <div ref={contenu} tabIndex={-1} className="flex max-h-[92dvh] flex-col gap-4 overflow-y-auto p-5 outline-none sm:p-6">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-titre`} className="text-xl leading-tight font-extrabold">
              {titre}
            </h2>
            {texte && <p className="mt-1 text-[15px] text-gris">{texte}</p>}
          </div>
          {!sansCroix && (
            <button
              type="button"
              data-fermer
              aria-label="Fermer"
              className="-mt-1 -mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-gris transition hover:bg-doux hover:text-encre"
            >
              <Icone nom="fermer" taille={18} />
            </button>
          )}
        </header>
        {children}
        {pied && <div className="flex flex-wrap justify-end gap-2 pt-1">{pied}</div>}
      </div>
    </dialog>
  );
}

/**
 * Confirmation avant une action (« Supprimer cette facture ? »), comme confirmer() du bac.
 * `danger` met le bouton en rouge ; `enCours` le grise pendant l'envoi.
 */
export function FenetreConfirmation({
  titre,
  texte,
  bouton,
  onConfirmer,
  fermer,
  danger = false,
  enCours = false,
}: {
  titre: ReactNode;
  texte?: ReactNode;
  bouton: ReactNode;
  onConfirmer: () => void;
  fermer: string | (() => void);
  danger?: boolean;
  enCours?: boolean;
}) {
  return (
    <Fenetre
      titre={titre}
      fermer={fermer}
      pied={
        <>
          <Bouton type="button" variante="secondaire" data-fermer>
            Annuler
          </Bouton>
          <Bouton type="button" variante={danger ? 'danger' : 'principal'} onClick={onConfirmer} disabled={enCours} aria-busy={enCours} autoFocus>
            {bouton}
          </Bouton>
        </>
      }
    >
      {texte && <p className="text-[15px]">{texte}</p>}
    </Fenetre>
  );
}
