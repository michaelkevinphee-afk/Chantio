// Fichiers déposés dans les Achats (factures, documents liés) : formats acceptés, extension, taille lisible.

export const FORMATS_ACHAT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*';
const TAILLE_MAX = 20 * 1024 * 1024;

/** Extension du fichier envoyé dans le stockage (une photo de téléphone n'a pas toujours de nom parlant). */
export function extension(f: File) {
  const brute = f.name.includes('.') ? f.name.split('.').pop() : f.type.split('/')[1];
  return (brute ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
}

export const fichierAccepte = (f: File) =>
  f.size <= TAILLE_MAX && (/\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name) || /^image\//.test(f.type) || /pdf/i.test(f.type));

/** « PDF » ou « Photo », comme le bac. */
export const genreFichier = (nom: string | null | undefined, type?: string | null) => (/pdf/i.test(`${type ?? ''}${nom ?? ''}`) ? 'PDF' : 'Photo');

/** 412000 → « 412 Ko », 2 300 000 → « 2,3 Mo » (taille() du bac). */
export function taille(o: number) {
  return o < 1e6 ? `${Math.max(1, Math.round(o / 1000))} Ko` : `${String(Math.round(o / 1e5) / 10).replace('.', ',')} Mo`;
}
