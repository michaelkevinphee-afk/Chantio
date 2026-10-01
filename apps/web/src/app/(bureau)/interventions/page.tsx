import Link from 'next/link';
import {
  LIBELLE_STATUT,
  LIBELLE_TYPE,
  dateCourte,
  heure,
  numero,
  type StatutIntervention,
} from '@chantio/shared';
import { LienBouton, Puce, PuceStatut, Titre, Vide } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';

export const metadata = { title: 'Interventions · Chantio' };

const FILTRES: (StatutIntervention | 'toutes')[] = [
  'toutes',
  'a_planifier',
  'planifiee',
  'en_cours',
  'terminee',
  'a_reprendre',
  'validee',
  'facturee',
];

export default async function Interventions({ searchParams }: PageProps<'/interventions'>) {
  const { supabase } = await contexteBureau();
  const { statut, q } = await searchParams;
  const filtre = typeof statut === 'string' && FILTRES.includes(statut as StatutIntervention) ? statut : 'toutes';
  const recherche = typeof q === 'string' ? q.trim() : '';

  let requete = supabase
    .from('interventions')
    .select(SELECT_LISTE)
    .order('date_prevue', { ascending: false, nullsFirst: true })
    .order('heure_prevue')
    .limit(200);
  if (filtre !== 'toutes') requete = requete.eq('statut', filtre);
  if (recherche) requete = requete.ilike('motif', `%${recherche.replace(/[%_]/g, '')}%`);
  const { data } = await requete;
  const liste = (data ?? []) as InterventionListe[];

  const lien = (s: string) => {
    const p = new URLSearchParams();
    if (s !== 'toutes') p.set('statut', s);
    if (recherche) p.set('q', recherche);
    const qs = p.toString();
    return qs ? `/interventions?${qs}` : '/interventions';
  };

  return (
    <>
      <Titre actions={<LienBouton href="/interventions/nouvelle">+ Nouvelle intervention</LienBouton>}>
        Interventions
      </Titre>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTRES.map((f) => (
          <Link
            key={f}
            href={lien(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              f === filtre ? 'bg-marine text-white' : 'border border-trait bg-white hover:border-marine'
            }`}
          >
            {f === 'toutes' ? 'Toutes' : LIBELLE_STATUT[f]}
          </Link>
        ))}
        <form className="ml-auto">
          {filtre !== 'toutes' && <input type="hidden" name="statut" value={filtre} />}
          <input name="q" defaultValue={recherche} placeholder="Rechercher un motif…" className="champ w-56 py-1.5" />
        </form>
      </div>

      {liste.length === 0 ? (
        <Vide titre="Aucune intervention">Créez la première avec le bouton « Nouvelle intervention ».</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-trait text-left text-xs uppercase text-gris">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Motif</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Technicien</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {liste.map((i) => (
                <tr key={i.id} className="hover:bg-beton">
                  <td className="px-4 py-3 font-mono text-xs text-gris">
                    <Link href={`/interventions/${i.id}`}>{numero(i.numero)}</Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {dateCourte(i.date_prevue)} {heure(i.heure_prevue)}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/interventions/${i.id}`} className="hover:underline">
                      {i.client?.nom}
                    </Link>
                    {i.site?.ville && <span className="block text-xs font-normal text-gris">{i.site.ville}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {i.motif} {i.urgence !== 'normale' && <Puce ton="rouge">{i.urgence === 'urgente' ? 'Urgent' : 'Astreinte'}</Puce>}
                  </td>
                  <td className="px-4 py-3">{LIBELLE_TYPE[i.type]}</td>
                  <td className="px-4 py-3">{techniciens(i)}</td>
                  <td className="px-4 py-3">
                    <PuceStatut statut={i.statut} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
