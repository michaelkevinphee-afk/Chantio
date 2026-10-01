import type { FicheAEnvoyer } from './types.ts';

/** Liste ce qui manque avant de pouvoir envoyer la fiche (vide = prête). */
export function verifierFiche(fiche: FicheAEnvoyer): string[] {
  const manques: string[] = [];
  const v = fiche.valeurs;
  if (!(v.constat && v.constat.length) && !v.constat_detail?.trim()) {
    manques.push('Indique ce que tu as constaté.');
  }
  if (!v.travaux?.trim()) {
    manques.push('Décris les travaux réalisés.');
  }
  if (fiche.duree_minutes == null || fiche.duree_minutes <= 0) {
    manques.push('Indique le temps passé.');
  }
  for (const f of fiche.fournitures) {
    if (!f.designation.trim()) manques.push('Une pièce n’a pas de nom.');
    if (!(f.quantite > 0)) manques.push(`Quantité invalide pour « ${f.designation} ».`);
  }
  if (fiche.signature_client && !fiche.signataire_nom?.trim()) {
    manques.push('Indique le nom de la personne qui signe.');
  }
  return manques;
}

/** Durée arrondie aux 5 minutes, au moins 5 minutes. */
export function dureeDepuis(debut: Date, fin: Date = new Date()): number {
  const minutes = Math.round((fin.getTime() - debut.getTime()) / 60000 / 5) * 5;
  return Math.max(5, minutes);
}

/** Identifiant unique créé sur le téléphone (format UUID v4). */
export function nouvelId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Chemin de stockage d'une photo : <entreprise>/<fiche>/<nom>.jpg */
export function cheminPhoto(entrepriseId: string, ficheId: string, nom: string = nouvelId()): string {
  return `${entrepriseId}/${ficheId}/${nom}.jpg`;
}

/** Stockage « profils » : photo d'un membre, <entreprise>/membres/<membre>/<nom>.jpg */
export function cheminPhotoProfil(entrepriseId: string, membreId: string, nom: string = nouvelId()): string {
  return `${entrepriseId}/membres/${membreId}/${nom}.jpg`;
}

/** Stockage « profils » : logo de l'entreprise, <entreprise>/logo/<nom>.<ext> */
export function cheminLogo(entrepriseId: string, extension = 'png', nom: string = nouvelId()): string {
  return `${entrepriseId}/logo/${nom}.${extension}`;
}

/** Initiales affichées quand il n'y a pas de photo : « Christophe Rambla » → « CR ». */
export function initiales(prenom: string, nom?: string | null): string {
  return ((prenom.trim()[0] ?? '') + (nom?.trim()[0] ?? prenom.trim()[1] ?? '')).toUpperCase();
}
