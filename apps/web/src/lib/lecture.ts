import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES_FOURNISSEUR } from '@chantio/shared';
import type { ChampsLus } from './devis';

// Lecture automatique (OCR) des anciens devis et factures importés.
// Elle utilise Claude (Anthropic) quand la clé ANTHROPIC_API_KEY est posée
// dans Vercel ; sans clé, le document arrive vide et se remplit à la main.

const MODELE = 'claude-opus-5-5';
const TAILLE_MAX = 20 * 1024 * 1024;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    genre: { type: 'string', enum: ['devis', 'facture'] },
    numero: { type: 'string' },
    date: { type: 'string', description: 'Date du document au format JJ/MM/AAAA' },
    client: { type: 'string', description: 'Nom du client tel qu’imprimé (ex. Mme Laurent, SCI Les Érables)' },
    adresse: { type: 'string', description: 'Rue du client' },
    ville: { type: 'string', description: 'Code postal et ville du client' },
    telephone: { type: 'string' },
    email: { type: 'string' },
    siret: { type: 'string', description: 'SIRET ou SIREN du client s’il est imprimé, chiffres seuls' },
    objet: { type: 'string' },
    tva: { type: 'number', description: 'Taux de TVA principal en %, par exemple 10' },
    validite: { type: 'string' },
    acompte: { type: 'string' },
    total_ttc: { type: 'number' },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          designation: { type: 'string' },
          quantite: { type: 'number' },
          unite: { type: 'string', description: 'u, h, m, m², forfait…' },
          prix_unitaire: { type: 'number', description: 'Prix unitaire hors taxes' },
          tva: { type: 'number' },
          doute: { type: 'boolean', description: 'true si un chiffre de la ligne est mal imprimé ou incertain' },
        },
        required: ['designation', 'quantite', 'unite', 'prix_unitaire', 'tva', 'doute'],
      },
    },
    confiance: {
      type: 'object',
      additionalProperties: false,
      description: 'Fiabilité de lecture de chaque champ, de 0 à 100',
      properties: Object.fromEntries(
        ['numero', 'date', 'client', 'adresse', 'ville', 'telephone', 'objet', 'tva', 'validite', 'acompte', 'total_ttc'].map((k) => [
          k,
          { type: 'number' },
        ]),
      ),
      required: ['numero', 'date', 'client', 'adresse', 'ville', 'telephone', 'objet', 'tva', 'validite', 'acompte', 'total_ttc'],
    },
  },
  required: [
    'genre',
    'numero',
    'date',
    'client',
    'adresse',
    'ville',
    'telephone',
    'email',
    'siret',
    'objet',
    'tva',
    'validite',
    'acompte',
    'total_ttc',
    'lignes',
    'confiance',
  ],
} as const;

const CONSIGNE = `Tu lis un devis ou une facture d'une entreprise du bâtiment (plomberie, chauffage), souvent scanné ou photographié.
Recopie les champs tels qu'ils sont imprimés, sans rien inventer : un champ absent reste une chaîne vide (ou 0 pour un nombre).
Les montants sont en euros, au format numérique (1122.55). Les prix des lignes sont hors taxes.
Indique pour chaque champ ta fiabilité de lecture de 0 à 100 : en dessous de 80 si un caractère est douteux (tache, pli, chiffre ambigu).`;

export const lectureActivee = () => !!process.env.ANTHROPIC_API_KEY;

