import {
  LIBELLE_TYPE,
  aDesImmeubles,
  aujourdhui,
  familleIntervention,
  numeroIntervention,
  quandLigneIntervention,
} from '@chantio/shared';
import { Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { nomsCourts, SELECT_LISTE_INTERVENTIONS, type InterventionListeComplete } from '@/lib/requetes';
import { PARAMS_FICHE, PARAMS_NOUVELLE } from './adresse';
import { BoutonNouvelle } from './bouton-nouvelle';
import { etatAffiche, lireFiltre, lirePeriode, lireType } from './filtres';
import { ListeInterventions, type LigneIntervention } from './liste';
import { FenetreNouvelleIntervention } from './nouvelle/fenetre';
import { prechargerVolet, VoletIntervention } from './volet-intervention';
import './interventions.css';

export const metadata = { title: 'Interventions · Chantio' };

const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const chaine = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function Interventions({ searchParams }: PageProps<'/interventions'>) {
  const { supabase } = await contexteBureau();
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const filtre = lireFiltre(sp.statut);
  const recherche = chaine(sp.q)?.trim() ?? '';
  const type = lireType(sp.type);
  const periode = lirePeriode(sp.periode);
  const jour = aujourdhui();

  // Tout est chargé une fois (les 2000 plus récentes) : filtres et recherche se font ensuite dans le navigateur.
  // Avec une recherche dans l'adresse, les plus anciennes qui y répondent sont ajoutées.
  const motCle = recherche.replace(/[,()%*\\:"']/g, ' ').trim();
  const [{ data }, { data: anciennes }, { data: devis }] = await Promise.all([
    supabase.from('interventions').select(SELECT_LISTE_INTERVENTIONS).order('date_prevue', { ascending: false, nullsFirst: true }).limit(2000),
    motCle
      ? supabase
          .from('interventions')
          .select(SELECT_LISTE_INTERVENTIONS)
          .or(`motif.ilike.%${motCle}%,reference.ilike.%${motCle}%,ordre_service.ilike.%${motCle}%`)
          .limit(300)
      : Promise.resolve({ data: [] }),
    // Devis préparés depuis une intervention (pour la puce « Devis à établir »).
    supabase.from('documents').select('id, cree_le, intervention:conditions->>intervention_id').eq('genre', 'devis').not('conditions->>intervention_id', 'is', null),
  ]);
  const toutes = [...new Map([...(data ?? []), ...(anciennes ?? [])].map((i) => [i.id as string, i as InterventionListeComplete])).values()];
  const devisPar = new Map<string, { id: string; cree_le: string }[]>();
  for (const d of (devis ?? []) as { id: string; cree_le: string; intervention: string | null }[]) {
    if (d.intervention) devisPar.set(d.intervention, [...(devisPar.get(d.intervention) ?? []), d]);
  }

  const lignes: LigneIntervention[] = toutes.map((i) => {
    const reference = numeroIntervention(i);
    const derniere = [...(i.fiches ?? [])].sort((a, b) => a.cree_le.localeCompare(b.cree_le)).at(-1);
    const depuis = derniere?.envoyee_le ?? derniere?.cree_le ?? '';
    const immeuble = !!i.client && aDesImmeubles(i.client.type);
    const occupant = i.occupant?.nom ?? (immeuble && i.site ? 'Parties communes' : '');
    const techniciens = nomsCourts(i);
    return {
      id: i.id,
      reference,
      etat: etatAffiche({ statut: i.statut, description: i.description, fiches: i.fiches }),
      famille: familleIntervention(i.type),
      libelleType: LIBELLE_TYPE[i.type],
      motif: i.motif,
      sousMotif: [i.client?.nom, i.ordre_service && `ordre de service ${i.ordre_service}`, i.contrat?.reference && `contrat ${i.contrat.reference}`]
        .filter(Boolean)
        .join(' · '),
      lieu: i.site?.adresse ?? '',
      occupant,
      quand: quandLigneIntervention(i, jour),
      aPlacer: !i.date_prevue,
      techniciens,
      urgence: i.urgence,
      devisAEtablir:
        derniere?.resultat === 'devis_a_etablir' && !(devisPar.get(i.id) ?? []).some((d) => d.id !== i.devis_id && d.cree_le >= depuis),
      date_prevue: i.date_prevue,
      date_fin: i.date_fin ?? null,
      recherche: sansAccent(
        [reference, i.motif, i.client?.nom, i.site?.adresse, i.site?.code_postal, i.site?.ville, i.occupant?.nom, i.ordre_service, i.contrat?.reference, techniciens].join(' '),
      ),
    };
  });

  // Adresse de la page sans le volet, ou sans la fenêtre de création : là où l'on revient en les fermant.
  const sans = (cles: readonly string[]) => {
    const p = new URLSearchParams();
    for (const [cle, v] of Object.entries(sp)) if (typeof v === 'string' && !cles.includes(cle)) p.set(cle, v);
    const qs = p.toString();
    return qs ? `/interventions?${qs}` : '/interventions';
  };
  const fiche = chaine(sp.fiche);
  const moment = chaine(sp.moment);

  return (
    <>
      <Titre
        texte="Toutes les interventions : à planifier, planifiées, fiches à valider, terminées. La recherche retrouve aussi les plus anciennes."
        actions={<BoutonNouvelle />}
      >
        Interventions
      </Titre>
      <ListeInterventions
        lignes={lignes}
        filtreInitial={filtre}
        rechercheInitiale={recherche}
        typeInitial={type}
        periodeInitiale={periode}
        jour={jour}
      />

      {fiche && <VoletIntervention key={fiche} id={fiche} fermer={sans([...PARAMS_FICHE, ...PARAMS_NOUVELLE])} />}
      {sp.nouvelle === '1' && (
        <FenetreNouvelleIntervention
          fermer={sans(PARAMS_NOUVELLE)}
          valeurs={{
            client: chaine(sp.client),
            site: chaine(sp.site),
            devis: chaine(sp.devis),
            date: chaine(sp.date),
            heure: chaine(sp.heure),
            moment: moment === 'matin' || moment === 'apres-midi' ? moment : undefined,
            technicien: chaine(sp.technicien),
          }}
        />
      )}
    </>
  );
}
