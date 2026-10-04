import 'server-only';

// Annuaire public et gratuit de l'État (recherche-entreprises.api.gouv.fr, sans clé) :
// recherche par nom ou SIREN/SIRET, et contrôle des dirigeants déclarés.

export type EntrepriseTrouvee = {
  nom: string;
  siren: string;
  siret: string | null;
  forme_juridique: string | null;
  activite: string | null;
  tva_intracom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  latitude: number | null;
  longitude: number | null;
  dirigeants: { nom: string; fonction: string | null }[];
  fermee: boolean;
  /** Déjà inscrite sur Chantio (renseigné par la recherche). */
  inscrite?: boolean;
};

// Formes juridiques les plus courantes (codes INSEE « catégorie juridique »).
const FORMES: Record<string, string> = {
  '1000': 'Entrepreneur individuel',
  '5202': 'SNC',
  '5499': 'SARL',
  '5498': 'EURL',
  '5410': 'SARL',
  '5599': 'SA',
  '5710': 'SAS',
  '5720': 'SASU',
  '6540': 'SCI',
  '6541': 'SCI',
  '9110': 'Syndicat de copropriété',
  '9220': 'Association',
  '7210': 'Commune',
  '7220': 'Département',
  '7230': 'Région',
  '7346': 'Communauté de communes',
  '7344': 'Métropole',
  '7389': 'Établissement public',
  '5546': 'SA d’HLM',
  '5547': 'SA d’HLM',
  '7371': 'Office public de l’habitat',
};

/** Clé de TVA intracommunautaire française, calculée à partir du SIREN. */
function tva(siren: string) {
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, '0')}${siren}`;
}

const titre = (s: string) =>
  s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

type Brut = {
  siren: string;
  nom_complet?: string;
  nom_raison_sociale?: string | null;
  nature_juridique?: string | null;
  activite_principale?: string | null;
  etat_administratif?: string;
  siege?: {
    siret?: string;
    numero_voie?: string | null;
    indice_repetition?: string | null;
    type_voie?: string | null;
    libelle_voie?: string | null;
    complement_adresse?: string | null;
    code_postal?: string | null;
    libelle_commune?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  };
  dirigeants?: { nom?: string | null; prenoms?: string | null; denomination?: string | null; qualite?: string | null }[];
};

function mettreEnForme(e: Brut): EntrepriseTrouvee {
  const s = e.siege ?? {};
  const rue = [s.numero_voie, s.indice_repetition, s.type_voie, s.libelle_voie].filter(Boolean).join(' ');
  const num = (v?: string | null) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
  return {
    nom: e.nom_raison_sociale || e.nom_complet || '',
    siren: e.siren,
    siret: s.siret ?? null,
    forme_juridique: (e.nature_juridique && FORMES[e.nature_juridique]) || null,
    activite: e.activite_principale ? `NAF ${e.activite_principale}` : null,
    tva_intracom: tva(e.siren),
    adresse: rue ? titre(rue) : null,
    code_postal: s.code_postal ?? null,
    ville: s.libelle_commune ? titre(s.libelle_commune) : null,
    latitude: num(s.latitude),
    longitude: num(s.longitude),
    dirigeants: (e.dirigeants ?? [])
      .map((d) => ({
        nom: d.denomination ? titre(d.denomination) : [d.prenoms && titre(d.prenoms), d.nom && titre(d.nom)].filter(Boolean).join(' '),
        fonction: d.qualite ?? null,
      }))
      .filter((d) => d.nom)
      .slice(0, 4),
    fermee: e.etat_administratif === 'C',
  };
}

/** Cherche par nom, SIREN ou SIRET (6 résultats au plus). Lève une erreur si l'annuaire ne répond pas. */
export async function chercherEntreprises(q: string): Promise<EntrepriseTrouvee[]> {
  // Un SIRET (14 chiffres) se cherche par son SIREN (9 premiers).
  const chiffres = q.trim().replace(/\s/g, '');
  const recherche = /^\d{14}$/.test(chiffres) ? chiffres.slice(0, 9) : /^\d{9}$/.test(chiffres) ? chiffres : q.trim();
  if (recherche.length < 3) return [];
  const url = new URL('https://recherche-entreprises.api.gouv.fr/search');
  url.searchParams.set('q', recherche);
  url.searchParams.set('per_page', '6');
  const rep = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const json = (await rep.json()) as { results?: Brut[] };
  return (json.results ?? []).map(mettreEnForme);
}

/** La fiche officielle d'un SIREN, ou null. */
export async function ficheSiren(siren: string): Promise<EntrepriseTrouvee | null> {
  const resultats = await chercherEntreprises(siren);
  return resultats.find((r) => r.siren === siren) ?? null;
}

const simplifier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Le prénom et le nom figurent ensemble parmi les dirigeants déclarés au registre. */
export function figureParmiDirigeants(fiche: EntrepriseTrouvee, prenom: string, nom: string | null) {
  const attendus = [...simplifier(prenom), ...simplifier(nom ?? '')];
  if (attendus.length < 2) return false;
  return fiche.dirigeants.some((d) => {
    const mots = new Set(simplifier(d.nom));
    return attendus.every((m) => mots.has(m));
  });
}