export async function lireFichierImporte(fichier: Buffer, typeMime: string, nom: string): Promise<ChampsLus> {
  if (!lectureActivee()) {
    return { message: 'Lecture automatique pas encore activée : complétez les champs à la main.' };
  }
  if (fichier.byteLength > TAILLE_MAX) return { message: 'Fichier trop lourd pour la lecture automatique (20 Mo au plus).' };

  const pdf = typeMime === 'application/pdf' || /\.pdf$/i.test(nom);
  const image = /^image\/(jpeg|png|gif|webp)$/.test(typeMime);
  if (!pdf && !image) return { message: 'Format non lu automatiquement : complétez les champs à la main.' };

  const donnees = fichier.toString('base64');
  const piece: Anthropic.ContentBlockParam = pdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } }
    : {
        type: 'image',
        source: { type: 'base64', media_type: typeMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: donnees },
      };

  try {
    // Une clé créée au niveau de l'organisation (sans espace de travail) exige
    // l'identifiant de l'espace : il se pose dans Vercel sous ANTHROPIC_WORKSPACE_ID.
    const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic(espace ? { defaultHeaders: { 'anthropic-workspace-id': espace } } : {});
    const reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 16000,
      system: CONSIGNE,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: [piece, { type: 'text', text: `Fichier : ${nom}. Lis ce document.` }] }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens') {
      return { message: 'Le document n’a pas pu être lu entièrement : complétez les champs à la main.' };
    }
    const texte = reponse.content.find((b) => b.type === 'text');
    if (!texte || texte.type !== 'text') return { message: 'Aucun champ reconnu.' };
    return JSON.parse(texte.text) as ChampsLus;
  } catch (e) {
    console.error('Lecture automatique', e);
    return { message: raisonEchec(e) };
  }
}

// ---------------------------------------------------------------------------
// Factures fournisseurs (Achats)
// ---------------------------------------------------------------------------

/** Ce que la lecture rend d'une facture fournisseur (chaîne vide ou 0 quand rien n'est lu). */
export type FactureLue = {
  facture: boolean;
  fournisseur: { nom: string; siret: string; tva_intracom: string; adresse: string; iban: string; categorie: string };
  numero: string;
  date: string;
  echeance: string;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  taux_tva: number;
  avoir: boolean;
  lignes: { designation: string; quantite: number; prix_unitaire_ht: number; total_ht: number }[];
};

const SCHEMA_ACHAT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facture: { type: 'boolean', description: 'false si le document n’est ni une facture, ni un avoir, ni un ticket de caisse' },
    fournisseur: {
      type: 'object',
      additionalProperties: false,
      description: 'L’entreprise qui ÉMET la facture (pas le client destinataire)',
      properties: {
        nom: { type: 'string' },
        siret: { type: 'string', description: 'SIRET ou SIREN, chiffres seuls' },
        tva_intracom: { type: 'string' },
        adresse: { type: 'string', description: 'Sur une seule ligne' },
        iban: { type: 'string' },
        categorie: { type: 'string', enum: CATEGORIES_FOURNISSEUR, description: 'Le type de fournisseur, d’après ce qu’il facture' },
      },
      required: ['nom', 'siret', 'tva_intracom', 'adresse', 'iban', 'categorie'],
    },
    numero: { type: 'string' },
    date: { type: 'string', description: 'Date de facturation au format AAAA-MM-JJ' },
    echeance: { type: 'string', description: 'Date d’échéance au format AAAA-MM-JJ, vide si absente' },
    montant_ht: { type: 'number' },
    montant_tva: { type: 'number' },
    montant_ttc: { type: 'number' },
    taux_tva: { type: 'number', description: 'Taux de TVA principal en %, 0 si autoliquidation' },
    avoir: { type: 'boolean', description: 'true seulement si le document est un avoir' },
    lignes: {
      type: 'array',
      description: 'Au plus 12 lignes',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          designation: { type: 'string' },
          quantite: { type: 'number' },
          prix_unitaire_ht: { type: 'number' },
          total_ht: { type: 'number' },
        },
        required: ['designation', 'quantite', 'prix_unitaire_ht', 'total_ht'],
      },
    },
  },
  required: ['facture', 'fournisseur', 'numero', 'date', 'echeance', 'montant_ht', 'montant_tva', 'montant_ttc', 'taux_tva', 'avoir', 'lignes'],
} as const;

const CONSIGNE_ACHAT = `Tu lis une facture reçue d'un fournisseur par une entreprise française du bâtiment (plomberie, chauffage) : négoce, loueur, sous-traitant, carburant…
Le fournisseur est l'entreprise qui émet la facture, pas le client destinataire.
Recopie les champs tels qu'ils sont imprimés, sans rien inventer : un champ absent reste une chaîne vide (ou 0 pour un nombre).
Montants en euros, positifs, au format numérique (1122.55), même pour un avoir.`;

