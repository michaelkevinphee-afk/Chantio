'use server';

import { lireFicheIntervention } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';

type Lu = { ok: true; id: string } | { ok: false; erreur: string };

/**
 * Interventions › Importer : enregistre une ancienne fiche d'intervention déposée (PDF ou photo, déjà envoyée
 * dans le dossier imports de l'entreprise), la lit avec la lecture automatique des devis, et garde ce qui est lu
 * dans `imports` (champs.genre = 'intervention', à part des devis et factures importés).
 * La fenêtre « Nouvelle intervention » s'ouvre ensuite pré-remplie (?nouvelle=1&importe=<id>).
 */
export async function lireFicheImportee(f: { nom: string; chemin: string; taille: number; type: string }): Promise<Lu> {
  const { supabase, entreprise, membre } = await contexteBureau();
  if (!String(f.chemin).startsWith(`${entreprise.id}/imports/`)) return { ok: false, erreur: 'Fichier non reçu.' };
  const { data: imp, error } = await supabase
    .from('imports')
    .insert({
      entreprise_id: entreprise.id,
      cree_par: membre.id,
      nom_fichier: String(f.nom).slice(0, 200),
      chemin: f.chemin,
      taille: Math.round(Number(f.taille) || 0),
      type_mime: String(f.type || '').slice(0, 100),
      champs: { genre: 'intervention' },
    })
    .select('id')
    .single();
  if (error || !imp) return { ok: false, erreur: 'La fiche n’a pas pu être enregistrée.' };

  const { data: fichier } = await supabase.storage.from('documents').download(f.chemin);
  const lu = fichier
    ? await lireFicheIntervention(Buffer.from(await fichier.arrayBuffer()), String(f.type || ''), String(f.nom))
    : { message: 'Le fichier n’a pas pu être ouvert : complétez les champs à la main.' };
  await supabase
    .from('imports')
    .update({ statut: 'message' in lu ? 'erreur' : 'pret', champs: { ...lu, genre: 'intervention' } })
    .eq('id', imp.id);
  return { ok: true, id: imp.id as string };
}
