import 'server-only';
import type { Client, Intervention, Membre, Site } from '@chantio/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type InterventionListe = Intervention & {
  client: Pick<Client, 'id' | 'nom' | 'telephone'> | null;
  site: Pick<Site, 'adresse' | 'code_postal' | 'ville'> | null;
  affectations: { membre: Pick<Membre, 'id' | 'prenom' | 'nom' | 'photo_chemin'> | null }[];
};

export const SELECT_LISTE =
  '*, client:clients(id, nom, telephone), site:sites(adresse, code_postal, ville), affectations(membre:membres(id, prenom, nom, photo_chemin))';

export function techniciens(i: InterventionListe): string {
  const noms = i.affectations.map((a) => a.membre?.prenom).filter(Boolean);
  return noms.length ? noms.join(', ') : '—';
}

export async function listerEquipe(supabase: SupabaseClient) {
  const { data } = await supabase.from('membres').select('*').eq('actif', true).order('prenom');
  return (data ?? []) as Membre[];
}

export async function listerClients(supabase: SupabaseClient) {
  const { data } = await supabase.from('clients').select('id, nom').order('nom');
  return (data ?? []) as Pick<Client, 'id' | 'nom'>[];
}
