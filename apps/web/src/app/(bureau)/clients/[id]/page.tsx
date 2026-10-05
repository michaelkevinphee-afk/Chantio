import {
  aDesImmeubles,
  adresseComplete,
  aujourdhui,
  chiffresFiche,
  chosesAFaire,
  eurBac,
  factureAEncaisser,
  factureEnRetard,
  historiqueDe,
  jjmmaaaaBac,
  prochainesDe,
  quandPhrase,
  resteDu,
  resumeClient,
  siteDuDocument,
  type ContactClient,
  type DocumentSuivi,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { LienBouton } from '@/components/ui';
import { chargerContrats } from '@/lib/contrats';
import { contexteBureau } from '@/lib/session';
import { chargerFiche, contratsParClient } from '@/lib/suivi-clients';
import { ajouterOccupant, enregistrerImmeuble, supprimerClient } from '../actions';
import { Annonce, ConfirmationAdresse, FormulaireImmeuble, FormulaireOccupant } from '../fenetres';
import { FormulaireClient, type ClientAModifier } from '../formulaire-client';
import { FenetreNouvelleIntervention } from '../../interventions/nouvelle/fenetre';
import { prechargerVolet, VoletIntervention } from '../../interventions/volet-intervention';
import { messageRetour } from '../messages';
import { Chiffres, EnTete, Historique, LienRetour, OuOnEnEst, Prochaines, SesImmeubles, surFiche, type ClientFiche } from './blocs';

export const metadata = { title: 'Fiche client · Chantio' };

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const eur0 = (n: number) => eurBac(n, 0);
const un = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/** D'où l'on vient (« ← Retour au planning ») : ?depuis=immeubles|planning|accueil, sinon la liste des clients. */
function retourDepuis(depuis: string, site: string): { href: string; libelle: string } {
  if (depuis === 'immeubles') return { href: site ? `/clients/immeubles?site=${encodeURIComponent(site)}` : '/clients/immeubles', libelle: 'Retour aux immeubles' };
  if (depuis === 'planning') return { href: '/planning', libelle: 'Retour au planning' };
  if (depuis === 'accueil') return { href: '/', libelle: 'Retour à Aujourd’hui' };
  return { href: '/clients', libelle: 'Retour à mes clients' };
}

export default async function FicheClient({ params, searchParams }: PageProps<'/clients/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const retour = retourDepuis(un(sp.depuis), un(sp.site));
  const { supabase } = await contexteBureau();

  const [{ data }, { data: lusContacts }, contrats, fiche, { count: nbDocuments }] = await Promise.all([
    supabase.from('clients').select('*, sites(*, occupants(*))').eq('id', id).maybeSingle(),
    supabase.from('contacts_client').select('*').eq('client_id', id).order('cree_le'),
    chargerContrats(supabase, id),
    chargerFiche(supabase, id),
    // Tous les documents, annulés compris : un client qui en a ne peut pas être supprimé.
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ]);

  if (!data) {
    return (
      <div className="flex max-w-[1040px] flex-col gap-4">
        <LienRetour {...retour} />
        <div className="carte flex flex-col items-start gap-3 p-6">
          <h1 className="text-[22px] font-extrabold">Client introuvable</h1>
          <p className="text-gris">Ce client n’existe plus ou vous n’y avez pas accès.</p>
          <LienBouton variante="secondaire" href="/clients">
            Voir mes clients
          </LienBouton>
        </div>
      </div>
    );
  }

  // Immeubles et occupants dans l'ordre où ils ont été ajoutés.
  const brut = data as ClientFiche & { sites: (ClientFiche['sites'][number] & { cree_le?: string })[] };
  const c: ClientFiche = {
    ...brut,
    sites: [...(brut.sites ?? [])]
      .sort((a, b) => (a.cree_le ?? '').localeCompare(b.cree_le ?? ''))
      .map((s) => ({ ...s, occupants: [...(s.occupants ?? [])].sort((a, b) => a.cree_le.localeCompare(b.cree_le)) })),
  };
  const contacts = (lusContacts ?? []) as ContactClient[];
  const ajd = aujourdhui();
  const imms = aDesImmeubles(c.type);
  const I = fiche.interventions;
  const D = fiche.documents;
  const cts = contratsParClient(contrats, ajd).get(id) ?? [];

  // 2. Où on en est
  const liste = chosesAFaire({ id, type: c.type, facturation: c.facturation, immeubles: c.sites.length }, I, D, ajd, cts);
  const actif = I.length > 0 || D.length > 0 || contrats.length > 0;
  const r = resumeClient(liste, actif);
  const somme = (L: DocumentSuivi[]) => L.reduce((s, f) => s + resteDu(f, D), 0);
  const bandeau: { titre: string; phrases: string[] } = { titre: '', phrases: [] };
  if (r.ton === 'rouge') {
    const retard = somme(D.filter((f) => factureAEncaisser(f, D) && factureEnRetard(f, D, ajd)));
    bandeau.titre = `${pluriel(r.urgent, 'chose urgente', 'choses urgentes')}${r.afaire ? ` et ${pluriel(r.afaire, 'autre chose', 'autres choses')} à faire` : ''} pour ce client.`;
    if (retard > 0.005) bandeau.phrases.push(`Factures en retard de paiement : ${eurBac(retard)} TTC.`);
  } else if (r.ton === 'cobalt') {
    bandeau.titre = `${pluriel(r.afaire, 'chose', 'choses')} à faire pour ce client.`;
  } else if (r.ton === 'vert') {
    bandeau.titre = 'Tout est à jour : rien à faire pour l’instant.';
    const pr = prochainesDe(I).find((i) => i.statut === 'en_cours' || (i.date_prevue && (i.date_fin || i.date_prevue) >= ajd));
    if (pr?.statut === 'en_cours') {
      const nbT = pr.techniciens.length;
      const qui = nbT ? pr.techniciens.join(', ') : pr.fiche?.auteur || 'le technicien';
      bandeau.phrases.push(`En ce moment : ${qui}${nbT > 1 ? ' sont' : ' est'} sur place (${pr.motif}).`);
    } else if (pr?.date_prevue) bandeau.phrases.push(`Prochaine intervention : ${quandPhrase(pr, ajd)} (${pr.motif}).`);
    const att = D.filter((f) => factureAEncaisser(f, D) && !factureEnRetard(f, D, ajd));
    if (att.length) {
      const ech = att
        .map((f) => f.echeance)
        .filter(Boolean)
        .sort()[0];
      bandeau.phrases.push(`On attend son paiement : ${eur0(somme(att))} TTC${ech ? ` avant le ${jjmmaaaaBac(ech)}` : ''}.`);
    }
    const env = D.filter((d) => d.genre === 'devis' && d.statut === 'envoye');
    if (env.length) bandeau.phrases.push(`On attend sa réponse sur ${pluriel(env.length, 'devis', 'devis')} (${eur0(env.reduce((s, d) => s + d.total_ht, 0))} HT).`);
  } else {
    bandeau.titre = 'Rien encore avec ce client.';
    bandeau.phrases.push('Commencez par une intervention ou un devis.');
  }

  // 1. En-tête
  const premier = contacts[0];
  const contact = c.contact || (premier ? [premier.nom, premier.fonction].filter(Boolean).join(', ') : null);
  const site0 = c.sites[0] ?? null;
  // Syndic ou bailleur : l'adresse du cabinet ; les autres : leur adresse (le premier immeuble).
  const adresse = imms ? (c.adresse_facturation ?? '') : site0 ? adresseComplete(site0) : (c.adresse_facturation ?? '');
  const contratsTete = imms ? contrats.filter((ct) => !ct.site_id || !c.sites.some((s) => s.id === ct.site_id)) : contrats;
  const lienContrat = (ct: (typeof contrats)[number]) =>
    ct.site_id ? `/clients/immeubles?site=${ct.site_id}&contrat=${ct.id}` : `/clients/immeubles?client=${id}&contrat=${ct.id}`;

  // 6. Ses immeubles : interventions et reste à payer par immeuble
  const interventionsParSite = new Map<string, number>();
  for (const i of I) if (i.site_id) interventionsParSite.set(i.site_id, (interventionsParSite.get(i.site_id) ?? 0) + 1);
  const resteParSite = new Map<string, number>();
  for (const f of D.filter((x) => factureAEncaisser(x, D))) {
    const s = siteDuDocument(f, I, D, contrats);
    if (s) resteParSite.set(s, (resteParSite.get(s) ?? 0) + resteDu(f, D));
  }

  // Fenêtres ouvertes par l'adresse. `ici` garde ?depuis (et son ?site) : on retrouve « ← Retour au planning »
  // en refermant une fenêtre ou le volet d'une intervention.
  const garde = new URLSearchParams();
  if (un(sp.depuis)) garde.set('depuis', un(sp.depuis));
  if (un(sp.depuis) && un(sp.site)) garde.set('site', un(sp.site));
  const ici = `/clients/${id}${garde.size ? `?${garde}` : ''}`;
  const ficheOuverte = un(sp.fiche);
  const nouvelle = sp.nouvelle === '1';
  const moment = un(sp.moment);
  const modifier = un(sp.modifier);
  const immeuble = un(sp.immeuble);
  const occupant = un(sp.occupant);
  const peutSupprimer = !I.length && !nbDocuments && !contrats.length;
  const aModifier: ClientAModifier = {
    id,
    nom: c.nom,
    type: c.type,
    contact: c.contact,
    telephone: c.telephone,
    mobile: c.mobile,
    email: c.email,
    adresse,
    site_id: imms ? null : (site0?.id ?? null),
    siren: c.siren,
    siret: c.siret,
    forme_juridique: c.forme_juridique,
    tva_intracom: c.tva_intracom,
    site_web: c.site_web,
    notes: c.notes,
    facturation: c.facturation,
    contacts: contacts.map((k) => ({ nom: k.nom, fonction: k.fonction ?? '', telephone: k.telephone ?? '', email: k.email ?? '' })),
  };
  const siteImmeuble = immeuble && immeuble !== 'nouveau' ? c.sites.find((s) => s.id === immeuble) : null;
  const siteOccupant = occupant ? c.sites.find((s) => s.id === occupant) : null;
  const villeDe = (s: { code_postal: string | null; ville: string | null } | null) => (s ? [s.code_postal, s.ville].filter(Boolean).join(' ') : '');
  const annonce = messageRetour(sp);

  return (
    <div className="flex max-w-[1040px] min-w-0 flex-col gap-4">
      <LienRetour {...retour} />
      <EnTete c={c} contact={contact} adresse={adresse} contrats={contratsTete} jour={ajd} lienContrat={lienContrat} ici={ici} />
      <OuOnEnEst ton={r.ton} bandeau={bandeau} liste={liste} retour={ici} />
      <Chiffres ch={chiffresFiche(D, ajd, cts)} aDesDocuments={D.length > 0} lienDocuments={D.some((d) => d.genre === 'devis') ? `/devis?client=${id}` : `/factures?client=${id}`} />
      <Prochaines liste={prochainesDe(I)} D={D} imms={imms} jour={ajd} ici={ici} nouvelle={surFiche(ici, { nouvelle: '1', client: id })} />
      <Historique lignes={historiqueDe(I, D)} D={D} imms={imms} jour={ajd} facturation={c.facturation} contrats={cts} ici={ici} />
      {imms && <SesImmeubles c={c} contrats={contrats} interventionsParSite={interventionsParSite} resteParSite={resteParSite} jour={ajd} ici={ici} />}
      <LienRetour {...retour} />

      {modifier && !sp.supprimer && (
        <Fenetre titre={`Modifier ${c.nom}`} fermer={ici} large>
          <FormulaireClient client={aModifier} fermer={ici} peutSupprimer={peutSupprimer} focus={modifier === 'tel' ? 'tel' : undefined} />
        </Fenetre>
      )}
      {sp.supprimer && peutSupprimer && (
        <ConfirmationAdresse
          titre={`Supprimer ${c.nom} ?`}
          texte="Ce client n’a ni intervention, ni document, ni contrat."
          bouton="Supprimer"
          fermer={ici}
          action={supprimerClient.bind(null, id)}
        />
      )}
      {(immeuble === 'nouveau' || siteImmeuble) && (
        <Fenetre titre={siteImmeuble ? `Modifier ${siteImmeuble.adresse}` : `Nouvel immeuble pour ${c.nom}`} fermer={ici}>
          <FormulaireImmeuble
            action={enregistrerImmeuble.bind(null, id, siteImmeuble?.id ?? null, ici)}
            fermer={ici}
            nouveau={!siteImmeuble}
            bailleur={c.type === 'bailleur' ? c.nom : null}
            valeurs={
              siteImmeuble
                ? {
                    adresse: siteImmeuble.adresse,
                    ville: villeDe(siteImmeuble),
                    gardien: siteImmeuble.gardien ?? '',
                    acces: siteImmeuble.acces ?? '',
                    copropriete: siteImmeuble.copropriete ?? '',
                    consignes: siteImmeuble.consignes ?? '',
                  }
                : { adresse: '', ville: villeDe(site0), gardien: '', acces: '', copropriete: '', consignes: '' }
            }
          />
        </Fenetre>
      )}
      {siteOccupant && (
        <Fenetre titre={`Nouvel occupant · ${siteOccupant.adresse}`} fermer={ici}>
          <FormulaireOccupant action={ajouterOccupant.bind(null, siteOccupant.id, ici)} fermer={ici} />
        </Fenetre>
      )}
      {/* Comme le bac : le volet d'une intervention et la fenêtre « Nouvelle intervention » par-dessus la fiche. */}
      {ficheOuverte && <VoletIntervention key={ficheOuverte} id={ficheOuverte} fermer={ici} />}
      {nouvelle && !ficheOuverte && (
        <FenetreNouvelleIntervention
          fermer={ici}
          valeurs={{
            client: un(sp.client) || id,
            site: un(sp.site) || undefined,
            devis: un(sp.devis) || undefined,
            date: un(sp.date) || undefined,
            heure: un(sp.heure) || undefined,
            moment: moment === 'matin' || moment === 'apres-midi' ? moment : undefined,
            technicien: un(sp.technicien) || undefined,
          }}
        />
      )}
      {annonce && <Annonce message={annonce.message} ton={annonce.ton} retirer={annonce.retirer} />}
    </div>
  );
}
