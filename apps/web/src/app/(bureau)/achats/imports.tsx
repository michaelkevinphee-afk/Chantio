'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Icone } from '@/components/icones';
import { annoncer } from '@/components/retour';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { enregistrerAchats, lireFacture } from './actions';
import { extension, fichierAccepte, genreFichier, taille } from './fichiers';
import { IconeAchat } from './icones';

// Importation des factures fournisseurs et petit panneau de suivi en bas à droite, comme le bac :
// chaque document importé, « lecture en cours… », « lue automatiquement » ou « à compléter ».
// La liste vit hors des composants : la lecture continue et le panneau reste affiché quand on ouvre
// une facture puis qu'on revient à la liste.

type EtatImport = 'envoi' | 'lecture' | 'lu' | 'manuel' | 'erreur';
export type ImportAchat = { cle: string; nom: string; genre: 'PDF' | 'Photo'; taille: number; etat: EtatImport; erreur?: string; id?: string };

let imports: ImportAchat[] = [];
const abonnes = new Set<() => void>();
const VIDE: ImportAchat[] = [];

function publier(liste: ImportAchat[]) {
  imports = liste;
  abonnes.forEach((f) => f());
}
const maj = (cle: string, p: Partial<ImportAchat>) => publier(imports.map((x) => (x.cle === cle ? { ...x, ...p } : x)));
const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

export function useImports() {
  return useSyncExternalStore(abonner, () => imports, () => VIDE);
}

/** Factures dont la lecture automatique est en cours (texte « lecture en cours… » dans la liste et la fiche). */
export function useLecturesEnCours() {
  const liste = useImports();
  return new Set(liste.filter((x) => x.etat === 'lecture' && x.id).map((x) => x.id as string));
}

/**
 * Envoie les fichiers dans le stockage, crée les factures « Reçu », puis lance leur lecture une par une.
 * Renvoie false si aucun fichier n'est accepté. `rafraichir` recharge la page affichée (router.refresh).
 */
export async function importerFactures({
  fichiers,
  photo,
  entrepriseId,
  lecture,
  rafraichir,
}: {
  fichiers: FileList | File[] | null;
  photo: boolean;
  entrepriseId: string;
  lecture: boolean;
  rafraichir: () => void;
}) {
  const tous = Array.from(fichiers ?? []);
  const valides = tous.filter(fichierAccepte);
  if (!valides.length) {
    if (tous.length) annoncer('Choisissez un PDF ou une photo de facture.', 'erreur');
    return false;
  }
  if (valides.length < tous.length) annoncer('Certains fichiers sont ignorés : PDF ou photo, 20 Mo au plus', 'erreur');
  const nouveaux: ImportAchat[] = valides.map((f) => ({
    cle: crypto.randomUUID(),
    nom: f.name || 'photo.jpg',
    genre: genreFichier(f.name, f.type),
    taille: f.size,
    etat: 'envoi',
  }));
  publier([...imports, ...nouveaux]);
  void envoyer(valides, nouveaux, photo, entrepriseId, lecture, rafraichir);
  return true;
}

async function envoyer(valides: File[], nouveaux: ImportAchat[], photo: boolean, entrepriseId: string, lecture: boolean, rafraichir: () => void) {
  const supabase = supabaseNavigateur();
  const envoyes: { nom: string; chemin: string; taille: number; type: string; cle: string }[] = [];
  await Promise.all(
    valides.map(async (f, n) => {
      const cle = nouveaux[n].cle;
      const chemin = `${entrepriseId}/achats/${cle}.${extension(f)}`;
      const { error } = await supabase.storage.from('documents').upload(chemin, f, { contentType: f.type || undefined });
      if (error) return maj(cle, { etat: 'erreur', erreur: 'envoi impossible, réessayez' });
      envoyes.push({ nom: f.name, chemin, taille: f.size, type: f.type, cle });
    }),
  );
  if (!envoyes.length) return;
  const r = await enregistrerAchats(
    envoyes.map((e) => ({ nom: e.nom, chemin: e.chemin, taille: e.taille, type: e.type })),
    photo,
  );
  if (!r.ok) {
    envoyes.forEach((e) => maj(e.cle, { etat: 'erreur', erreur: r.erreur }));
    return;
  }
  r.ids.forEach((id, n) => maj(envoyes[n].cle, { id, etat: lecture ? 'lecture' : 'manuel' }));
  rafraichir();
  if (!lecture) return;
  // Lecture une par une (la plus longue étape).
  for (const [n, id] of r.ids.entries()) {
    const cle = envoyes[n].cle;
    try {
      const lu = await lireFacture(id);
      maj(cle, lu.ok && !/compléter|ressemble/.test(lu.resume) ? { etat: 'lu' } : { etat: 'manuel' });
    } catch {
      maj(cle, { etat: 'manuel' });
    }
    rafraichir();
  }
}

const TEXTE: Record<EtatImport, string> = {
  envoi: 'lecture en cours…',
  lecture: 'lecture en cours…',
  lu: 'lue automatiquement',
  manuel: 'à compléter',
  erreur: '',
};

/** Le panneau en bas à droite (masqué sur la fiche plein écran, comme le bac). */
export function PanneauImports() {
  const liste = useImports();
  if (!liste.length) return null;
  const enCours = liste.some((x) => x.etat === 'envoi' || x.etat === 'lecture');
  return (
    <section
      aria-label="Importation de factures"
      className="imports-achats fixed right-5 bottom-5 z-[45] w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-trait bg-white shadow-[0_24px_50px_-20px_rgb(16_26_61/0.45)] max-menu:right-4 max-menu:bottom-[calc(84px+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-between gap-2.5 border-b border-trait py-2 pr-2 pl-4">
        <b role="status" className="text-[15px]">
          {enCours
            ? 'Importation en cours…'
            : liste.length > 1
              ? `Importation de ${liste.length} documents terminée`
              : 'Importation d’un document terminée'}
        </b>
        <button
          type="button"
          onClick={() => publier([])}
          aria-label="Fermer le panneau d’importation"
          className="grid h-10 w-10 place-items-center rounded-full text-gris transition hover:bg-doux hover:text-encre"
        >
          <Icone nom="fermer" taille={18} />
        </button>
      </div>
      <div className="max-h-[40vh] overflow-y-auto">
        {liste.map((x) => {
          const contenu = (
            <>
              <IconeAchat nom="fic" taille={22} className="shrink-0 text-gris" />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{x.nom}</b>
                <small className="text-[13px] text-gris">
                  {x.genre} · {taille(x.taille)} · {x.etat === 'erreur' ? x.erreur : TEXTE[x.etat]}
                </small>
              </span>
              {x.etat === 'envoi' || x.etat === 'lecture' ? (
                <span aria-hidden="true" className="im-rond" />
              ) : x.etat === 'erreur' ? (
                <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rouge text-[13px] font-extrabold text-white">
                  !
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white ${x.etat === 'lu' ? 'bg-vert' : 'bg-[#C9CFDC]'}`}
                >
                  ✓
                </span>
              )}
            </>
          );
          const classe = 'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-fond';
          return x.id ? (
            <Link key={x.cle} href={`/achats/${x.id}`} className={classe}>
              {contenu}
            </Link>
          ) : (
            <div key={x.cle} className={classe}>
              {contenu}
            </div>
          );
        })}
      </div>
    </section>
  );
}
