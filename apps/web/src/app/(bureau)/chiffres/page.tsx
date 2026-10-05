import {
  ajouterJours,
  aujourdhui,
  chargeSemaine,
  chiffresBureau,
  dossiersPrevuRealise,
  euroBac,
  lundiDe,
  nomCourt,
  numeroIntervention,
  prevuRealise,
  reglagesPrix,
  type InterventionCharge,
  type InterventionLiee,
  type InterventionPrevu,
  type LigneDocument,
} from '@chantio/shared';
import { presentsSurLeTerrain, techniciensTerrain } from '@/components/accueil/techniciens';
import { LienVentes } from '@/components/lien-ventes';
import { Titre } from '@/components/ui';
import { normaliserLigne } from '@/lib/devis';
import { listerEquipe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { prechargerVolet, VoletIntervention } from '../interventions/volet-intervention';
import { CarteCharge, CartePrevu, CarteParType, Tuile, type LignePrevu } from './blocs';
import { chargerMonAnnee } from './annee/donnees';
import { MonAnnee } from './annee/mon-annee';
import { SELECT_DOCUMENTS, versDocument, type DocumentLu } from './documents';
import { OngletsChiffres } from './onglets';

export const metadata = { title: 'Chiffres · Chantio' };

const SELECT_FINIES =
  'id, reference, numero, motif, statut, devis_id, contrat_id, fiches(envoyee_le, duree_minutes, resultat, fournitures(designation, reference, quantite)), contrat:contrats(reference, heures_visite, fournitures_visite, montant_ht, visites_par_an)';
type InterventionFinie = InterventionPrevu & {
  reference: string | null;
  numero: number;
  motif: string;
  contrat: { reference: string | null; heures_visite: number; fournitures_visite: number; montant_ht: number; visites_par_an: number } | null;
};

const FINIES = ['terminee', 'validee', 'facturee'];
const s = (n: number) => (n > 1 ? 's' : '');
const eur0 = (n: number) => euroBac(n, 0);
const chaine = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

/**
 * Chiffres, comme vChiffres() du bac à sable : pour faire le point sur ce qui a été facturé et encaissé,
 * la charge de l'équipe cette semaine et les marges des chantiers (prévu au devis contre réalisé).
 * Une ligne du tableau ouvre le volet de l'intervention par-dessus la page (?fiche=<id>).
 */
export default async function Chiffres({ searchParams }: PageProps<'/chiffres'>) {
  const ctx = await contexteBureau();
  const { supabase, entreprise } = ctx;
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const fiche = chaine(sp.fiche);
  const dirigeant = ctx.membre.role === 'dirigeant';

  // Mon année : le pilotage de l'année (réservé au dirigeant, comme son budget).
  if (dirigeant && chaine(sp.vue) === 'annee') {
    const donnees = await chargerMonAnnee(ctx);
    return (
      <>
        <Titre retour={<LienVentes />} texte="Pour voir où va l’année : production, objectifs, prévision et résultat." actions={<OngletsChiffres actif="annee" />}>
          Chiffres
        </Titre>
        <MonAnnee donnees={donnees} entreprise={entreprise.nom} />
      </>
    );
  }

  const jour = aujourdhui();
  const debutAnnee = `${jour.slice(0, 4)}-01-01`;
  // La veille du 1er du mois : un paiement saisi juste avant minuit (UTC) peut tomber le 1er à Paris.
  const veilleMois = ajouterJours(`${jour.slice(0, 7)}-01`, -1);
  const lundi = lundiDe(jour);
  const semaine = Array.from({ length: 7 }, (_, k) => ajouterJours(lundi, k));
  const rp = reglagesPrix(entreprise.facturation);

  const [
    { data: docsLus },
    equipe,
    { data: planifiees },
    { data: finies },
    { data: signes },
    { data: liees },
    { data: contrats },
    { data: titres },
    { data: catalogue },
  ] = await Promise.all([
    // Factures et avoirs de l'année, tout ce qui est à encaisser, payé ce mois-ci, les avoirs, les devis en attente.
    supabase
      .from('documents')
      .select(SELECT_DOCUMENTS)
      .neq('statut', 'annule')
      .or(`date_document.gte.${debutAnnee},statut.in.(envoye,a_encaisser),paye_le.gte.${veilleMois},type_facture.eq.avoir`)
      .limit(5000),
    listerEquipe(supabase),
    supabase
      .from('interventions')
      .select('type, date_prevue, heure_prevue, date_fin, fin_midi, duree_prevue, affectations(membre_id)')
      .lte('date_prevue', semaine[6])
      .or(`date_prevue.gte.${lundi},date_fin.gte.${lundi}`),
    // Interventions terminées venues d'un devis ou d'un contrat (les autres liens sont lus plus bas).
    supabase
      .from('interventions')
      .select(SELECT_FINIES)
      .in('statut', FINIES)
      .or('devis_id.not.is.null,contrat_id.not.is.null')
      .order('modifie_le', { ascending: false })
      .limit(200),
    // Devis signés : le « prévu » des interventions (créées depuis eux, ou d'où ils viennent).
    supabase.from('documents').select('id, statut, intervention_id:conditions->>intervention_id').eq('genre', 'devis').eq('statut', 'signe').limit(3000),
    // Interventions créées depuis un devis : elles disent le type de ses factures.
    supabase.from('interventions').select('id, type, contrat_id, devis_id').not('devis_id', 'is', null).limit(5000),
    supabase.from('contrats').select('renouvellement_id').not('renouvellement_id', 'is', null),
    // Un document avec des lots est un chantier.
    supabase.from('lignes_document').select('document_id').eq('titre', true).limit(10000),
    supabase.from('articles').select('designation, reference, prix_achat'),
  ]);

  // --- Les documents, et ceux qu'il faut en plus pour classer les factures : devis d'origine, facture d'un avoir.
  const documents = ((docsLus ?? []) as unknown as DocumentLu[]).map(versDocument);
  const connus = new Set(documents.map((d) => d.id));
  const manquants = [
    ...new Set(documents.flatMap((d) => [d.devis_id, d.type_facture === 'avoir' ? d.facture_id : null]).filter((id): id is string => !!id && !connus.has(id))),
  ];
  const signesLus = (signes ?? []) as { id: string; statut: 'signe'; intervention_id: string | null }[];
  const interventionsLiees = (liees ?? []) as InterventionLiee[];
  const finiesLues = (finies ?? []) as unknown as InterventionFinie[];
  const vues = new Set(interventionsLiees.map((i) => i.id));
  const dejaFinies = new Set(finiesLues.map((i) => i.id));
  const [{ data: autresDocs }, { data: autresInterventions }, { data: autresFinies }] = await Promise.all([
    manquants.length ? supabase.from('documents').select(SELECT_DOCUMENTS).in('id', manquants.slice(0, 300)) : Promise.resolve({ data: [] }),
    // Interventions d'où viennent des documents (conditions.intervention_id) et pas encore lues.
    (() => {
      const ids = [...new Set(documents.flatMap((d) => (d.conditions?.intervention_id ? [d.conditions.intervention_id] : [])))].filter((id) => !vues.has(id));
      return ids.length ? supabase.from('interventions').select('id, type, contrat_id, devis_id').in('id', ids.slice(0, 300)) : Promise.resolve({ data: [] });
    })(),
    // Interventions terminées d'où vient un devis signé (sans devis_id ni contrat).
    (() => {
      const ids = [...new Set(signesLus.flatMap((d) => (d.intervention_id ? [d.intervention_id] : [])))].filter((id) => !dejaFinies.has(id));
      return ids.length ? supabase.from('interventions').select(SELECT_FINIES).in('statut', FINIES).in('id', ids.slice(0, 200)) : Promise.resolve({ data: [] });
    })(),
  ]);
  const tous = [...documents, ...((autresDocs ?? []) as unknown as DocumentLu[]).map(versDocument)];
  const chiffres = chiffresBureau(
    tous,
    {
      interventions: [...interventionsLiees, ...((autresInterventions ?? []) as InterventionLiee[])],
      renouvellements: ((contrats ?? []) as { renouvellement_id: string }[]).map((c) => c.renouvellement_id),
      avecLots: ((titres ?? []) as { document_id: string }[]).map((t) => t.document_id),
    },
    jour,
  );

  // --- Charge de la semaine : les membres de terrain (dirigeant compris), par famille d'intervention, dans l'ordre
  // de l'Accueil et du Planning ; comme le bac (techsTerrain), sans les invités qui n'ont rien cette semaine.
  const semaineLue = (planifiees ?? []) as InterventionCharge[];
  const terrain = presentsSurLeTerrain(
    techniciensTerrain(equipe),
    semaineLue.flatMap((i) => i.affectations.map((a) => a.membre_id)),
  );
  const charge = chargeSemaine(terrain, semaineLue, semaine).map((c) => ({
    id: c.membre.id,
    nom: nomCourt(c.membre.prenom, c.membre.nom),
    heures: c.heures,
    total: c.total,
    dispo: c.dispo,
    taux: c.taux,
  }));

  // --- Prévu au devis contre réalisé : une ligne par intervention terminée, avec son devis signé ou son contrat.
  const dossiers = dossiersPrevuRealise(
    [...finiesLues, ...((autresFinies ?? []) as unknown as InterventionFinie[])],
    signesLus.map((d) => ({ id: d.id, statut: d.statut, conditions: { intervention_id: d.intervention_id } })),
  );
  const devisIds = [...new Set(dossiers.flatMap((d) => (d.source.genre === 'devis' ? [d.source.id] : [])))];
  const { data: devisLus } = devisIds.length
    ? await supabase.from('documents').select('id, remise, lignes:lignes_document(*)').in('id', devisIds)
    : { data: [] };
  const devis = new Map(
    ((devisLus ?? []) as { id: string; remise: number | null; lignes: Record<string, unknown>[] | null }[]).map((d) => [
      d.id,
      { remise: Number(d.remise) || 0, lignes: (d.lignes ?? []).map(normaliserLigne).sort((a, b) => a.position - b.position) as LigneDocument[] },
    ]),
  );
  const prix = (catalogue ?? []) as { designation: string; reference: string | null; prix_achat: number | null }[];
  const lignesPrevu: LignePrevu[] = dossiers.flatMap(({ intervention: i, source, minutes, pieces }) => {
    let base: { lignes: LigneDocument[]; remise: number } | undefined;
    if (source.genre === 'devis') base = devis.get(source.id);
    else if (i.contrat) {
      // Une visite du contrat : heures et fournitures d'une visite, vendue au montant annuel divisé par les visites.
      const c = i.contrat;
      base = {
        remise: 0,
        lignes: [
          {
            designation: 'Visite d’entretien',
            quantite: 1,
            unite: 'visite',
            prix_unitaire: (Number(c.montant_ht) || 0) / Math.max(1, c.visites_par_an),
            tva: 20,
            achat: Number(c.fournitures_visite) || 0,
            heures: Number(c.heures_visite) || 0,
          },
        ],
      };
    }
    if (!base) return [];
    return [{ id: i.id, numero: numeroIntervention(i), motif: i.motif, lien: `/chiffres?fiche=${i.id}`, pr: prevuRealise(base, { minutes, pieces }, prix, rp) }];
  });

  return (
    <>
      <Titre
        retour={<LienVentes />}
        texte="Pour faire le point : ce qui a été facturé et encaissé, la charge de l’équipe et les marges des chantiers."
        actions={dirigeant ? <OngletsChiffres actif="point" /> : undefined}
      >
        Chiffres
      </Titre>

      <div className="flex flex-col gap-4">
        <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 min-[1081px]:grid-cols-4">
          <Tuile libelle="Facturé depuis janvier" valeur={eur0(chiffres.factureHT)} aide="hors taxes, avoirs déduits" />
          <Tuile libelle="Encaissé ce mois-ci" valeur={eur0(chiffres.encaisseMois)} aide="TTC" />
          <Tuile
            libelle="Reste à encaisser"
            valeur={eur0(chiffres.resteAEncaisser)}
            aide={`TTC · ${chiffres.aEncaisser} facture${s(chiffres.aEncaisser)}${chiffres.enRetard ? `, dont ${chiffres.enRetard} en retard` : ''}`}
            rouge={chiffres.enRetard > 0}
            href="/factures?filtre=a_encaisser"
          />
          <Tuile
            libelle="Devis en attente de réponse"
            valeur={eur0(chiffres.devisAttenteHT)}
            aide={`hors taxes · ${chiffres.devisAttente} devis`}
            href="/devis?filtre=attente"
          />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 menu:grid-cols-2">
          <CarteCharge lignes={charge} />
          <CarteParType parType={chiffres.parType} />
        </div>

        <CartePrevu lignes={lignesPrevu} coutHoraire={rp.cout_horaire} fraisGeneraux={rp.frais_generaux} />
      </div>

      {fiche && <VoletIntervention key={fiche} id={fiche} fermer="/chiffres" />}
    </>
  );
}
