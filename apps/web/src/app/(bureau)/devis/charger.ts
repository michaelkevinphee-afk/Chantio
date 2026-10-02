import 'server-only';
import { completerClient, nomClient, type Entreprise } from '@chantio/shared';
import { lireArticles } from '@/lib/devis';
import { liensProfils } from '@/lib/profils';
import type { supabaseServeur } from '@/lib/supabase/server';
import type { ClientConnu } from './editeur';
import type { EntreprisePapier } from './papier';

type Supa = Awaited<ReturnType<typeof supabaseServeur>>;

/** Ce dont l'éditeur a besoin en plus du document : catalogue, clients, entreprise… */
export async function chargerContexteEditeur(supabase: Supa, entreprise: Entreprise) {
  const [articles, { data: clients }, { data: sites }, { data: factures }, { data: devis }, liens] = await Promise.all([
    lireArticles(supabase),
    supabase.from('clients').select('id, nom, type, telephone, email, adresse_facturation').order('nom').limit(500),
    supabase.from('sites').select('client_id, adresse, code_postal, ville').limit(2000),
    supabase
      .from('documents')
      .select('id, numero, client, net_a_payer, type_facture')
      .eq('genre', 'facture')
      .not('numero', 'is', null)
      .neq('type_facture', 'avoir')
      .order('date_document', { ascending: false })
      .limit(200),
    supabase.from('documents').select('id, numero, client, objet').eq('genre', 'devis').eq('statut', 'signe').order('date_document', { ascending: false }).limit(200),
    liensProfils(supabase, [entreprise.logo_chemin]),
  ]);

  const adresseSite = new Map<string, string>();
  for (const s of sites ?? []) {
    if (!adresseSite.has(s.client_id)) adresseSite.set(s.client_id, [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
  }

  const papier: EntreprisePapier = {
    nom: entreprise.nom,
    adresse: entreprise.adresse,
    telephone: entreprise.telephone,
    email: entreprise.email,
    siret: entreprise.siret,
    metiers: entreprise.metiers ?? [],
    logo: entreprise.logo_chemin ? (liens.get(entreprise.logo_chemin) ?? null) : null,
    facturation: entreprise.facturation ?? {},
  };

  return {
    articles,
    entreprise: papier,
    clients: (clients ?? []).map(
      (k): ClientConnu => ({
        id: k.id,
        nom: k.nom,
        type: k.type,
        telephone: k.telephone,
        email: k.email,
        adresse: k.adresse_facturation || adresseSite.get(k.id) || null,
      }),
    ),
    facturesValidees: (factures ?? []).map((f) => ({
      id: f.id as string,
      numero: f.numero as string,
      client: nomClient(completerClient(f.client)),
      total: Number(f.net_a_payer),
    })),
    devisSignes: (devis ?? []).map((d) => ({
      id: d.id as string,
      numero: d.numero as string,
      client: nomClient(completerClient(d.client)),
      objet: d.objet as string,
    })),
  };
}
