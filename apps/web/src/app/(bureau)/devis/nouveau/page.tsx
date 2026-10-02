import {
  aujourdhui,
  clientVide,
  conditionsParDefaut,
  nombre,
  type ClientDocument,
  type LigneDocument,
} from '@chantio/shared';
import type { ChampsLus } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { chargerContexteEditeur } from '../charger';
import { Editeur, type InitialEditeur } from '../editeur';

export const metadata = { title: 'Nouveau devis · Chantio' };

/** « 14/09/2026 » → « 2026-09-14 » */
const versIso = (d?: string) => {
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : aujourdhui();
};

export default async function NouveauDocument({ searchParams }: PageProps<'/devis/nouveau'>) {
  const { supabase, entreprise } = await contexteBureau();
  const { genre: g, import: idImport } = await searchParams;
  const ctx = await chargerContexteEditeur(supabase, entreprise);
  const reglages = entreprise.facturation ?? {};

  let client: ClientDocument = clientVide();
  let objet = '';
  let date = aujourdhui();
  let lignes: LigneDocument[] = [];
  let genre: 'devis' | 'facture' = g === 'facture' ? 'facture' : 'devis';
  const conditions = conditionsParDefaut(reglages);
  const lus: string[] = [];

  // Prérempli depuis un document importé (champs lus puis vérifiés).
  if (typeof idImport === 'string') {
    const { data: imp } = await supabase.from('imports').select('champs').eq('id', idImport).maybeSingle();
    const c = (imp?.champs ?? {}) as ChampsLus;
    if (c.genre) genre = c.genre;
    const pro = /\b(SAS|SARL|SCI|SA|EURL|syndic|cabinet|soci[ée]t[ée])\b/i.test(c.client ?? '') || !!c.siret;
    const m = (c.client ?? '').match(/^(Mme et M\.|Mme|M\.|Monsieur|Madame)\s+(.*)$/i);
    client = {
      ...client,
      type: pro ? 'pro' : 'particulier',
      civ: m ? (/^(Madame|Mme)$/i.test(m[1]) ? 'Mme' : /^Mme et/i.test(m[1]) ? 'Mme et M.' : 'M.') : client.civ,
      nom: pro ? '' : (m?.[2] ?? c.client ?? '').replace(/\b(\p{Lu})(\p{Lu}+)\b/gu, (_, a: string, b: string) => a + b.toLowerCase()),
      raison: pro ? (c.client ?? '') : '',
      siret: c.siret ?? '',
      tel: c.telephone ?? '',
      email: c.email ?? '',
      adresse: [c.adresse, c.ville].filter(Boolean).join(', '),
    };
    objet = c.objet ?? '';
    date = versIso(c.date);
    lignes = (c.lignes ?? []).map((l) => ({
      designation: l.designation,
      quantite: Number(l.quantite) || 1,
      unite: l.unite || 'u',
      prix_unitaire: Number(l.prix_unitaire) || 0,
      tva: [5.5, 10, 20].includes(Number(l.tva)) ? Number(l.tva) : Number(c.tva) || 10,
    }));
    if (c.acompte) conditions.acompte = String(Math.round(nombre(c.acompte)) || 30);
    if (c.validite) conditions.validite = c.validite;
    for (const k of ['client', 'adresse', 'telephone', 'objet']) if ((c as Record<string, unknown>)[k]) lus.push(k);
  }

  const initial: InitialEditeur = {
    genre,
    type_facture: genre === 'facture' ? 'totale' : null,
    numero: null,
    date_document: date,
    client,
    objet,
    conditions,
    remise: 0,
    pourcentage: 30,
    avancement: 0,
    avancement_precedent: 0,
    situation_numero: null,
    lignes,
    client_id: null,
    devis_id: null,
    facture_id: null,
    import_id: typeof idImport === 'string' ? idImport : null,
    origine: typeof idImport === 'string' ? 'import' : 'saisie',
    lus,
  };

  return (
    <Editeur
      id={null}
      statut="brouillon"
      initial={initial}
      historique={null}
      {...ctx}
    />
  );
}
