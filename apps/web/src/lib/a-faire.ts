import 'server-only';
import { cache } from 'react';
import {
  aujourdhui,
  phraseAttente,
  resumeAFaire,
  toutAFaire,
  type AchatAFaire,
  type AttenteAFaire,
  type ClientAFaire,
  type ElementAFaire,
  type FacturationClient,
  type ResumeAFaire,
  type StatutAchat,
  type TypeClient,
} from '@chantio/shared';
import { contexteBureau } from './session';
import { chargerSuivi } from './suivi-clients';

// Les « choses à faire » du bureau, comme l'Accueil du bac à sable : la liste « À faire »,
// le résumé (« 15 choses à faire, dont 2 urgentes ») de l'en-tête et de la pastille du menu,
// et la phrase « On attend aussi ». Calculé une seule fois par requête (React cache) :
// la mise en page (pastille) et la page d'accueil se partagent le même résultat.

export interface AFaire {
  /** Toutes les lignes, l'urgent d'abord ; l'Accueil n'affiche pas celles « On attend » (niveau 'attente'). */
  liste: ElementAFaire[];
  /** { u, n, texte } : pastille du menu = n (rouge si u > 0), info-bulle = texte. */
  resume: ResumeAFaire;
  /** Phrase « On attend aussi … » et ses liens, null s'il n'y a rien. */
  attente: AttenteAFaire | null;
}

type LigneClient = { id: string; nom: string; type: TypeClient; facturation: FacturationClient | null; sites: { count: number }[] | null };
type LigneAchat = {
  id: string;
  numero: string | null;
  statut: StatutAchat;
  echeance: string | null;
  montant_ttc: number | string | null;
  fournisseur: { nom: string } | null;
  paiements: { montant: number | string }[] | null;
};

export const chargerAFaire = cache(async (): Promise<AFaire> => {
  const { supabase, membre, entreprise } = await contexteBureau();
  const jour = aujourdhui();
  const dirigeant = membre.role === 'dirigeant';
  const [{ data: clients }, suivi, { data: achats }, demandes] = await Promise.all([
    supabase.from('clients').select('id, nom, type, facturation, sites(count)').limit(5000),
    chargerSuivi(supabase),
    supabase
      .from('achats')
      .select('id, numero, statut, echeance, montant_ttc, fournisseur:fournisseurs(nom), paiements:paiements_achats(montant)')
      .in('statut', ['recu', 'a_payer', 'planifie'])
      .order('echeance', { ascending: true, nullsFirst: false })
      .limit(2000),
    // Les demandes d'accès ne sont visibles que des dirigeants.
    dirigeant
      ? supabase.from('demandes_acces').select('id, prenom, nom').eq('entreprise_id', entreprise.id).eq('statut', 'en_attente').order('cree_le')
      : Promise.resolve({ data: [] }),
  ]);

  const donnees = {
    clients: ((clients ?? []) as unknown as LigneClient[]).map(
      (c): ClientAFaire => ({ id: c.id, nom: c.nom, type: c.type, facturation: c.facturation, immeubles: c.sites?.[0]?.count ?? 0 }),
    ),
    interventions: suivi.interventions,
    documents: suivi.documents,
    contrats: suivi.contrats,
    achats: ((achats ?? []) as unknown as LigneAchat[]).map(
      (a): AchatAFaire => ({
        id: a.id,
        numero: a.numero,
        statut: a.statut,
        echeance: a.echeance,
        montant_ttc: Number(a.montant_ttc) || 0,
        paye: (a.paiements ?? []).reduce((s, p) => s + (Number(p.montant) || 0), 0),
        fournisseur: a.fournisseur?.nom ?? null,
      }),
    ),
    entreprise: dirigeant
      ? { nom: entreprise.nom, identite_statut: entreprise.identite_statut ?? null, demandes: (demandes.data ?? []) as { id: string; prenom: string; nom: string | null }[] }
      : null,
    aujourdhui: jour,
  };
  const liste = toutAFaire(donnees);
  return { liste, resume: resumeAFaire(liste), attente: phraseAttente(donnees) };
});
