'use server';

import { revalidatePath } from 'next/cache';
import { ACOMPTES, DELAIS, VALIDITES, nombre, reglagesPrix, type ReglagesFacturation, type ReglagesPrix } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';

export type Rubrique = 'entreprise' | 'banque' | 'conditions' | 'emails' | 'prix';
export type EtatParametres = { ok?: boolean; erreur?: string; n?: number } | undefined;

type Cle = keyof ReglagesFacturation;
const TEXTES: Record<Rubrique, Cle[]> = {
  entreprise: ['forme', 'capital', 'siret', 'tva_intra', 'rcs', 'slogan', 'assureur', 'contrat', 'zone', 'mediateur', 'rge'],
  banque: ['titulaire', 'banque', 'iban', 'bic'],
  conditions: [],
  emails: ['mail_devis_objet', 'mail_devis_texte', 'mail_facture_objet', 'mail_facture_texte'],
  prix: [],
};
const PRIX: (keyof ReglagesPrix)[] = ['cout_horaire', 'frais_generaux', 'coefficient', 'marge_min', 'chute'];
const LIBELLE_PRIX: Record<keyof ReglagesPrix, string> = {
  cout_horaire: 'Le coût horaire',
  frais_generaux: 'Les frais généraux',
  coefficient: 'Le coefficient',
  marge_min: 'La marge minimale',
  chute: 'La chute',
};

/**
 * Enregistre une rubrique des paramètres (dirigeant) : seules ses clés
 * changent, le reste des réglages de l'entreprise est gardé.
 */
export async function enregistrerParametres(rubrique: Rubrique, _: EtatParametres, d: FormData): Promise<EtatParametres> {
  const { supabase, entreprise, membre } = await contexteBureau();
  if (membre.role !== 'dirigeant') return { erreur: 'Seul le dirigeant peut modifier les paramètres.' };
  const { data } = await supabase.from('entreprises').select('facturation').eq('id', entreprise.id).single();
  const r: Record<string, unknown> = { ...((data?.facturation as ReglagesFacturation | null) ?? {}) };
  const poser = (k: string, v: unknown) => {
    if (v === '' || v == null) delete r[k];
    else r[k] = v;
  };

  for (const k of TEXTES[rubrique]) {
    const long = k.endsWith('_texte') ? 3000 : 300;
    poser(k, String(d.get(k) ?? '').trim().slice(0, long));
  }
  if (rubrique === 'banque') {
    r.iban_factures = d.get('iban_factures') === 'on' ? 'oui' : 'non';
    if (typeof r.iban === 'string') r.iban = r.iban.replace(/\s+/g, ' ').toUpperCase();
  }
  if (rubrique === 'conditions') {
    const choix = (k: Cle, liste: readonly string[]) => poser(k, liste.includes(String(d.get(k))) ? String(d.get(k)) : '');
    choix('validite', VALIDITES);
    choix('acompte', ACOMPTES);
    choix('delai', DELAIS);
  }
  if (rubrique === 'prix') {
    const saisis: Partial<ReglagesPrix> = {};
    for (const k of PRIX) {
      const brut = String(d.get(k) ?? '').trim();
      if (!brut) {
        delete r[k];
        continue;
      }
      const n = Number(brut.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || reglagesPrix({ [k]: n })[k] !== n) return { erreur: `${LIBELLE_PRIX[k]} n’est pas une valeur possible.` };
      saisis[k] = n;
    }
    Object.assign(r, saisis);
    const objectif = Math.round(nombre(String(d.get('objectif_mensuel') ?? '').replace(/\s/g, '')));
    poser('objectif_mensuel', objectif > 0 ? objectif : '');
  }

  const { error } = await supabase.from('entreprises').update({ facturation: r }).eq('id', entreprise.id);
  if (error) {
    console.error('Paramètres non enregistrés', error);
    return { erreur: 'Les paramètres n’ont pas pu être enregistrés. Réessayez.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true, n: Date.now() };
}
