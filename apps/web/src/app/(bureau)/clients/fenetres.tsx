'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Children, useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { FenetreConfirmation } from '@/components/fenetre';
import { BoutonEnvoi, annoncer } from '@/components/retour';
import { Bouton } from '@/components/ui';
import type { EtatFenetre } from './actions';

// Briques des fenêtres de « Mes clients » (ouvrirFenetre, champ, confirmer du bac) et petits composants
// interactifs des fiches (Afficher les N autres, Retirer, bulle après une action serveur).

type ActionFenetre = (etat: EtatFenetre, d: FormData) => Promise<EtatFenetre>;

/**
 * Envoi d'un formulaire de fenêtre : l'erreur reste affichée dans la fenêtre ; en cas de réussite,
 * la bulle s'affiche (« Client enregistré ») et on va à l'adresse renvoyée (ou on ferme la fenêtre).
 */
export function useEnvoi(action: ActionFenetre, fermer: string) {
  const router = useRouter();
  const [etat, envoyer] = useActionState(action, undefined);
  const traite = useRef<EtatFenetre>(undefined);
  useEffect(() => {
    if (!etat?.ok || traite.current === etat) return;
    traite.current = etat;
    annoncer(etat.ok);
    const aller = etat.aller ?? fermer;
    router.push(aller, { scroll: aller.split('?')[0] !== fermer.split('?')[0] });
  }, [etat, fermer, router]);
  return { etat, envoyer };
}

