import {
  DESCRIPTION_FORMULE,
  LIBELLE_FORMULE,
  OPTIONS_ABONNEMENT,
  PRIX_FORMULE_HT,
  revenuMensuel,
  UTILISATEURS_FORMULE,
  type Formule,
  type OptionAbonnement,
} from '@chantio/shared';
import { EnClair, Tableau } from '@/components/console/elements';
import { Titre } from '@/components/ui';
import { euros } from '@/lib/console';
import { listeEntreprises } from '../donnees';

export const metadata = { title: 'Formules et options · Console Chantio' };

// Formules et options : le catalogue de prix (dans le code, @chantio/shared) et qui l'utilise.

export default async function Formules() {
  const entreprises = (await listeEntreprises()).filter((e) => e.statut !== 'resilie');
  const formules = Object.keys(LIBELLE_FORMULE) as Formule[];
  const options = Object.keys(OPTIONS_ABONNEMENT) as OptionAbonnement[];

  return (
    <>
      <Titre texte="Ce que propose Chantio, à quel prix, et combien d’entreprises ont choisi chaque formule.">Formules et options</Titre>
      <EnClair>
        Les prix viennent du business plan et sont les mêmes partout (site, Paramètres › Abonnement du client, cette console). Pour en changer un, demandez-le à
        Claude : il change le code et tout suit. Un prix négocié avec un client se met sur sa fiche, onglet Abonnement.
      </EnClair>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {formules.map((f, i) => {
          const qui = entreprises.filter((e) => e.formule === f);
          const u = UTILISATEURS_FORMULE[f];
          return (
            <section key={f} className="carte apparition flex flex-col gap-2 p-5" style={{ '--i': i } as React.CSSProperties}>
              <h2 className="text-[19px] font-extrabold">{LIBELLE_FORMULE[f]}</h2>
              <p className="text-[30px] leading-none font-extrabold tabular-nums">
                {PRIX_FORMULE_HT[f]} € <span className="text-[15px] font-semibold text-gris">HT / mois</span>
              </p>
              <p className="text-[14.5px] text-gris">{DESCRIPTION_FORMULE[f]}</p>
              <ul className="mt-1 grid gap-1 text-[14.5px]">
                <li>
                  {u.inclus} utilisateurs compris{u.parUtilisateur ? `, puis ${u.parUtilisateur} € HT par utilisateur` : ', pas d’utilisateur en plus'}
                </li>
                <li>Toutes les fonctions : fiches, planning, devis, factures, achats, contrats</li>
              </ul>
              <p className="mt-auto border-t border-trait pt-3 text-[14px]">
                <b className="tabular-nums">{qui.length}</b> entreprise{qui.length > 1 ? 's' : ''} ·{' '}
                <b className="tabular-nums">{euros(qui.reduce((s, e) => s + revenuMensuel(e), 0))}</b> par mois
              </p>
            </section>
          );
        })}
      </div>
      <h2 className="mb-3 text-[17px] font-extrabold">Options</h2>
      <Tableau entetes={['Option', 'Ce que c’est', { t: 'Prix HT / mois', droite: true }, { t: 'Entreprises', droite: true }]}>
        {options.map((o) => (
          <tr key={o}>
            <td className="px-4 py-3 font-bold">{OPTIONS_ABONNEMENT[o].libelle}</td>
            <td className="px-4 py-3 text-gris">{OPTIONS_ABONNEMENT[o].description}</td>
            <td className="px-4 py-3 text-right tabular-nums">{euros(OPTIONS_ABONNEMENT[o].prix)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{entreprises.filter((e) => e.options.includes(o)).length}</td>
          </tr>
        ))}
      </Tableau>
      <p className="mt-3 text-[13px] text-gris">Paiement en ligne (Stripe, prélèvement SEPA) : pas encore branché. Les comptes payants se facturent à la main pour l’instant.</p>
    </>
  );
}
