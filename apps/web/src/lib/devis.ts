import 'server-only';
import {
  aujourdhui,
  calculer,
  titreDocument,
  completerClient,
  completerConditions,
  estAppelOffres,
  etatDocument,
  nomClient,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type ReglagesFacturation,
  type StatutDocument,
  type TonStatut,
  type TypeFacture,
} from '@chantio/shared';
import type { supabaseServeur } from './supabase/server';

type Supa = Awaited<ReturnType<typeof supabaseServeur>>;

export interface DocumentLu {
  id: string;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  numero: string | null;
  statut: StatutDocument;
  client_id: string | null;
  client: ClientDocument;
  objet: string;
  date_document: string;
  echeance: string | null;
  conditions: ConditionsDocument;
  devis_id: string | null;
  facture_id: string | null;
  remise: number;
  pourcentage: number;
  avancement: number;
  avancement_precedent: number;
  situation_numero: number | null;
  /** Coefficient global du document (sinon celui des réglages). */
  coefficient: number | null;
  total_ht: number;
  total_ttc: number;
  net_a_payer: number;
  origine: 'saisie' | 'import';
  finalise_le: string | null;
  envoye_le: string | null;
  relance_le: string | null;
  relances: number;
  signe_le: string | null;
  paye_le: string | null;
  cree_le: string;
}

export interface LigneLue extends LigneDocument {
  id: string;
  position: number;
}

export interface ArticleLu {
  id: string;
  designation: string;
  categorie: string;
  unite: string;
  reference: string | null;
  prix_achat: number;
  prix_vente: number;
  /** Temps de pose par unité (ouvrages). */
  heures: number;
  tva: number;
  utilisations: number;
  actif: boolean;
}

export interface ImportLu {
  id: string;
  nom_fichier: string;
  chemin: string;
  taille: number | null;
  type_mime: string | null;
  statut: 'a_lire' | 'a_verifier' | 'pret' | 'converti' | 'erreur';
  champs: ChampsLus;
  document_id: string | null;
  cree_le: string;
}

/** Ce que la lecture automatique a trouvé dans un document importé. */
export interface ChampsLus {
  genre?: GenreDocument;
  numero?: string;
  date?: string;
  client?: string;
  adresse?: string;
  ville?: string;
  telephone?: string;
  email?: string;
  siret?: string;
  objet?: string;
  tva?: number;
  validite?: string;
  acompte?: string;
  total_ttc?: number;
  lignes?: { designation: string; quantite: number; unite: string; prix_unitaire: number; tva: number; doute?: boolean }[];
  /** Fiabilité de lecture par champ (0 à 100). */
  confiance?: Record<string, number>;
  message?: string;
}

const NOMBRES_DOC = ['remise', 'pourcentage', 'avancement', 'avancement_precedent', 'total_ht', 'total_ttc', 'net_a_payer'] as const;

export function normaliserDocument(d: Record<string, unknown>, reglages?: ReglagesFacturation): DocumentLu {
  const doc = { ...d } as unknown as DocumentLu;
  for (const k of NOMBRES_DOC) (doc as unknown as Record<string, number>)[k] = Number(d[k] ?? 0);
  doc.coefficient = d.coefficient == null ? null : Number(d.coefficient);
  doc.client = completerClient(d.client as Partial<ClientDocument>);
  doc.conditions = completerConditions(d.conditions as Partial<ConditionsDocument>, reglages);
  return doc;
}

export function normaliserLigne(l: Record<string, unknown>): LigneLue {
  return {
    id: String(l.id),
    position: Number(l.position ?? 0),
    titre: !!l.titre,
    designation: String(l.designation ?? ''),
    quantite: Number(l.quantite ?? 0),
    unite: String(l.unite ?? 'u'),
    prix_unitaire: Number(l.prix_unitaire ?? 0),
    tva: Number(l.tva ?? 10),
    avancement: Number(l.avancement ?? 0),
    avancement_precedent: Number(l.avancement_precedent ?? 0),
    article_id: (l.article_id as string | null) ?? null,
    achat: l.achat == null ? null : Number(l.achat),
    heures: l.heures == null ? null : Number(l.heures),
    coefficient: l.coefficient == null ? null : Number(l.coefficient),
    prix_calcule: !!l.prix_calcule,
    metre: (l.metre as LigneDocument['metre']) ?? null,
    reference: (l.reference as string | null) ?? null,
  };
}

