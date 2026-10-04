import 'server-only';
import type { Client, Intervention, Membre, Occupant, Site } from '@chantio/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type InterventionListe = Intervention & {
  client: Pick<Client, 'id' | 'nom' | 'telephone'> | null;
  site: Pick<Site, 'adresse' | 'code_postal' | 'ville' | 'latitude' | 'longitude'> | null;
  affectations: { membre: Pick<Membre, 'id' | 'prenom' | 'nom' | 'photo_chemin'> | null }[];
};

export const SELECT_LISTE =
  '*, client:clients(id, nom, telephone), site:sites(adresse, code_postal, ville, latitude, longitude), affectations(membre:membres(id, prenom, nom, photo_chemin))';

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

export type ClientAdresses = Pick<Client, 'id' | 'nom' | 'type'> & {
  sites: (Pick<Site, 'id' | 'adresse' | 'code_postal' | 'ville' | 'acces' | 'gardien'> & {
    occupants: Pick<Occupant, 'id' | 'nom' | 'lot' | 'telephone'>[];
  })[];
};

/** Clients avec leurs adresses déjà connues (immeubles des syndics) et leurs occupants. */
export async function listerClientsAdresses(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('clients')
    .select('id, nom, type, sites(id, adresse, code_postal, ville, acces, gardien, occupants(id, nom, lot, telephone))')
    .order('nom');
  return (data ?? []) as ClientAdresses[];
}
