// Devis et factures du bâtiment : calcul des montants (remise, TVA par taux,
// acompte, avancement, situation, solde, avoir, retenue de garantie, prime)
// et conditions particulières. Partagé entre l'aperçu en direct (navigateur)
// et l'enregistrement (serveur), pour que les deux donnent le même total.

export type GenreDocument = 'devis' | 'facture';
export type TypeFacture = 'totale' | 'acompte' | 'avancement' | 'situation' | 'solde' | 'avoir';
export type StatutDocument = 'brouillon' | 'envoye' | 'signe' | 'refuse' | 'a_encaisser' | 'payee' | 'annule';
export type Echeancier = 'acompte' | '303040' | 'situations' | 'fin';

export const TAUX_TVA = [5.5, 10, 20] as const;
export const UNITES = ['u', 'h', 'm', 'm²', 'm³', 'ml', 'kg', 'forfait', 'ens.'] as const;
export const CATEGORIES_ARTICLE = ['Fournitures', 'Main-d’œuvre', 'Forfaits', 'Déplacements'] as const;

/** Client tel qu'il figure sur le document (copie au moment de la rédaction). */
export interface ClientDocument {
  type: 'particulier' | 'pro';
  civ: string;
  nom: string;
  prenom: string;
  tel: string;
  email: string;
  adresse: string;
  raison: string;
  siret: string;
  tvaIntra: string;
  forme: string;
  naf: string;
  contact: string;
  bdc: string;
  role: 'principal' | 'sous-traitant';
  identique: boolean;
  adresseChantier: string;
  /** Logement achevé depuis plus de 2 ans : TVA réduite possible. */
  plus2ans: boolean;
  /** Contrat signé au domicile du client : droit de rétractation. */
  domicile: boolean;
}

export interface ConditionsDocument {
  validite: string;
  debut: string;
  duree: string;
  echeancier: Echeancier;
  acompte: string;
  delai: string;
  virement: boolean;
  cheque: boolean;
  carte: boolean;
  especes: boolean;
  escompte: boolean;
  escompteTaux: string;
  reserve: boolean;
  retenue: boolean;
  caution: boolean;
  decennale: boolean;
  assureur: string;
  contrat: string;
  zone: string;
  attTva: boolean;
  autoliq: boolean;
  aide: boolean;
  aideMontant: string;
  aideOrga: string;
  rge: string;
  revision: boolean;
  indice: string;
  moisRef: string;
  dechets: boolean;
  dechetsQte: string;
  dechetsLieu: string;
  dechetsCout: string;
  prorata: boolean;
  prorataTaux: string;
  penExec: boolean;
  penExecMontant: string;
  retract: boolean;
  mediateur: string;
}

export interface LigneDocument {
  titre?: boolean;
  designation: string;
  quantite: number;
  unite: string;
  prix_unitaire: number;
  tva: number;
  /** Situations : avancement cumulé de la ligne (%) et part déjà facturée (%). */
  avancement?: number;
  avancement_precedent?: number;
  article_id?: string | null;
}

export interface DocumentACalculer {
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  remise: number;
  /** Facture d'acompte : pourcentage du marché. */
  pourcentage: number;
  /** Facture d'avancement : avancement global cumulé (%). */
  avancement: number;
  /** Avancement, acompte ou situations déjà facturés sur le même devis (%). */
  avancement_precedent: number;
  client: Pick<ClientDocument, 'type'>;
  conditions: Pick<ConditionsDocument, 'retenue' | 'caution' | 'autoliq' | 'aide' | 'aideMontant'>;
  lignes: LigneDocument[];
}

/** Réglages de facturation propres à l'entreprise (pré-remplissent les conditions). */
export interface ReglagesFacturation {
  forme?: string;
  capital?: string;
  siret?: string;
  tva_intra?: string;
  rcs?: string;
  iban?: string;
  bic?: string;
  assureur?: string;
  contrat?: string;
  zone?: string;
  mediateur?: string;
  rge?: string;
  objectif_mensuel?: number;
  slogan?: string;
}

