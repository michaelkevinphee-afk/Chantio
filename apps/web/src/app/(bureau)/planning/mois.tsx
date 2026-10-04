import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ajouterJours, lundiDe, occupe, periode, surPlusieursJours, type TypeIntervention } from '@chantio/shared';
import { Icone } from '@/components/icones';
import type { CarteRdv } from './calendrier';
import { Bascule, jourCourt, LISERE } from './outils';

export type AppelOffresMois = { id: string; numero: string | null; objet: string; limite: string };

const CHANTIERS: TypeIntervention[] = ['chantier', 'installation', 'mise_en_service'];
const FINI = ['terminee', 'validee', 'facturee'];
// Un marché gagné démarre en général un mois après la remise des offres.
const DELAI_DEMARRAGE = 30;

const creneau = (c: CarteRdv) => ({ date_prevue: c.date, heure_prevue: c.heure, date_fin: c.date_fin, fin_midi: c.fin_midi });

/**
 * Le mois en un coup d'œil : une ligne par chantier, du premier au dernier
 * jour ; sous chaque jour, le nombre de dépannages et d'entretiens. Les
 * appels d'offres en cours montrent le chantier qui arriverait s'ils étaient gagnés.
 */
export function VueMois({
  debut,
  fin,
  aujourdhui,
  cartes,
  equipe,
  appels,
}: {
  debut: string;
  fin: string;
  aujourdhui: string;
  cartes: CarteRdv[];
  equipe: { id: string; prenom: string }[];
  appels: AppelOffresMois[];
}) {
  const nbj = Number(fin.slice(8, 10));
  const jours = Array.from({ length: nbj }, (_, k) => ajouterJours(debut, k));
  const estChantier = (c: CarteRdv) => surPlusieursJours(creneau(c)) || CHANTIERS.includes(c.type);
  const chantiers = cartes.filter((c) => c.date && estChantier(c)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const autres = cartes.filter((c) => c.date && !estChantier(c));
  const siGagne = appels
    .map((a) => ({ ...a, demarrage: ajouterJours(a.limite, DELAI_DEMARRAGE) }))
    .filter((a) => a.demarrage >= debut && a.demarrage <= fin)
    .sort((a, b) => a.demarrage.localeCompare(b.demarrage));

  const titre = new Date(`${debut}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const avant = ajouterJours(debut, -1).slice(0, 7);
  const apres = ajouterJours(fin, 1).slice(0, 7);
  const lundi = debut <= aujourdhui && aujourdhui <= fin ? lundiDe(aujourdhui) : lundiDe(debut);
  const colonnes = { gridTemplateColumns: `200px repeat(${nbj}, minmax(26px, 1fr))` } as CSSProperties;
  const noms = (c: CarteRdv) => c.techniciens.map((t) => equipe.find((m) => m.id === t)?.prenom).filter(Boolean).join(', ') || 'Sans technicien';
  const colonneDe = (iso: string) => (iso < debut ? 1 : iso > fin ? nbj : Number(iso.slice(8, 10)));

  /** Fond d'une piste : week-ends grisés, aujourd'hui en bleu. */
  const fond = jours.map((j, k) => {
    const we = new Date(`${j}T12:00:00`).getDay() % 6 === 0;
    return we || j === aujourdhui ? (
      <span key={j} aria-hidden="true" style={{ gridColumn: `${k + 1} / span 1` }} className={`absolute inset-y-0 w-full ${j === aujourdhui ? 'bg-doux' : 'bg-fond'}`} />
    ) : null;
  });

  return (
    <section className="carte overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-trait px-5 py-3">
        <h2 className="text-[17px] font-extrabold first-letter:uppercase">{titre}</h2>
        <Bascule vue="mois" lundi={lundi} mois={debut.slice(0, 7)} />
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/planning?mois=${avant}`}
            aria-label="Mois précédent"
            className="grid h-9 w-9 place-items-center rounded-xl border border-trait bg-white transition hover:border-cobalt"
          >
            <Icone nom="gauche" taille={18} />
          </Link>
          <Link
            href={`/planning?mois=${aujourdhui.slice(0, 7)}`}
            className="h-9 rounded-xl border border-trait bg-white px-3 text-sm leading-9 font-bold transition hover:border-cobalt"
          >
            Ce mois-ci
          </Link>
          <Link
            href={`/planning?mois=${apres}`}
            aria-label="Mois suivant"
            className="grid h-9 w-9 place-items-center rounded-xl border border-trait bg-white transition hover:border-cobalt"
          >
            <Icone nom="chevron" taille={18} />
          </Link>
        </div>
      </header>

      <div className="overflow-x-auto">
        <div className="grid min-w-[1000px]" style={colonnes}>
          <div className="border-b border-trait bg-fond/60 px-4 py-2.5 text-xs font-bold tracking-wide text-gris uppercase">Chantiers</div>
          {jours.map((j) => {
            const d = jourCourt(j);
            const nb = autres.filter((c) => occupe(creneau(c), j)).length;
            const auj = j === aujourdhui;
            return (
              <div key={j} className={`border-b border-l border-trait py-1.5 text-center ${auj ? 'bg-doux' : 'bg-fond/60'}`}>
                <span className="block text-[10px] font-bold text-gris uppercase">{d.nom.slice(0, 1)}</span>
                <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold ${auj ? 'bg-cobalt text-white' : ''}`}>{d.num}</span>
                <span
                  className={`mx-auto mt-0.5 block h-4 w-5 rounded-full text-[10px] leading-4 font-extrabold ${nb ? 'bg-bleu-doux text-bleu' : 'text-transparent'}`}
                  title={nb ? `${nb} dépannage${nb > 1 ? 's' : ''} ou entretien${nb > 1 ? 's' : ''}` : undefined}
                >
                  {nb || '·'}
                </span>
              </div>
            );
          })}

          {chantiers.map((c) => (
            <div key={c.id} className="contents">
              <div className="min-w-0 border-b border-trait px-4 py-2">
                <span className="block truncate text-[11px] text-gris">
                  <span className="font-mono">{c.reference ?? 'Chantier'}</span> · {noms(c)}
                </span>
                <span className="block truncate text-sm font-bold" title={c.motif}>
                  {c.motif}
                </span>
              </div>
              <div className="relative grid items-center border-b border-trait py-1.5" style={{ gridColumn: '2 / -1', gridTemplateColumns: `repeat(${nbj}, minmax(0, 1fr))` }}>
                {fond}
                <Link
                  href={`/interventions/${c.id}`}
                  style={{ gridColumn: `${colonneDe(c.date!)} / ${colonneDe(c.date_fin && c.date_fin > c.date! ? c.date_fin : c.date!) + 1}` }}
                  title={`${c.client} · ${c.motif}${periode(creneau(c)) ? ` · ${periode(creneau(c))}` : ''}`}
                  className={`relative mx-0.5 block truncate rounded-[10px] border border-l-4 px-2 py-1.5 text-xs font-bold transition hover:border-pervenche ${LISERE[c.statut]} ${
                    FINI.includes(c.statut) ? 'border-trait bg-gris-doux text-gris' : 'degrade border-transparent text-white'
                  }`}
                >
                  {c.client}
                </Link>
              </div>
            </div>
          ))}

          {siGagne.map((a) => (
            <div key={a.id} className="contents">
              <div className="min-w-0 border-b border-trait px-4 py-2">
                <span className="block text-[11px] font-bold text-violet">Appel d’offres</span>
                <span className="block truncate text-sm font-bold">si gagné</span>
              </div>
              <div className="relative grid items-center border-b border-trait py-1.5" style={{ gridColumn: '2 / -1', gridTemplateColumns: `repeat(${nbj}, minmax(0, 1fr))` }}>
                {fond}
                <Link
                  href={`/devis/${a.id}`}
                  style={{ gridColumn: `${colonneDe(a.demarrage)} / ${nbj + 1}` }}
                  title={`Réponse attendue le ${jourCourt(a.limite).long} : démarrage possible vers le ${jourCourt(a.demarrage).long}`}
                  className="relative mx-0.5 block truncate rounded-[10px] border border-dashed border-violet bg-violet-doux px-2 py-1.5 text-xs font-bold text-violet transition hover:bg-white"
                >
                  {a.objet}
                  {a.numero ? ` · ${a.numero}` : ''}
                </Link>
              </div>
            </div>
          ))}

          {!chantiers.length && !siGagne.length && (
            <p className="border-b border-trait px-5 py-8 text-center text-gris" style={{ gridColumn: '1 / -1' }}>
              Aucun chantier ce mois-ci. Pour étaler une intervention sur plusieurs jours, indiquez son dernier jour dans son bloc Planning.
            </p>
          )}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-trait px-5 py-2.5 text-xs text-gris">
        <span className="inline-flex items-center gap-1.5">
          <i className="degrade inline-block h-2.5 w-5 rounded" /> Chantier prévu
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-5 rounded bg-gris-doux" /> Terminé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-5 rounded border border-dashed border-violet bg-violet-doux" /> Appel d’offres en cours, démarrage un mois après la remise
        </span>
        <span className="inline-flex items-center gap-1.5">
          <b className="rounded-full bg-bleu-doux px-1.5 text-[10px] text-bleu">2</b> dépannages et entretiens du jour
        </span>
      </p>
    </section>
  );
}
