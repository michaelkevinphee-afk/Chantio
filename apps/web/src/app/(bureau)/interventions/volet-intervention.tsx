import {
  LIBELLE_RESULTAT,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  TON_FAMILLE,
  aDesImmeubles,
  adresseComplete,
  aujourdhui,
  familleIntervention,
  initialesClient,
  jjmmaaaaBac,
  nomCourt,
  numeroIntervention,
  payeurTexte,
  peutValider,
  prevuRealise,
  reglagesPrix,
  surPlusieursJours,
  type Client,
  type Fourniture,
  type Intervention,
  type LigneDocument,
  type Membre,
  type Occupant,
  type Site,
} from '@chantio/shared';
import { cache } from 'react';
import { Puce, PuceStatut } from '@/components/ui';
import { Volet } from '@/components/volet';
import { lireDocument } from '@/lib/devis';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, nomsCourts } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { etatAffiche, heureParis, messageRenvoi, quandTexte } from './filtres';
import { AnnoncesVolet, BoutonDocument, BoutonEtat, BoutonRenvoyer, BoutonSupprimer } from './volet/boutons';
import { ClientLieu } from './volet/client-lieu';
import { Demande } from './volet/demande';
import { DocumentsLies, type DocumentLie } from './volet/documents';
import { FicheTechnicien, type FicheComplete } from './volet/fiche-technicien';
import { Planification } from './volet/planification';
import { PourTechnicien } from './volet/pour-technicien';
import { PrevuRealise } from './volet/prevu-realise';
import { BANDEAU, type TonBandeau } from './volet/styles';

type Detail = Intervention & {
  client: Pick<Client, 'id' | 'nom' | 'type' | 'contact' | 'telephone' | 'mobile' | 'email'> | null;
  site:
    | (Pick<Site, 'id' | 'adresse' | 'code_postal' | 'ville' | 'acces' | 'consignes' | 'gardien' | 'copropriete'> & {
        occupants: Pick<Occupant, 'id' | 'nom' | 'lot' | 'telephone'>[];
      })
    | null;
  occupant: Pick<Occupant, 'id' | 'nom' | 'lot' | 'telephone'> | null;
  affectations: { membre: Pick<Membre, 'id' | 'prenom' | 'nom' | 'photo_chemin'> | null }[];
  contrat: {
    id: string;
    reference: string | null;
    objet: string;
    client_id: string;
    site_id: string | null;
    heures_visite: number;
    fournitures_visite: number;
    montant_ht: number;
    visites_par_an: number;
  } | null;
};

const SELECT_VOLET =
  '*, client:clients(id, nom, type, contact, telephone, mobile, email), site:sites(id, adresse, code_postal, ville, acces, consignes, gardien, copropriete, occupants(id, nom, lot, telephone)), occupant:occupants(id, nom, lot, telephone), affectations(membre:membres(id, prenom, nom, photo_chemin)), contrat:contrats(id, reference, objet, client_id, site_id, heures_visite, fournitures_visite, montant_ht, visites_par_an)';
const SELECT_DOCUMENT = 'id, genre, type_facture, numero, statut, objet, total_ht, echeance, situation_numero, cree_le';

const cle = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * « Voir la fiche client » : comme le bac, la fiche ouverte depuis l'Accueil, le Planning ou les immeubles
 * propose « ← Retour à Aujourd’hui », « ← Retour au planning » ou « ← Retour aux immeubles ».
 */
function lienFicheClient(client: string, fermer: string): string {
  const [chemin, qs = ''] = fermer.split('?');
  const site = new URLSearchParams(qs).get('site');
  const depuis = chemin === '/' ? 'accueil' : chemin === '/planning' ? 'planning' : chemin === '/clients/immeubles' ? 'immeubles' : null;
  if (!depuis) return `/clients/${client}`;
  return `/clients/${client}?depuis=${depuis}${depuis === 'immeubles' && site ? `&site=${encodeURIComponent(site)}` : ''}`;
}

