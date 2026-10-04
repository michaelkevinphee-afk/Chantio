'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { coefficientPlancher, euro, pourcent, REGLAGES_PRIX_DEFAUT, reglagesPrix, type ReglagesPrix } from '@chantio/shared';
import { annoncer, BoutonEnvoi } from '@/components/retour';
import { enregistrerParametres, type Rubrique } from './actions';

/** Une rubrique des paramètres : ses champs, puis « Enregistrer » (dirigeant seulement). */
export function FormulaireParametres({ rubrique, modifiable, children }: { rubrique: Rubrique; modifiable: boolean; children: ReactNode }) {
  const [etat, envoyer] = useActionState(enregistrerParametres.bind(null, rubrique), undefined);
  useEffect(() => {
    if (etat?.ok) annoncer('Paramètres enregistrés');
  }, [etat]);
  return (
    <form action={envoyer}>
      <fieldset disabled={!modifiable} className="space-y-6 disabled:opacity-80">
        {children}
      </fieldset>
      {etat?.erreur && <p className="mt-5 rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}
      {modifiable && (
        <div className="mt-6 flex justify-end border-t border-trait pt-5">
          <BoutonEnvoi enCours="Enregistrement…">Enregistrer</BoutonEnvoi>
        </div>
      )}
    </form>
  );
}

const PRIX: { k: keyof ReglagesPrix; lib: string; unite: string; aide: string }[] = [
  { k: 'cout_horaire', lib: 'Coût horaire chargé', unite: '€ HT / h', aide: 'Salaires et charges, divisés par les heures facturables.' },
  { k: 'frais_generaux', lib: 'Frais généraux', unite: '% du déboursé', aide: 'Loyer, véhicules, assurances, bureau, comptable.' },
  { k: 'coefficient', lib: 'Coefficient global par défaut', unite: '×', aide: 'Proposé à chaque nouveau devis, modifiable devis par devis.' },
  { k: 'marge_min', lib: 'Marge nette minimale', unite: '%', aide: 'En dessous, le devis vous alerte.' },
  { k: 'chute', lib: 'Chute des métrés en m²', unite: '%', aide: 'Ajoutée par défaut aux surfaces (carrelage, faïence).' },
];
const texte = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Prix et coefficients, avec ce que donne le coefficient sur 100 € de déboursé. */
export function ChampsPrix({ valeurs }: { valeurs: Partial<ReglagesPrix> }) {
  const [saisie, setSaisie] = useState(() => Object.fromEntries(PRIX.map(({ k }) => [k, texte(valeurs[k])])) as Record<keyof ReglagesPrix, string>);
  const essai = reglagesPrix(
    Object.fromEntries(PRIX.flatMap(({ k }) => (saisie[k].trim() ? [[k, Number(saisie[k].replace(/\s/g, '').replace(',', '.'))]] : []))),
  );
  const vente = 100 * essai.coefficient;
  const revient = 100 * (1 + essai.frais_generaux / 100);
  const marge = vente ? ((vente - revient) / vente) * 100 : 0;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {PRIX.map(({ k, lib, unite, aide }) => (
          <label key={k} className="block">
            <span className="etiquette">
              {lib} <span className="font-semibold text-gris">· {unite}</span>
            </span>
            <input
              name={k}
              className="champ tabular-nums"
              inputMode="decimal"
              value={saisie[k]}
              placeholder={texte(REGLAGES_PRIX_DEFAUT[k])}
              onChange={(e) => setSaisie({ ...saisie, [k]: e.target.value })}
            />
            <span className="mt-1 block text-xs text-gris">{aide}</span>
          </label>
        ))}
      </div>
      <div className="rounded-2xl bg-fond p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Prix de vente', euro(vente), ''],
            ['Prix de revient', euro(revient), ''],
            ['Marge nette', pourcent(marge), marge < essai.marge_min ? 'text-rouge' : 'text-vert'],
          ].map(([l, v, ton]) => (
            <div key={l}>
              <p className="text-xs font-bold text-gris">{l}</p>
              <p className={`text-xl font-extrabold tabular-nums ${ton}`}>{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gris">
          Pour 100 € de déboursé sec (fournitures et main-d’œuvre) avec le coefficient × {texte(essai.coefficient)}. Prix d’un ouvrage = (fourniture + temps de pose ×{' '}
          {euro(essai.cout_horaire)}) × coefficient. Pour garder {pourcent(essai.marge_min)} de marge nette, ne descendez pas sous × {texte(coefficientPlancher(essai))}.
        </p>
      </div>
    </>
  );
}
