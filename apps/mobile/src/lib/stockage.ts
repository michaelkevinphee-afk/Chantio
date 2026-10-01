import AsyncStorage from '@react-native-async-storage/async-storage';

// Stockage local du téléphone. En mode démo, tout reste en mémoire :
// rien n'est gardé après la fermeture de l'appli.
const memoire = new Map<string, string>();
let enMemoire = false;

export function stockageEnMemoire(oui: boolean) {
  enMemoire = oui;
  memoire.clear();
}

export async function lire<T>(cle: string): Promise<T | null> {
  try {
    const brut = enMemoire ? memoire.get(cle) ?? null : await AsyncStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

export async function ecrire(cle: string, valeur: unknown): Promise<void> {
  const brut = JSON.stringify(valeur);
  if (enMemoire) memoire.set(cle, brut);
  else await AsyncStorage.setItem(cle, brut);
}

export async function effacer(cle: string): Promise<void> {
  if (enMemoire) memoire.delete(cle);
  else await AsyncStorage.removeItem(cle);
}
