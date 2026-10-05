import { LIBELLE_PARCOURS, sansAccents, type Parcours, type StatutDocument, type TypeFacture } from '@chantio/shared';
import type { TonCompteur } from '@/components/compteurs-onglets';

// Règles de « Mes devis » et « Mes factures » (SEG_D, TYPES_D, PERIODES_D, dansPeriode du bac), lues à la fois
// par les pages serveur (paramètres d'adresse ?filtre=, ?type=, ?periode=) et par la liste dans le navigateur.

export type GenreListe = 'devis' | 'facture';

/** Une ligne du tableau, préparée par le serveur (lireListeDocuments). */
export interface LigneVente {
  id: string;
  genre: GenreListe;
  statut: StatutDocument;
  /** Type de devis (parcours) ou type de facture. */
  type: Parcours | TypeFacture;
  /** Devis de chantier qui répond à un appel d'offres. */
  ao: boolean;
  clientId: string | null;
  /** Nom de la fiche client (« — » sans client). */
  client: string;
  objet: string;
  numero: string | null;
  /** Date du document (aaaa-mm-jj), celle des filtres de période. */
  date: string;
  /** Date d'émission affichée : null pour un brouillon. */
  emission: string | null;
  /** Échéance d'une facture, fin de validité d'un devis envoyé, date limite d'un appel d'offres à préparer. */
  echeance: string | null;
  echeanceDepassee: boolean;
  /** Facture émise qui reste à encaisser (avoirs déduits), et en retard si son échéance est passée. */
  aEncaisser: boolean;
  enRetard: boolean;
  /** Facture entièrement annulée par un ou plusieurs avoirs. */
  annuleeParAvoir: boolean;
  avoir: boolean;
  /** Montants signés : négatifs pour un avoir. */
  ht: number;
  ttc: number;
  /** Devis signé : part déjà facturée (%). */
  facturePct: number | null;
  /** Texte de recherche (numéro, objet, client, type, ordre de service), sans accents. */
  cherche: string;
  creeLe: string;
}

export interface Segment {
  cle: string;
  libelle: string;
  ton: TonCompteur;
  /** Anciennes valeurs d'adresse acceptées. */
  alias: readonly string[];
  test: (l: LigneVente) => boolean;
}

const brouillon = (l: LigneVente) => l.statut === 'brouillon';

/** Les compteurs du haut : chacun filtre le tableau (SEG_D du bac). */
export const SEGMENTS: Record<GenreListe, readonly Segment[]> = {
  devis: [
    { cle: 'tous', libelle: 'Tous', ton: 'gris', alias: ['toutes'], test: () => true },
    { cle: 'brouillon', libelle: 'Brouillons', ton: 'cobalt', alias: ['brouillons'], test: brouillon },
    { cle: 'attente', libelle: 'En attente', ton: 'violet', alias: ['envoye', 'envoyes', 'en_attente'], test: (l) => l.statut === 'envoye' },
    { cle: 'signe', libelle: 'Signés', ton: 'vert', alias: ['signes'], test: (l) => l.statut === 'signe' },
    { cle: 'refuse', libelle: 'Refusés', ton: 'gris', alias: ['refuses', 'annule'], test: (l) => l.statut === 'refuse' || l.statut === 'annule' },
  ],
  facture: [
    { cle: 'toutes', libelle: 'Toutes', ton: 'gris', alias: ['tous'], test: () => true },
    { cle: 'brouillon', libelle: 'Brouillons', ton: 'cobalt', alias: ['brouillons'], test: brouillon },
    { cle: 'a_encaisser', libelle: 'À encaisser', ton: 'violet', alias: ['encaisser', 'aencaisser'], test: (l) => l.aEncaisser },
    { cle: 'retard', libelle: 'En retard', ton: 'rouge', alias: ['en_retard', 'retards'], test: (l) => l.enRetard },
    { cle: 'terminee', libelle: 'Terminées', ton: 'vert', alias: ['terminees', 'payee', 'payees'], test: (l) => !brouillon(l) && !l.aEncaisser },
  ],
};

/** Libellés courts des types de facture (colonne Type, menu « Tous les types »). */
export const TYPE_FACTURE_COURT: Record<TypeFacture, string> = {
  totale: 'Totale',
  acompte: 'Acompte',
  avancement: 'Avancement',
  situation: 'Situation',
  solde: 'Solde',
  avoir: 'Avoir',
};

/** Menu « Tous les types » (TYPES_D du bac) ; « ao » = appels d'offres. */
export const TYPES: Record<GenreListe, readonly (readonly [string, string])[]> = {
  devis: [
    ['tous', 'Tous les types'],
    ['depannage', LIBELLE_PARCOURS.depannage],
    ['chantier', LIBELLE_PARCOURS.chantier],
    ['ao', 'Chantier · appels d’offres'],
    ['contrat', LIBELLE_PARCOURS.contrat],
  ],
  facture: [['tous', 'Tous les types'], ...(Object.entries(TYPE_FACTURE_COURT) as [string, string][])],
};

/** Menu « Toutes les dates », sur la date d'émission (PERIODES_D du bac). */
export const PERIODES = [
  ['tout', 'Toutes les dates'],
  ['mois', 'Ce mois-ci'],
  ['mois_prec', 'Le mois dernier'],
  ['trimestre', 'Les 3 derniers mois'],
  ['annee', 'Cette année'],
  ['annee_prec', 'L’année dernière'],
] as const;

export const defautSegment = (g: GenreListe) => SEGMENTS[g][0].cle;

