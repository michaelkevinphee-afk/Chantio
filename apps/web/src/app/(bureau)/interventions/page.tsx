import type { StatutIntervention } from '@chantio/shared';
import { LienBouton, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';
import { FILTRES, ListeInterventions } from './liste';

export const metadata = { title: 'Interventions · Chantio' };

export default async function Interventions({ searchParams }: PageProps<'/interventions'>) {
  const { supabase } = await contexteBureau();
  const { statut, q } = await searchParams;
  const filtre = typeof statut === 'string' && FILTRES.includes(statut as StatutIntervention) ? (statut as StatutIntervention) : 'toutes';
  const recherche = typeof q === 'string' ? q.trim() : '';

  // Tout est chargé une fois : filtres et recherche se font ensuite dans le navigateur, sans attente.
  const { data } = await supabase
    .from('interventions')
    .select(SELECT_LISTE)
    .order('date_prevue', { ascending: false, nullsFirst: true })
    .order('heure_prevue')
    .limit(500);
  const liste = (data ?? []) as InterventionListe[];

  return (
    <>
      <Titre actions={<LienBouton href="/interventions/nouvelle">+ Nouvelle intervention</LienBouton>}>
        Interventions
      </Titre>
      <ListeInterventions
        filtreInitial={filtre}
        rechercheInitiale={recherche}
        lignes={liste.map((i) => ({
          id: i.id,
          numero: i.numero,
          statut: i.statut,
          date_prevue: i.date_prevue,
          heure_prevue: i.heure_prevue,
          client: i.client?.nom ?? '',
          ville: i.site?.ville ?? null,
          motif: i.motif,
          type: i.type,
          urgence: i.urgence,
          techniciens: techniciens(i),
        }))}
      />
    </>
  );
}
