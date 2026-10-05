import Link from 'next/link';
import { Fragment } from 'react';
import { ajouterJours, jourCourt, lundiDe, occupe, periode, surPlusieursJours } from '@chantio/shared';
import { adressePlanning } from './adresse';
import type { CarteRdv } from './calendrier';
import { BarreOutils } from './outils';

export type AppelOffresMois = { id: string; objet: string; limite: string };

const FINI = ['terminee', 'validee', 'facturee'];
// Un marché gagné démarre en général un mois après la remise des offres.
const DELAI_DEMARRAGE = 30;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const INITIALE = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const creneau = (c: CarteRdv) => ({ date_prevue: c.date, heure_prevue: c.heure, date_fin: c.date_fin, fin_midi: c.fin_midi });

/**
 * Vue Mois du bac : une ligne par chantier, du premier au dernier jour ; sous chaque jour, le nombre
 * de dépannages et d'entretiens. Les appels d'offres en cours montrent le chantier qui arriverait
 * s'ils étaient gagnés. Un clic sur un chantier ouvre son volet par-dessus le planning.
 */
export function VueMois({
  debut,
  fin,
  aujourdhui,
  cartes,
  noms,
  appels,
  params,
}: {
  debut: string;
  fin: string;
  aujourdhui: string;
  cartes: CarteRdv[];
  /** Nom court de chaque membre, par id. */
  noms: Map<string, string>;
  appels: AppelOffresMois[];
  /** Paramètres de l'adresse (pour garder les familles cochées). */
  params: Record<string, string | string[] | undefined>;
}) {
  const nbj = Number(fin.slice(8, 10));
  const jours = Array.from({ length: nbj }, (_, k) => ajouterJours(debut, k));
  const estChantier = (c: CarteRdv) => c.famille === 'chantier' || surPlusieursJours(creneau(c));
  const chantiers = cartes.filter((c) => c.date && estChantier(c)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const autres = cartes.filter((c) => c.date && !estChantier(c));
  const siGagne = appels
    .map((a) => ({ ...a, demarrage: ajouterJours(a.limite, DELAI_DEMARRAGE) }))
    .filter((a) => a.demarrage >= debut && a.demarrage <= fin)
    .sort((a, b) => a.demarrage.localeCompare(b.demarrage));

  const [annee, mois] = debut.split('-').map(Number);
  const lundi = debut <= aujourdhui && aujourdhui <= fin ? lundiDe(aujourdhui) : lundiDe(debut);
  const pistes = { gridTemplateColumns: `repeat(${nbj}, minmax(24px, 1fr))` };
  const colonneDe = (iso: string) => (iso < debut ? 1 : iso > fin ? nbj : Number(iso.slice(8, 10)));
  const techniciens = (c: CarteRdv) => c.techniciens.map((t) => noms.get(t)).filter(Boolean).join(', ') || 'Personne';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      <BarreOutils vue="mois" lundi={lundi} mois={debut.slice(0, 7)} aujourdhui={aujourdhui} />

      <div className="overflow-x-auto">
        <div className="pl-gantt" style={{ gridTemplateColumns: `200px repeat(${nbj}, minmax(24px, 1fr))` }}>
          <div className="h" style={{ paddingLeft: 10, textAlign: 'left' }}>
            {MOIS[mois - 1]} {annee}
          </div>
          {jours.map((j) => {
            const jour = new Date(`${j}T12:00:00Z`).getUTCDay();
            const nb = autres.filter((c) => occupe(creneau(c), j)).length;
            return (
              <div key={j} className={`h ${jour === 0 || jour === 6 ? 'we' : ''} ${j === aujourdhui ? 'auj' : ''}`}>
                {INITIALE[jour]}
                <br />
                {Number(j.slice(8, 10))}
                {nb > 0 && (
                  <span className="pl-nbc" title={`${nb} dépannage(s) ou entretien(s)`}>
                    {nb}
                  </span>
                )}
              </div>
            );
          })}

          {chantiers.map((c) => {
            const p = periode(creneau(c));
            return (
              <Fragment key={c.id}>
                <div className="nom">
                  <span className="font-mono text-xs text-gris">{c.reference}</span>
                  <br />
                  {techniciens(c)}
                </div>
                <div className="piste" style={pistes}>
                  <Link
                    href={adressePlanning(params, { fiche: c.id })}
                    scroll={false}
                    prefetch={false}
                    style={{ gridColumn: `${colonneDe(c.date!)} / ${colonneDe(c.date_fin && c.date_fin > c.date! ? c.date_fin : c.date!) + 1}` }}
                    title={`${c.reference} · ${c.motif}${c.adresse ? ` · ${c.adresse}` : ''}${p ? ` · ${p}` : ''}`}
                    className={`pl-barre ${FINI.includes(c.statut) ? 'fini' : ''}`}
                  >
                    {c.motif}
                    {c.lieu ? ` · ${c.lieu}` : ''}
                  </Link>
                </div>
              </Fragment>
            );
          })}

          {siGagne.map((a) => (
            <Fragment key={a.id}>
              <div className="nom">
                <span className="text-xs text-gris">Appel d’offres</span>
                <br />
                si gagné
              </div>
              <div className="piste" style={pistes}>
                <Link
                  href={`/devis/${a.id}`}
                  style={{ gridColumn: `${colonneDe(a.demarrage)} / ${nbj + 1}` }}
                  title={`Réponse attendue le ${jourCourt(a.limite)} : démarrage possible vers le ${jourCourt(a.demarrage)}`}
                  className="pl-barre option"
                >
                  {a.objet}
                </Link>
              </div>
            </Fragment>
          ))}

          {!chantiers.length && (
            <>
              <div className="nom text-gris">Aucun chantier</div>
              <div className="piste" style={pistes} />
            </>
          )}
        </div>
      </div>

      <p className="pl-legende">
        <span>
          <i style={{ backgroundImage: 'var(--degrade)' }} />
          Chantier prévu
        </span>
        <span>
          <i className="bg-doux" />
          Terminé
        </span>
        <span>
          <i className="border border-dashed border-violet bg-violet-doux" />
          Appel d’offres en cours (si gagné)
        </span>
        <span>
          <b className="pl-nbc">2</b> dépannages et entretiens du jour
        </span>
      </p>
    </div>
  );
}