/**
 * Tout ce qu'affiche le volet d'une intervention, lu une seule fois par requête (React cache).
 * Les pages qui l'affichent l'appellent dès le début (prechargerVolet) : la fiche se lit en même temps
 * que la page au lieu d'attendre qu'elle soit prête.
 */
const chargerVolet = cache(async (id: string) => {
  const { supabase } = await contexteBureau();
  const [{ data }, { data: fichesBrutes }, equipe, { data: parConditions }, { data: catalogue }, { data: arrivees }] = await Promise.all([
    supabase.from('interventions').select(SELECT_VOLET).eq('id', id).maybeSingle(),
    supabase.from('fiches').select('*, fournitures(*), medias(*)').eq('intervention_id', id).order('cree_le'),
    listerEquipe(supabase),
    supabase.from('documents').select(SELECT_DOCUMENT).filter('conditions->>intervention_id', 'eq', id),
    supabase.from('articles').select('designation, reference, prix_achat'),
    supabase.from('pointages').select('le').eq('intervention_id', id).eq('genre', 'arrivee').order('le', { ascending: false }).limit(1),
  ]);
  const devisId = (data as { devis_id?: string | null } | null)?.devis_id;
  const { data: parDevis } = devisId
    ? await supabase.from('documents').select(SELECT_DOCUMENT).or(`id.eq.${devisId},devis_id.eq.${devisId}`)
    : { data: [] };
  return { data, fichesBrutes, equipe, parConditions, catalogue, arrivees, parDevis };
});

/** Lance la lecture du volet ?fiche=<id> sans l'attendre (à appeler en tête de page). */
export function prechargerVolet(id: string | undefined) {
  if (id) void chargerVolet(id).catch(() => {});
}

/**
 * Volet d'une intervention, comme le bac : tout s'y lit et s'y modifie (chaque changement s'enregistre seul),
 * et toutes les actions s'y trouvent. Affiché par-dessus la page avec ?fiche=<id> (Interventions, Planning, Accueil) ;
 * `fermer` = l'adresse de la page sans la fiche.
 */
