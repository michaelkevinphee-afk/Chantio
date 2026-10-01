// Prise de photo, compression (~1600 px, JPEG) et copie dans un dossier
// durable de l'appli, pour que la photo survive jusqu'à son envoi.
import { nouvelId } from '@chantio/shared';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const COTE_MAX = 1600;

async function compresser(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width > COTE_MAX || asset.height > COTE_MAX) {
    if (asset.width >= asset.height) ctx.resize({ width: COTE_MAX });
    else ctx.resize({ height: COTE_MAX });
  }
  const image = await ctx.renderAsync();
  const resultat = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return resultat.uri;
}

function garder(uri: string, id: string): string {
  if (Platform.OS === 'web') return uri;
  const dossier = new Directory(Paths.document, 'photos');
  if (!dossier.exists) dossier.create({ intermediates: true, idempotent: true });
  const cible = new File(dossier, `${id}.jpg`);
  new File(uri).move(cible);
  return cible.uri;
}

/** Retourne les photos choisies : id (futur nom de fichier) et chemin local. */
export async function choisirPhotos(origine: 'camera' | 'galerie'): Promise<{ id: string; uri: string }[]> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  let resultat: ImagePicker.ImagePickerResult;
  if (origine === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Autorise l'appareil photo dans les réglages du téléphone.");
    resultat = await ImagePicker.launchCameraAsync(options);
  } else {
    resultat = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 10 });
  }
  if (resultat.canceled) return [];
  const photos: { id: string; uri: string }[] = [];
  for (const asset of resultat.assets) {
    const id = nouvelId();
    photos.push({ id, uri: garder(await compresser(asset), id) });
  }
  return photos;
}

export function supprimerPhotoLocale(uri: string) {
  if (Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignoré
  }
}
