'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Fenetre, FenetreConfirmation } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { annulerFacturation, devisDepuisIntervention, facturer, facturerIntervention, renvoyer, supprimer, valider } from '../actions';
import { CHAMP, ETIQUETTE, PETIT, PETIT_DANGER, PETIT_SECOND } from './styles';

const ACTIONS = {
  valider: { fn: valider, enCours: 'Validation…', message: (ref: string) => `Fiche ${ref} validée` },
  facturer: { fn: facturer, enCours: 'Enregistrement…', message: (ref: string) => `${ref} marquée facturée` },
  annuler: { fn: annulerFacturation, enCours: 'Annulation…', message: (ref: string) => `Facturation de ${ref} annulée` },
} as const;

/** Bouton d'un changement d'état (Valider la fiche, Marquer facturée, Annuler la facturation) : bulle de confirmation, le volet se met à jour. */
export function BoutonEtat({
  id,
  reference,
  action,
  second = false,
  children,
}: {
  id: string;
  reference: string;
  action: keyof typeof ACTIONS;
  second?: boolean;
  children: React.ReactNode;
}) {
  const [enCours, demarrer] = useTransition();
  const a = ACTIONS[action];
  return (
    <button
      type="button"
      className={second ? PETIT_SECOND : PETIT}
      disabled={enCours}
      aria-busy={enCours}
      onClick={() =>
        demarrer(async () => {
          const { erreur } = await a.fn(id).catch(() => ({ erreur: 'Pas de réseau : réessayez.' }));
          annoncer(erreur ?? a.message(reference), erreur ? 'erreur' : 'ok');
        })
      }
    >
      {enCours && <Roue taille={13} />}
      {enCours ? a.enCours : children}
    </button>
  );
}

/** « Renvoyer au technicien » : fenêtre avec le message du bureau, comme le bac. */
export function BoutonRenvoyer({ id, reference, techniciens }: { id: string; reference: string; techniciens: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState('');
  const [enCours, demarrer] = useTransition();
  return (
    <>
      <button type="button" className={PETIT_SECOND} onClick={() => setOuvert(true)}>
        Renvoyer au technicien
      </button>
      {ouvert && (
        <Fenetre
          titre={`Renvoyer ${reference} au technicien`}
          texte={`La fiche repasse « À reprendre » dans l’appli de ${techniciens}, avec votre message en tête.`}
          fermer={() => setOuvert(false)}
          pied={
            <>
              <Bouton type="button" variante="secondaire" data-fermer>
                Annuler
              </Bouton>
              <Bouton
                type="button"
                disabled={enCours}
                aria-busy={enCours}
                onClick={() =>
                  demarrer(async () => {
                    const { erreur } = await renvoyer(id, message).catch(() => ({ erreur: 'Pas de réseau : réessayez.' }));
                    if (erreur) annoncer(erreur, 'erreur');
                    else {
                      annoncer(`${reference} renvoyée à ${techniciens}`);
                      setOuvert(false);
                      setMessage('');
                    }
                  })
                }
              >
                {enCours && <Roue />}
                Renvoyer
              </Bouton>
            </>
          }
        >
          <label className="block">
            <span className={ETIQUETTE}>Ce qu’il faut reprendre</span>
            <textarea
              rows={3}
              autoFocus
              className={CHAMP}
              value={message}
              maxLength={500}
              placeholder="ex. Il manque la photo après travaux et la signature."
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </Fenetre>
      )}
    </>
  );
}

/**
 * « Créer la facture » / « Créer le devis » / « Créer un devis » : prépare le brouillon relié à l'intervention et l'ouvre.
 * Avec ?facturer=1 (ou ?chiffrer=1) dans l'adresse, le bouton correspondant est mis en avant.
 */
export function BoutonDocument({
  id,
  genre,
  second = false,
  miseEnAvant = true,
  children,
}: {
  id: string;
  genre: 'facture' | 'devis';
  second?: boolean;
  /** Mis en avant par ?facturer=1 / ?chiffrer=1 (un seul bouton par genre). */
  miseEnAvant?: boolean;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const enAvant = miseEnAvant && params.get(genre === 'facture' ? 'facturer' : 'chiffrer') === '1';
  const bouton = useRef<HTMLButtonElement>(null);
  const [enCours, demarrer] = useTransition();
  useEffect(() => {
    if (!enAvant || !bouton.current) return;
    bouton.current.scrollIntoView({ block: 'center' });
    bouton.current.focus({ preventScroll: true });
  }, [enAvant]);
  return (
    <button
      ref={bouton}
      type="button"
      className={`${second ? PETIT_SECOND : PETIT} ${enAvant ? 'ring-4 ring-cobalt/30' : ''}`}
      disabled={enCours}
      aria-busy={enCours}
      onClick={() =>
        demarrer(async () => {
          await (genre === 'facture' ? facturerIntervention(id) : devisDepuisIntervention(id));
        })
      }
    >
      {enCours && <Roue taille={13} />}
      {enCours ? 'Préparation…' : children}
    </button>
  );
}

/** « Supprimer l'intervention », après confirmation. */
export function BoutonSupprimer({ id, reference, documents, retour }: { id: string; reference: string; documents: number; retour: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  return (
    <>
      <button type="button" className={PETIT_DANGER} onClick={() => setOuvert(true)}>
        Supprimer l’intervention
      </button>
      {ouvert && (
        <FenetreConfirmation
          titre={`Supprimer ${reference} ?`}
          texte={`L’intervention disparaît du planning et de l’appli du technicien.${
            documents ? ` ${documents > 1 ? `Les ${documents} documents liés sont gardés.` : 'Le document lié est gardé.'}` : ''
          } Son numéro n’est pas réutilisé.`}
          bouton={enCours ? 'Suppression…' : 'Supprimer'}
          danger
          enCours={enCours}
          fermer={() => setOuvert(false)}
          onConfirmer={() =>
            demarrer(async () => {
              try {
                const { erreur } = await supprimer(id, retour);
                if (erreur) annoncer(erreur, 'erreur');
              } catch (e) {
                // Réussie, la suppression renvoie vers la page sans le volet (redirection de Next).
                if (String((e as { digest?: string })?.digest ?? '').startsWith('NEXT_REDIRECT')) annoncer(`${reference} supprimée`);
                throw e;
              }
            })
          }
        />
      )}
    </>
  );
}

/**
 * Bulles venues de l'adresse : « Intervention DEP-… créée » (après la fenêtre de création, ?cree=1)
 * ou l'erreur d'une action (?erreur=…). Le paramètre est ensuite retiré de l'adresse.
 */
export function AnnoncesVolet({ reference, aPlacer }: { reference: string; aPlacer: boolean }) {
  const params = useSearchParams();
  const cree = params.get('cree') === '1';
  const erreur = params.get('erreur');
  const fait = useRef('');
  useEffect(() => {
    const cle = `${cree}|${erreur}`;
    if ((!cree && !erreur) || fait.current === cle) return;
    fait.current = cle;
    if (cree) annoncer(`Intervention ${reference} créée${aPlacer ? ', à placer au planning' : ''}`);
    if (erreur) annoncer(erreur, 'erreur');
    const u = new URL(window.location.href);
    u.searchParams.delete('cree');
    u.searchParams.delete('erreur');
    window.history.replaceState(null, '', `${u.pathname}${u.search}`);
  }, [cree, erreur, reference, aPlacer]);
  return null;
}
