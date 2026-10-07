import 'server-only';
import { cache } from 'react';
import type { Formule, RoleMembre, StatutAbonnement, StatutIdentite } from '@chantio/shared';
import { contexteConsole } from '@/lib/console';

// Lectures de la console, une seule fois par affichage (mises en cache pour la requête).

export type VueEnsemble = {
  utilisateurs: number;
  connectes_7j: number;
  identites_en_attente: number;
  idees_nouvelles: number;
  demandes_assistance: number;
  jours: { jour: string; interventions: number; fiches: number }[];
};

export type LigneEntreprise = {
  id: string;
  nom: string;
  siren: string | null;
  code_postal: string | null;
  ville: string | null;
  metiers: string[] | null;
  formule: Formule;
  statut: StatutAbonnement;
  essai_fin: string | null;
  prix_special: number | string | null;
  options: string[];
  identite_statut: StatutIdentite;
  cree_le: string;
  utilisateurs: number;
  invitations: number;
  dirigeant: string | null;
  dirigeant_email: string | null;
  derniere_connexion: string | null;
  interventions: number;
  fiches_30j: number;
  assistance_ouverte: boolean;
};

export type Assistance = {
  id: string;
  origine: 'chantio' | 'client';
  demandeur: string;
  motif: string;
  duree_minutes: number;
  mode?: 'lecture' | 'modification';
  statut: 'demandee' | 'acceptee' | 'refusee' | 'terminee' | 'annulee';
  cree_le: string;
  repondu_le: string | null;
  repondu_par: string | null;
  debut: string | null;
  fin: string | null;
  termine_par: string | null;
};

export type FicheEntreprise = {
  entreprise: {
    id: string;
    nom: string;
    siren: string | null;
    siret: string | null;
    forme_juridique: string | null;
    adresse: string | null;
    code_postal: string | null;
    ville: string | null;
    telephone: string | null;
    email: string | null;
    metiers: string[] | null;
    activite: string | null;
    formule: Formule;
    identite_statut: StatutIdentite;
    identite_mode: 'registre' | 'documents' | null;
    identite_le: string | null;
    identite_motif: string | null;
    representant: string | null;
    cree_le: string;
  };
  abonnement: { statut: StatutAbonnement; essai_fin: string | null; prix_special: number | string | null; options: string[]; modifie_le: string } | null;
  membres: {
    prenom: string;
    nom: string | null;
    email: string;
    role: RoleMembre;
    actif: boolean;
    compte: boolean;
    derniere_connexion: string | null;
    cree_le: string;
  }[];
  volumes: Record<'clients' | 'interventions' | 'fiches' | 'photos' | 'devis' | 'factures' | 'achats' | 'contrats' | 'retours' | 'stockage_octets', number>;
  assistance_ouverte: string | null;
  demande_en_attente: string | null;
  assistances: Assistance[];
  journal: { qui: string; action: string; le: string }[];
};

export const vueEnsemble = cache(async () => {
  const { supabase } = await contexteConsole();
  const { data, error } = await supabase.rpc('console_vue_ensemble');
  if (error) console.error('console_vue_ensemble', error);
  return (data ?? null) as VueEnsemble | null;
});

export const listeEntreprises = cache(async () => {
  const { supabase } = await contexteConsole();
  const { data, error } = await supabase.rpc('console_entreprises');
  if (error) console.error('console_entreprises', error);
  return ((data ?? []) as LigneEntreprise[]).map((e) => ({
    ...e,
    options: e.options ?? [],
    utilisateurs: Number(e.utilisateurs) || 0,
    invitations: Number(e.invitations) || 0,
    interventions: Number(e.interventions) || 0,
    fiches_30j: Number(e.fiches_30j) || 0,
  }));
});

export const ficheEntreprise = cache(async (id: string) => {
  const { supabase } = await contexteConsole();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.rpc('console_entreprise', { p_entreprise: id });
  if (error) console.error('console_entreprise', error);
  return (data ?? null) as FicheEntreprise | null;
});