export async function VoletIntervention({ id, fermer }: { id: string; fermer: string }) {
  const { supabase, membre, entreprise } = await contexteBureau();
  const jour = aujourdhui();
  const { data, fichesBrutes, equipe, parConditions, catalogue, arrivees, parDevis } = await chargerVolet(id);

  if (!data) {
    return (
      <Volet fermer={fermer} titre="Intervention introuvable" blanc>
        <p className="text-gris">Elle a peut-être été supprimée.</p>
      </Volet>
    );
  }
  const i = data as Detail;
  const fiches = (fichesBrutes ?? []) as FicheComplete[];
  const derniere = fiches.at(-1) ?? null;
  const envoyees = fiches.filter((f) => f.envoyee_le);
  const reference = numeroIntervention(i);
  const etat = etatAffiche({ statut: i.statut, description: i.description, fiches });
  const famille = familleIntervention(i.type);
  const immeuble = !!i.client && aDesImmeubles(i.client.type) && !!i.site;
  const valideur = peutValider(membre.role);

  // Devis et factures liés : le devis d'où vient l'intervention et ses factures, et tout document préparé depuis elle.
  const documents = [...new Map([...(parDevis ?? []), ...(parConditions ?? [])].map((d) => [d.id as string, d])).values()].sort(
    (a, b) => String(a.cree_le).localeCompare(String(b.cree_le)),
  ) as (DocumentLie & { cree_le: string })[];
  const devisLies = documents.filter((d) => d.genre === 'devis' && d.statut !== 'refuse');
  // « Le technicien demande un devis » : tant qu'aucun nouveau devis n'a été préparé depuis sa fiche.
  const depuis = derniere?.envoyee_le ?? derniere?.cree_le ?? '';
  const devisDemande =
    derniere?.resultat === 'devis_a_etablir' && !devisLies.some((d) => d.id !== i.devis_id && String(d.cree_le) >= String(depuis));

  // Prix d'achat des pièces (réservé au bureau) : article du catalogue, par référence puis par désignation.
  const articles = (catalogue ?? []) as { designation: string; reference: string | null; prix_achat: number | null }[];
  const prixAchat = (p: Fourniture) => {
    const a =
      (p.reference?.trim() && articles.find((x) => x.reference && cle(x.reference) === cle(p.reference))) ||
      articles.find((x) => cle(x.designation) === cle(p.designation));
    return a && Number(a.prix_achat) > 0 ? Number(a.prix_achat) : null;
  };

  // Prévu contre réalisé : d'après le devis signé (sauf s'il a été demandé après la visite), ou une visite du contrat.
  const rp = reglagesPrix(entreprise.facturation);
  const devisSigne = i.devis_id && derniere?.resultat !== 'devis_a_etablir' ? documents.find((d) => d.id === i.devis_id && d.statut === 'signe') : undefined;
  let prevu: { pr: ReturnType<typeof prevuRealise>; source: string } | null = null;
  if (envoyees.length && (devisSigne || i.contrat)) {
    const realise = {
      minutes: envoyees.reduce((t, f) => t + (f.duree_minutes ?? 0), 0),
      pieces: envoyees.flatMap((f) => f.fournitures.map((p) => ({ designation: p.designation, reference: p.reference, quantite: Number(p.quantite) }))),
    };
    if (devisSigne) {
      const lu = await lireDocument(supabase, devisSigne.id);
      if (lu) prevu = { pr: prevuRealise({ lignes: lu.lignes, remise: lu.document.remise }, realise, articles, rp), source: `le devis ${lu.document.numero ?? 'brouillon'}` };
    } else if (i.contrat) {
      const c = i.contrat;
      const ligne: LigneDocument = {
        designation: 'Visite d’entretien',
        quantite: 1,
        unite: 'visite',
        prix_unitaire: (Number(c.montant_ht) || 0) / Math.max(1, c.visites_par_an),
        tva: 20,
        achat: Number(c.fournitures_visite) || 0,
        heures: Number(c.heures_visite) || 0,
      };
      prevu = { pr: prevuRealise({ lignes: [ligne], remise: 0 }, realise, articles, rp), source: `le contrat ${c.reference ?? ''}`.trim() };
    }
  }

  // Liens temporaires (1 h) : photos des fiches (stockage privé) et photos de profil.
  const chemins = fiches.flatMap((f) => f.medias.map((m) => m.chemin));
  const urls = new Map<string, string>();
  const intervenants = equipe.filter((m) => m.role !== 'assistant');
  const [{ data: signees }, profils] = await Promise.all([
    chemins.length ? supabase.storage.from('medias').createSignedUrls(chemins, 3600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    liensProfils(supabase, intervenants.map((m) => m.photo_chemin)),
  ]);
  signees?.forEach((s) => s.signedUrl && s.path && urls.set(s.path, s.signedUrl));

  // Auteur de la fiche : un membre de l'équipe, sinon un ancien membre.
  const auteurId = derniere?.auteur_id;
  let auteur = auteurId ? equipe.find((m) => m.id === auteurId) : undefined;
  if (auteurId && !auteur) {
    const { data: ancien } = await supabase.from('membres').select('*').eq('id', auteurId).maybeSingle();
    auteur = (ancien as Membre | null) ?? undefined;
  }
  const techniciens = nomsCourts(i);
  const techs = techniciens === 'Personne' ? 'son technicien' : techniciens;

  // Bandeaux d'action selon l'état.
  const bandeaux: { ton: TonBandeau; titre?: string; texte?: string; boutons?: React.ReactNode }[] = [];
  if (etat === 'terminee') {
    bandeaux.push({
      ton: 'violet',
      titre: `Fiche envoyée${auteur ? ` par ${nomCourt(auteur.prenom, auteur.nom)}` : ''}${derniere?.envoyee_le ? ` ${quandTexte(derniere.envoyee_le, jour)}` : ''}.`,
      texte: 'Vérifiez-la puis validez-la, ou renvoyez-la au technicien.',
      boutons: valideur ? (
        <>
          <BoutonEtat id={i.id} reference={reference} action="valider">
            Valider la fiche
          </BoutonEtat>
          <BoutonRenvoyer id={i.id} reference={reference} techniciens={techs} />
        </>
      ) : (
        <span className="text-[12.5px] text-gris">La validation est réservée au dirigeant et au chef de chantier.</span>
      ),
    });
  } else if (etat === 'a_reprendre') {
    const motifBureau = messageRenvoi(i.description);
    const r = derniere?.resultat;
    const motifTech = r && r !== 'termine' ? `${LIBELLE_RESULTAT[r]}${derniere?.valeurs?.a_prevoir ? ` : ${derniere.valeurs.a_prevoir}` : ''}.` : '';
    bandeaux.push({
      ton: 'rouge',
      titre: 'À reprendre par le technicien.',
      texte: (i.statut === 'a_reprendre' ? motifTech : motifBureau) || undefined,
      // Fiche renvoyée « à reprendre » par le technicien lui-même : le bureau peut encore la valider.
      boutons:
        valideur && i.statut === 'a_reprendre' ? (
          <BoutonEtat id={i.id} reference={reference} action="valider" second>
            Valider la fiche
          </BoutonEtat>
        ) : undefined,
    });
  } else if (etat === 'validee') {
    bandeaux.push({
      ton: 'vert',
      titre: 'Fiche validée, prête à facturer.',
      boutons: (
        <>
          <BoutonDocument id={i.id} genre="facture">
            Créer la facture
          </BoutonDocument>
          <BoutonEtat id={i.id} reference={reference} action="facturer" second>
            Marquer facturée
          </BoutonEtat>
          {valideur && <BoutonRenvoyer id={i.id} reference={reference} techniciens={techs} />}
        </>
      ),
    });
  } else if (etat === 'a_planifier') {
    bandeaux.push({
      ton: 'gris',
      texte: i.date_prevue
        ? `Prévue le ${jjmmaaaaBac(i.date_prevue)} : choisissez un technicien ci-dessous.`
        : `À placer au planning : choisissez une date et un technicien ci-dessous${i.souhaitee_le ? ` (visite souhaitée le ${jjmmaaaaBac(i.souhaitee_le)})` : ''}.`,
    });
  } else if (etat === 'en_cours') {
    const debut = derniere && !derniere.envoyee_le ? derniere.debut : (arrivees?.[0]?.le as string | undefined);
    bandeaux.push({ ton: 'cobalt', titre: `En cours${debut ? ` depuis ${heureParis(debut)}` : ''}.`, texte: `${techniciens} remplit la fiche sur son téléphone.` });
  }
  if (devisDemande) {
    bandeaux.push({
      ton: 'violet',
      titre: 'Le technicien demande un devis.',
      texte: derniere?.valeurs?.a_prevoir || undefined,
      boutons: (
        <BoutonDocument id={i.id} genre="devis">
          Créer le devis
        </BoutonDocument>
      ),
    });
  }

  // Contact sur place : l'occupant à appeler, sinon le contact du client.
  const contact = i.occupant && !/^parties communes/i.test(i.occupant.nom)
    ? { nom: i.occupant.nom, telephone: i.occupant.telephone ?? '', source: 'Repris de l’occupant à appeler.' }
    : {
        nom: i.client?.contact || i.client?.nom || '',
        telephone: i.client?.mobile || i.client?.telephone || '',
        source: i.client ? 'Repris de la fiche du client.' : '',
      };
  const detailLieu = [i.site?.gardien && `Gardien : ${i.site.gardien}`, i.site?.acces, i.site?.consignes].filter(Boolean).join(' · ');
  const lienContrat = i.contrat
    ? `/clients/immeubles?${i.contrat.site_id ? `site=${i.contrat.site_id}` : `client=${i.contrat.client_id}`}&contrat=${i.contrat.id}`
    : null;
  const modifiable = ['a_planifier', 'planifiee', 'en_cours', 'a_reprendre'].includes(i.statut);
  const supprimable = membre.role === 'dirigeant' && !['validee', 'facturee'].includes(i.statut);

  return (
    <Volet
      fermer={fermer}
      blanc
      titre={<span className="font-mono text-[21px] font-semibold tracking-normal text-cobalt">{reference}</span>}
      dessous={
        <span className="flex flex-wrap gap-1.5">
          <Puce ton={TON_FAMILLE[famille]}>{LIBELLE_TYPE[i.type]}</Puce>
          <PuceStatut statut={etat} />
          {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
        </span>
      }
    >
      <AnnoncesVolet reference={reference} aPlacer={i.statut === 'a_planifier'} />
      <div className="flex flex-col gap-3.5">
        {bandeaux.map((b, n) => (
          <div key={n} className={`flex flex-col gap-2 rounded-xl px-3.5 py-3 text-[13.5px] ${BANDEAU[b.ton]}`}>
            {b.titre && <b className="font-extrabold">{b.titre}</b>}
            {b.texte && <span>{b.texte}</span>}
            {b.boutons && <div className="flex flex-wrap items-center gap-2">{b.boutons}</div>}
          </div>
        ))}

        <Demande
          id={i.id}
          motif={i.motif}
          urgence={i.urgence}
          contrat={i.contrat && lienContrat ? { lien: lienContrat, texte: `${i.contrat.reference ?? 'Contrat'} · ${i.contrat.objet}` } : null}
        />

        <ClientLieu
          id={i.id}
          reference={reference}
          client={
            i.client
              ? {
                  id: i.client.id,
                  nom: i.client.nom,
                  initiales: initialesClient(i.client.nom),
                  contact: [i.client.contact, i.client.telephone || i.client.mobile].filter(Boolean).join(' · '),
                  lien: lienFicheClient(i.client.id, fermer),
                }
              : null
          }
          adresse={adresseComplete(i.site)}
          detailLieu={detailLieu}
          immeuble={immeuble}
          occupants={[...(i.site?.occupants ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(({ id: oid, nom, lot }) => ({ id: oid, nom, lot }))}
          occupantId={i.occupant_id}
          ordreService={i.ordre_service}
          payeur={payeurTexte(i.client, i.site)}
        />

        <Planification
          interventionId={i.id}
          chantier={i.type === 'chantier' || surPlusieursJours(i)}
          modifiable={modifiable}
          equipe={intervenants.map((m) => ({
            id: m.id,
            prenom: m.prenom,
            nom: m.nom,
            photo: m.photo_chemin ? (profils.get(m.photo_chemin) ?? null) : null,
            invite: !m.user_id,
          }))}
          initial={{
            date_prevue: i.date_prevue,
            heure_prevue: i.heure_prevue?.slice(0, 5) ?? null,
            date_fin: i.date_fin ?? null,
            fin_midi: !!i.fin_midi,
            duree_prevue: i.duree_prevue == null ? null : Number(i.duree_prevue),
            techniciens: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
          }}
        />

        <PourTechnicien id={i.id} description={i.description} contact={contact} />

        <FicheTechnicien fiches={fiches} urls={urls} prixAchat={prixAchat} />

        {prevu && <PrevuRealise pr={prevu.pr} source={prevu.source} />}

        <DocumentsLies id={i.id} documents={documents} jour={jour} enAvant={!devisDemande} />

        <section className="flex flex-wrap items-center gap-2">
          {supprimable && <BoutonSupprimer id={i.id} reference={reference} documents={documents.length} retour={fermer} />}
          {i.statut === 'facturee' && (
            <BoutonEtat id={i.id} reference={reference} action="annuler" second>
              Annuler la facturation
            </BoutonEtat>
          )}
          <small className="ml-auto text-[12.5px] text-gris">Créée {quandTexte(i.cree_le, jour)}</small>
        </section>
      </div>
    </Volet>
  );
}

