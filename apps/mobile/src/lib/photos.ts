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

const COTE_PROFIL = 512;

/** Photo de profil : appareil photo ou galerie, recadrée au carré et réduite à ~512 px (JPEG). */
export async function choisirPhotoProfil(origine: 'camera' | 'galerie'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1] };
  let resultat: ImagePicker.ImagePickerResult;
  if (origine === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Autorise l'appareil photo dans les réglages du téléphone.");
    resultat = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
  } else {
    resultat = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (resultat.canceled || !resultat.assets[0]) return null;
  const { uri, width, height } = resultat.assets[0];
  const ctx = ImageManipulator.manipulate(uri);
  // Carré centré (si l'outil de recadrage n'a pas été proposé, ex. sur le web).
  const cote = Math.min(width, height);
  if (cote > 0 && width !== height) {
    ctx.crop({ originX: Math.floor((width - cote) / 2), originY: Math.floor((height - cote) / 2), width: cote, height: cote });
  }
  if (cote > COTE_PROFIL) ctx.resize({ width: COTE_PROFIL, height: COTE_PROFIL });
  const image = await ctx.renderAsync();
  const fichier = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return garder(fichier.uri, `profil-${nouvelId()}`);
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
