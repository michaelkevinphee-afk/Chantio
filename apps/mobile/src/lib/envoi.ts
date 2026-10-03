// Boîte d'envoi : tout ce qui doit partir au serveur passe par ici.
// En cas d'échec (pas de réseau…), l'opération reste dans la file et
// sera retentée au retour de l'appli au premier plan ou du réseau.
import type { FicheAEnvoyer } from '@chantio/shared';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { PositionTelephone, SourceDonnees } from './donnees';
import { ecrire, lire } from './stockage';

export type Operation =
  | { type: 'demarrer'; id: string; interventionId: string; erreur?: string }
  | {
      type: 'pointage';
      id: string;
      interventionId: string;
      genre: 'arrivee' | 'depart';
      position: PositionTelephone | null;
      /** Heure sur le téléphone au moment de Démarrer / Terminer. */
      le: string;
      erreur?: string;
    }
  | {
      type: 'fiche';
      id: string;
      fiche: FicheAEnvoyer;
      /** Photos à déposer : chemin de stockage → fichier local */
      photos: { chemin: string; uri: string }[];
      deposees: string[];
      erreur?: string;
    };

const CLE = 'chantio:boite-envoi';
let file: Operation[] = [];
let chargee = false;
let enCours: Promise<void> | null = null;
const abonnes = new Set<(ops: Operation[]) => void>();

async function charger() {
  if (!chargee) {
    file = (await lire<Operation[]>(CLE)) ?? [];
    chargee = true;
  }
}

async function sauver() {
  await ecrire(CLE, file);
  abonnes.forEach((f) => f(file));
}

export function abonner(f: (ops: Operation[]) => void) {
  abonnes.add(f);
  charger().then(() => f(file));
  return () => void abonnes.delete(f);
}

/** À appeler quand on change de compte ou de mode. */
export function reinitialiserBoite() {
  file = [];
  chargee = false;
}

export async function ajouter(op: Operation) {
  await charger();
  file = [...file.filter((o) => o.id !== op.id), op];
  await sauver();
}

function supprimerPhotosLocales(op: Extract<Operation, { type: 'fiche' }>) {
  if (Platform.OS === 'web') return;
  for (const p of op.photos) {
    try {
      const f = new File(p.uri);
      if (f.exists) f.delete();
    } catch {
      // pas grave : le fichier sera simplement orphelin
    }
  }
}

async function executer(source: SourceDonnees, op: Operation) {
  if (op.type === 'demarrer') {
    await source.demarrer(op.interventionId);
    return;
  }
  if (op.type === 'pointage') {
    try {
      await source.pointer(op.interventionId, op.genre, op.position, op.le);
    } catch (e) {
      // Sans réseau, on réessaiera. Refusé par le serveur : on n'insiste pas, ce n'est qu'un pointage.
      if (/network|fetch|timeout|réseau/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return;
  }
  for (const p of op.photos) {
    if (op.deposees.includes(p.chemin)) continue;
    await source.envoyerPhoto(p.chemin, p.uri);
    op.deposees.push(p.chemin);
    await sauver();
  }
  await source.envoyerFiche(op.fiche);
  supprimerPhotosLocales(op);
}

/** Envoie tout ce qui est en attente. Un seul traitement à la fois. */
export function traiterBoite(source: SourceDonnees): Promise<void> {
  if (enCours) return enCours;
  enCours = (async () => {
    await charger();
    for (const op of [...file]) {
      try {
        await executer(source, op);
        file = file.filter((o) => o.id !== op.id);
      } catch (e) {
        op.erreur = e instanceof Error ? e.message : String(e);
      }
      await sauver();
    }
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

export async function estEnAttente(id: string): Promise<boolean> {
  await charger();
  return file.some((o) => o.id === id);
}
