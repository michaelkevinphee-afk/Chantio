import { LIBELLE_TYPE_CLIENT, adresseComplete, type Client, type Site } from '@chantio/shared';
import { Bouton, Titre, Vide } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { ajouterClient } from './actions';

export const metadata = { title: 'Clients · Chantio' };

export default async function Clients({ searchParams }: PageProps<'/clients'>) {
  const { supabase } = await contexteBureau();
  const { erreur } = await searchParams;
  const { data } = await supabase
    .from('clients')
    .select('*, sites(adresse, code_postal, ville), interventions(count)')
    .order('nom');
  const clients = (data ?? []) as (Client & { sites: Site[]; interventions: { count: number }[] })[];

  return (
    <>
      <Titre sous={`${clients.length} client${clients.length > 1 ? 's' : ''}`}>Clients</Titre>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {clients.length === 0 ? (
          <Vide titre="Aucun client">Ajoutez votre premier client, ou créez directement une intervention.</Vide>
        ) : (
          <div className="carte overflow-x-auto self-start">
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
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-semibold">{c.nom}</td>
                    <td className="px-4 py-3">{LIBELLE_TYPE_CLIENT[c.type]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{c.telephone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {adresseComplete(c.sites[0] ?? null) || '—'}
                      {c.sites.length > 1 && <span className="text-gris"> (+{c.sites.length - 1})</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{c.interventions[0]?.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={ajouterClient} className="carte space-y-3 self-start p-5">
          <h2 className="font-titre text-xl font-extrabold uppercase">Ajouter un client</h2>
          <input name="nom" className="champ" required placeholder="Nom ou raison sociale" aria-label="Nom" />
          <select name="type" className="champ" defaultValue="particulier" aria-label="Type">
            {Object.entries(LIBELLE_TYPE_CLIENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input name="telephone" type="tel" className="champ" placeholder="Téléphone" aria-label="Téléphone" />
          <input name="email" type="email" className="champ" placeholder="E-mail" aria-label="E-mail" />
          <input name="adresse" className="champ" placeholder="Adresse" aria-label="Adresse" />
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <input name="code_postal" className="champ" placeholder="CP" aria-label="Code postal" />
            <input name="ville" className="champ" placeholder="Ville" aria-label="Ville" />
          </div>
          {erreur && <p className="text-sm font-semibold text-rouge">{erreur}</p>}
          <Bouton className="w-full">Ajouter</Bouton>
        </form>
      </div>
    </>
  );
}
