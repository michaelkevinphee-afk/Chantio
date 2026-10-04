import { ajouterJours, aujourdhui, initiales, lundiDe, type ConditionsDocument } from '@chantio/shared';
import { Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { invitationsActives } from '@/lib/invitations';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { Calendrier, type CarteRdv } from './calendrier';
import { VueMois, type AppelOffresMois } from './mois';

export const metadata = { title: 'Planning · Chantio' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function PagePlanning({ searchParams }: PageProps<'/planning'>) {
  const { supabase, membre } = await contexteBureau();
  const { semaine, mois } = await searchParams;
  const jour = aujourdhui();
  const vueMois = typeof mois === 'string';

  // Semaine du lundi au dimanche, ou mois entier : une intervention compte dès
  // qu'un de ses jours tombe dedans (un chantier commencé avant aussi).
  const premierDuMois = vueMois && /^\d{4}-\d{2}$/.test(mois) ? `${mois}-01` : `${jour.slice(0, 7)}-01`;
  const debut = vueMois ? premierDuMois : lundiDe(typeof semaine === 'string' && ISO.test(semaine) ? semaine : jour);
  const fin = vueMois ? ajouterJours(`${ajouterJours(premierDuMois, 31).slice(0, 7)}-01`, -1) : ajouterJours(debut, 6);

  const [{ data: dansLaPeriode }, { data: sansDate }, equipe, { data: appels }] = await Promise.all([
    supabase
      .from('interventions')
      .select(SELECT_LISTE)
      .lte('date_prevue', fin)
      .or(`date_prevue.gte.${debut},date_fin.gte.${debut}`)
      .order('date_prevue')
      .order('heure_prevue'),
    vueMois
      ? Promise.resolve({ data: [] })
      : supabase.from('interventions').select(SELECT_LISTE).is('date_prevue', null).in('statut', ['a_planifier', 'planifiee']).order('cree_le'),
    listerEquipe(supabase),
    // Réponses aux appels d'offres en cours : le chantier possible, si le marché est gagné.
    vueMois
      ? supabase.from('documents').select('id, numero, objet, conditions').eq('genre', 'devis').in('statut', ['brouillon', 'envoye']).eq('conditions->>ao', 'true')
      : Promise.resolve({ data: [] }),
  ]);
  const terrain = equipe.filter((m) => m.role !== 'assistant');

  const carte = (i: InterventionListe): CarteRdv => ({
    id: i.id,
    reference: i.reference,
    type: i.type,
    date: i.date_prevue,
    heure: i.heure_prevue?.slice(0, 5) ?? null,
    date_fin: i.date_fin ?? null,
    fin_midi: !!i.fin_midi,
    duree: i.duree_prevue == null ? null : Number(i.duree_prevue),
    client: i.client?.nom ?? '',
    motif: i.motif,
    ville: i.site?.ville ?? null,
    statut: i.statut,
    urgent: i.urgence !== 'normale',
    techniciens: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
  });
  const cartes = [...((dansLaPeriode ?? []) as InterventionListe[]), ...((sansDate ?? []) as InterventionListe[])].map(carte);

  if (vueMois) {
    return (
      <>
        <Titre sous="Les chantiers du mois, et ce qui arrive si un appel d’offres est gagné">Planning</Titre>
        <VueMois
          debut={debut}
          fin={fin}
          aujourdhui={jour}
          cartes={cartes}
          equipe={terrain.map((m) => ({ id: m.id, prenom: m.prenom }))}
          appels={((appels ?? []) as { id: string; numero: string | null; objet: string; conditions: Partial<ConditionsDocument> | null }[]).flatMap(
            (d): AppelOffresMois[] => (d.conditions?.aoLimite ? [{ id: d.id, numero: d.numero, objet: d.objet, limite: d.conditions.aoLimite }] : []),
          )}
        />
      </>
    );
  }

  const liens = await liensProfils(supabase, terrain.map((m) => m.photo_chemin));
  return (
    <>
      <Titre sous="Glissez une intervention sur une demi-journée et un technicien">Planning</Titre>
      <Calendrier
        lundi={debut}
        aujourdhui={jour}
        invitations={invitationsActives}
        dirigeant={membre.role === 'dirigeant'}
        equipe={terrain.map((m) => ({
          id: m.id,
          prenom: m.prenom,
          nom: m.nom,
          initiales: initiales(m.prenom, m.nom),
          photo: m.photo_chemin ? (liens.get(m.photo_chemin) ?? null) : null,
          heures: Number(m.heures_semaine ?? 35),
          reserve: m.reserve_urgences ?? [],
        }))}
        cartes={cartes}
      />
    </>
  );
}