export interface TotauxDocument {
  /** Somme des lignes avant remise. */
  brut: number;
  /** Montant du marché après remise (100 %). */
  marcheHT: number;
  remise: number;
  /** Montant HT de ce document (part facturée). */
  ht: number;
  tva: { taux: number; base: number; montant: number }[];
  totalTva: number;
  ttc: number;
  retenue: number;
  aide: number;
  net: number;
  autoliq: boolean;
  /** Situations : cumul des travaux HT à date, et cumul déjà facturé. */
  cumulSituation: number;
  dejaFacture: number;
}

export const arrondi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** « 1 234,5 » ou « 1234.50 » → 1234.5 */
export function nombre(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** 1234.5 → « 1 234,50 € » */
export function euro(n: number): string {
  return (
    (Object.is(n, -0) ? 0 : n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') +
    ' €'
  );
}

/** 5.5 → « 5,5 % » */
export function pourcent(n: number): string {
  return String(+n.toFixed(1)).replace('.', ',') + ' %';
}

/** Part du marché facturée par une ligne, selon le type de facture. */
function partFacturee(doc: DocumentACalculer, l: LigneDocument): number {
  if (doc.genre !== 'facture') return 1;
  switch (doc.type_facture) {
    case 'acompte':
      return doc.pourcentage / 100;
    case 'avancement':
      return Math.max(0, doc.avancement - doc.avancement_precedent) / 100;
    case 'situation':
      return Math.max(0, (l.avancement ?? 0) - (l.avancement_precedent ?? 0)) / 100;
    case 'solde':
      return Math.max(0, 100 - doc.avancement_precedent) / 100;
    case 'avoir':
      return -1;
    default:
      return 1;
  }
}

export function calculer(doc: DocumentACalculer): TotauxDocument {
  const facture = doc.genre === 'facture';
  const tf = doc.type_facture;
  const r = 1 - (Number(doc.remise) || 0) / 100;
  const ouvrages = doc.lignes.filter((l) => !l.titre);
  const brut = ouvrages.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const marcheHT = brut * r;

  const parTaux = new Map<number, number>();
  for (const l of ouvrages) {
    const base = l.quantite * l.prix_unitaire * r * partFacturee(doc, l);
    parTaux.set(l.tva, (parTaux.get(l.tva) ?? 0) + base);
  }
  const autoliq = doc.client.type === 'pro' && !!doc.conditions.autoliq;
  const tva = autoliq
    ? []
    : [...parTaux.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([taux, base]) => ({ taux, base: arrondi(base), montant: arrondi((base * taux) / 100) }));
  const ht = arrondi([...parTaux.values()].reduce((s, b) => s + b, 0));
  const totalTva = arrondi(tva.reduce((s, x) => s + x.montant, 0));
  const ttc = arrondi(ht + totalTva);
  const avecRetenue =
    facture && doc.conditions.retenue && !doc.conditions.caution && ['situation', 'avancement', 'solde', 'totale'].includes(tf ?? '');
  const retenue = avecRetenue ? arrondi(ttc * 0.05) : 0;
  const aide = !facture && doc.conditions.aide ? arrondi(nombre(doc.conditions.aideMontant)) : 0;
  const cumulSituation = arrondi(ouvrages.reduce((s, l) => s + (l.quantite * l.prix_unitaire * r * (l.avancement ?? 0)) / 100, 0));
  const dejaFacture =
    tf === 'situation'
      ? arrondi(ouvrages.reduce((s, l) => s + (l.quantite * l.prix_unitaire * r * (l.avancement_precedent ?? 0)) / 100, 0))
      : arrondi((marcheHT * (tf === 'avancement' || tf === 'solde' ? doc.avancement_precedent : 0)) / 100);

  return {
    brut: arrondi(brut),
    marcheHT: arrondi(marcheHT),
    remise: arrondi(brut - marcheHT),
    ht,
    tva,
    totalTva,
    ttc,
    retenue,
    aide,
    net: arrondi(ttc - retenue - aide),
    autoliq,
    cumulSituation,
    dejaFacture,
  };
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

export const TITRES_FACTURE: Record<TypeFacture, string> = {
  totale: 'Facture',
  acompte: 'Facture d’acompte',
  avancement: 'Facture d’avancement',
  situation: 'Situation de travaux',
  solde: 'Facture de solde',
  avoir: 'Avoir',
};

export const TYPES_FACTURE: { valeur: TypeFacture; libelle: string; aide: string }[] = [
  { valeur: 'acompte', libelle: 'Acompte', aide: 'Un pourcentage du devis, avant les travaux' },
  { valeur: 'avancement', libelle: 'Avancement', aide: 'Selon l’avancement global du chantier' },
  { valeur: 'situation', libelle: 'Situation', aide: 'Ligne par ligne, en cumulé' },
  { valeur: 'solde', libelle: 'Solde', aide: 'Décompte final, déduction faite du déjà facturé' },
  { valeur: 'totale', libelle: 'Facture unique', aide: 'Tout le chantier en une fois' },
  { valeur: 'avoir', libelle: 'Avoir', aide: 'Annule ou corrige une facture' },
];

export function titreDocument(genre: GenreDocument, type: TypeFacture | null, situationNumero?: number | null): string {
  if (genre === 'devis') return 'Devis';
  const t = TITRES_FACTURE[type ?? 'totale'];
  return type === 'situation' && situationNumero ? `${t} n° ${situationNumero}` : t;
}

export type TonStatut = 'gris' | 'bleu' | 'violet' | 'vert' | 'rouge';

/** Libellé et couleur de l'état, avec le retard calculé à la date du jour. */
export function etatDocument(
  d: { genre: GenreDocument; statut: StatutDocument; echeance: string | null; relances?: number },
  aujourdhui: string,
): { libelle: string; ton: TonStatut; retard: number } {
  if (d.genre === 'facture' && d.statut === 'a_encaisser' && d.echeance && d.echeance < aujourdhui) {
    const jours = Math.round((Date.parse(aujourdhui) - Date.parse(d.echeance)) / 86_400_000);
    return { libelle: `En retard de ${jours} jour${jours > 1 ? 's' : ''}`, ton: 'rouge', retard: jours };
  }
  const table: Record<StatutDocument, [string, TonStatut]> = {
    brouillon: ['Brouillon', 'gris'],
    envoye: [d.relances ? 'Relancé' : 'Envoyé', d.relances ? 'violet' : 'bleu'],
    signe: ['Signé', 'vert'],
    refuse: ['Refusé', 'rouge'],
    a_encaisser: ['À encaisser', 'bleu'],
    payee: ['Payée', 'vert'],
    annule: ['Annulé', 'gris'],
  };
  const [libelle, ton] = table[d.statut];
  return { libelle, ton, retard: 0 };
}

// ---------------------------------------------------------------------------
// Valeurs de départ
// ---------------------------------------------------------------------------

export function clientVide(): ClientDocument {
  return {
    type: 'particulier',
    civ: 'Mme',
    nom: '',
    prenom: '',
    tel: '',
    email: '',
    adresse: '',
    raison: '',
    siret: '',
    tvaIntra: '',
    forme: '',
    naf: '',
    contact: '',
    bdc: '',
    role: 'principal',
    identique: true,
    adresseChantier: '',
    plus2ans: true,
    domicile: false,
  };
}

export function conditionsParDefaut(r: ReglagesFacturation = {}): ConditionsDocument {
  return {
    validite: '1 mois',
    debut: 'à convenir',
    duree: 'à préciser',
    echeancier: 'acompte',
    acompte: '30',
    delai: 'À réception de facture',
    virement: true,
    cheque: true,
    carte: false,
    especes: false,
    escompte: false,
    escompteTaux: '1 %',
    reserve: true,
    retenue: false,
    caution: false,
    decennale: true,
    assureur: r.assureur || 'Assureur à compléter',
    contrat: r.contrat || 'N° à compléter',
    zone: r.zone || 'France métropolitaine',
    attTva: true,
    autoliq: false,
    aide: false,
    aideMontant: '0',
    aideOrga: 'MaPrimeRénov’',
    rge: r.rge || '',
    revision: false,
    indice: 'BT38 Plomberie sanitaire',
    moisRef: '',
    dechets: true,
    dechetsQte: 'à estimer',
    dechetsLieu: 'déchetterie professionnelle',
    dechetsCout: 'inclus dans le prix',
    prorata: false,
    prorataTaux: '2 % du montant HT',
    penExec: false,
    penExecMontant: '50 € par jour',
    retract: false,
    mediateur: r.mediateur || 'Médiateur à compléter',
  };
}

/** Complète un objet partiel (venu de la base) avec les valeurs par défaut. */
export function completerClient(c: Partial<ClientDocument> | null | undefined): ClientDocument {
  return { ...clientVide(), ...(c ?? {}) };
}
export function completerConditions(c: Partial<ConditionsDocument> | null | undefined, r?: ReglagesFacturation): ConditionsDocument {
  return { ...conditionsParDefaut(r), ...(c ?? {}) };
}

/** TVA par défaut d'une nouvelle ligne : 20 % pour un pro, 10 % pour un logement de plus de 2 ans. */
export function tvaParDefaut(client: Pick<ClientDocument, 'type' | 'plus2ans'>): number {
  return client.type === 'pro' ? 20 : client.plus2ans ? 10 : 20;
}

export function nomClient(c: ClientDocument): string {
  if (c.type === 'pro') return c.raison || 'Entreprise à rechercher';
  return [c.civ, c.prenom, c.nom].filter(Boolean).join(' ') || 'Client à renseigner';
}

// ---------------------------------------------------------------------------
// Conditions particulières (page 2 du document)
// ---------------------------------------------------------------------------

const ECHEANCIERS: Record<Echeancier, (c: ConditionsDocument) => string> = {
  acompte: (c) => `Acompte de ${c.acompte} % à la signature, solde à la réception des travaux.`,
  '303040': () => '30 % à la commande, 40 % à mi-chantier, 30 % à la réception des travaux.',
  situations: () => 'Factures de situation mensuelles selon l’avancement des travaux, solde à la réception.',
  fin: () => 'Totalité à la réception des travaux.',
};

export function clauses(
  doc: { genre: GenreDocument; date: string; client: ClientDocument; conditions: ConditionsDocument },
  T: Pick<TotauxDocument, 'autoliq' | 'tva'>,
): [string, string][] {
  const c = doc.conditions;
  const pro = doc.client.type === 'pro';
  const facture = doc.genre === 'facture';
  const L: [string, string][] = [];
  if (!facture) L.push(['Validité', `Devis valable ${c.validite} à compter du ${doc.date}. Devis gratuit.`]);
  L.push([
    'Délais',
    `Début des travaux prévu ${/^\d/.test(c.debut) ? 'le ' : ''}${c.debut}, pour une durée estimée de ${c.duree}, sous réserve d’accès au chantier et de l’approvisionnement.`,
  ]);
  L.push(['Échéancier', (ECHEANCIERS[c.echeancier] ?? ECHEANCIERS.fin)(c)]);
  const moyens = [
    c.virement && 'virement',
    c.cheque && 'chèque',
    c.carte && 'carte bancaire par lien sécurisé',
    c.especes && 'espèces dans la limite de 1 000 €',
  ].filter(Boolean);
  L.push([
    'Paiement',
    `Paiement ${c.delai.charAt(0).toLowerCase() + c.delai.slice(1)}${moyens.length ? ', par ' + moyens.join(', ') : ''}. ${
      c.escompte ? `Escompte de ${c.escompteTaux} pour paiement anticipé.` : 'Pas d’escompte pour paiement anticipé.'
    }`,
  ]);
  L.push([
    'Retard de paiement',
    `Pénalités au taux de trois fois le taux d’intérêt légal${
      pro ? ', et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce)' : ''
    }.`,
  ]);
  if (c.reserve) L.push(['Réserve de propriété', 'Les fournitures restent la propriété de l’entreprise jusqu’au paiement complet.']);
  if (c.retenue)
    L.push([
      'Retenue de garantie',
      `5 % du montant TTC, libérée un an après la réception des travaux (loi n° 71-584 du 16 juillet 1971)${
        c.caution ? ', remplacée par une caution bancaire' : ''
      }.`,
    ]);
  if (c.decennale) L.push(['Assurance décennale', `${c.assureur}, contrat ${c.contrat}, couverture ${c.zone}.`]);
  L.push([
    'Garanties',
    'Garantie de parfait achèvement d’un an, garantie de bon fonctionnement de deux ans sur les équipements, garantie décennale.',
  ]);
  if (T.autoliq) L.push(['TVA', 'Autoliquidation : TVA due par le preneur, article 283-2 nonies du CGI.']);
  else if (!pro && c.attTva && T.tva.some((x) => x.taux < 20))
    L.push(['TVA à taux réduit', 'Applicable sous réserve de l’attestation signée par le client, jointe à ce document.']);
  if (c.aide && !facture)
    L.push([
      'Aide',
      `Prime ${c.aideOrga} de ${euro(nombre(c.aideMontant))} déduite${c.rge ? ', entreprise RGE n° ' + c.rge : ''}. Si la prime est refusée, ce montant reste dû par le client.`,
    ]);
  L.push(['Prix', c.revision ? `Prix révisables selon l’indice ${c.indice}${c.moisRef ? ', base ' + c.moisRef : ''}.` : 'Prix fermes et non révisables.']);
  if (c.dechets) L.push(['Déchets de chantier', `${c.dechetsQte}, déposés à : ${c.dechetsLieu}. Coût : ${c.dechetsCout}.`]);
  if (pro && c.prorata) L.push(['Compte prorata', `Participation de ${c.prorataTaux}.`]);
  if (pro && c.penExec) L.push(['Retard de chantier', `Pénalités de ${c.penExecMontant} de retard sur la date de fin convenue.`]);
  if (!pro && c.retract)
    L.push([
      'Rétractation',
      'Le client dispose de 14 jours pour se rétracter (art. L221-18 du Code de la consommation). Formulaire joint. Les travaux ne commencent pendant ce délai qu’à sa demande écrite.',
    ]);
  if (!pro) L.push(['Médiation', `En cas de litige, le client peut saisir gratuitement le médiateur de la consommation : ${c.mediateur}.`]);
  return L;
}

// ---------------------------------------------------------------------------
// SIREN, SIRET et TVA intracommunautaire
// ---------------------------------------------------------------------------

/** Clé de Luhn (SIREN sur 9 chiffres, SIRET sur 14). */
export function luhn(chiffres: string): boolean {
  if (!/^\d+$/.test(chiffres)) return false;
  let t = 0;
  [...chiffres].reverse().forEach((c, i) => {
    let d = Number(c);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    t += d;
  });
  return t % 10 === 0;
}

/** Numéro de TVA intracommunautaire français déduit du SIREN. */
export function cleTva(siren: string): string {
  return 'FR' + String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, '0') + siren;
}

/** « 81234567600009 » → « 812 345 676 00009 » */
export function formaterSiret(s: string): string {
  const n = s.replace(/\D/g, '');
  if (n.length === 14) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
  if (n.length === 9) return n.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  return s;
}

/** Contrôle d'un SIREN ou SIRET saisi : null si c'est bon, sinon le problème. */
export function controlerSiret(saisie: string): string | null {
  const n = saisie.replace(/\s/g, '');
  if (!n) return null;
  if (!/^\d+$/.test(n)) return 'Uniquement des chiffres';
  if (n.length !== 9 && n.length !== 14) return '9 chiffres (SIREN) ou 14 (SIRET)';
  // La Poste (SIREN 356000000) a des SIRET hors clé de Luhn.
  if (!luhn(n) && !n.startsWith('356000000')) return 'Numéro invalide (clé de contrôle)';
  return null;
}
