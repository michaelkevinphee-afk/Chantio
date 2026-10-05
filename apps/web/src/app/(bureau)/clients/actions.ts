'use server';

import { revalidatePath } from 'next/cache';
import type { TypeClient } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';

// Fenêtres de « Mes clients » (comme le bac) : nouveau client, modifier la fiche, immeuble, occupant, équipement.
// Chaque action renvoie un message (bulle « Client enregistré »…) et l'adresse où revenir ; la fenêtre s'en charge.

/** Réponse d'une fenêtre : une erreur à afficher, ou le message de réussite et l'adresse où aller. */
export type EtatFenetre = { erreur?: string; ok?: string; aller?: string } | undefined;

const texte = (d: FormData, cle: string) => String(d.get(cle) ?? '').trim() || null;
const chiffres = (d: FormData, cle: string, n: number) => {
  const v = String(d.get(cle) ?? '').replace(/\s/g, '');
  return v.length === n && /^\d+$/.test(v) ? v : null;
};
const nombre = (d: FormData, cle: string) => {
  const v = Number(texte(d, cle));
  return texte(d, cle) && Number.isFinite(v) ? v : null;
};
const TYPES: TypeClient[] = ['particulier', 'syndic', 'bailleur', 'entreprise', 'collectivite'];
const avecImmeubles = (t: TypeClient) => t === 'syndic' || t === 'bailleur';

/** « 12 rue de la Pompe, 75016 Paris » → adresse, code postal, ville (le code postal est facultatif). */
function decouperAdresse(v: string): { adresse: string; code_postal: string | null; ville: string | null } {
  const m = v.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
  return m ? { adresse: m[1].trim().replace(/,$/, ''), code_postal: m[2], ville: m[3].trim() } : { adresse: v, code_postal: null, ville: null };
}
/** « 75016 Paris » → code postal et ville. */
function decouperVille(v: string | null): { code_postal: string | null; ville: string | null } {
  if (!v) return { code_postal: null, ville: null };
  const m = v.match(/^(\d{5})\s*(.*)$/);
  return m ? { code_postal: m[1], ville: m[2].trim() || null } : { code_postal: null, ville: v };
}

/**
 * Nouveau client, ou fiche modifiée (fenêtre du bac : type, nom, contact, téléphone, e-mail, adresse, SIREN, facturation).
 * Syndic ou bailleur : l'adresse est celle du cabinet (adresse de facturation), ses immeubles s'ajoutent ensuite.
 * Les autres : l'adresse est celle où l'on intervient (sa première adresse).
 */
export async function enregistrerClient(id: string | null, fermer: string, _: EtatFenetre, d: FormData): Promise<EtatFenetre> {
  const { supabase, entreprise } = await contexteBureau();
  const type = (TYPES as string[]).includes(texte(d, 'type') ?? '') ? (texte(d, 'type') as TypeClient) : 'particulier';
  const nom = texte(d, 'nom');
  if (!nom) return { erreur: 'Indiquez le nom du client.' };
  const pro = type !== 'particulier';
  const imms = avecImmeubles(type);

  // Le téléphone principal reste dans sa colonne (portable ou fixe) ; l'autre numéro va dans l'autre.
  const colonne = texte(d, 'tel_colonne') === 'mobile' ? 'mobile' : 'telephone';
  const autre = colonne === 'mobile' ? 'telephone' : 'mobile';
  const adresse = texte(d, 'adresse');
  const champs = {
    nom: nom.slice(0, 200),
    type,
    contact: texte(d, 'contact'),
    [colonne]: texte(d, 'telephone'),
    [autre]: texte(d, 'autre_telephone'),
    email: texte(d, 'email'),
    siren: pro ? chiffres(d, 'siren', 9) : null,
    siret: pro ? chiffres(d, 'siret', 14) : null,
    forme_juridique: pro ? texte(d, 'forme_juridique') : null,
    tva_intracom: pro ? texte(d, 'tva_intracom') : null,
    site_web: pro ? texte(d, 'site_web') : null,
    ...(d.has('activite') ? { activite: pro ? texte(d, 'activite') : null } : {}),
    notes: texte(d, 'notes'),
    facturation: imms && texte(d, 'facturation') === 'mensuel' ? 'mensuel' : 'intervention',
    ...(imms ? { adresse_facturation: adresse } : {}),
  };
  if (pro && String(d.get('siren') ?? '').trim() && !champs.siren) return { erreur: 'Le SIREN compte 9 chiffres.' };

  let clientId = id;
  if (id) {
    const { error } = await supabase.from('clients').update(champs).eq('id', id);
    if (error) {
      console.error('Client non enregistré', error);
      return { erreur: 'Le client n’a pas pu être enregistré. Réessayez.' };
    }
  } else {
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...champs, entreprise_id: entreprise.id })
      .select('id')
      .single();
    if (error || !data) {
      console.error('Création du client impossible', error);
      return { erreur: 'Le client n’a pas pu être ajouté. Réessayez.' };
    }
    clientId = data.id as string;
  }

  // Adresse d'un particulier, d'une entreprise ou d'une collectivité : sa première adresse d'intervention.
  if (!imms && adresse) {
    const lieu = decouperAdresse(adresse);
    const siteId = id ? texte(d, 'site_id') : null;
    if (siteId) await supabase.from('sites').update(lieu).eq('id', siteId).eq('client_id', clientId!);
    else
      await supabase.from('sites').insert({
        ...lieu,
        entreprise_id: entreprise.id,
        client_id: clientId!,
        latitude: nombre(d, 'latitude'),
        longitude: nombre(d, 'longitude'),
      });
  }

  // Autres personnes à joindre (gestionnaire, comptable…) : la liste est remplacée.
  if (pro && d.get('contacts_envoyes') === '1') {
    const fonctions = d.getAll('contact_fonction');
    const telephones = d.getAll('contact_telephone');
    const emails = d.getAll('contact_email');
    const contacts = d
      .getAll('contact_nom')
      .map((n, k) => ({
        entreprise_id: entreprise.id,
        client_id: clientId!,
        nom: String(n).trim(),
        fonction: String(fonctions[k] ?? '').trim() || null,
        telephone: String(telephones[k] ?? '').trim() || null,
        email: String(emails[k] ?? '').trim() || null,
      }))
      .filter((c) => c.nom);
    if (id) await supabase.from('contacts_client').delete().eq('client_id', id);
    if (contacts.length) await supabase.from('contacts_client').insert(contacts);
  }

  revalidatePath('/clients', 'layout');
  return id
    ? { ok: 'Client enregistré', aller: fermer }
    : { ok: `${nom} ajouté${imms ? ' : ajoutez maintenant ses immeubles' : ''}`, aller: `/clients/${clientId}` };
}

