import {
  adresseComplete,
  ajouterJours,
  aujourdhui,
  familleIntervention,
  initiales,
  jourCourt,
  lundiDe,
  nomCourt,
  numeroIntervention,
  numeroSemaine,
  type ConditionsDocument,
} from '@chantio/shared';
import { presentsSurLeTerrain, techniciensTerrain } from '@/components/accueil/techniciens';
import { Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { PARAMS_NOUVELLE } from '../interventions/adresse';
import { etatAffiche } from '../interventions/filtres';
import { FenetreNouvelleIntervention } from '../interventions/nouvelle/fenetre';
import { prechargerVolet, VoletIntervention } from '../interventions/volet-intervention';
import { adressePlanning, lireFamilles } from './adresse';
import { Calendrier, type CarteRdv, type MembrePlanning } from './calendrier';
import { VueMois, type AppelOffresMois } from './mois';
import { BoutonNouvelle } from './outils';
import './planning.css';

export const metadata = { title: 'Planning · Chantio' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** La liste du planning + la dernière fiche envoyée (état « À reprendre »). */
const SELECT_PLANNING = `${SELECT_LISTE}, fiches(envoyee_le)`;
type InterventionPlanning = InterventionListe & { fiches: { envoyee_le: string | null }[] | null };

const chaine = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function PagePlanning({ searchParams }: PageProps<'/planning'>) {
  const { supabase, membre } = await contexteBureau();
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const semaine = chaine(sp.semaine);
  const mois = chaine(sp.mois);
  const jour = aujourdhui();
  const vueMois = mois !== undefined;

  // Semaine du lundi au dimanche, ou mois entier : une intervention compte dès
  // qu'un de ses jours tombe dedans (un chantier commencé avant aussi).
  const premierDuMois = vueMois && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois) ? `${mois}-01` : `${jour.slice(0, 7)}-01`;
  const debut = vueMois ? premierDuMois : lundiDe(semaine && ISO.test(semaine) ? semaine : jour);
  const fin = vueMois ? ajouterJours(`${ajouterJours(premierDuMois, 31).slice(0, 7)}-01`, -1) : ajouterJours(debut, 6);

  const [{ data: dansLaPeriode }, { data: enAttente }, equipe, { data: appels }] = await Promise.all([
    supabase
      .from('interventions')
      .select(SELECT_PLANNING)
      .lte('date_prevue', fin)
      .or(`date_prevue.gte.${debut},date_fin.gte.${debut}`)
      .order('date_prevue')
      .order('heure_prevue'),
    // « À placer au planning » (semaine) : toute intervention à planifier, même datée sans technicien,
    // et toute intervention sans date ni validée ni facturée (règle aPlacer du bac).
    vueMois
      ? Promise.resolve({ data: [] })
      : supabase
          .from('interventions')
          .select(SELECT_PLANNING)
          .not('statut', 'in', '(validee,facturee)')
          .or('statut.eq.a_planifier,date_prevue.is.null')
          .order('souhaitee_le', { nullsFirst: true })
          .order('cree_le')
          .limit(300),
    listerEquipe(supabase),
    // Réponses aux appels d'offres en cours : le chantier possible, si le marché est gagné.
    vueMois
      ? supabase.from('documents').select('id, objet, conditions').eq('genre', 'devis').in('statut', ['brouillon', 'envoye']).eq('conditions->>ao', 'true')
      : Promise.resolve({ data: [] }),
  ]);

  // Ceux qui vont sur le terrain (tous sauf les assistant(e)s), dirigeant d'abord puis dans l'ordre d'arrivée ;
  // leur couleur est la même qu'à l'Accueil et dans les Chiffres.
  const tousTerrain = techniciensTerrain(equipe);

  const carte = (i: InterventionPlanning): CarteRdv => ({
    id: i.id,
    reference: numeroIntervention(i),
    type: i.type,
    famille: familleIntervention(i.type),
    date: i.date_prevue,
    heure: i.heure_prevue?.slice(0, 5) ?? null,
    date_fin: i.date_fin ?? null,
    fin_midi: !!i.fin_midi,
    duree: i.duree_prevue == null ? null : Number(i.duree_prevue),
    souhaitee: i.souhaitee_le ?? null,
    motif: i.motif,
    lieu: i.site?.adresse || i.client?.nom || '',
    adresse: i.site ? adresseComplete(i.site) : (i.client?.nom ?? ''),
    statut: i.statut,
    etat: etatAffiche({ statut: i.statut, description: i.description, fiches: i.fiches }),
    urgence: i.urgence,
    techniciens: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
  });
  // Une intervention datée cette semaine et encore à placer arrive par les deux requêtes : une seule fois.
  const toutes = new Map<string, InterventionPlanning>();
  for (const i of [...(dansLaPeriode ?? []), ...(enAttente ?? [])] as InterventionPlanning[]) toutes.set(i.id, i);
  const cartes = [...toutes.values()].map(carte);
  // Une ligne par technicien comme le bac (techsTerrain : comptes ouverts, pas les invités), plus tout invité
  // qui a une intervention dans la période affichée, pour qu'aucune ne disparaisse du planning.
  const terrain = presentsSurLeTerrain(
    tousTerrain,
    ((dansLaPeriode ?? []) as InterventionPlanning[]).flatMap((i) => i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : []))),
  );

  // Volet d'une intervention et fenêtre de création, par-dessus le planning : on revient à la même
  // semaine (ou au même mois) avec les mêmes familles cochées en les fermant.
  const fiche = chaine(sp.fiche);
  const moment = chaine(sp.moment);
  const fermerFenetre = (() => {
    const p = new URLSearchParams();
    for (const [cle, v] of Object.entries(sp)) if (typeof v === 'string' && !(PARAMS_NOUVELLE as readonly string[]).includes(cle)) p.set(cle, v);
    const qs = p.toString();
    return qs ? `/planning?${qs}` : '/planning';
  })();
  const pardessus = (
    <>
      {fiche && <VoletIntervention key={fiche} id={fiche} fermer={adressePlanning(sp)} />}
      {sp.nouvelle === '1' && (
        <FenetreNouvelleIntervention
          fermer={fermerFenetre}
          valeurs={{
            date: chaine(sp.date),
            heure: chaine(sp.heure),
            moment: moment === 'matin' || moment === 'apres-midi' ? moment : undefined,
            technicien: chaine(sp.technicien),
            client: chaine(sp.client),
            site: chaine(sp.site),
            devis: chaine(sp.devis),
          }}
        />
      )}
    </>
  );

  if (vueMois) {
    const [a, m] = debut.split('-').map(Number);
    return (
      <>
        <Titre texte={`${MOIS[m - 1]} ${a} · les chantiers sur le mois ; le chiffre sous chaque jour compte les dépannages et entretiens.`} actions={<BoutonNouvelle />}>
          Planning
        </Titre>
        <VueMois
          debut={debut}
          fin={fin}
          aujourdhui={jour}
          cartes={cartes}
          noms={new Map(tousTerrain.map((t) => [t.id, nomCourt(t.prenom, t.nom)]))}
          params={sp}
          appels={((appels ?? []) as { id: string; objet: string; conditions: Partial<ConditionsDocument> | null }[]).flatMap((d): AppelOffresMois[] =>
            d.conditions?.aoLimite ? [{ id: d.id, objet: d.objet, limite: d.conditions.aoLimite }] : [],
          )}
        />
        {pardessus}
      </>
    );
  }

  const liens = await liensProfils(
    supabase,
    terrain.map((m) => m.photo_chemin),
  );
  const membres: MembrePlanning[] = terrain.map((m) => ({
    id: m.id,
    prenom: m.prenom,
    nom: nomCourt(m.prenom, m.nom),
    initiales: initiales(m.prenom, m.nom),
    photo: m.photo_chemin ? (liens.get(m.photo_chemin) ?? null) : null,
    couleur: m.couleur,
    heures: Number(m.heures_semaine ?? 35),
    reserve: m.reserve_urgences ?? [],
  }));

  return (
    <>
      <Titre
        texte={`Semaine ${numeroSemaine(debut)} · du ${jourCourt(debut)} au ${jourCourt(ajouterJours(debut, 5))} · chantiers et dépannages dans la même vue, par demi-journée. Glissez une intervention pour la déplacer.`}
        actions={<BoutonNouvelle />}
      >
        Planning
      </Titre>
      <Calendrier
        key={debut}
        lundi={debut}
        aujourdhui={jour}
        dirigeant={membre.role === 'dirigeant'}
        equipe={membres}
        cartes={cartes}
        familles={lireFamilles(sp.familles)}
      />
      {pardessus}
    </>
  );
}
