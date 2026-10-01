import { LIBELLE_TYPE_CLIENT, adresseComplete, type Client, type Site } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { LienBouton, Titre, Vide } from '@/components/ui';
import { LigneCliquable, Volet } from '@/components/volet';
import { contexteBureau } from '@/lib/session';
import { FormulaireClient } from './formulaire-client';
import { VoletClient } from './volet-client';

export const metadata = { title: 'Clients · Chantio' };

export default async function Clients({ searchParams }: PageProps<'/clients'>) {
  const { supabase } = await contexteBureau();
  const { fiche, nouveau, cree } = await searchParams;
  const { data } = await supabase
    .from('clients')
    .select('*, sites(adresse, code_postal, ville), interventions(count)')
    .order('nom');
  const clients = (data ?? []) as (Client & { sites: Site[]; interventions: { count: number }[] })[];

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
      {clients.length === 0 ? (
        <Vide titre="Aucun client">Ajoutez votre premier client avec le bouton « Nouveau client ».</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-trait text-left text-xs uppercase text-gris">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3 text-right">Interventions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {clients.map((c) => (
                <LigneCliquable key={c.id} href={`/clients?fiche=${c.id}`}>
                  <td className="px-4 py-3 font-semibold">{c.nom}</td>
                  <td className="px-4 py-3">{LIBELLE_TYPE_CLIENT[c.type]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.mobile ?? c.telephone ?? '—'}</td>
                  <td className="px-4 py-3">
                    {adresseComplete(c.sites[0] ?? null) || '—'}
                    {c.sites.length > 1 && <span className="text-gris"> (+{c.sites.length - 1})</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{c.interventions[0]?.count ?? 0}</td>
                </LigneCliquable>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nouveau && (
        <Volet fermer="/clients" titre="Nouveau client" sous="Particulier ou professionnel">
          <FormulaireClient />
        </Volet>
      )}
      {typeof fiche === 'string' && <VoletClient key={fiche} id={fiche} fermer="/clients" cree={!!cree} />}
    </>
  );
}