/** Lit une facture fournisseur (PDF ou photo). */
export async function lireFactureFournisseur(fichier: Buffer, typeMime: string, nom: string): Promise<FactureLue | { message: string }> {
  if (!lectureActivee()) return { message: 'Lecture automatique pas encore activée : complétez les champs à la main.' };
  if (fichier.byteLength > TAILLE_MAX) return { message: 'Fichier trop lourd pour la lecture automatique (20 Mo au plus).' };
  const pdf = typeMime === 'application/pdf' || /\.pdf$/i.test(nom);
  const image = /^image\/(jpeg|png|gif|webp)$/.test(typeMime);
  if (!pdf && !image) return { message: 'Format non lu automatiquement : complétez les champs à la main.' };

  const donnees = fichier.toString('base64');
  const piece: Anthropic.ContentBlockParam = pdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } }
    : {
        type: 'image',
        source: { type: 'base64', media_type: typeMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: donnees },
      };
  try {
    const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic(espace ? { defaultHeaders: { 'anthropic-workspace-id': espace } } : {});
    const reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 8000,
      system: CONSIGNE_ACHAT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_ACHAT as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: [piece, { type: 'text', text: `Fichier : ${nom}. Lis cette facture.` }] }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens') {
      return { message: 'La facture n’a pas pu être lue entièrement : complétez les champs à la main.' };
    }
    const texte = reponse.content.find((b) => b.type === 'text');
    if (!texte || texte.type !== 'text') return { message: 'Aucun champ reconnu.' };
    return JSON.parse(texte.text) as FactureLue;
  } catch (e) {
    console.error('Lecture automatique (achat)', e);
    return { message: raisonEchec(e) };
  }
}

// ---------------------------------------------------------------------------
// Anciennes fiches d'intervention (Interventions › Importer)
// ---------------------------------------------------------------------------

/** Ce que la lecture rend d'une fiche d'intervention papier ou PDF (chaîne vide quand rien n'est lu). */
export type FicheLue = {
  fiche: boolean;
  numero: string;
  date: string;
  heure: string;
  type: 'depannage' | 'chantier' | 'entretien';
  client: string;
  client_type: 'particulier' | 'syndic' | 'bailleur' | 'entreprise' | 'collectivite';
  telephone: string;
  adresse: string;
  code_postal: string;
  ville: string;
  motif: string;
  demande: string;
  travaux: string;
  fournitures: { designation: string; quantite: number }[];
  technicien: string;
  duree: string;
  observations: string;
};

const SCHEMA_FICHE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fiche: { type: 'boolean', description: 'false si le document n’est pas une fiche, un bon ou un rapport d’intervention' },
    numero: { type: 'string', description: 'Numéro de la fiche ou du bon' },
    date: { type: 'string', description: 'Date de l’intervention au format AAAA-MM-JJ, vide si absente' },
    heure: { type: 'string', description: 'Heure d’arrivée au format HH:MM, vide si absente' },
    type: { type: 'string', enum: ['depannage', 'chantier', 'entretien'], description: 'depannage par défaut ; entretien pour une visite annuelle ou un contrat' },
    client: { type: 'string', description: 'Nom du client tel qu’imprimé ou écrit (ex. Mme Laurent, Cabinet Foncia)' },
    client_type: { type: 'string', enum: ['particulier', 'syndic', 'bailleur', 'entreprise', 'collectivite'] },
    telephone: { type: 'string' },
    adresse: { type: 'string', description: 'Rue du lieu d’intervention' },
    code_postal: { type: 'string' },
    ville: { type: 'string' },
    motif: { type: 'string', description: 'En deux à cinq mots : Fuite, Panne chaudière, Entretien annuel…' },
    demande: { type: 'string', description: 'Ce que le client a demandé ou constaté' },
    travaux: { type: 'string', description: 'Travaux réalisés, tels qu’écrits sur la fiche' },
    fournitures: {
      type: 'array',
      description: 'Pièces et fournitures posées, au plus 20',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { designation: { type: 'string' }, quantite: { type: 'number' } },
        required: ['designation', 'quantite'],
      },
    },
    technicien: { type: 'string', description: 'Nom ou prénom du technicien' },
    duree: { type: 'string', description: 'Temps passé tel qu’écrit (ex. 1 h 30)' },
    observations: { type: 'string', description: 'Remarques, réserves, travaux à prévoir' },
  },
  required: [
    'fiche',
    'numero',
    'date',
    'heure',
    'type',
    'client',
    'client_type',
    'telephone',
    'adresse',
    'code_postal',
    'ville',
    'motif',
    'demande',
    'travaux',
    'fournitures',
    'technicien',
    'duree',
    'observations',
  ],
} as const;