export function normaliserArticle(a: Record<string, unknown>): ArticleLu {
  return {
    id: String(a.id),
    designation: String(a.designation),
    categorie: String(a.categorie),
    unite: String(a.unite),
    reference: (a.reference as string | null) ?? null,
    prix_achat: Number(a.prix_achat ?? 0),
    prix_vente: Number(a.prix_vente ?? 0),
    heures: Number(a.heures ?? 0),
    tva: Number(a.tva ?? 10),
    utilisations: Number(a.utilisations ?? 0),
    actif: a.actif !== false,
  };
}

export async function lireArticles(supabase: Supa): Promise<ArticleLu[]> {
  const { data } = await supabase.from('articles').select('*').eq('actif', true).order('utilisations', { ascending: false }).order('designation');
  return (data ?? []).map(normaliserArticle);
}

export async function lireDocument(supabase: Supa, id: string, reglages?: ReglagesFacturation) {
  const [{ data: d }, { data: lignes }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('lignes_document').select('*').eq('document_id', id).order('position'),
  ]);
  if (!d) return null;
  return { document: normaliserDocument(d, reglages), lignes: (lignes ?? []).map(normaliserLigne) };
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export interface RangDocument {
  id: string;
  lien: string;
  numero: string;
  client: string;
  pro: boolean;
  lieu: string;
  objet: string;
  date: string;
  montant: number;
  etat: { libelle: string; ton: TonStatut; retard: number };
  statut: StatutDocument;
  importe: boolean;
  /** Devis qui répond à un appel d'offres. */
  ao: boolean;
  /** Progression : 0 brouillon, 1 envoyé, 2 signé ou à encaisser, 3 facturé ou payé, -1 refusé ou en retard. */
  jalon: number;
  detail: string;
  email: string;
  relancable: boolean;
  facturable: boolean;
  encaissable: boolean;
}

export interface Tuile {
  cle: 'attente' | 'signes' | 'encaisser' | 'retard';
  libelle: string;
  teinte: string;
  valeur: number;
  montant: number;
  unite: string;
  delta: string;
  sens: 'haut' | 'bas' | 'neutre';
  serie: number[];
  onglet: 'devis' | 'factures';
  filtre?: string;
  alerte?: boolean;
}

