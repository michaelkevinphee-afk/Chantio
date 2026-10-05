import { redirect } from 'next/navigation';
import {
  aDesImmeubles,
  adresseComplete,
  aujourdhui,
  chosesAFaire,
  initialesClient,
  resumeClient,
  type Client,
  type Site,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { LienVentes } from '@/components/lien-ventes';
import { LienBouton, Titre } from '@/components/ui';
import { chargerContrats } from '@/lib/contrats';
import { contexteBureau } from '@/lib/session';
import { chargerSuivi } from '@/lib/suivi-clients';
import { FormulaireClient } from './formulaire-client';
import { ListeClients, type CarteClient } from './liste';
import { OngletsClients } from './onglets';

export const metadata = { title: 'Mes clients · Chantio' };

type ClientListe = Client & {
  sites: (Pick<Site, 'adresse' | 'code_postal' | 'ville'> & { occupants: { nom: string; lot: string | null }[] | null })[];
  contacts_client: { nom: string; fonction: string | null }[] | null;
  interventions: { count: number }[];
  documents: { count: number }[];
};

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
/** Les numéros ne se coupent pas en fin de ligne (telTexte du bac). */
const telTexte = (t: string) => t.replace(/ /g, ' ');

export default async function Clients({ searchParams }: PageProps<'/clients'>) {
  const { fiche, nouveau } = await searchParams;
  // Anciennes adresses de la fiche (volet) : elle a maintenant sa page.
  if (typeof fiche === 'string' && fiche) redirect(`/clients/${encodeURIComponent(fiche)}`);

  const { supabase } = await contexteBureau();
  const contrats = await chargerContrats(supabase);
  const [{ data }, suivi] = await Promise.all([
    supabase
      .from('clients')
      .select('*, sites(adresse, code_postal, ville, occupants(nom, lot)), contacts_client(nom, fonction), interventions(count), documents(count)')
      .neq('documents.statut', 'annule')
      .order('nom'),
    chargerSuivi(supabase, undefined, contrats, { tout: true }),
  ]);
  const clients = (data ?? []) as ClientListe[];
  const ajd = aujourdhui();

  const cartes = clients.map((c): CarteClient => {
    const imms = aDesImmeubles(c.type);
    const cts = suivi.contrats.get(c.id) ?? [];
    const liste = chosesAFaire(
      { id: c.id, type: c.type, facturation: c.facturation, immeubles: c.sites.length },
      suivi.interventions.get(c.id) ?? [],
      suivi.documents.get(c.id) ?? [],
      ajd,
      cts,
    );
    const actif = (c.interventions[0]?.count ?? 0) > 0 || (c.documents[0]?.count ?? 0) > 0 || cts.length > 0;
    const premier = c.contacts_client?.[0];
    const contact = c.contact || (premier ? [premier.nom, premier.fonction].filter(Boolean).join(', ') : '');
    const tel = c.mobile || c.telephone;
    const sous = [contact, tel && telTexte(tel)].filter(Boolean) as string[];
    if (imms) sous.push(c.sites.length ? pluriel(c.sites.length, 'immeuble', 'immeubles') : 'aucun immeuble');
    // Syndic ou bailleur : ses adresses sont des immeubles (« Trouvé : … ») ; sinon, c'est son adresse.
    const adresse = imms ? c.adresse_facturation : [c.adresse_facturation, ...c.sites.map((s) => adresseComplete(s))].filter(Boolean).join(' ');
    return {
      id: c.id,
      nom: c.nom,
      type: c.type,
      initiales: initialesClient(c.nom),
      sous: sous.join(' · '),
      etat: resumeClient(liste, actif),
      aDesImmeubles: imms,
      texte: [c.nom, contact, ...(c.contacts_client ?? []).map((k) => k.nom), adresse, c.siren, c.telephone, c.mobile, c.email].filter(Boolean).join(' '),
      immeubles: imms ? c.sites.map((s) => ({ ...s, occupants: s.occupants ?? [] })) : [],
    };
  });

  return (
    <>
      <Titre
        retour={<LienVentes />}
        texte="Choisissez un client pour voir sa fiche : ce qu’il y a à faire, ses interventions et son chiffre."
        actions={
          <LienBouton href="/clients?nouveau=1" scroll={false}>
            Nouveau client
          </LienBouton>
        }
      >
        Mes clients
      </Titre>
      {/* Les onglets n'apparaissent qu'une fois qu'il y a des clients (ou des immeubles), comme dans le bac. */}
      {clients.length > 0 && <OngletsClients actif="clients" />}
      <ListeClients cartes={cartes} />

      {nouveau && (
        <Fenetre titre="Nouveau client" fermer="/clients" large>
          <FormulaireClient fermer="/clients" />
        </Fenetre>
      )}
    </>
  );
}
