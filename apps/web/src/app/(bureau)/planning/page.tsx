import { ajouterJours, aujourdhui, initiales, lundiDe } from '@chantio/shared';
import { Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { invitationsActives } from '@/lib/invitations';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { Calendrier, type CarteRdv } from './calendrier';

export const metadata = { title: 'Planning · Chantio' };

export default async function PagePlanning({ searchParams }: PageProps<'/planning'>) {
  const { supabase } = await contexteBureau();
  const { semaine } = await searchParams;
  const jour = aujourdhui();
  const lundi = lundiDe(typeof semaine === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(semaine) ? semaine : jour);
  const dimanche = ajouterJours(lundi, 6);

  const [{ data: dansLaSemaine }, { data: sansDate }, equipe] = await Promise.all([
    supabase.from('interventions').select(SELECT_LISTE).gte('date_prevue', lundi).lte('date_prevue', dimanche).order('heure_prevue'),
    supabase
      .from('interventions')
      .select(SELECT_LISTE)
      .is('date_prevue', null)
      .in('statut', ['a_planifier', 'planifiee'])
      .order('cree_le'),
    listerEquipe(supabase),
  ]);
  const terrain = equipe.filter((m) => m.role !== 'assistant');
  const liens = await liensProfils(supabase, terrain.map((m) => m.photo_chemin));

  const carte = (i: InterventionListe): CarteRdv => ({
    id: i.id,
    date: i.date_prevue,
    heure: i.heure_prevue?.slice(0, 5) ?? null,
    client: i.client?.nom ?? '',
    motif: i.motif,
    ville: i.site?.ville ?? null,
    statut: i.statut,
    urgent: i.urgence !== 'normale',
    techniciens: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
  });

  return (
    <>
      <Titre sous="Glissez une intervention sur un jour et un technicien">Planning</Titre>
      <Calendrier
        lundi={lundi}
        aujourdhui={jour}
        invitations={invitationsActives}
        equipe={terrain.map((m) => ({
          id: m.id,
          prenom: m.prenom,
          nom: m.nom,
          initiales: initiales(m.prenom, m.nom),
          photo: m.photo_chemin ? (liens.get(m.photo_chemin) ?? null) : null,
          email: Boolean(m.email),
        }))}
        cartes={[...((dansLaSemaine ?? []) as InterventionListe[]), ...((sansDate ?? []) as InterventionListe[])].map(carte)}
      />
    </>
  );
}
