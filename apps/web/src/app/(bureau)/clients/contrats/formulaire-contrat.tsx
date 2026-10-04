'use client';

import { useActionState, useState } from 'react';
import { ajouterJours, ajouterMois, type Contrat } from '@chantio/shared';
import { BoutonEnvoi } from '@/components/retour';
import { classeBouton } from '@/components/ui';
import { Champ, Groupe } from '../formulaire-client';
import { enregistrerContrat, supprimerContrat } from './actions';

export type ClientContrat = { id: string; nom: string; sites: { id: string; adresse: string }[] };

const nb = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Création ou modification d'un contrat d'entretien. */
export function FormulaireContrat({
  contrat,
  clients,
  clientInitial,
  debutPropose,
  retour,
}: {
  contrat: Contrat | null;
  clients: ClientContrat[];
  clientInitial: string | null;
  debutPropose: string;
  retour: string;
}) {
  const [etat, envoyer] = useActionState(enregistrerContrat.bind(null, contrat?.id ?? null), undefined);
  const [clientId, setClientId] = useState(contrat?.client_id ?? clientInitial ?? '');
  const [debut, setDebut] = useState(contrat?.debut ?? debutPropose);
  const [fin, setFin] = useState(contrat?.fin ?? ajouterJours(ajouterMois(debutPropose, 12), -1));
  const [finTouchee, setFinTouchee] = useState(!!contrat);
  const sites = clients.find((c) => c.id === clientId)?.sites ?? [];

  return (
    <form action={envoyer} className="space-y-5">
      <input type="hidden" name="retour" value={retour} />
      <Groupe titre="Client">
        <Champ libelle="Client">
          <select name="client_id" className="champ" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choisir…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Adresse entretenue">
          <select name="site_id" className="champ" defaultValue={contrat?.site_id ?? sites[0]?.id ?? ''} key={clientId}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.adresse}
              </option>
            ))}
            <option value="">{sites.length ? 'Aucune adresse précise' : 'Aucune adresse connue pour ce client'}</option>
          </select>
        </Champ>
        <Champ libelle="Objet">
          <input name="objet" className="champ" required defaultValue={contrat?.objet ?? ''} placeholder="Entretien chaudière collective" />
        </Champ>
      </Groupe>

      <Groupe titre="Durée">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px] gap-2">
          <Champ libelle="Début">
            <input
              name="debut"
              type="date"
              className="champ"
              required
              value={debut}
              onChange={(e) => {
                setDebut(e.target.value);
                if (!finTouchee && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setFin(ajouterJours(ajouterMois(e.target.value, 12), -1));
              }}
            />
          </Champ>
          <Champ libelle="Fin">
            <input
              name="fin"
              type="date"
              className="champ"
              required
              min={debut}
              value={fin}
              onChange={(e) => {
                setFin(e.target.value);
                setFinTouchee(true);
              }}
            />
          </Champ>
          <Champ libelle="Préavis (mois)">
            <input name="preavis_mois" className="champ" inputMode="numeric" defaultValue={contrat?.preavis_mois ?? 3} />
          </Champ>
        </div>
        <label className="flex items-start gap-2 pt-1 text-sm font-semibold">
          <input name="tacite" type="checkbox" defaultChecked={contrat?.tacite ?? true} className="mt-0.5 h-4 w-4 accent-cobalt" />
          <span>
            Reconduction tacite
            <span className="block font-normal text-gris">Sinon, le client doit signer chaque renouvellement.</span>
          </span>
        </label>
      </Groupe>

      <Groupe titre="Visites et prix">
        <div className="grid grid-cols-3 gap-2">
          <Champ libelle="Montant (€ HT par an)">
            <input name="montant_ht" className="champ" inputMode="decimal" defaultValue={nb(contrat?.montant_ht ?? 0)} />
          </Champ>
          <Champ libelle="Visites par an">
            <input name="visites_par_an" className="champ" inputMode="numeric" defaultValue={contrat?.visites_par_an ?? 1} />
          </Champ>
          <Champ libelle="Dernière visite">
            <input name="derniere_visite" type="date" className="champ" defaultValue={contrat?.derniere_visite ?? ''} />
          </Champ>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Champ libelle="Fournitures par visite (€ HT)">
            <input name="fournitures_visite" className="champ" inputMode="decimal" defaultValue={nb(contrat?.fournitures_visite ?? 0)} />
          </Champ>
          <Champ libelle="Heures par visite">
            <input name="heures_visite" className="champ" inputMode="decimal" defaultValue={nb(contrat?.heures_visite ?? 1)} />
          </Champ>
        </div>
        <p className="text-xs text-gris">Les fournitures et les heures servent à chiffrer le devis de renouvellement avec vos coefficients.</p>
      </Groupe>

      <Groupe titre="Notes">
        <textarea name="notes" rows={2} className="champ" defaultValue={contrat?.notes ?? ''} placeholder="Équipements couverts, exclusions…" aria-label="Notes" />
      </Groupe>

      {etat?.erreur && <p className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}
      <div className="sticky -bottom-6 -mx-6 -mb-6 flex gap-2 border-t border-trait bg-fond/90 px-6 py-4 backdrop-blur">
        {contrat && (
          <button
            formAction={supprimerContrat.bind(null, contrat.id)}
            formNoValidate
            onClick={(e) => {
              if (!confirm(`Supprimer le contrat ${contrat.reference ?? ''} ? Les visites déjà créées restent au planning.`)) e.preventDefault();
            }}
            className={classeBouton('danger')}
          >
            Supprimer
          </button>
        )}
        <BoutonEnvoi className="flex-1" enCours="Enregistrement…">
          {contrat ? 'Enregistrer le contrat' : 'Créer le contrat'}
        </BoutonEnvoi>
      </div>
    </form>
  );
}
