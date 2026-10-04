import { LIBELLE_ROLE, LIBELLE_TYPE, LIBELLE_TYPE_CLIENT, LIBELLE_URGENCE, MOTIFS, aujourdhui, interventionDepuisDevis } from '@chantio/shared';
import { Bouton, LienBouton, Titre } from '@/components/ui';
import { lireDocument } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { listerClientsAdresses, listerEquipe } from '@/lib/requetes';
import { creerIntervention } from '../actions';
import { ChoixClient } from './choix-client';

export const metadata = { title: 'Nouvelle intervention · Chantio' };

export default async function NouvelleIntervention({ searchParams }: PageProps<'/interventions/nouvelle'>) {
  const { supabase } = await contexteBureau();
  const [clients, equipe, { erreur, client, devis, date, heure, technicien }] = await Promise.all([
    listerClientsAdresses(supabase),
    listerEquipe(supabase),
    searchParams,
  ]);
  const intervenants = equipe.filter((m) => m.role !== 'assistant');
  // Depuis une case libre du planning : jour, demi-journée et technicien déjà choisis.
  const dateInitiale = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : aujourdhui();
  const heureInitiale = typeof heure === 'string' && /^\d{2}:\d{2}$/.test(heure) ? heure : undefined;

  // Depuis un devis : client, adresse du chantier, objet et ouvrages déjà remplis.
  const lu = typeof devis === 'string' ? await lireDocument(supabase, devis) : null;
  const p = lu ? interventionDepuisDevis({ ...lu.document, lignes: lu.lignes }) : null;
  const simplifier = (n: string) => n.toLowerCase().replace(/^(mme et m\.|mme|m\.|monsieur|madame)\s+/, '').trim();
  const clientDevis = lu
    ? (clients.find((c) => c.id === lu.document.client_id) ?? clients.find((c) => p && simplifier(c.nom) === simplifier(p.client.nom)))
    : undefined;
  const clientInitial = typeof client === 'string' && clients.some((c) => c.id === client) ? client : (clientDevis?.id ?? (p ? 'nouveau' : undefined));

  return (
    <>
      <Titre>Nouvelle intervention</Titre>
      {lu && (
        <p className="mb-6 rounded-xl bg-doux px-4 py-3 text-sm font-semibold text-cobalt">
          Pré-remplie d’après le devis {lu.document.numero ?? '(brouillon)'}. Vérifiez, choisissez la date et le technicien, puis créez l’intervention.
        </p>
      )}
      <form action={creerIntervention} className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {lu && <input type="hidden" name="devis" value={lu.document.id} />}
          <ChoixClient
            clients={clients}
            initial={clientInitial}
            nouveau={clientDevis ? undefined : p?.client}
            types={Object.entries(LIBELLE_TYPE_CLIENT).map(([valeur, libelle]) => ({ valeur, libelle }))}
            adresse={p ? { adresse: p.adresse, code_postal: p.code_postal, ville: p.ville } : undefined}
          />

          <fieldset className="carte grid gap-4 p-6 sm:grid-cols-2">
            <legend className="px-1 text-xl font-extrabold">Demande</legend>
            <div className="sm:col-span-2">
              <label className="etiquette" htmlFor="motif">Motif</label>
              <input id="motif" name="motif" className="champ" defaultValue={p?.motif} required list="motifs" placeholder="Fuite sous évier" />
              <datalist id="motifs">
                {MOTIFS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="etiquette" htmlFor="type">Type</label>
              <select id="type" name="type" className="champ" defaultValue={p?.type ?? 'depannage'}>
                {Object.entries(LIBELLE_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="etiquette" htmlFor="urgence">Urgence</label>
              <select id="urgence" name="urgence" className="champ" defaultValue="normale">
                {Object.entries(LIBELLE_URGENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="etiquette" htmlFor="description">Précisions pour le technicien</label>
              <textarea id="description" name="description" rows={p ? 6 : 3} className="champ" defaultValue={p?.description} />
            </div>
          </fieldset>
        </div>

        <aside className="space-y-6">
          <fieldset className="carte space-y-4 p-6">
            <legend className="px-1 text-xl font-extrabold">Planning</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiquette" htmlFor="date_prevue">Date</label>
                <input id="date_prevue" name="date_prevue" type="date" className="champ" defaultValue={dateInitiale} />
              </div>
              <div>
                <label className="etiquette" htmlFor="heure_prevue">Heure</label>
                <input id="heure_prevue" name="heure_prevue" type="time" className="champ" defaultValue={heureInitiale} />
              </div>
              <div>
                <label className="etiquette" htmlFor="date_fin">Dernier jour</label>
                <input id="date_fin" name="date_fin" type="date" className="champ" />
              </div>
              <div>
                <label className="etiquette" htmlFor="duree_prevue">Durée prévue (h)</label>
                <input id="duree_prevue" name="duree_prevue" inputMode="decimal" className="champ" placeholder="1" />
              </div>
            </div>
            <p className="-mt-2 text-xs text-gris">Un chantier sur plusieurs jours : indiquez son dernier jour, il s’étend au planning.</p>
            <div>
              <p className="etiquette">Technicien(s)</p>
              <div className="space-y-2">
                {intervenants.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 rounded-xl border border-trait px-3 py-2">
                    <input type="checkbox" name="techniciens" value={m.id} defaultChecked={m.id === technicien} className="h-4 w-4 accent-cobalt" />
                    <span className="font-semibold">{m.prenom} {m.nom}</span>
                    <span className="ml-auto text-xs text-gris">{LIBELLE_ROLE[m.role]}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gris">Sans technicien, l’intervention reste « à planifier ».</p>
            </div>
          </fieldset>
          {erreur && <p className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}
          <div className="flex gap-2">
            <Bouton className="flex-1 py-3">Créer l’intervention</Bouton>
            <LienBouton href={lu ? `/devis/${lu.document.id}` : '/interventions'} variante="secondaire">Annuler</LienBouton>
          </div>
        </aside>
      </form>
    </>
  );
}
