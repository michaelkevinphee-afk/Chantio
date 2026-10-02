import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
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
