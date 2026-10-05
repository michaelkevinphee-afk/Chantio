import 'server-only';
import { nomCourt, type Client, type Intervention, type Membre, type Occupant, type Site } from '@chantio/shared';
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

export type ClientAdresses = Pick<Client, 'id' | 'nom' | 'type' | 'contact' | 'telephone'> & {
  sites: (Pick<Site, 'id' | 'adresse' | 'code_postal' | 'ville' | 'acces' | 'gardien' | 'copropriete'> & {
    occupants: Pick<Occupant, 'id' | 'nom' | 'lot' | 'telephone'>[];
  })[];
  /** Contrats d'entretien du client (sur un de ses immeubles, ou sans immeuble). */
  contrats: { id: string; reference: string | null; objet: string; site_id: string | null }[];
};

/** Clients avec leurs adresses déjà connues (immeubles des syndics), leurs occupants et leurs contrats d'entretien. */
export async function listerClientsAdresses(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('clients')
    .select(
      'id, nom, type, contact, telephone, sites(id, adresse, code_postal, ville, acces, gardien, copropriete, occupants(id, nom, lot, telephone)), contrats(id, reference, objet, site_id)',
    )
    .order('nom');
  return (data ?? []) as ClientAdresses[];
}

// ---------- Écran Interventions (liste du bureau) ----------

/** Ce que la liste des interventions affiche : lieu, occupant, contrat, dernière fiche. Ne pas confondre avec SELECT_LISTE (Accueil, Planning). */
export const SELECT_LISTE_INTERVENTIONS =
  '*, client:clients(id, nom, telephone, type), site:sites(adresse, code_postal, ville, latitude, longitude), affectations(membre:membres(id, prenom, nom, photo_chemin)), occupant:occupants(nom), contrat:contrats(reference), fiches(resultat, envoyee_le, cree_le)';

export type InterventionListeComplete = InterventionListe & {
  client: (Pick<Client, 'id' | 'nom' | 'telephone' | 'type'>) | null;
  occupant: Pick<Occupant, 'nom'> | null;
  contrat: { reference: string | null } | null;
  fiches: { resultat: string | null; envoyee_le: string | null; cree_le: string }[];
};

/** « Karim B., Mehdi A. », ou « Personne » sans technicien (colonne Technicien du bac). */
export function nomsCourts(i: Pick<InterventionListe, 'affectations'>): string {
  const noms = i.affectations.flatMap((a) => (a.membre ? [nomCourt(a.membre.prenom, a.membre.nom)] : []));
  return noms.length ? noms.join(', ') : 'Personne';
}
