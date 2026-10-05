import { aDesImmeubles, ajouterMois, aujourdhui, eurBac, initialesClient, siteDuDocument } from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { LienVentes } from '@/components/lien-ventes';
import { LienBouton, Titre } from '@/components/ui';
import {
  SELECT_CLIENTS_BATIMENTS,
  chargerContrats,
  construireBatiments,
  etatBac,
  lienBatiment,
  pireEtat,
  suivreContrat,
  type Batiment,
  type ClientBatiments,
} from '@/lib/contrats';
import { contexteBureau } from '@/lib/session';
import { FenetreNouvelleIntervention } from '../../interventions/nouvelle/fenetre';
import { prechargerVolet, VoletIntervention } from '../../interventions/volet-intervention';
import { chargerFiche } from '@/lib/suivi-clients';
import { enregistrerEquipement, retirerEquipement } from '../actions';
import { supprimerContrat } from '../contrats/actions';
import { FormulaireContrat, type ContratAModifier } from '../contrats/formulaire-contrat';
import { Annonce, ConfirmationAdresse } from '../fenetres';
import { messageRetour } from '../messages';
import { Bascule, OngletsClients } from '../onglets';
import { CarteContrat, EnTeteBatiment, Echeancier, Equipements, HistoriqueBatiment, Tuile } from './blocs';
import { DefilerVers, FormulaireEquipement, ListeBatiments } from './interactif';

export const metadata = { title: 'Immeubles et contrats · Chantio' };

const un = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
/** L'adresse avec des paramètres en plus (ou remplacés). */
function avec(url: string, params: Record<string, string>): string {
  const [chemin, qs = ''] = url.split('?');
  const p = new URLSearchParams(qs);
  for (const [cle, v] of Object.entries(params)) p.set(cle, v);
  return `${chemin}?${p}`;
}
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
/** Valeur du bâtiment dans la fenêtre « Contrat » : une adresse, ou le client sans adresse. */
const valeurBatiment = (b: Pick<Batiment, 'site' | 'client'>) => (b.site ? `s:${b.site.id}` : `c:${b.client.id}`);