/** On ne supprime qu'un client sans intervention, document ni contrat (comme le bac). */
export async function supprimerClient(id: string): Promise<EtatFenetre> {
  const { supabase } = await contexteBureau();
  const [{ data: c }, i, d, k] = await Promise.all([
    supabase.from('clients').select('nom').eq('id', id).maybeSingle(),
    supabase.from('interventions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('contrats').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ]);
  if (!c) return { erreur: 'Ce client n’existe plus.' };
  if (i.count || d.count || k.count) return { erreur: 'Ce client a des interventions, des documents ou des contrats : il ne peut pas être supprimé.' };
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) {
    console.error('Client non supprimé', error);
    return { erreur: 'Le client n’a pas pu être supprimé. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: `${c.nom} supprimé`, aller: '/clients' };
}

// ---------- Immeubles et occupants (syndics et bailleurs) ----------

/**
 * Nouvel immeuble ou immeuble modifié (« Adresse », « Code postal et ville », « Gardien », « Code d’accès », « Facturé à »).
 * « Facturé à » laissé vide : « Syndicat des copropriétaires du » + l'adresse (pour un bailleur : son nom, puis l'adresse).
 * Un nouvel immeuble reçoit tout de suite l'occupant « Parties communes ».
 */
export async function enregistrerImmeuble(clientId: string, siteId: string | null, fermer: string, _: EtatFenetre, d: FormData): Promise<EtatFenetre> {
  const { supabase, entreprise } = await contexteBureau();
  const adresse = texte(d, 'adresse');
  if (!adresse) return { erreur: 'Indiquez l’adresse de l’immeuble.' };
  const { data: c } = await supabase.from('clients').select('nom, type').eq('id', clientId).maybeSingle();
  if (!c) return { erreur: 'Ce client n’existe plus.' };
  const champs = {
    adresse: adresse.slice(0, 300),
    ...decouperVille(texte(d, 'ville')),
    gardien: texte(d, 'gardien'),
    acces: texte(d, 'acces'),
    copropriete: texte(d, 'copropriete') ?? `${c.type === 'bailleur' ? `${c.nom}, ` : 'Syndicat des copropriétaires du '}${adresse}`,
    consignes: texte(d, 'consignes'),
  };
  if (siteId) {
    const { error } = await supabase.from('sites').update(champs).eq('id', siteId).eq('client_id', clientId);
    if (error) {
      console.error('Immeuble non enregistré', error);
      return { erreur: 'L’immeuble n’a pas pu être enregistré. Réessayez.' };
    }
  } else {
    const { data, error } = await supabase
      .from('sites')
      .insert({ ...champs, entreprise_id: entreprise.id, client_id: clientId })
      .select('id')
      .single();
    if (error || !data) {
      console.error('Immeuble non ajouté', error);
      return { erreur: 'L’immeuble n’a pas pu être ajouté. Réessayez.' };
    }
    await supabase.from('occupants').insert({ entreprise_id: entreprise.id, site_id: data.id, nom: 'Parties communes' });
  }
  revalidatePath('/clients', 'layout');
  return { ok: siteId ? 'Immeuble enregistré' : `${adresse} ajouté : sa fiche est aussi dans l’onglet « Immeubles et contrats »`, aller: fermer };
}

export async function ajouterOccupant(siteId: string, fermer: string, _: EtatFenetre, d: FormData): Promise<EtatFenetre> {
  const { supabase, entreprise } = await contexteBureau();
  const nom = texte(d, 'nom');
  if (!nom) return { erreur: 'Indiquez le nom de l’occupant.' };
  const { data: s } = await supabase.from('sites').select('adresse').eq('id', siteId).maybeSingle();
  if (!s) return { erreur: 'Cet immeuble n’existe plus.' };
  const { error } = await supabase
    .from('occupants')
    .insert({ entreprise_id: entreprise.id, site_id: siteId, nom: nom.slice(0, 200), lot: texte(d, 'lot'), telephone: texte(d, 'telephone') });
  if (error) {
    console.error('Occupant non ajouté', error);
    return { erreur: 'L’occupant n’a pas pu être ajouté. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: `Occupant ajouté au ${s.adresse} : ${nom}`, aller: fermer };
}

/** Retire un occupant de la liste ; ses anciennes interventions restent. Les parties communes ne se retirent pas. */
export async function retirerOccupant(occupantId: string): Promise<EtatFenetre> {
  const { supabase } = await contexteBureau();
  const { data: o } = await supabase.from('occupants').select('nom, site:sites(adresse)').eq('id', occupantId).maybeSingle();
  if (!o) return { erreur: 'Cet occupant n’est déjà plus dans la liste.' };
  if (/parties communes/i.test(o.nom as string)) return { erreur: 'Les parties communes restent dans la liste.' };
  const { error } = await supabase.from('occupants').delete().eq('id', occupantId);
  if (error) {
    console.error('Occupant non retiré', error);
    return { erreur: 'L’occupant n’a pas pu être retiré. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  const adresse = (o.site as unknown as { adresse: string } | null)?.adresse;
  return { ok: `${o.nom} n’est plus dans la liste${adresse ? ` du ${adresse}` : ''}` };
}

// ---------- Équipements suivis d'un bâtiment ----------
// Chaudière, VMC, adoucisseur… avec le dernier et le prochain passage, et l'obligation réglementaire.

const jour = (d: FormData, cle: string) => {
  const v = texte(d, cle);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

/**
 * Fenêtre « Équipement » du bac : « Équipement », « Détail » (marque, année de pose…), passages, obligation.
 * Le détail est rangé dans le modèle ; la marque et le modèle déjà saisis restent s'il n'a pas changé.
 */
export async function enregistrerEquipement(siteId: string, equipementId: string | null, fermer: string, _: EtatFenetre, d: FormData): Promise<EtatFenetre> {
  const { supabase, entreprise } = await contexteBureau();
  const categorie = texte(d, 'categorie');
  if (!categorie) return { erreur: 'Indiquez l’équipement.' };
  const detail = texte(d, 'detail');
  const detailAvant = String(d.get('detail_avant') ?? '').trim() || null;
  const champs = {
    categorie: categorie.slice(0, 200),
    ...(equipementId && detail === detailAvant ? {} : { marque: null, modele: detail }),
    dernier_passage: jour(d, 'dernier_passage'),
    prochain_passage: jour(d, 'prochain_passage'),
    obligation: texte(d, 'obligation'),
  };
  const { error } = equipementId
    ? await supabase.from('equipements').update(champs).eq('id', equipementId)
    : await supabase.from('equipements').insert({ ...champs, entreprise_id: entreprise.id, site_id: siteId });
  if (error) {
    console.error('Équipement non enregistré', error);
    return { erreur: 'L’équipement n’a pas pu être enregistré. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: 'Équipement enregistré', aller: fermer };
}

export async function retirerEquipement(equipementId: string, fermer: string): Promise<EtatFenetre> {
  const { supabase } = await contexteBureau();
  const { error } = await supabase.from('equipements').delete().eq('id', equipementId);
  if (error) {
    console.error('Équipement non retiré', error);
    return { erreur: 'L’équipement n’a pas pu être retiré. Réessayez.' };
  }
  revalidatePath('/clients', 'layout');
  return { ok: 'Équipement retiré', aller: fermer };
}
