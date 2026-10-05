'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Formule } from '@chantio/shared';
import { choisirFormule, enregistrerNotification } from './actions';
import { CaseAuto, envoyer } from './champ-auto';
import type { Notifications } from './valeurs';

const envoiNotification = (cle: string, valeur: string | boolean) => enregistrerNotification(cle, valeur === true);

/** Paramètres › Mes notifications : 4 cases, enregistrées dans le compte (valables dans toutes les entreprises). */
export function CasesNotifications({ n }: { n: Notifications }) {
  return (
    <div className="flex flex-col gap-3.5">
      <CaseAuto cle="retard" libelle="Une facture passe en retard de paiement" coche={n.retard} envoi={envoiNotification} />
      <CaseAuto cle="signe" libelle="Un client signe un devis" coche={n.signe} envoi={envoiNotification} />
      <CaseAuto cle="fiche" libelle="Un technicien envoie une fiche d’intervention" coche={n.fiche} envoi={envoiNotification} />
      <CaseAuto cle="resume" libelle="Chaque matin, le résumé de la journée" aide="Les interventions du jour et ce qui est à faire." coche={n.resume} envoi={envoiNotification} />
    </div>
  );
}

/** Abonnement : choisir une autre formule (discret, la formule se changeait dans « Vos entreprises »). */
export function BoutonFormule({ formule }: { formule: Formule }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  return (
    <button
      type="button"
      disabled={enCours}
      className="mt-auto text-sm font-bold text-cobalt hover:underline disabled:opacity-60"
      onClick={async () => {
        setEnCours(true);
        const r = await envoyer(() => choisirFormule(formule), 'formule', formule);
        setEnCours(false);
        if (r.ok) router.refresh();
      }}
    >
      Choisir cette formule
    </button>
  );
}
