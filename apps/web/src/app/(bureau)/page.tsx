import Link from 'next/link';
import { adresseComplete, aujourdhui, dateLongue, heure, type StatutIntervention } from '@chantio/shared';
import { PuceStatut, Titre, Vide } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';

export const metadata = { title: 'Tableau de bord · Chantio' };

const COMPTEURS: { statut: StatutIntervention; libelle: string; accent?: boolean }[] = [
  { statut: 'a_planifier', libelle: 'À planifier' },
  { statut: 'planifiee', libelle: 'Planifiées' },
  { statut: 'en_cours', libelle: 'En cours' },
  { statut: 'terminee', libelle: 'À valider', accent: true },
  { statut: 'a_reprendre', libelle: 'À reprendre', accent: true },
  { statut: 'validee', libelle: 'À facturer' },
];

export default async function TableauDeBord() {
  const { supabase, membre } = await contexteBureau();
  const jour = aujourdhui();

  const [{ data: statuts }, { data: duJour }, { data: aValider }] = await Promise.all([
    supabase.from('interventions').select('statut').neq('statut', 'facturee'),
    supabase.from('interventions').select(SELECT_LISTE).eq('date_prevue', jour).order('heure_prevue'),
    supabase
      .from('interventions')
      .select(SELECT_LISTE)
      .in('statut', ['terminee', 'a_reprendre'])
      .order('modifie_le', { ascending: false })
      .limit(8),
  ]);

  const compte = (s: StatutIntervention) => (statuts ?? []).filter((x) => x.statut === s).length;
  const jourListe = (duJour ?? []) as InterventionListe[];
  const validerListe = (aValider ?? []) as InterventionListe[];

  return (
    <>
      <Titre sous={<span className="inline-block first-letter:uppercase">{dateLongue(jour)}</span>}>Bonjour {membre.prenom}</Titre>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COMPTEURS.map((c) => {
          const n = compte(c.statut);
          return (
            <Link
              key={c.statut}
              href={`/interventions?statut=${c.statut}`}
              className={`carte p-4 transition hover:border-marine ${c.accent && n ? 'border-jaune bg-jaune-doux' : ''}`}
            >
              <p className="font-titre text-5xl font-extrabold leading-none text-marine">{n}</p>
              <p className="mt-1 text-sm font-semibold text-gris">{c.libelle}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-titre text-2xl font-extrabold uppercase">Aujourd’hui</h2>
          {jourListe.length === 0 ? (
            <Vide titre="Rien de prévu aujourd’hui" />
          ) : (
            <ul className="carte divide-y divide-trait">
              {jourListe.map((i) => (
                <li key={i.id}>
                  <Link href={`/interventions/${i.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-beton">
                    <span className="w-14 font-titre text-xl font-bold">{heure(i.heure_prevue) || '—'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{i.client?.nom}</span>
                      <span className="block truncate text-sm text-gris">
                        {i.motif} · {techniciens(i)}
                      </span>
                    </span>
                    <PuceStatut statut={i.statut} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-titre text-2xl font-extrabold uppercase">Fiches à valider</h2>
          {validerListe.length === 0 ? (
            <Vide titre="Tout est à jour">Les fiches envoyées par les techniciens apparaîtront ici.</Vide>
          ) : (
            <ul className="carte divide-y divide-trait">
              {validerListe.map((i) => (
                <li key={i.id}>
                  <Link href={`/interventions/${i.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-beton">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {i.client?.nom} · {i.motif}
                      </span>
                      <span className="block truncate text-sm text-gris">
                        {adresseComplete(i.site)} · {techniciens(i)}
                      </span>
                    </span>
                    <PuceStatut statut={i.statut} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
