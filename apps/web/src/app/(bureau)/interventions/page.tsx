import { aujourdhui, LIBELLE_TYPE, type StatutIntervention, type TypeIntervention } from '@chantio/shared';
import { LienBouton, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';
import { adresse } from './adresse';
import { FILTRES, PERIODES, type Periode } from './filtres';
import { ListeInterventions } from './liste';
import { VoletIntervention } from './volet-intervention';

export const metadata = { title: 'Interventions · Chantio' };

export default async function Interventions({ searchParams }: PageProps<'/interventions'>) {
  const { supabase } = await contexteBureau();
  const { statut, q, fiche, type, periode } = await searchParams;
  const filtre = typeof statut === 'string' && FILTRES.includes(statut as StatutIntervention) ? (statut as StatutIntervention) : 'toutes';
  const recherche = typeof q === 'string' ? q.trim() : '';
  const typeChoisi = typeof type === 'string' && type in LIBELLE_TYPE ? (type as TypeIntervention) : 'tous';
  const periodeChoisie = PERIODES.find(([v]) => v === periode)?.[0] ?? ('toutes' as Periode);

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
        typeInitial={typeChoisi}
        periodeInitiale={periodeChoisie}
        jour={aujourdhui()}
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

      {typeof fiche === 'string' && (
        <VoletIntervention
          key={fiche}
          id={fiche}
          fermer={adresse({ statut: filtre, q: recherche, type: typeChoisi, periode: periodeChoisie })}
        />
      )}
    </>
  );
}