/** Un champ libellé (champ() du bac) : libellé gris, saisie, aide facultative. */
export function Champ({ libelle, aide, children, className = '' }: { libelle: ReactNode; aide?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-[13px] font-bold text-gris ${className}`}>
      {libelle}
      {children}
      {aide && <span className="text-xs font-medium text-gris">{aide}</span>}
    </label>
  );
}

/** Champs côte à côte, qui passent les uns sous les autres quand la place manque (ligne-champs du bac). */
export function LigneChamps({ children }: { children: ReactNode }) {
  return <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">{children}</div>;
}

export const SAISIE = 'champ py-2.5 text-[15px] font-medium text-encre';

export function Erreur({ etat }: { etat: EtatFenetre }) {
  return etat?.erreur ? (
    <p role="alert" className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">
      {etat.erreur}
    </p>
  ) : null;
}

/** Boutons du bas d'une fenêtre : à gauche une action rare (Supprimer…), à droite « Annuler » et l'action. */
export function Pied({ gauche, valider, enCours = 'Enregistrement…' }: { gauche?: ReactNode; valider: ReactNode; enCours?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
      {gauche && <div className="mr-auto">{gauche}</div>}
      <Bouton type="button" variante="secondaire" data-fermer className="!px-4 !py-2.5">
        Annuler
      </Bouton>
      <BoutonEnvoi className="!px-4 !py-2.5" enCours={enCours}>
        {valider}
      </BoutonEnvoi>
    </div>
  );
}

/**
 * Bulle de confirmation après une action serveur qui revient sur la page avec un paramètre (?visites=4…) :
 * elle s'affiche une fois, puis le paramètre est retiré de l'adresse.
 */
export function Annonce({ message, retirer, ton = 'ok' }: { message: string; retirer: string[]; ton?: 'ok' | 'erreur' }) {
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    annoncer(message, ton);
    const p = new URLSearchParams(params.toString());
    retirer.forEach((k) => p.delete(k));
    const s = p.toString();
    router.replace(s ? `${chemin}?${s}` : chemin, { scroll: false });
  }, [message, retirer, ton, chemin, params, router]);
  return null;
}

/**
 * Les premiers éléments d'une liste, puis « Afficher les N autres » (voirPlus du bac).
 * Le focus passe au premier élément qui vient d'apparaître.
 */
export function VoirPlus({ limite, un, plusieurs, children }: { limite: number; un: string; plusieurs: string; children: ReactNode }) {
  const tous = Children.toArray(children);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const reste = tous.length - limite;
  return (
    <div ref={boite} className="contents">
      {ouvert || reste <= 0 ? tous : tous.slice(0, limite)}
      {!ouvert && reste > 0 && (
        <button
          type="button"
          onClick={() => {
            setOuvert(true);
            // Après l'affichage : le premier élément nouveau (ou son bouton) prend le focus.
            requestAnimationFrame(() => {
              const el = boite.current?.children[limite] as HTMLElement | undefined;
              const cible = el?.matches('a, button') ? el : (el?.querySelector<HTMLElement>('a, button') ?? null);
              cible?.focus();
            });
          }}
          className="self-start py-2 text-[14.5px] font-bold text-cobalt hover:underline max-[700px]:min-h-12"
        >
          {reste > 1 ? `Afficher les ${reste} ${plusieurs}` : `Afficher ${un}`}
        </button>
      )}
    </div>
  );
}

/**
 * Bouton qui demande confirmation puis lance une action serveur (« Retirer Mme Martin de la liste ? »).
 * Après coup : la bulle, puis l'adresse renvoyée par l'action, sinon la page est simplement relue.
 */
export function BoutonConfirme({
  children,
  className,
  etiquette,
  titre,
  texte,
  bouton,
  danger = false,
  action,
}: {
  children: ReactNode;
  className?: string;
  /** Nom lu par les lecteurs d'écran (« Retirer Mme Martin »). */
  etiquette?: string;
  titre: ReactNode;
  texte?: ReactNode;
  bouton: ReactNode;
  danger?: boolean;
  action: () => Promise<EtatFenetre>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  return (
    <>
      <button type="button" aria-label={etiquette} onClick={() => setOuvert(true)} className={className}>
        {children}
      </button>
      {ouvert && (
        <FenetreConfirmation
          titre={titre}
          texte={texte}
          bouton={bouton}
          danger={danger}
          enCours={enCours}
          fermer={() => setOuvert(false)}
          onConfirmer={() =>
            demarrer(async () => {
              const r = await action();
              setOuvert(false);
              if (r?.erreur) annoncer(r.erreur, 'erreur');
              else if (r?.ok) annoncer(r.ok);
              if (r?.aller) router.push(r.aller, { scroll: false });
              else router.refresh();
            })
          }
        />
      )}
    </>
  );
}

/** Confirmation ouverte par l'adresse (?supprimer=…), après la fenêtre de modification (comme le bac). */
export function ConfirmationAdresse({
  titre,
  texte,
  bouton,
  fermer,
  action,
}: {
  titre: ReactNode;
  texte?: ReactNode;
  bouton: ReactNode;
  fermer: string;
  action: () => Promise<EtatFenetre>;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  return (
    <FenetreConfirmation
      titre={titre}
      texte={texte}
      bouton={bouton}
      danger
      enCours={enCours}
      fermer={fermer}
      onConfirmer={() =>
        demarrer(async () => {
          const r = await action();
          if (r?.erreur) {
            annoncer(r.erreur, 'erreur');
            router.push(fermer, { scroll: false });
            return;
          }
          if (r?.ok) annoncer(r.ok);
          router.push(r?.aller ?? fermer, { scroll: false });
        })
      }
    />
  );
}

/** Formulaire d'une fenêtre relié à une action serveur (immeuble, occupant…). */
export function FormulaireFenetre({
  action,
  fermer,
  children,
  valider,
  gauche,
}: {
  action: ActionFenetre;
  fermer: string;
  children: ReactNode;
  valider: ReactNode;
  gauche?: ReactNode;
}) {
  const { etat, envoyer } = useEnvoi(action, fermer);
  return (
    <form action={envoyer} className="flex flex-col gap-3.5">
      {children}
      <Erreur etat={etat} />
      <Pied valider={valider} gauche={gauche} />
    </form>
  );
}

/** Fenêtre « Immeuble » (fenetreImmeuble du bac). */
export function FormulaireImmeuble({
  action,
  fermer,
  valeurs,
  bailleur,
  nouveau,
}: {
  action: ActionFenetre;
  fermer: string;
  valeurs: { adresse: string; ville: string; gardien: string; acces: string; copropriete: string; consignes: string };
  bailleur: string | null;
  nouveau: boolean;
}) {
  return (
    <FormulaireFenetre action={action} fermer={fermer} valider={nouveau ? 'Ajouter l’immeuble' : 'Enregistrer'}>
      <LigneChamps>
        <Champ libelle="Adresse">
          <input name="adresse" defaultValue={valeurs.adresse} className={SAISIE} placeholder="ex. 18 rue de l’Annonciation" autoFocus required />
        </Champ>
        <Champ libelle="Code postal et ville">
          <input name="ville" defaultValue={valeurs.ville} className={SAISIE} placeholder="75016 Paris" />
        </Champ>
      </LigneChamps>
      <LigneChamps>
        <Champ libelle="Gardien">
          <input name="gardien" defaultValue={valeurs.gardien} className={SAISIE} />
        </Champ>
        <Champ libelle="Code d’accès">
          <input name="acces" defaultValue={valeurs.acces} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <Champ
        libelle="Facturé à"
        aide={bailleur ? `Laissez vide : « ${bailleur}, » + l’adresse` : 'Laissez vide : « Syndicat des copropriétaires du » + l’adresse'}
      >
        <input name="copropriete" defaultValue={valeurs.copropriete} className={SAISIE} placeholder={bailleur ? `${bailleur}, …` : 'Syndicat des copropriétaires du …'} />
      </Champ>
      <Champ libelle="Consignes pour le technicien">
        <input name="consignes" defaultValue={valeurs.consignes} className={SAISIE} placeholder="Horaires, badge, local technique…" />
      </Champ>
    </FormulaireFenetre>
  );
}

/** Fenêtre « Nouvel occupant » (fenetreOccupant du bac). */
export function FormulaireOccupant({ action, fermer }: { action: ActionFenetre; fermer: string }) {
  return (
    <FormulaireFenetre action={action} fermer={fermer} valider="Ajouter">
      <LigneChamps>
        <Champ libelle="Nom">
          <input name="nom" className={SAISIE} placeholder="ex. Mme Royer" autoFocus required />
        </Champ>
        <Champ libelle="Lot ou étage">
          <input name="lot" className={SAISIE} placeholder="ex. 4e droite" />
        </Champ>
        <Champ libelle="Téléphone">
          <input name="telephone" type="tel" className={SAISIE} />
        </Champ>
      </LigneChamps>
    </FormulaireFenetre>
  );
}

/**
 * La bulle du bac après « Préparer le renouvellement » : « Proposition de renouvellement préparée pour CT-… ».
 * Posé dans le formulaire : à l'envoi, on attend d'arriver dans l'éditeur du devis préparé
 * (/devis/<id>?renouvellement=<numéro>), puis la bulle s'affiche (la zone des bulles reste en place entre les pages).
 */
export function AnnonceRenouvellement() {
  const repere = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const formulaire = repere.current?.closest('form');
    if (!formulaire) return;
    const envoi = () => {
      const debut = Date.now();
      const minuteur = window.setInterval(() => {
        const numero = window.location.pathname.startsWith('/devis/') ? new URLSearchParams(window.location.search).get('renouvellement') : null;
        if (numero) {
          window.clearInterval(minuteur);
          annoncer(`Proposition de renouvellement préparée pour ${numero}`);
        } else if (Date.now() - debut > 20_000) window.clearInterval(minuteur);
      }, 150);
    };
    formulaire.addEventListener('submit', envoi);
    return () => formulaire.removeEventListener('submit', envoi);
  }, []);
  return <span ref={repere} hidden />;
}
