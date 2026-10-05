import type { ReactNode } from 'react';
import { DESCRIPTION_FORMULE, LIBELLE_FORMULE, PRIX_FORMULE_HT, type Formule } from '@chantio/shared';
import { Icone, type NomIcone } from '@/components/icones';
import { Puce } from '@/components/ui';
import { BoutonFormule } from './notifications';
import { Bientot, Note, Section } from './elements';

// Rubriques d'information, sans réglage à saisir (textes du bac à sable).

/** Paramètres › Facturation électronique. */
export function RubriqueEfacture() {
  return (
    <>
      <Section titre="Ce que dit la loi" grille={false}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <b>Recevoir :</b> depuis le 1<sup>er</sup> septembre 2026, toute entreprise doit pouvoir recevoir des factures électroniques.
          </li>
          <li>
            <b>Émettre :</b> obligatoire pour les PME, les TPE et les indépendants à partir du 1<sup>er</sup> septembre 2027.
          </li>
          <li>
            Les factures passent par une <b>plateforme agréée</b>, dans un format que les logiciels savent lire (Factur-X, par exemple).
          </li>
        </ul>
      </Section>
      <Section titre="Dans Chantio" grille={false}>
        <p>
          <b>Recevoir :</b> vos factures fournisseurs arriveront par Super PDP, plateforme agréée, directement dans « Achats », puis « Factures », déjà lues.{' '}
          <Bientot />
        </p>
        <p>
          <b>Émettre :</b> vos factures partiront par la même plateforme, sans rien changer à votre façon de les faire. <Bientot />
        </p>
        <Note>Les factures aux particuliers ne sont pas concernées.</Note>
      </Section>
    </>
  );
}

const LIENS: [NomIcone, string, string, ReactNode][] = [
  ['p_connectivite', 'Logiciel de gestion', 'Batigest, EBP, Obat : reprendre vos clients, vos articles et vos devis.', <Bientot key="b" />],
  ['p_compta', 'Comptabilité', 'Envoyer vos ventes à votre expert-comptable.', <Bientot key="b" />],
  [
    'calendrier',
    'Agenda',
    'Les interventions arrivent dans l’agenda de chaque technicien (Google Agenda, Outlook, Apple Calendrier).',
    <Puce key="p" ton="vert">
      Sur la plateforme
    </Puce>,
  ],
  ['p_abonnement', 'Paiement en ligne', 'Stripe (carte bancaire), GoCardless (prélèvement SEPA) : le client paie depuis sa facture.', <Bientot key="b" />],
  ['p_banque', 'Banque', 'Marquer automatiquement les factures payées.', <Bientot key="b" />],
];

/** Paramètres › Connectivité. */
export function RubriqueConnectivite() {
  return (
    <ul className="flex flex-col pt-5">
      {LIENS.map(([icone, titre, texte, etat]) => (
        <li
          key={titre}
          className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 border-b border-trait py-3 last:border-b-0 min-[521px]:grid-cols-[44px_minmax(0,1fr)_auto]"
        >
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-doux text-cobalt" aria-hidden="true">
            <Icone nom={icone} taille={22} />
          </span>
          <span className="min-w-0">
            <b className="block font-extrabold">{titre}</b>
            <small className="block text-[13px] font-medium text-gris">{texte}</small>
          </span>
          <span className="col-start-2 justify-self-start min-[521px]:col-start-3">{etat}</span>
        </li>
      ))}
    </ul>
  );
}

/** Paramètres › Abonnement (dirigeant). */
export function RubriqueAbonnement({ formule }: { formule: Formule }) {
  return (
    <>
      <Section titre="Votre formule" grille={false}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[1101px]:grid-cols-3">
          {(Object.keys(LIBELLE_FORMULE) as Formule[]).map((f) => {
            const actuelle = f === formule;
            return (
              <div
                key={f}
                className={`flex flex-col items-start gap-1.5 rounded-[14px] p-3.5 ${actuelle ? 'border-2 border-cobalt bg-[#F9FAFF]' : 'border border-trait'}`}
              >
                <b className="font-extrabold">{LIBELLE_FORMULE[f]}</b>
                <span className="text-[22px] font-extrabold tabular-nums">
                  {PRIX_FORMULE_HT[f]} € <small className="text-xs font-semibold text-gris">HT / mois</small>
                </span>
                <span className="text-gris">{DESCRIPTION_FORMULE[f]}</span>
                {actuelle ? <Puce ton="cobalt">Formule actuelle</Puce> : <BoutonFormule formule={f} />}
              </div>
            );
          })}
        </div>
        <Note>Aucun paiement n’est demandé pour l’instant.</Note>
      </Section>
      <Section titre="Factures Chantio" grille={false}>
        <p>
          Vos factures d’abonnement, à télécharger. <Bientot />
        </p>
      </Section>
    </>
  );
}

/** Paramètres › Mes données (dirigeant). */
export function RubriqueDonnees() {
  return (
    <Section titre="Exporter mes données" grille={false}>
      <p>
        Télécharger vos clients, interventions, devis et factures dans un fichier. <Bientot />
      </p>
    </Section>
  );
}
