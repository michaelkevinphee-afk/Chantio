import { adresseComplete, aujourdhui, chosesAFaire, resumeClient, type Client, type Site } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { LienBouton, Titre } from '@/components/ui';
import { Volet } from '@/components/volet';
import { contexteBureau } from '@/lib/session';
import { chargerSuivi } from '@/lib/suivi-clients';
import { FormulaireClient } from './formulaire-client';
import { ListeClients } from './liste';
import { OngletsClients } from './onglets';
import { VoletClient } from './volet-client';

export const metadata = { title: 'Clients · Chantio' };

type ClientListe = Client & {
  sites: (Pick<Site, 'adresse' | 'code_postal' | 'ville'> & { occupants: { nom: string; lot: string | null }[] })[];
  interventions: { count: number }[];
};

export default async function Clients({ searchParams }: PageProps<'/clients'>) {
  const { supabase } = await contexteBureau();
  const { fiche, nouveau, cree } = await searchParams;
  const [{ data }, suivi] = await Promise.all([
    supabase.from('clients').select('*, sites(adresse, code_postal, ville, occupants(nom, lot)), interventions(count)').order('nom'),
    chargerSuivi(supabase),
  ]);
  const clients = (data ?? []) as ClientListe[];
  const ajd = aujourdhui();

  const lignes = clients.map((c) => {
    const interventions = suivi.interventions.get(c.id) ?? [];
    const documents = suivi.documents.get(c.id) ?? [];
    const liste = chosesAFaire({ id: c.id, type: c.type, facturation: c.facturation, immeubles: c.sites.length }, interventions, documents, ajd);
    const total = c.interventions[0]?.count ?? 0;
    return {
      id: c.id,
      nom: c.nom,
      type: c.type,
      telephone: c.mobile ?? c.telephone,
      adresse: adresseComplete(c.sites[0] ?? null),
      autres: Math.max(0, c.sites.length - 1),
      interventions: total,
      etat: resumeClient(liste, total > 0 || documents.length > 0),
      recherche: [
        c.nom,
        c.contact,
        c.telephone,
        c.mobile,
        c.email,
        c.siren,
        ...c.sites.flatMap((s) => [adresseComplete(s), ...s.occupants.map((o) => `${o.nom} ${o.lot ?? ''}`)]),
      ]
        .filter(Boolean)
        .join(' '),
    };
  });

  return (
    <>
      <Titre
        sous={`${clients.length} client${clients.length > 1 ? 's' : ''}`}
        actions={
          <LienBouton href="/clients?nouveau=1" scroll={false}>
            <Icone nom="plus" taille={18} /> Nouveau client
          </LienBouton>
        }
      >
        Clients
      </Titre>
      <OngletsClients actif="clients" />
      <ListeClients lignes={lignes} />

      {nouveau && (
        <Volet fermer="/clients" titre="Nouveau client" sous="Particulier ou professionnel">
          <FormulaireClient />
        </Volet>
      )}
      {typeof fiche === 'string' && <VoletClient key={fiche} id={fiche} fermer="/clients" cree={!!cree} />}
    </>
  );
}