export default async function Immeubles({ searchParams }: PageProps<'/clients/immeubles'>) {
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const echeancier = un(sp.vue) === 'echeancier';
  const { supabase } = await contexteBureau();
  const [contrats, { data }] = await Promise.all([chargerContrats(supabase), supabase.from('clients').select(SELECT_CLIENTS_BATIMENTS).order('nom')]);
  const clients = (data ?? []) as unknown as ClientBatiments[];
  const bs = construireBatiments(clients, contrats);
  const jour = aujourdhui();

  // Le bâtiment ouvert : ?site=, ?client= (le client sans adresse, sinon son premier bâtiment), ?contrat=, sinon le premier.
  // Après la création d'une intervention (?fiche=<id> sans ?site), celui de l'intervention.
  const ficheOuverte = un(sp.fiche);
  let site = un(sp.site);
  let client = un(sp.client);
  if (ficheOuverte && !site && !client) {
    const { data: iv } = await supabase.from('interventions').select('site_id, client_id').eq('id', ficheOuverte).maybeSingle();
    site = (iv?.site_id as string | null) ?? '';
    client = site ? '' : ((iv?.client_id as string | null) ?? '');
  }
  const contratVise = un(sp.contrat);
  const ct0 = contratVise ? contrats.find((c) => c.id === contratVise) : undefined;
  const b0 =
    (site && bs.find((b) => b.site?.id === site)) ||
    (client && (bs.find((b) => b.cle === `client:${client}`) ?? bs.find((b) => b.client.id === client))) ||
    (ct0 && bs.find((b) => b.contrats.some((c) => c.id === ct0.id))) ||
    bs[0] ||
    null;

  // Adresse de la page sans les fenêtres : on y revient en les fermant.
  const ici = b0 ? lienBatiment(b0, echeancier ? { vue: 'echeancier' } : {}) : echeancier ? '/clients/immeubles?vue=echeancier' : '/clients/immeubles';

  // « Nouvelle intervention » : la fenêtre s'ouvre par-dessus la page, client et immeuble déjà choisis (comme le bac).
  const nouvelleIci = b0 ? avec(ici, { nouvelle: '1', client: b0.client.id, ...(b0.site ? { site: b0.site.id } : {}) }) : '';
  const moment = un(sp.moment);

  // Tuiles du haut
  const ca = contrats.reduce((s, c) => s + c.montant_ht, 0);
  const etats = contrats.map((c) => etatBac(c, jour));
  const aRenouveler = etats.filter((e) => e.etiquette === 'À renouveler' || e.etiquette === 'Préavis dépassé').length;
  const visites30 = contrats.reduce(
    (s, c) =>
      s +
      suivreContrat(c, jour).visites.filter((v) => {
        const j = ecart(jour, v.date);
        return j >= -5 && j <= 30;
      }).length,
    0,
  );
  const nbEquipements = bs.reduce((s, b) => s + (b.site?.equipements.length ?? 0), 0);

  // Historique du bâtiment ouvert : interventions à cette adresse, devis et factures qui s'y rapportent.
  let histo: Awaited<ReturnType<typeof chargerFiche>> = { interventions: [], documents: [] };
  if (b0 && !echeancier) {
    const f = await chargerFiche(supabase, b0.client.id);
    const ctsClient = contrats.filter((c) => c.client_id === b0.client.id);
    const unSeulLieu = !aDesImmeubles(b0.client.type) && b0.client.sites.length <= 1;
    const lieu = (d: (typeof f.documents)[number]) => siteDuDocument(d, f.interventions, f.documents, ctsClient);
    histo = b0.site
      ? {
          interventions: f.interventions.filter((i) => i.site_id === b0.site!.id || (unSeulLieu && !i.site_id)),
          documents: f.documents.filter((d) => {
            const s = lieu(d);
            return s === b0.site!.id || (unSeulLieu && !s);
          }),
        }
      : { interventions: f.interventions.filter((i) => !i.site_id), documents: f.documents.filter((d) => !lieu(d)) };
  }

  // Fenêtres ouvertes par l'adresse
  const nouveau = !!sp.nouveau;
  const aModifier = un(sp.modifier) ? contrats.find((c) => c.id === un(sp.modifier)) : undefined;
  const aSupprimer = un(sp.supprimer) ? contrats.find((c) => c.id === un(sp.supprimer)) : undefined;
  const equipement = un(sp.equipement);
  const eqModifie = equipement && equipement !== 'nouveau' ? b0?.site?.equipements.find((q) => q.id === equipement) : undefined;
  const choixBatiments: [string, string][] = bs.map((b) => [valeurBatiment(b), `${b.nom} · ${b.client.nom}`]);
  // Nouveau contrat : il commence le 1er du mois prochain (comme le bac).
  const premierDuMoisProchain = ajouterMois(`${jour.slice(0, 7)}-01`, 1);
  const batimentDe = (id: string) => bs.find((b) => b.contrats.some((c) => c.id === id));
  const annonce = messageRetour(sp);

  const versContrat = (c: (typeof contrats)[number]): ContratAModifier => ({
    id: c.id,
    reference: c.reference,
    objet: c.objet,
    debut: c.debut,
    fin: c.fin,
    preavis_mois: c.preavis_mois,
    tacite: c.tacite,
    montant_ht: c.montant_ht,
    visites_par_an: c.visites_par_an,
    derniere_visite: c.derniere_visite,
    fournitures_visite: c.fournitures_visite,
    heures_visite: c.heures_visite,
    notes: c.notes,
  });

  return (
    <>
      <Titre
        retour={<LienVentes />}
        texte="Les immeubles de vos syndics et bailleurs : contrats d’entretien, renouvellements, visites, équipements, historique."
        actions={
          <>
            <LienBouton variante="secondaire" href={avec(ici, { nouveau: '1' })} scroll={false}>
              Nouveau contrat
            </LienBouton>
            {b0 && (
              <LienBouton href={nouvelleIci} scroll={false} prefetch={false}>
                Nouvelle intervention
              </LienBouton>
            )}
          </>
        }
      >
        Mes clients
      </Titre>
      <OngletsClients actif="immeubles" />

      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid grid-cols-4 gap-3 max-[1080px]:grid-cols-2">
          <Tuile libelle="Contrats d’entretien" valeur={contrats.length} sous={`${eurBac(ca, 0)}\u00a0HT par an`} />
          <Tuile libelle="À renouveler" valeur={aRenouveler} rouge={aRenouveler > 0} sous="préavis dans moins de 90 jours" />
          <Tuile libelle="Visites dans les 30 jours" valeur={visites30} sous="planifiées ou à planifier" />
          <Tuile libelle="Équipements suivis" valeur={nbEquipements} sous={`sur ${bs.length} bâtiment${bs.length > 1 ? 's' : ''}`} />
        </div>

        <Bascule
          etiquette="Immeubles et contrats"
          actif={echeancier ? 'echeancier' : 'immeubles'}
          className="self-start scroll-mt-24"
          onglets={[
            { cle: 'immeubles', libelle: 'Immeubles', href: b0 ? lienBatiment(b0) : '/clients/immeubles' },
            { cle: 'echeancier', libelle: 'Échéancier des contrats', href: b0 ? lienBatiment(b0, { vue: 'echeancier' }) : '/clients/immeubles?vue=echeancier' },
          ]}
        />

        {echeancier ? (
          <Echeancier contrats={contrats} jour={jour} />
        ) : !b0 ? (
          <div className="carte p-4">
            <p className="p-2.5 text-center text-[13px] text-gris">
              Aucun immeuble. Ajoutez-en un depuis la fiche d’un syndic (onglet « Clients »), ou créez un contrat pour un client.
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-[260px_minmax(0,1fr)] items-start gap-4 max-[900px]:grid-cols-1">
            <ListeBatiments
              actif={b0.cle}
              items={bs.map((b) => ({
                cle: b.cle,
                href: lienBatiment(b),
                initiales: initialesClient(b.nom.replace(/^\d+\s+/, '')),
                nom: b.nom,
                client: b.client.nom,
                etat: pireEtat(b, jour),
              }))}
            />
            <div id="fiche-batiment" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
              <EnTeteBatiment
                b={b0}
                nouvelleIntervention={nouvelleIci}
                nouveauContrat={avec(ici, { nouveau: '1' })}
              />
              {b0.contrats.map((c) => (
                <CarteContrat key={c.id} c={c} jour={jour} modifier={avec(ici, { modifier: c.id })} enAvant={c.id === contratVise} retour={ici} />
              ))}
              {!b0.contrats.length && (
                <div className="carte p-4">
                  <p className="text-gris">Pas de contrat d’entretien sur ce bâtiment.</p>
                </div>
              )}
              <div className="grid min-w-0 grid-cols-2 items-start gap-4 max-menu:grid-cols-1">
                <Equipements b={b0} jour={jour} lien={(q) => avec(ici, { equipement: q })} />
                <HistoriqueBatiment interventions={histo.interventions} documents={histo.documents} lien={(id) => avec(ici, { fiche: id })} />
              </div>
            </div>
            {ct0 && b0.contrats.some((c) => c.id === ct0.id) && <DefilerVers id={`ct-${ct0.id}`} />}
          </div>
        )}
      </div>

      {(nouveau || aModifier) && !aSupprimer && (
        <Fenetre titre={aModifier ? `Modifier le contrat ${aModifier.reference ?? ''}` : 'Nouveau contrat d’entretien'} fermer={ici} large>
          <FormulaireContrat
            contrat={aModifier ? versContrat(aModifier) : null}
            batiments={choixBatiments}
            batiment={aModifier ? valeurBatiment(batimentDe(aModifier.id) ?? { site: null, client: b0?.client ?? clients[0] }) : b0 ? valeurBatiment(b0) : ''}
            clientsSansImmeubles={clients.filter((k) => !aDesImmeubles(k.type)).map((k) => ({ id: k.id, nom: k.nom }))}
            debutPropose={premierDuMoisProchain}
            derniereProposee={jour}
            fermer={ici}
            lienSupprimer={aModifier ? avec(ici, { supprimer: aModifier.id }) : undefined}
          />
        </Fenetre>
      )}
      {aSupprimer && (
        <ConfirmationAdresse
          titre={`Supprimer le contrat ${aSupprimer.reference ?? ''} ?`}
          texte="Les interventions déjà créées restent."
          bouton="Supprimer"
          fermer={ici}
          action={supprimerContrat.bind(null, aSupprimer.id)}
        />
      )}
      {b0?.site && (equipement === 'nouveau' || eqModifie) && (
        <Fenetre titre={eqModifie ? 'Modifier l’équipement' : `Nouvel équipement · ${b0.nom}`} fermer={ici}>
          <FormulaireEquipement
            action={enregistrerEquipement.bind(null, b0.site.id, eqModifie?.id ?? null, ici)}
            fermer={ici}
            retirer={eqModifie ? retirerEquipement.bind(null, eqModifie.id, ici) : undefined}
            valeurs={{
              categorie: eqModifie?.categorie ?? '',
              detail: eqModifie ? [eqModifie.marque, eqModifie.modele].filter(Boolean).join(' · ') : '',
              dernier: eqModifie?.dernier_passage ?? '',
              prochain: eqModifie?.prochain_passage ?? '',
              obligation: eqModifie?.obligation ?? '',
            }}
          />
        </Fenetre>
      )}
      {/* Comme le bac : le volet d'une intervention et la fenêtre « Nouvelle intervention » par-dessus la page. */}
      {ficheOuverte && <VoletIntervention key={ficheOuverte} id={ficheOuverte} fermer={ici} />}
      {sp.nouvelle === '1' && !ficheOuverte && (
        <FenetreNouvelleIntervention
          fermer={ici}
          valeurs={{
            client: un(sp.client) || b0?.client.id,
            site: un(sp.site) || undefined,
            date: un(sp.date) || undefined,
            heure: un(sp.heure) || undefined,
            moment: moment === 'matin' || moment === 'apres-midi' ? moment : undefined,
            technicien: un(sp.technicien) || undefined,
          }}
        />
      )}
      {annonce && <Annonce message={annonce.message} ton={annonce.ton} retirer={annonce.retirer} />}
    </>
  );
}
