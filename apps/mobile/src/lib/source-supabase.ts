import { ajouterJours, aujourdhui, cheminPhotoProfil, type FicheAEnvoyer, type Membre } from '@chantio/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { enErreur, type InterventionVue, type Profil, type SourceDonnees } from './donnees';
import { supabase } from './supabase';

const CHAMPS_INTERVENTION = `*,
  client:clients(nom, telephone, contact),
  site:sites(adresse, code_postal, ville, acces, consignes, gardien, latitude, longitude),
  occupant:occupants(nom, lot, telephone),
  affectations(membre:membres(id, prenom))`;

type LigneIntervention = Omit<InterventionVue, 'intervenants'> & {
  affectations: { membre: { id: string; prenom: string } | null }[] | null;
};

async function lireFichier(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

export const sourceSupabase: SourceDonnees = {
  mode: 'supabase',

  async chargerProfil(): Promise<Profil | null> {
    const sb = supabase();
    const { data: session } = await sb.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) return null;

    const chercher = async () => {
      // Fiche dans l'entreprise active (un compte peut appartenir à plusieurs entreprises).
      const { data, error } = await sb.rpc('membre_actif').maybeSingle();
      if (error) throw enErreur(error);
      return data as Membre | null;
    };
    let membre = await chercher();
    if (!membre) {
      // Compte créé avant l'invitation : on le relie à son membre.
      const { error } = await sb.rpc('rejoindre_entreprise');
      if (error) throw enErreur(error);
      membre = await chercher();
    }
    if (!membre) return null;

    const { data: entreprise, error } = await sb
      .from('entreprises')
      .select('id, nom, geolocalisation')
      .eq('id', membre.entreprise_id)
      .single();
    if (error) throw enErreur(error);
    return { membre, entreprise };
  },

  async creerEntreprise(nom, prenom) {
    const { error } = await supabase().rpc('creer_entreprise', { p_nom: nom, p_prenom: prenom });
    if (error) throw enErreur(error);
  },

  async listerEntreprises() {
    const { data, error } = await supabase().rpc('mes_entreprises');
    if (error) throw enErreur(error);
    return ((data ?? []) as { id: string; nom: string; role: Membre['role']; active: boolean }[]).map(({ id, nom, role, active }) => ({
      id,
      nom,
      role,
      active,
    }));
  },

  async choisirEntreprise(id) {
    const { error } = await supabase().rpc('choisir_entreprise', { p_entreprise: id });
    if (error) throw enErreur(error);
  },

  async listerInterventions() {
    const debut = aujourdhui();
    const fin = ajouterJours(debut, 30);
    const { data, error } = await supabase()
      .from('interventions')
      .select(CHAMPS_INTERVENTION)
      .or(`and(date_prevue.gte.${debut},date_prevue.lte.${fin}),and(date_prevue.lt.${debut},date_fin.gte.${debut}),statut.eq.en_cours`)
      .order('date_prevue', { ascending: true })
      .order('heure_prevue', { ascending: true, nullsFirst: false })
      .limit(300);
    if (error) throw enErreur(error);
    return (data as unknown as LigneIntervention[]).map(({ affectations, ...i }) => ({
      ...i,
      intervenants: (affectations ?? []).flatMap((a) => (a.membre ? [a.membre] : [])),
    }));
  },

  async demarrer(interventionId) {
    const { error } = await supabase().rpc('demarrer_intervention', { p_intervention: interventionId });
    if (error) throw enErreur(error);
  },

  async envoyerPhoto(chemin, uriLocale) {
    const corps = await lireFichier(uriLocale);
    const { error } = await supabase()
      .storage.from('medias')
      .upload(chemin, corps, { contentType: 'image/jpeg', upsert: false });
    // Déjà déposée lors d'un essai précédent : c'est bon.
    if (error && !/exist|duplicate/i.test(error.message)) throw enErreur(error);
  },

  async envoyerFiche(fiche: FicheAEnvoyer) {
    const { error } = await supabase().rpc('envoyer_fiche', { p_fiche: fiche });
    if (error) throw enErreur(error);
  },

  async changerPhotoProfil(membre, uriLocale) {
    // Nouveau fichier à chaque fois (pas d'écrasement), puis le membre pointe dessus.
    const chemin = cheminPhotoProfil(membre.entreprise_id, membre.id);
    const corps = await lireFichier(uriLocale);
    const sb = supabase();
    const { error } = await sb.storage.from('profils').upload(chemin, corps, { contentType: 'image/jpeg', upsert: false });
    if (error) throw enErreur(error);
    const { error: e2 } = await sb.rpc('definir_photo', { p_chemin: chemin });
    if (e2) throw enErreur(e2);
    return chemin;
  },

  async retirerPhotoProfil() {
    const { error } = await supabase().rpc('definir_photo', { p_chemin: null });
    if (error) throw enErreur(error);
  },

  async urlPhotoProfil(chemin) {
    const { data, error } = await supabase().storage.from('profils').createSignedUrl(chemin, 60 * 60 * 24);
    if (error) return null;
    return data.signedUrl;
  },

  async reglerPartagePosition(actif) {
    const { error } = await supabase().rpc('regler_partage_position', { p_actif: actif });
    if (error) throw enErreur(error);
  },

  async partagerPosition(p) {
    const { data, error } = await supabase().rpc('partager_position', {
      p_latitude: p.lat,
      p_longitude: p.lon,
      p_precision: p.precision,
    });
    if (error) throw enErreur(error);
    return data === true;
  },

  async pointer(interventionId, genre, p, le) {
    const { error } = await supabase().rpc('pointer', {
      p_intervention: interventionId,
      p_genre: genre,
      p_latitude: p?.lat ?? null,
      p_longitude: p?.lon ?? null,
      p_precision: p?.precision ?? null,
      p_le: le,
    });
    if (error) throw enErreur(error);
  },

  async envoyerRetour(r) {
    // Entreprise et membre posés par la base (entreprise active du compte).
    const { error } = await supabase().from('retours').insert({
      auteur: r.auteur,
      texte: r.texte,
      page: r.page,
      titre_page: r.titrePage,
      appareil: r.appareil,
    });
    if (error) throw enErreur(error);
  },
};
