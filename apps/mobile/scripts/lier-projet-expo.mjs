// Après « eas init » (qui écrit l'identifiant du projet Expo dans app.json),
// renseigne l'adresse des mises à jour pour que « eas update » puisse publier.
import { readFileSync, writeFileSync } from 'node:fs';

const fichier = new URL('../app.json', import.meta.url);
const config = JSON.parse(readFileSync(fichier, 'utf8'));
const id = config.expo?.extra?.eas?.projectId;
if (!id) {
  console.error("Identifiant du projet Expo introuvable : « eas init » n'a pas abouti.");
  process.exit(1);
}
config.expo.updates = { ...config.expo.updates, url: `https://u.expo.dev/${id}` };
writeFileSync(fichier, JSON.stringify(config, null, 2) + '\n');
console.log(`Projet Expo lié : ${id}`);