// ---------------------------------------------------------------------------
// Mémoire de la liste (etat.docTri, docPage, docParPage… du bac), gardée dans un cookie de session :
// la croix de l'éditeur (?garder=1) ramène au même compteur, type, période, recherche, tri et page ;
// le menu rouvre la liste sans filtre, en gardant le tri et le nombre de résultats par page.
// ---------------------------------------------------------------------------

export const COOKIE_LISTE = 'chantio-ventes';
export type TriListe = { cle: string; sens: 'asc' | 'desc' };
export const TRI_DEFAUT: TriListe = { cle: 'date', sens: 'desc' };
const COLONNES_TRI = ['client', 'num', 'date', 'ech', 'ht', 'ttc'];

export interface MemoireListe {
  tri: TriListe;
  parPage: number;
  /** Par liste : compteur, type, période, recherche et page au moment où l'on a ouvert un document. */
  vues: Partial<Record<GenreListe, { segment: string; type: string; periode: string; q: string; page: number }>>;
}

/** Lit le cookie (valeur brute) ; tout ce qui n'est pas reconnu reprend sa valeur par défaut. */
export function lireMemoire(brut: string | undefined): MemoireListe {
  const m: MemoireListe = { tri: TRI_DEFAUT, parPage: 25, vues: {} };
  if (!brut) return m;
  try {
    const o = JSON.parse(decodeURIComponent(brut)) as Partial<MemoireListe>;
    if (o.tri && COLONNES_TRI.includes(o.tri.cle) && (o.tri.sens === 'asc' || o.tri.sens === 'desc')) m.tri = { cle: o.tri.cle, sens: o.tri.sens };
    if ([25, 50, 100].includes(Number(o.parPage))) m.parPage = Number(o.parPage);
    for (const g of ['devis', 'facture'] as const) {
      const v = o.vues?.[g];
      if (v)
        m.vues[g] = {
          segment: lireSegment(g, v.segment),
          type: lireType(g, v.type),
          periode: lirePeriode(v.periode),
          q: typeof v.q === 'string' ? v.q.slice(0, 200) : '',
          page: Math.max(1, Math.min(10_000, Math.round(Number(v.page) || 1))),
        };
    }
  } catch {
    // cookie illisible : valeurs par défaut
  }
  return m;
}

/** Valeur brute du cookie lue dans le navigateur (la page peut venir du cache du routeur : le cookie fait foi). */
export function cookieListe(): string | undefined {
  const v = document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_LISTE}=`));
  return v ? v.slice(COOKIE_LISTE.length + 1) : undefined;
}

/** Écrit le cookie depuis le navigateur (cookie de session, pour tout le site). */
export function ecrireMemoire(m: MemoireListe) {
  document.cookie = `${COOKIE_LISTE}=${encodeURIComponent(JSON.stringify(m))}; path=/; SameSite=Lax`;
}

/** ?filtre= : une clé, une ancienne valeur, ou rien (Tous / Toutes). ?filtre=ao des devis devient le type « appels d'offres ». */
export function lireSegment(g: GenreListe, v: unknown): string {
  if (typeof v !== 'string') return defautSegment(g);
  const s = SEGMENTS[g].find((x) => x.cle === v || x.alias.includes(v));
  return s?.cle ?? defautSegment(g);
}

export function lireType(g: GenreListe, v: unknown, filtre?: unknown): string {
  if (g === 'devis' && filtre === 'ao') return 'ao';
  if (typeof v !== 'string') return 'tous';
  return TYPES[g].some(([cle]) => cle === v) ? v : 'tous';
}

export function lirePeriode(v: unknown): string {
  return typeof v === 'string' && PERIODES.some(([cle]) => cle === v) ? v : 'tout';
}

const iso = (a: number, m: number, j = 1) => {
  const d = new Date(a, m, j);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La date du document est-elle dans la période choisie ? (dansPeriode du bac) */
export function dansPeriode(date: string | null | undefined, periode: string, aujourdhui: string): boolean {
  if (!periode || periode === 'tout') return true;
  if (!date) return false;
  const x = date.slice(0, 10);
  const a = Number(aujourdhui.slice(0, 4));
  const m = Number(aujourdhui.slice(5, 7)) - 1;
  const m0 = iso(a, m);
  if (periode === 'mois') return x >= m0;
  if (periode === 'mois_prec') return x >= iso(a, m - 1) && x < m0;
  if (periode === 'trimestre') return x >= iso(a, m - 2);
  if (periode === 'annee') return x >= `${a}-01-01`;
  return x >= `${a - 1}-01-01` && x < `${a}-01-01`;
}

/** Contient tous les mots cherchés (contient() du bac : sans accents, dans n'importe quel ordre). */
export function correspond(l: LigneVente, q: string): boolean {
  return sansAccents(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((m) => l.cherche.includes(m));
}

/** Les lignes après la recherche (ou le client), le type et la période, avant le compteur choisi (docsBase du bac). */
export function lignesDeBase(
  lignes: readonly LigneVente[],
  c: { q: string; clientAuto: { id: string; nom: string } | null; type: string; periode: string },
  aujourdhui: string,
): LigneVente[] {
  const parClient = !!c.clientAuto && c.q === c.clientAuto.nom;
  return lignes.filter(
    (l) =>
      (parClient ? l.clientId === c.clientAuto!.id : correspond(l, c.q)) &&
      (c.type === 'tous' || (c.type === 'ao' ? l.ao : l.type === c.type)) &&
      dansPeriode(l.date, c.periode, aujourdhui),
  );
}
