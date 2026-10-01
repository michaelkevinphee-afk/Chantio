// Brouillon de fiche, gardé sur le téléphone à chaque modification
// (une fiche par intervention) : fermer l'appli ne fait rien perdre.
import {
  cheminPhoto,
  nouvelId,
  type CodeMesure,
  type FicheAEnvoyer,
  type ResultatFiche,
  type ValeursFiche,
} from '@chantio/shared';

import { effacer, ecrire, lire } from './stockage';

export interface PhotoLocale {
  id: string;
  uri: string;
  categorie: 'avant' | 'apres';
}

export interface PieceBrouillon {
  designation: string;
  quantite: number;
}

export interface Brouillon {
  ficheId: string;
  interventionId: string;
  etape: number;
  debut: string;
  constat: string[];
  constatDetail: string;
  mesures: Partial<Record<CodeMesure, number | null>>;
  pieces: PieceBrouillon[];
  travaux: string;
  resultat: ResultatFiche;
  aPrevoir: string;
  dureeMinutes: number | null;
  photos: PhotoLocale[];
  /** Tracé SVG, dans un repère de 300 × 150. */
  signature: string | null;
  signataireNom: string;
  clientAbsent: boolean;
  motifAbsence: string;
}

const cle = (interventionId: string) => `chantio:brouillon:${interventionId}`;

export function nouveauBrouillon(interventionId: string): Brouillon {
  return {
    ficheId: nouvelId(),
    interventionId,
    etape: 0,
    debut: new Date().toISOString(),
    constat: [],
    constatDetail: '',
    mesures: {},
    pieces: [],
    travaux: '',
    resultat: 'termine',
    aPrevoir: '',
    dureeMinutes: null,
    photos: [],
    signature: null,
    signataireNom: '',
    clientAbsent: false,
    motifAbsence: '',
  };
}

export const lireBrouillon = (interventionId: string) => lire<Brouillon>(cle(interventionId));
export const enregistrerBrouillon = (b: Brouillon) => ecrire(cle(b.interventionId), b);
export const effacerBrouillon = (interventionId: string) => effacer(cle(interventionId));

/** Construit ce que le serveur attend (photos rangées sous <entreprise>/<fiche>/). */
export function versFiche(b: Brouillon, entrepriseId: string): FicheAEnvoyer {
  const mesures = Object.fromEntries(
    Object.entries(b.mesures).filter(([, v]) => v != null && !Number.isNaN(v)),
  ) as ValeursFiche['mesures'];
  const valeurs: ValeursFiche = {
    constat: b.constat,
    constat_detail: b.constatDetail.trim() || undefined,
    travaux: b.travaux.trim(),
    mesures,
    a_prevoir: b.resultat !== 'termine' ? b.aPrevoir.trim() || undefined : undefined,
  };
  const signee = !b.clientAbsent && !!b.signature;
  return {
    id: b.ficheId,
    intervention_id: b.interventionId,
    debut: b.debut,
    fin: new Date().toISOString(),
    duree_minutes: b.dureeMinutes,
    valeurs,
    resultat: b.resultat,
    signature_client: signee ? b.signature : null,
    signataire_nom: signee ? b.signataireNom.trim() : null,
    signee_le: signee ? new Date().toISOString() : null,
    refus_signature: b.clientAbsent ? b.motifAbsence.trim() || 'Client absent' : null,
    fournitures: b.pieces.map((p) => ({ designation: p.designation, quantite: p.quantite, unite: 'u' })),
    medias: b.photos.map((p) => ({
      chemin: cheminPhoto(entrepriseId, b.ficheId, p.id),
      categorie: p.categorie,
    })),
  };
}