export interface TableauDeBord {
  sousTitre: string;
  tuiles: Tuile[];
  mois: { libelle: string; facture: number; encaisse: number; actuel: boolean }[];
  totalAnnee: number;
  objectif: number;
  objectifDefini: boolean;
  factureMois: number;
  signesNonFactures: number;
  nbSignesNonFactures: number;
  parcours: { libelle: string; nombre: number }[];
  devis: RangDocument[];
  factures: RangDocument[];
  importes: RangDocument[];
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jour = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const dateFr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

function lieu(c: ClientDocument): string {
  const adr = c.identique ? c.adresse : c.adresseChantier || c.adresse;
  const m = adr.match(/\b(\d{5})\s+([^,]+)$/);
  if (!m) return adr.split(',').pop()?.trim() ?? '';
  const [, cp, ville] = m;
  if (/^75\d{3}$/.test(cp) && /paris/i.test(ville)) return `Paris ${Number(cp.slice(3))}e`;
  return ville.trim().replace(/\b\w/g, (x) => x.toUpperCase());
}

function ilYa(iso: string | null, ref: string): string {
  if (!iso) return '';
  const j = Math.round((Date.parse(ref) - Date.parse(jour(iso))) / 86_400_000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  return `il y a ${j} j`;
}

export async function lireTableauDeBord(supabase: Supa, nomEntreprise: string, reglages: ReglagesFacturation): Promise<TableauDeBord> {
  const ajd = aujourdhui();
  const annee = Number(ajd.slice(0, 4));
  const moisCourant = Number(ajd.slice(5, 7)) - 1;

  const [{ data: docs }, { data: imports }] = await Promise.all([
    supabase
      .from('documents')
      .select(
        'id, genre, type_facture, numero, statut, client, objet, date_document, echeance, conditions, devis_id, total_ht, total_ttc, net_a_payer, origine, finalise_le, envoye_le, relance_le, relances, signe_le, paye_le, cree_le',
      )
      .order('date_document', { ascending: false })
      .order('cree_le', { ascending: false })
      .limit(1000),
    supabase.from('imports').select('*').in('statut', ['a_lire', 'a_verifier', 'pret', 'erreur']).or('champs->>genre.is.null,champs->>genre.neq.intervention').order('cree_le', { ascending: false }),
  ]);
  const tous = (docs ?? []).map((d) => normaliserDocument(d));
  const devis = tous.filter((d) => d.genre === 'devis');
  const factures = tous.filter((d) => d.genre === 'facture');
  const finalisees = factures.filter((f) => f.numero);
  const facturesParDevis = new Map<string, DocumentLu[]>();
  for (const f of finalisees) if (f.devis_id) facturesParDevis.set(f.devis_id, [...(facturesParDevis.get(f.devis_id) ?? []), f]);

  // --- Tuiles
  const enAttente = devis.filter((d) => d.statut === 'envoye');
  const semaine = Date.parse(ajd) - 7 * 86_400_000;
  const envoyesSemaine = enAttente.filter((d) => d.finalise_le && Date.parse(d.finalise_le) >= semaine).length;
  const debutMois = `${ajd.slice(0, 7)}-01`;
  const moisPrec = new Date(annee, moisCourant - 1, 1);
  const debutMoisPrec = `${moisPrec.getFullYear()}-${String(moisPrec.getMonth() + 1).padStart(2, '0')}-01`;
  const signesMois = devis.filter((d) => d.statut === 'signe' && jour(d.signe_le) >= debutMois);
  const signesMoisPrec = devis.filter((d) => d.statut === 'signe' && jour(d.signe_le) >= debutMoisPrec && jour(d.signe_le) < debutMois);
  const somme = (l: DocumentLu[], k: 'net_a_payer' | 'total_ht' = 'net_a_payer') => l.reduce((s, d) => s + d[k], 0);
  const aEncaisser = finalisees.filter((f) => f.statut === 'a_encaisser' && f.type_facture !== 'avoir');
  const enRetard = aEncaisser.filter((f) => f.echeance && f.echeance < ajd);
  const retardMax = enRetard.reduce((m, f) => Math.max(m, etatDocument(f, ajd).retard), 0);
  const echeanceMoy = aEncaisser.length
    ? Math.round(aEncaisser.reduce((s, f) => s + Math.max(0, (Date.parse(f.echeance ?? ajd) - Date.parse(ajd)) / 86_400_000), 0) / aEncaisser.length)
    : 0;

  const parSemaine = (liste: DocumentLu[], cle: 'finalise_le' | 'signe_le' | 'date_document') =>
    Array.from({ length: 6 }, (_, i) => {
      const fin = Date.parse(ajd) - (5 - i) * 7 * 86_400_000 + 86_400_000;
      const debut = fin - 7 * 86_400_000;
      return liste.filter((d) => {
        const t = d[cle] ? Date.parse(jour(d[cle] as string)) : NaN;
        return t >= debut && t < fin;
      }).length;
    });

  const varSignes = somme(signesMoisPrec) ? Math.round(((somme(signesMois) - somme(signesMoisPrec)) / somme(signesMoisPrec)) * 100) : null;
  const tuiles: Tuile[] = [
    {
      cle: 'attente',
      libelle: 'Devis en attente',
      teinte: 'var(--cobalt)',
      valeur: enAttente.length,
      montant: somme(enAttente),
      unite: 'devis',
      delta: envoyesSemaine ? `+${envoyesSemaine} cette semaine` : 'Aucun envoi cette semaine',
      sens: envoyesSemaine ? 'haut' : 'neutre',
      serie: parSemaine(devis.filter((d) => d.finalise_le), 'finalise_le'),
      onglet: 'devis',
      filtre: 'Envoyé',
    },
    {
      cle: 'signes',
      libelle: 'Signés ce mois',
      teinte: 'var(--vert)',
      valeur: signesMois.length,
      montant: somme(signesMois),
      unite: 'devis',
      delta:
        varSignes === null
          ? `en ${MOIS_LONG[moisCourant]}`
          : `${varSignes >= 0 ? '+' : ''}${varSignes} % vs ${MOIS_LONG[moisPrec.getMonth()]}`,
      sens: varSignes === null ? 'neutre' : varSignes >= 0 ? 'haut' : 'bas',
      serie: parSemaine(devis.filter((d) => d.signe_le), 'signe_le'),
      onglet: 'devis',
      filtre: 'Signé',
    },
    {
      cle: 'encaisser',
      libelle: 'À encaisser',
      teinte: 'var(--violet)',
      valeur: aEncaisser.length,
      montant: somme(aEncaisser),
      unite: aEncaisser.length > 1 ? 'factures' : 'facture',
      delta: aEncaisser.length ? `Échéance moyenne ${echeanceMoy} j` : 'Tout est encaissé',
      sens: 'neutre',
      serie: parSemaine(finalisees, 'date_document'),
      onglet: 'factures',
      filtre: 'À encaisser',
    },
    {
      cle: 'retard',
      libelle: 'En retard',
      teinte: 'var(--rouge)',
      valeur: enRetard.length,
      montant: somme(enRetard),
      unite: enRetard.length > 1 ? 'factures' : 'facture',
      delta: enRetard.length ? `${retardMax} jour${retardMax > 1 ? 's' : ''} de retard` : 'Aucun retard',
      sens: enRetard.length ? 'bas' : 'haut',
      serie: parSemaine(enRetard, 'date_document'),
      onglet: 'factures',
      filtre: 'En retard',
      alerte: enRetard.length > 0,
    },
  ];

  // --- Chiffre d'affaires de l'année (HT), facturé et encaissé
  const mois = MOIS.slice(0, moisCourant + 1).map((libelle, i) => {
    const prefixe = `${annee}-${String(i + 1).padStart(2, '0')}`;
    const facture = finalisees.filter((f) => f.date_document.startsWith(prefixe)).reduce((s, f) => s + f.total_ht, 0);
    const encaisse = finalisees.filter((f) => f.statut === 'payee' && jour(f.paye_le).startsWith(prefixe)).reduce((s, f) => s + f.total_ht, 0);
    return { libelle, facture, encaisse, actuel: i === moisCourant };
  });
  const totalAnnee = mois.reduce((s, m) => s + m.facture, 0);
  const factureMois = mois[moisCourant]?.facture ?? 0;
  const passes = mois.slice(0, moisCourant).filter((m) => m.facture > 0);
  const objectifDefini = !!reglages.objectif_mensuel;
  const objectif =
    reglages.objectif_mensuel ||
    (passes.length ? Math.ceil(passes.reduce((s, m) => s + m.facture, 0) / passes.length / 1000) * 1000 : 10000);

  const signesNonFactures = devis.filter((d) => d.statut === 'signe' && !facturesParDevis.has(d.id));

  // --- Parcours des devis validés ces 30 derniers jours
  const depuis = Date.parse(ajd) - 30 * 86_400_000;
  const recents = devis.filter((d) => d.finalise_le && Date.parse(d.finalise_le) >= depuis);
  const signes = recents.filter((d) => d.statut === 'signe' || facturesParDevis.has(d.id));
  const factures30 = signes.filter((d) => facturesParDevis.has(d.id));
  const payes = factures30.filter((d) => (facturesParDevis.get(d.id) ?? []).some((f) => f.statut === 'payee'));

  // --- Listes
  const rang = (d: DocumentLu): RangDocument => {
    const etat = etatDocument(d, ajd);
    const facture = d.genre === 'facture';
    let jalon = 0;
    if (facture) jalon = d.statut === 'payee' ? 3 : etat.retard ? -1 : d.numero ? 2 : 0;
    else jalon = d.statut === 'refuse' ? -1 : facturesParDevis.has(d.id) ? 3 : d.statut === 'signe' ? 2 : d.statut === 'envoye' ? 1 : 0;
    let detail = dateFr(d.date_document);
    if (!facture && d.statut === 'envoye') detail += d.relances ? ` · relancé ${ilYa(d.relance_le, ajd)}` : ` · envoyé ${ilYa(d.finalise_le, ajd)}`;
    if (!facture && facturesParDevis.has(d.id)) detail += ' · facturé';
    if (facture && d.statut === 'a_encaisser') {
      detail = etat.retard
        ? `échue depuis ${etat.retard} j`
        : d.echeance
          ? `échéance ${Math.max(0, Math.round((Date.parse(d.echeance) - Date.parse(ajd)) / 86_400_000))} j`
          : 'à encaisser';
    }
    if (facture && d.statut === 'payee') detail = 'encaissée';
    if (d.statut === 'brouillon') detail = `brouillon du ${dateFr(d.date_document)}`;
    const ao = estAppelOffres(d);
    if (ao && d.statut === 'brouillon') detail = [d.conditions.aoConsultation, `brouillon du ${dateFr(d.date_document)}`].filter(Boolean).join(' · ');
    if (ao && d.statut === 'envoye') detail = `réponse envoyée ${ilYa(d.finalise_le, ajd)} · résultat attendu`;
    return {
      id: d.id,
      lien: `/devis/${d.id}`,
      numero: d.numero ?? 'Brouillon',
      client: nomClient(d.client).replace(/^Client à renseigner$/, 'Sans client'),
      pro: d.client.type === 'pro',
      lieu: lieu(d.client),
      objet: d.objet || (facture ? 'Facture' : 'Devis'),
      date: dateFr(d.date_document),
      montant: d.net_a_payer,
      etat,
      statut: d.statut,
      importe: d.origine === 'import',
      ao,
      jalon,
      detail,
      email: d.client.email,
      relancable: (!facture && d.statut === 'envoye') || (facture && d.statut === 'a_encaisser'),
      facturable: !facture && d.statut === 'signe',
      encaissable: facture && d.statut === 'a_encaisser',
    };
  };

  const rangsImports: RangDocument[] = (imports ?? []).map((i) => {
    const c = (i.champs ?? {}) as ChampsLus;
    const doutes = Object.values(c.confiance ?? {}).filter((v) => v < 80).length;
    const etat: RangDocument['etat'] =
      i.statut === 'a_lire'
        ? { libelle: 'À lire', ton: 'gris', retard: 0 }
        : i.statut === 'erreur'
          ? { libelle: 'Lecture impossible', ton: 'rouge', retard: 0 }
          : doutes
            ? { libelle: `${doutes} champ${doutes > 1 ? 's' : ''} à vérifier`, ton: 'violet', retard: 0 }
            : { libelle: 'Prêt', ton: 'vert', retard: 0 };
    return {
      id: i.id,
      lien: `/devis/import/${i.id}`,
      numero: c.numero || i.nom_fichier,
      client: c.client || 'Client à lire',
      pro: false,
      lieu: c.ville || '',
      objet: c.objet || i.nom_fichier,
      date: c.date || dateFr(i.cree_le),
      montant: Number(c.total_ttc ?? 0),
      etat,
      statut: 'brouillon',
      importe: true,
      ao: false,
      jalon: 0,
      detail: c.date || dateFr(i.cree_le),
      email: '',
      relancable: false,
      facturable: false,
      encaissable: false,
    };
  });

  return {
    sousTitre: `${MOIS_LONG[moisCourant].replace(/^./, (x) => x.toUpperCase())} ${annee} · ${nomEntreprise}`,
    tuiles,
    mois,
    totalAnnee,
    objectif,
    objectifDefini,
    factureMois,
    signesNonFactures: signesNonFactures.reduce((s, d) => s + d.total_ht, 0),
    nbSignesNonFactures: signesNonFactures.length,
    parcours: [
      { libelle: 'Envoyés', nombre: recents.length },
      { libelle: 'Signés', nombre: signes.length },
      { libelle: 'Facturés', nombre: factures30.length },
      { libelle: 'Payés', nombre: payes.length },
    ],
    devis: devis.map(rang),
    factures: factures.map(rang),
    importes: rangsImports,
  };
}

// ---------------------------------------------------------------------------
// Ce qui a déjà été facturé sur un devis (acompte, situations…)
// ---------------------------------------------------------------------------

export interface HistoriqueDevis {
  devisId: string;
  numero: string | null;
  /** Part du marché HT déjà facturée par les factures validées (%). */
  dejaPct: number;
  /** Numéro de la prochaine situation. */
  situationNumero: number;
  /** Avancement cumulé de chaque ligne à la dernière situation (par position). */
  avancementsSituation: number[];
  factures: { id: string; numero: string; titre: string; total_ht: number }[];
}

export async function lireHistoriqueDevis(supabase: Supa, devisId: string, sauf?: string | null): Promise<HistoriqueDevis | null> {
  const lu = await lireDocument(supabase, devisId);
  if (!lu || lu.document.genre !== 'devis') return null;
  const marche = calculer({ ...lu.document, genre: 'devis', type_facture: null, lignes: lu.lignes }).marcheHT;
  const { data } = await supabase
    .from('documents')
    .select('id, type_facture, total_ht, numero, situation_numero, date_document')
    .eq('devis_id', devisId)
    .eq('genre', 'facture')
    .not('numero', 'is', null)
    .order('date_document')
    .order('finalise_le');
  const factures = (data ?? []).filter((f) => f.id !== sauf);
  const dejaHT = factures.reduce((s, f) => s + Number(f.total_ht), 0);
  const situations = factures.filter((f) => f.type_facture === 'situation');
  let avancementsSituation: number[] = [];
  const derniere = situations.at(-1);
  if (derniere) {
    const { data: lp } = await supabase.from('lignes_document').select('position, avancement').eq('document_id', derniere.id).order('position');
    avancementsSituation = [];
    for (const l of lp ?? []) avancementsSituation[Number(l.position)] = Number(l.avancement);
  }
  return {
    devisId,
    numero: lu.document.numero,
    dejaPct: marche ? Math.min(100, Math.max(0, Math.round((dejaHT / marche) * 10000) / 100)) : 0,
    situationNumero: situations.length + 1,
    avancementsSituation,
    factures: factures.map((f) => ({
      id: f.id as string,
      numero: f.numero as string,
      titre: titreDocument('facture', f.type_facture as TypeFacture, f.situation_numero as number | null),
      total_ht: Number(f.total_ht),
    })),
  };
}
