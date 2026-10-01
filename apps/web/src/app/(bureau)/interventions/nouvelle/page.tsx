import { LIBELLE_ROLE, LIBELLE_TYPE, LIBELLE_TYPE_CLIENT, LIBELLE_URGENCE, MOTIFS, aujourdhui } from '@chantio/shared';
import { Bouton, LienBouton, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { listerClients, listerEquipe } from '@/lib/requetes';
import { creerIntervention } from '../actions';
import { ChoixClient } from './choix-client';

export const metadata = { title: 'Nouvelle intervention · Chantio' };

export default async function NouvelleIntervention({ searchParams }: PageProps<'/interventions/nouvelle'>) {
  const { supabase } = await contexteBureau();
  const [clients, equipe, { erreur }] = await Promise.all([listerClients(supabase), listerEquipe(supabase), searchParams]);
  const intervenants = equipe.filter((m) => m.role !== 'assistant');

  return (
    <>
      <Titre>Nouvelle intervention</Titre>
      <form action={creerIntervention} className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <fieldset className="carte space-y-4 p-6">
            <legend className="px-1 text-xl font-extrabold">Client</legend>
            <ChoixClient
              clients={clients}
              types={Object.entries(LIBELLE_TYPE_CLIENT).map(([valeur, libelle]) => ({ valeur, libelle }))}
            />
          </fieldset>

          <fieldset className="carte grid gap-4 p-6 sm:grid-cols-6">
            <legend className="px-1 text-xl font-extrabold">Adresse d’intervention</legend>
            <div className="sm:col-span-6">
              <label className="etiquette" htmlFor="adresse">Adresse</label>
              <input id="adresse" name="adresse" className="champ" required placeholder="12 rue des Tilleuls" />
            </div>
            <div className="sm:col-span-2">
              <label className="etiquette" htmlFor="code_postal">Code postal</label>
              <input id="code_postal" name="code_postal" className="champ" inputMode="numeric" />
            </div>
            <div className="sm:col-span-4">
              <label className="etiquette" htmlFor="ville">Ville</label>
              <input id="ville" name="ville" className="champ" />
            </div>
            <div className="sm:col-span-6">
              <label className="etiquette" htmlFor="acces">Accès (code, étage, consignes)</label>
              <input id="acces" name="acces" className="champ" placeholder="Code 4512B · 3e étage" />
            </div>
          </fieldset>

          <fieldset className="carte grid gap-4 p-6 sm:grid-cols-2">
            <legend className="px-1 text-xl font-extrabold">Demande</legend>
            <div className="sm:col-span-2">
              <label className="etiquette" htmlFor="motif">Motif</label>
              <input id="motif" name="motif" className="champ" required list="motifs" placeholder="Fuite sous évier" />
              <datalist id="motifs">
                {MOTIFS.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <label className="etiquette" htmlFor="type">Type</label>
              <select id="type" name="type" className="champ" defaultValue="depannage">
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
              <textarea id="description" name="description" rows={3} className="champ" />
            </div>
          </fieldset>
        </div>

        <aside className="space-y-6">
          <fieldset className="carte space-y-4 p-6">
            <legend className="px-1 text-xl font-extrabold">Planning</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiquette" htmlFor="date_prevue">Date</label>
                <input id="date_prevue" name="date_prevue" type="date" className="champ" defaultValue={aujourdhui()} />
              </div>
              <div>
                <label className="etiquette" htmlFor="heure_prevue">Heure</label>
                <input id="heure_prevue" name="heure_prevue" type="time" className="champ" />
              </div>
            </div>
            <div>
              <p className="etiquette">Technicien(s)</p>
              <div className="space-y-2">
                {intervenants.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 rounded-xl border border-trait px-3 py-2">
                    <input type="checkbox" name="techniciens" value={m.id} className="h-4 w-4 accent-cobalt" />
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
            <LienBouton href="/interventions" variante="secondaire">Annuler</LienBouton>
          </div>
        </aside>
      </form>
    </>
  );
}
