import 'server-only';
import {
  aDesImmeubles,
  attacherForfaits,
  calculer,
  libelleDocument,
  partDejaFacturee,
  type Entreprise,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import { lireArticles, lireDocument, type DocumentLu, type LigneLue } from '@/lib/devis';
import { liensProfils } from '@/lib/profils';
import type { supabaseServeur } from '@/lib/supabase/server';
import type { ClientConnu } from './client-editeur';
import type { EntreprisePapier } from './papier';

type Supa = Awaited<ReturnType<typeof supabaseServeur>>;

/** L'entreprise telle qu'elle s'imprime sur le document (en-tête, mentions, logo). */
export async function entreprisePapier(supabase: Supa, entreprise: Entreprise): Promise<EntreprisePapier> {
  const liens = await liensProfils(supabase, [entreprise.logo_chemin]);
  return {
    nom: entreprise.nom,
    adresse: entreprise.adresse,
    telephone: entreprise.telephone,
    email: entreprise.email,
    siret: entreprise.siret,
    metiers: entreprise.metiers ?? [],
    logo: entreprise.logo_chemin ? (liens.get(entreprise.logo_chemin) ?? null) : null,
    facturation: entreprise.facturation ?? {},
  };
}

/** Ce dont l'éditeur a besoin en plus du document : produits et services, clients (immeubles, occupants), entreprise. */
export async function chargerContexteEditeur(supabase: Supa, entreprise: Entreprise) {
  const [articles, { data: clients }, { data: sites }, { data: occupants }, papier] = await Promise.all([
    lireArticles(supabase),
    supabase
      .from('clients')
      .select('id, nom, type, civilite, contact, telephone, mobile, email, adresse_facturation, siret, siren, tva_intracom, forme_juridique, activite')
      .order('nom')
      .limit(1000),
    supabase.from('sites').select('id, client_id, adresse, code_postal, ville, copropriete').order('adresse').limit(3000),
    supabase.from('occupants').select('site_id, nom').order('nom').limit(5000),
    entreprisePapier(supabase, entreprise),
  ]);

  const occupantsDe = new Map<string, string[]>();
  for (const o of occupants ?? []) occupantsDe.set(o.site_id, [...(occupantsDe.get(o.site_id) ?? []), o.nom as string]);
  const sitesDe = new Map<string, ClientConnu['sites']>();
  for (const s of sites ?? []) {
    const site = {
      id: s.id as string,
      adresse: s.adresse as string,
      code_postal: (s.code_postal as string | null) ?? null,
      ville: (s.ville as string | null) ?? null,
      copropriete: (s.copropriete as string | null) ?? null,
      occupants: occupantsDe.get(s.id) ?? [],
    };
    sitesDe.set(s.client_id, [...(sitesDe.get(s.client_id) ?? []), site]);
  }
  const adresseSite = (s?: ClientConnu['sites'][number]) => (s ? [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null);

  return {
    articles,
    entreprise: papier,
    clients: (clients ?? []).map((k): ClientConnu => {
      const ses = sitesDe.get(k.id) ?? [];
      return {
        id: k.id,
        nom: k.nom,
        type: k.type,
        telephone: k.mobile || k.telephone || null,
        email: k.email,
        adresse: k.adresse_facturation || adresseSite(ses[0]),
        contact: k.contact,
        siren: (k.siren || (k.siret ? String(k.siret).replace(/\D/g, '').slice(0, 9) : '')) || null,
        source: k,
        // Les immeubles ne servent qu'aux syndics et bailleurs ; l'adresse du premier site sert aux autres.
        sites: aDesImmeubles(k.type) ? ses : ses.slice(0, 1),
      };
    }),
  };
}

export interface FactureLiee {
  id: string;
  numero: string | null;
  type_facture: TypeFacture | null;
  statut: StatutDocument;
  situation_numero: number | null;
  libelle: string;
}

/**
 * Ce qui est déjà facturé sur un devis (brouillons compris, avoirs déduits, comme le bac) :
 * montant du marché HT, part facturée en %, factures du devis.
 */
export async function lireFacturation(supabase: Supa, devisId: string, sauf?: string | null) {
  const lu = await lireDocument(supabase, devisId);
  if (!lu || lu.document.genre !== 'devis') return null;
  const marcheHT = calculer({ ...lu.document, genre: 'devis', type_facture: null, lignes: lu.lignes }).marcheHT;
  const { data } = await supabase
    .from('documents')
    .select('id, numero, type_facture, statut, situation_numero, total_ht, total_ttc, facture_id, date_document, cree_le')
    .eq('devis_id', devisId)
    .eq('genre', 'facture')
    .order('date_document')
    .order('cree_le');
  const docs = (data ?? []).map((f) => ({ ...f, total_ht: Number(f.total_ht), total_ttc: Number(f.total_ttc) }));
  const factures = docs.filter((f) => f.type_facture !== 'avoir');
  const ids = factures.map((f) => f.id as string);
  const { data: avoirs } = ids.length
    ? await supabase.from('documents').select('facture_id, numero, total_ttc').eq('type_facture', 'avoir').in('facture_id', ids)
    : { data: [] as { facture_id: string; numero: string | null; total_ttc: number }[] };
  const avoirsEmis = (avoirs ?? []).map((a) => ({ facture_id: a.facture_id as string | null, numero: a.numero as string | null, total_ttc: Number(a.total_ttc) }));
  return {
    devis: lu.document,
    lignes: lu.lignes,
    marcheHT,
    deja: partDejaFacturee(
      marcheHT,
      factures.map((f) => ({ id: f.id, type_facture: f.type_facture, statut: f.statut, total_ht: f.total_ht, total_ttc: f.total_ttc })),
      avoirsEmis,
      sauf,
    ),
    situations: factures.filter((f) => f.type_facture === 'situation' && f.statut !== 'annule' && f.id !== sauf).length,
    factures: factures.map(
      (f): FactureLiee => ({
        id: f.id,
        numero: f.numero,
        type_facture: f.type_facture,
        statut: f.statut,
        situation_numero: f.situation_numero,
        libelle: libelleDocument({ genre: 'facture', type_facture: f.type_facture }),
      }),
    ),
  };
}

export interface LiensDocument {
  intervention: { id: string; reference: string } | null;
  origine: { id: string; numero: string | null } | null;
  enfants: { id: string; numero: string | null; libelle: string }[];
  /** Contrat lié ; `aAppliquer` : ce devis est la proposition de renouvellement en cours du contrat. */
  contrat: { id: string; reference: string; montant_ht: number; visites_par_an: number; fin: string; aAppliquer: boolean } | null;
  /** Immeuble du document (syndic, bailleur) : « 12 rue de la Pompe, 75016 Paris ». */
  lieu: string | null;
  /** Devis : part déjà facturée ; facture d'un devis : part facturée par les autres factures. */
  deja: number;
  marcheHT: number;
  situations: number;
  refDevis: string | null;
  refFacture: string | null;
}

/** Liens du document (fiche client, intervention, devis d'origine, factures, contrat) et déjà facturé. */
export async function chargerLiens(supabase: Supa, d: DocumentLu): Promise<LiensDocument> {
  const c = d.conditions;
  const [interv, contrat, origine, enfantsAvoirs, facturation, site] = await Promise.all([
    c.intervention_id
      ? supabase.from('interventions').select('id, reference, numero').eq('id', c.intervention_id).maybeSingle()
      : d.genre === 'devis'
        ? supabase.from('interventions').select('id, reference, numero').eq('devis_id', d.id).limit(1).maybeSingle()
        : null,
    c.contrat_id
      ? supabase.from('contrats').select('id, reference, montant_ht, visites_par_an, fin, renouvellement_id').eq('id', c.contrat_id).maybeSingle()
      : d.genre === 'devis'
        ? supabase.from('contrats').select('id, reference, montant_ht, visites_par_an, fin, renouvellement_id').eq('renouvellement_id', d.id).limit(1).maybeSingle()
        : null,
    d.genre === 'facture' && (d.type_facture === 'avoir' ? d.facture_id : d.devis_id)
      ? supabase
          .from('documents')
          .select('id, numero')
          .eq('id', (d.type_facture === 'avoir' ? d.facture_id : d.devis_id)!)
          .maybeSingle()
      : null,
    d.genre === 'facture' && d.type_facture !== 'avoir'
      ? supabase.from('documents').select('id, numero, type_facture').eq('facture_id', d.id).eq('type_facture', 'avoir').order('cree_le')
      : null,
    d.genre === 'devis' ? lireFacturation(supabase, d.id) : d.devis_id ? lireFacturation(supabase, d.devis_id, d.id) : null,
    c.siteId ? supabase.from('sites').select('adresse, code_postal, ville').eq('id', c.siteId).maybeSingle() : null,
  ]);
  const i = interv?.data as { id: string; reference: string | null; numero: number } | null | undefined;
  const ct = contrat?.data as
    | { id: string; reference: string | null; montant_ht: number; visites_par_an: number; fin: string; renouvellement_id: string | null }
    | null
    | undefined;
  const s = site?.data as { adresse: string; code_postal: string | null; ville: string | null } | null | undefined;
  const o = origine?.data as { id: string; numero: string | null } | null | undefined;
  const enfants =
    d.genre === 'devis'
      ? (facturation?.factures ?? []).map((f) => ({ id: f.id, numero: f.numero, libelle: f.libelle }))
      : ((enfantsAvoirs?.data ?? []) as { id: string; numero: string | null }[]).map((a) => ({ id: a.id, numero: a.numero, libelle: 'Avoir' }));
  return {
    intervention: i ? { id: i.id, reference: i.reference || `N° ${String(i.numero).padStart(4, '0')}` } : null,
    origine: o ? { id: o.id, numero: o.numero } : null,
    enfants,
    contrat: ct
      ? {
          id: ct.id,
          reference: ct.reference || 'Contrat',
          montant_ht: Number(ct.montant_ht),
          visites_par_an: Number(ct.visites_par_an),
          fin: ct.fin,
          aAppliquer: ct.renouvellement_id === d.id,
        }
      : null,
    lieu: s ? [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null,
    deja: facturation?.deja ?? 0,
    marcheHT: facturation?.marcheHT ?? 0,
    situations: facturation?.situations ?? 0,
    refDevis: d.genre === 'facture' ? (facturation?.devis.numero ?? null) : null,
    refFacture: d.type_facture === 'avoir' ? (o?.numero ?? null) : null,
  };
}

/** Lignes lues avec leur forfait de dépannage remis (conditions.forfaits). */
export function lignesAvecForfaits(d: DocumentLu, lignes: LigneLue[]): LigneLue[] {
  return attacherForfaits(lignes, d.conditions);
}