const CONSIGNE_FICHE = `Tu lis une fiche d'intervention (bon d'intervention, rapport de dépannage) d'une entreprise française du bâtiment (plomberie, chauffage), souvent remplie à la main puis scannée ou photographiée.
Recopie les champs tels qu'ils sont écrits, sans rien inventer : un champ absent reste une chaîne vide.
Le client est la personne ou la société chez qui l'intervention a lieu (ou le syndic qui l'a commandée), pas l'entreprise qui intervient.`;

/** Lit une ancienne fiche d'intervention (PDF ou photo). */
export async function lireFicheIntervention(fichier: Buffer, typeMime: string, nom: string): Promise<FicheLue | { message: string }> {
  if (!lectureActivee()) return { message: 'Lecture automatique pas encore activée : complétez les champs à la main.' };
  if (fichier.byteLength > TAILLE_MAX) return { message: 'Fichier trop lourd pour la lecture automatique (20 Mo au plus).' };
  const pdf = typeMime === 'application/pdf' || /\.pdf$/i.test(nom);
  const image = /^image\/(jpeg|png|gif|webp)$/.test(typeMime);
  if (!pdf && !image) return { message: 'Format non lu automatiquement : PDF, JPG, PNG ou WEBP.' };

  const donnees = fichier.toString('base64');
  const piece: Anthropic.ContentBlockParam = pdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } }
    : {
        type: 'image',
        source: { type: 'base64', media_type: typeMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: donnees },
      };
  try {
    const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic(espace ? { defaultHeaders: { 'anthropic-workspace-id': espace } } : {});
    const reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 8000,
      system: CONSIGNE_FICHE,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_FICHE as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: [piece, { type: 'text', text: `Fichier : ${nom}. Lis cette fiche d’intervention.` }] }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens') {
      return { message: 'La fiche n’a pas pu être lue entièrement : complétez les champs à la main.' };
    }
    const texte = reponse.content.find((b) => b.type === 'text');
    if (!texte || texte.type !== 'text') return { message: 'Aucun champ reconnu.' };
    return JSON.parse(texte.text) as FicheLue;
  } catch (e) {
    console.error('Lecture automatique (fiche)', e);
    return { message: raisonEchec(e) };
  }
}

/** Traduit l'erreur de l'API en une phrase qui dit quoi faire. */
function raisonEchec(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'La lecture a pris trop de temps : relancez-la.';
  if (e instanceof Anthropic.APIError) {
    const detail = String(e.message ?? '');
    if (e.status === 401) return 'Clé ANTHROPIC_API_KEY refusée : vérifiez-la dans Vercel, puis redéployez.';
    if (e.status === 403) return 'Cette clé n’a pas le droit de lire les documents : vérifiez le compte Anthropic.';
    if (/not scoped to a workspace/i.test(detail))
      return 'Clé Anthropic sans espace de travail : créez une clé dans l’espace « Default » de la console Anthropic, ou ajoutez ANTHROPIC_WORKSPACE_ID dans Vercel.';
    if (/workspace/i.test(detail) && (e.status === 400 || e.status === 404))
      return 'Espace de travail Anthropic introuvable : vérifiez ANTHROPIC_WORKSPACE_ID dans Vercel.';
    if (/credit balance/i.test(detail)) return 'Crédit Anthropic épuisé : ajoutez du crédit dans Billing sur console.anthropic.com.';
    if (e.status === 404) return 'Modèle de lecture introuvable sur ce compte Anthropic.';
    if (e.status === 413) return 'Fichier trop lourd pour la lecture automatique.';
    if (e.status === 429) return 'Trop de lectures en même temps : relancez dans une minute.';
    if (e.status && e.status >= 500) return 'Le service de lecture est surchargé : relancez dans quelques minutes.';
    return `La lecture automatique a échoué (${e.status ?? 'réseau'}) : ${detail.slice(0, 300)}`;
  }
  return 'La lecture automatique a échoué : complétez les champs à la main.';
}
