'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ajouterJours, ajouterMois } from '@chantio/shared';
import { classeBouton } from '@/components/ui';
import { Champ, FormulaireFenetre, LigneChamps, SAISIE } from '../fenetres';
import { enregistrerContrat } from './actions';

/** Contrat tel que la fenêtre « Modifier le contrat » le reçoit. */
export type ContratAModifier = {
  id: string;
  reference: string | null;
  objet: string;
  debut: string;
  fin: string;
  preavis_mois: number;
  tacite: boolean;
  montant_ht: number;
  visites_par_an: number;
  derniere_visite: string | null;
  fournitures_visite: number;
  heures_visite: number;
  notes: string | null;
};

const nb = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/**
 * Fenêtre « Nouveau contrat d’entretien » / « Modifier le contrat CT-… » (fenetreContrat du bac).
 * Bâtiment : « s:<site> » ou « c:<client> » ; « Le bâtiment n’est pas dans la liste » ajoute une adresse au client.
 */
export function FormulaireContrat({
  contrat,
  batiments,
  batiment,
  clientsSansImmeubles,
  debutPropose,
  derniereProposee,
  fermer,
  lienSupprimer,
}: {
  contrat: ContratAModifier | null;
  /** Les bâtiments, triés : [valeur, « 12 rue … · Syndic … »]. */
  batiments: [string, string][];
  /** Bâtiment choisi au départ (celui de la fiche ouverte). */
  batiment: string;
  clientsSansImmeubles: { id: string; nom: string }[];
  debutPropose: string;
  derniereProposee: string;
  fermer: string;
  lienSupprimer?: string;
}) {
  const nouveau = !contrat;
  const [debut, setDebut] = useState(contrat?.debut ?? debutPropose);
  const [fin, setFin] = useState(contrat?.fin ?? ajouterJours(ajouterMois(debutPropose, 12), -1));
  const [finTouchee, setFinTouchee] = useState(!nouveau);

  return (
    <FormulaireFenetre
      action={enregistrerContrat.bind(null, contrat?.id ?? null)}
      fermer={fermer}
      valider={nouveau ? 'Créer le contrat' : 'Enregistrer'}
      gauche={
        lienSupprimer && (
          <Link href={lienSupprimer} scroll={false} className={classeBouton('danger', '!px-4 !py-2.5')}>
            Supprimer
          </Link>
        )
      }
    >
      {batiments.length > 0 && (
        <Champ libelle="Bâtiment" aide="Pour un particulier ou une entreprise sans bâtiment, ajoutez-le ci-dessous">
          <select name="batiment" defaultValue={batiment} className={SAISIE}>
            {batiments.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Champ>
      )}
      {nouveau && (
        <details className="rounded-[12px] border border-trait px-3.5 py-2.5 [&[open]>summary]:mb-2.5">
          <summary className="cursor-pointer text-[14.5px] font-bold text-cobalt">Le bâtiment n’est pas dans la liste</summary>
          <LigneChamps>
            <Champ libelle="Client">
              <select name="batiment_client" className={SAISIE}>
                {clientsSansImmeubles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Nom du bâtiment">
              <input name="batiment_nom" className={SAISIE} placeholder="ex. Appartement Martin" />
            </Champ>
          </LigneChamps>
        </details>
      )}
      <Champ libelle="Objet">
        <input name="objet" defaultValue={contrat?.objet ?? ''} className={SAISIE} placeholder="ex. Entretien chaudière collective" autoFocus={nouveau} />
      </Champ>
      <LigneChamps>
        <Champ libelle="Début">
          <input
            name="debut"
            type="date"
            value={debut}
            onChange={(e) => {
              setDebut(e.target.value);
              // Tant que la fin n'a pas été changée, elle suit le début (un an moins un jour).
              if (!finTouchee && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setFin(ajouterJours(ajouterMois(e.target.value, 12), -1));
            }}
            className={SAISIE}
          />
        </Champ>
        <Champ libelle="Fin">
          <input
            name="fin"
            type="date"
            value={fin}
            onChange={(e) => {
              setFin(e.target.value);
              setFinTouchee(true);
            }}
            className={SAISIE}
          />
        </Champ>
        <Champ libelle="Préavis (mois)">
          <input name="preavis_mois" inputMode="numeric" defaultValue={contrat?.preavis_mois ?? 3} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <LigneChamps>
        <Champ libelle="Montant (€ HT par an)">
          <input name="montant_ht" inputMode="decimal" defaultValue={nb(contrat?.montant_ht ?? 0)} className={SAISIE} />
        </Champ>
        <Champ libelle="Visites par an">
          <input name="visites_par_an" inputMode="numeric" defaultValue={contrat?.visites_par_an ?? 1} className={SAISIE} />
        </Champ>
        <Champ libelle="Dernière visite">
          <input name="derniere_visite" type="date" defaultValue={contrat ? (contrat.derniere_visite ?? '') : derniereProposee} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <LigneChamps>
        <Champ libelle="Fournitures par visite (€)" aide="Pour calculer le prix du renouvellement">
          <input name="fournitures_visite" inputMode="decimal" defaultValue={nb(contrat?.fournitures_visite ?? 20)} className={SAISIE} />
        </Champ>
        <Champ libelle="Heures par visite">
          <input name="heures_visite" inputMode="decimal" defaultValue={nb(contrat?.heures_visite ?? 2)} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <label className="flex items-start gap-2.5 text-[14.5px] font-semibold text-encre">
        <input type="checkbox" name="tacite" defaultChecked={contrat?.tacite ?? true} className="mt-0.5 h-5 w-5 shrink-0 accent-cobalt" />
        Reconduction tacite (sinon le client doit signer chaque renouvellement)
      </label>
      <Champ libelle="Notes">
        <input name="notes" defaultValue={contrat?.notes ?? ''} className={SAISIE} placeholder="Clauses particulières, interlocuteur…" />
      </Champ>
    </FormulaireFenetre>
  );
}
