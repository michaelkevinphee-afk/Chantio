import { NextResponse, type NextRequest } from 'next/server';
import { contexteBureau } from '@/lib/session';

// Recherche d'entreprises par nom ou SIREN/SIRET, via l'annuaire public et
// gratuit de l'État (recherche-entreprises.api.gouv.fr, sans clé).
// Renvoie des fiches déjà mises en forme pour pré-remplir un nouveau client.

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

export async function GET(requete: NextRequest) {
  await contexteBureau();
  const q = (requete.nextUrl.searchParams.get('q') ?? '').trim();
  // Un SIRET (14 chiffres) se cherche par son SIREN (9 premiers).
  const chiffres = q.replace(/\s/g, '');
  const recherche = /^\d{14}$/.test(chiffres) ? chiffres.slice(0, 9) : /^\d{9}$/.test(chiffres) ? chiffres : q;
  if (recherche.length < 3) return NextResponse.json({ resultats: [] });

  const url = new URL('https://recherche-entreprises.api.gouv.fr/search');
  url.searchParams.set('q', recherche);
  url.searchParams.set('per_page', '6');
  try {
    const rep = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 86400 } });
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const json = (await rep.json()) as { results?: Brut[] };
    return NextResponse.json({ resultats: (json.results ?? []).map(mettreEnForme) });
  } catch (e) {
    console.error('Recherche d’entreprise impossible', e);
    return NextResponse.json({ resultats: [], erreur: 'La recherche ne répond pas, remplissez la fiche à la main.' }, { status: 502 });
  }
}
