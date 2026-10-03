import type { TypeClient, TypeIntervention } from './types.ts';
import { nomClient, type ClientDocument, type LigneDocument } from './devis.ts';

// Création d'une intervention à partir d'un devis : on reprend le client,
// l'adresse du chantier, l'objet et les ouvrages pour pré-remplir la fiche.

export interface AdresseDecoupee {
  adresse: string;
  code_postal: string;
  ville: string;
}

/** « 18 avenue Mozart, 75016 Paris » → rue, code postal et ville séparés. */
export function decouperAdresse(texte: string): AdresseDecoupee {
  const propre = texte.replace(/\s+/g, ' ').trim();
  const m = propre.match(/^(.*?)[,\s-]*\b(\d{5})\s+(.+)$/);
  if (!m) return { adresse: propre, code_postal: '', ville: '' };
  return { adresse: m[1].replace(/[,\s-]+$/, '').trim(), code_postal: m[2], ville: m[3].replace(/,.*$/, '').trim() };
}

export interface InterventionDepuisDevis extends AdresseDecoupee {
  client: { nom: string; telephone: string; type: TypeClient };
  motif: string;
  type: TypeIntervention;
  description: string;
}

const quantite = (q: number) => String(Math.round(q * 100) / 100).replace('.', ',');

export function interventionDepuisDevis(devis: {
  numero: string | null;
  objet: string;
  client: ClientDocument;
  lignes: LigneDocument[];
}): InterventionDepuisDevis {
  const c = devis.client;
  const lieu = !c.identique && c.adresseChantier.trim() ? c.adresseChantier : c.adresse;
  // Les ouvrages utiles au technicien : on laisse de côté les titres, le déplacement et la main d'œuvre.
  const ouvrages = devis.lignes
    .filter((l) => !l.titre && l.designation.trim())
    .filter((l) => !/^(main d.(œ|oe)uvre|d[ée]placement|forfait d[ée]placement)/i.test(l.designation.trim()))
    .map((l) => `• ${quantite(l.quantite)} ${l.unite} · ${l.designation.trim()}`);
  const entete = `D’après le devis ${devis.numero ?? '(brouillon)'}`;
  return {
    client: {
      nom: nomClient(c),
      telephone: c.tel,
      type: c.type === 'pro' ? (/syndic/i.test(c.raison) ? 'syndic' : 'entreprise') : 'particulier',
    },
    ...decouperAdresse(lieu),
    motif: devis.objet.trim() || entete,
    // Un devis prépare des travaux : remplacement ou pose, rarement un dépannage.
    type: /entretien|ramonage|contrat/i.test(devis.objet) ? 'entretien' : 'installation',
    description: [entete + (ouvrages.length ? ' :' : ''), ...ouvrages].join('\n'),
  };
}
