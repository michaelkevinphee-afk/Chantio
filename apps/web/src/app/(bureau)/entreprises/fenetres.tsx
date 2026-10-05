'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RoleMembre } from '@chantio/shared';
import { Fenetre, FenetreConfirmation } from '@/components/fenetre';
import { annoncer, BoutonEnvoi, Roue } from '@/components/retour';
import { Bouton, LienBouton } from '@/components/ui';
import { choisirEntreprise, demanderFacturationElectronique, traiterDemande } from './actions';

const PETIT = '!rounded-[10px] !px-3 !py-1.5 !text-[13px]';

export interface EntreprisePdp {
  id: string;
  nom: string;
  /** SIREN lisible (« 123 456 789 »), ou vide. */
  siren: string;
  active: boolean;
  identite: 'a_verifier' | 'en_attente' | 'verifiee' | 'refusee';
  /** Le SIRET définitif est connu. */
  siret: boolean;
}

/** Bandeau bas d'une carte : « Activer votre facturation électronique » et sa fenêtre (comme fenetrePdp du bac). */
export function BandeauPdp({ e }: { e: EntreprisePdp }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const accord = useRef<HTMLInputElement>(null);
  const fermer = () => setOuvert(false);

  async function activer() {
    if (!accord.current?.checked) {
      annoncer('Cochez l’autorisation pour activer', 'erreur');
      accord.current?.focus();
      return;
    }
    setEnCours(true);
    const r = await demanderFacturationElectronique(e.id).catch(() => ({ erreur: 'La demande n’a pas pu être enregistrée. Réessayez.' }) as { erreur?: string });
    setEnCours(false);
    if (r.erreur) return annoncer(r.erreur, 'erreur');
    fermer();
    annoncer(`Inscription demandée pour ${e.nom}`);
    router.refresh();
  }

  let fenetre: React.ReactNode = null;
  if (ouvert && !e.active) {
    fenetre = (
      <Fenetre
        titre="Activer la facturation électronique"
        fermer={fermer}
        sansCroix
        pied={
          <>
            <Bouton type="button" variante="secondaire" data-fermer>
              Fermer
            </Bouton>
            <form action={choisirEntreprise.bind(null, e.id, '/entreprises')}>
              <BoutonEnvoi enCours="Ouverture…">Ouvrir {e.nom}</BoutonEnvoi>
            </form>
          </>
        }
      >
        <p>
          La facturation électronique s’active depuis l’entreprise ouverte. Ouvrez <b>{e.nom}</b>, puis revenez ici.
        </p>
      </Fenetre>
    );
  } else if (ouvert && (e.identite !== 'verifiee' || !e.siret)) {
    const aVerifier = e.identite === 'a_verifier' || e.identite === 'refusee';
    fenetre = (
      <Fenetre
        titre="Encore une étape avant la facturation électronique"
        fermer={fermer}
        sansCroix
        pied={
          <>
            <Bouton type="button" variante="secondaire" data-fermer>
              Fermer
            </Bouton>
            {aVerifier && <LienBouton href="/entreprises/identite">Vérifier mon identité</LienBouton>}
          </>
        }
      >
        {!e.siret && (
          <p>
            Il faut le SIRET définitif de {e.nom} : l’adresse de facturation électronique est rattachée à ce numéro. Ajoutez-le dans « Paramètres », puis « Mon
            entreprise », dès que vous l’avez reçu.
          </p>
        )}
        {e.identite !== 'verifiee' && (
          <p>
            La plateforme agréée doit savoir qui agit pour {e.nom}.{' '}
            {e.identite === 'en_attente'
              ? 'Votre identité est en cours de vérification : vous pourrez activer la facturation électronique dès qu’elle sera validée.'
              : 'Vérifiez d’abord votre identité de dirigeant.'}
          </p>
        )}
      </Fenetre>
    );
  } else if (ouvert) {
    fenetre = (
      <Fenetre
        titre="Activer la facturation électronique"
        fermer={fermer}
        sansCroix
        pied={
          <>
            <Bouton type="button" variante="secondaire" data-fermer>
              Annuler
            </Bouton>
            <Bouton type="button" onClick={activer} disabled={enCours} aria-busy={enCours}>
              {enCours && <Roue />} Activer
            </Bouton>
          </>
        }
      >
        <p>
          Chantio inscrit <b>{e.nom}</b> à l’annuaire national des factures électroniques, avec <b>Super PDP</b>, plateforme agréée par l’administration.
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Vos fournisseurs vous envoient leurs factures électroniques : elles arrivent dans « Achats », déjà lues.</li>
          <li>Vos factures à vos clients professionnels partiront par la même plateforme, dès que l’émission sera obligatoire.</li>
        </ul>
        <div className="flex flex-col gap-0.5 rounded-[12px] bg-fond px-3.5 py-3">
          <small className="text-gris">Votre adresse de facturation électronique</small>
          <b className="font-mono text-lg">{e.siren}</b>
          <small className="text-gris">C’est votre SIREN : vos fournisseurs n’ont rien à vous demander.</small>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[14px] font-bold">
          <input ref={accord} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-cobalt" />
          <span>J’autorise Chantio et Super PDP à inscrire {e.nom} à l’annuaire et à recevoir ses factures électroniques en son nom</span>
        </label>
        <p className="text-[13px] text-gris">La liaison avec Super PDP n’est pas encore ouverte : votre demande est enregistrée et l’inscription sera faite dès son ouverture.</p>
      </Fenetre>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-doux px-[22px] py-3.5 font-semibold max-[760px]:px-4 max-[760px]:py-3">
      <span className="min-w-0">Activer votre facturation électronique, simplement en 1 clic</span>
      <Bouton type="button" variante="secondaire" className="!px-4 !py-2.5 text-sm" onClick={() => setOuvert(true)}>
        Je me mets en conformité
      </Bouton>
      {fenetre}
    </div>
  );
}

const ROLES_ACCES: { role: RoleMembre; libelle: string; detail: string }[] = [
  { role: 'assistant', libelle: 'Bureau', detail: 'Planning, clients, devis, factures et achats. Pas l’abonnement ni les membres.' },
  { role: 'technicien', libelle: 'Technicien', detail: 'L’appli technicien seulement : ses interventions et ses fiches.' },
  { role: 'dirigeant', libelle: 'Dirigeant', detail: 'Tout, y compris les membres, l’abonnement et la facturation électronique.' },
];

/** Boutons d'une demande d'accès : Accepter (fenêtre du rôle) et Refuser (confirmation). */
export function ReponseDemande({ id, nom, email, entreprise }: { id: string; nom: string; email: string; entreprise: string }) {
  const router = useRouter();
  const [fenetre, setFenetre] = useState<'' | 'accepter' | 'refuser'>('');
  const [enCours, setEnCours] = useState(false);
  return (
    <span className="flex gap-2">
      <Bouton type="button" className={PETIT} onClick={() => setFenetre('accepter')}>
        Accepter
      </Bouton>
      <Bouton type="button" variante="secondaire" className={PETIT} onClick={() => setFenetre('refuser')}>
        Refuser
      </Bouton>
      {fenetre === 'accepter' && (
        <Fenetre titre={`Donner accès à ${nom}`} fermer={() => setFenetre('')} sansCroix>
          <form
            action={async (d) => {
              await traiterDemande(id, true, d);
              setFenetre('');
              annoncer(`${nom.split(' ')[0]} a maintenant accès à ${entreprise}`);
              router.refresh();
            }}
            className="space-y-4"
          >
            <p>
              {email} rejoint {entreprise} avec le rôle :
            </p>
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Rôle</legend>
              {ROLES_ACCES.map((r) => (
                <label key={r.role} className="flex cursor-pointer items-start gap-2 text-[14px]">
                  <input type="radio" name="role" value={r.role} defaultChecked={r.role === 'assistant'} className="mt-1 accent-cobalt" />
                  <span>
                    <b className="font-extrabold">{r.libelle}</b>
                    <small className="block text-[13px] text-gris">{r.detail}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Bouton type="button" variante="secondaire" data-fermer>
                Annuler
              </Bouton>
              <BoutonEnvoi enCours="…">Donner l’accès</BoutonEnvoi>
            </div>
          </form>
        </Fenetre>
      )}
      {fenetre === 'refuser' && (
        <FenetreConfirmation
          titre={`Refuser la demande de ${nom} ?`}
          texte={`Cette personne ne rejoindra pas ${entreprise}.`}
          bouton="Refuser"
          danger
          enCours={enCours}
          fermer={() => setFenetre('')}
          onConfirmer={async () => {
            setEnCours(true);
            await traiterDemande(id, false);
            setEnCours(false);
            setFenetre('');
            annoncer('Demande refusée');
            router.refresh();
          }}
        />
      )}
    </span>
  );
}
