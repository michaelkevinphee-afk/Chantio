// Lecture d'un fichier de pilotage Excel (un onglet « Production » avec les
// mois en colonnes, un onglet « Plan » avec le budget) pour remplir le budget
// de l'année et la production des mois facturés hors Chantio.
// On cherche les libellés plutôt que des cases précises : une ligne ajoutée
// ou une colonne décalée ne gêne pas.

import { MOIS_LONGS, type BudgetPilotage, type Douze, type FraisBudget } from './pilotage.ts';

export interface FeuilleLue {
  nom: string;
  /** Les rangées, chaque cellule en texte (valeur calculée pour une formule). */
  rangees: string[][];
}

export interface LecturePilotage {
  /** Année trouvée dans un titre (« … 2026 »), sinon null. */
  annee: number | null;
  /** Champs du budget trouvés dans le fichier ; les autres ne sont pas touchés. */
  budget: Partial<Omit<BudgetPilotage, 'annee'>>;
  dep: Douze;
  cha: Douze;
  /** L'année précédente, tous types confondus. */
  n1: Douze;
  /** Ce qui a été lu et ce qui manque, en phrases courtes pour l'écran d'aperçu. */
  lu: string[];
  manque: string[];
}

/** Minuscules, sans accents, espaces simples. */
export const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** « 23863.22 », « 23 863,22 € », « 15 % » → nombre ; texte → null. */
export function nombreCellule(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[\s  €]/g, '').replace(/%$/, '');
  if (!t || !/^-?\d+([.,]\d+)?(e-?\d+)?$/i.test(t)) return null;
  const v = Number(t.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

const MOIS_N = MOIS_LONGS.map(normaliser);
const estMois = (c: string, i: number) => {
  const t = normaliser(c).replace(/\.$/, '');
  return t === MOIS_N[i] || (t.length >= 3 && MOIS_N[i].startsWith(t));
};

/** Rangée d'en-tête : janvier à décembre à la suite ; renvoie la colonne de chaque mois. */
function enteteMois(r: string[]): number[] | null {
  for (let c = 0; c + 11 < r.length; c++) {
    if (!estMois(r[c] ?? '', 0)) continue;
    if (MOIS_N.every((_, i) => estMois(r[c + i] ?? '', i))) return MOIS_N.map((_, i) => c + i);
  }
  return null;
}

type Bloc = 'depannage' | 'chantier' | 'n1' | 'total' | null;
function blocDe(lib: string): Bloc {
  const t = normaliser(lib);
  if (!t) return null;
  if (/\bn ?- ?1\b|annee precedente|l'an dernier/.test(t)) return 'n1';
  if (/depann|opera|\bsav\b/.test(t)) return 'depannage';
  if (/chantier|batigest|travaux/.test(t)) return 'chantier';
  if (/^total\b/.test(t)) return 'total';
  return null;
}

/** Premier nombre d'une rangée après la colonne c. */
const nombreApres = (r: string[], c: number) => {
  for (let k = c + 1; k < r.length; k++) {
    const v = nombreCellule(r[k]);
    if (v != null) return { v, k };
  }
  return null;
};
/** Un pourcentage écrit 0,15 ou 15 → 15. */
const pourcent = (v: number) => (Math.abs(v) <= 1 ? Math.round(v * 10000) / 100 : v);
const arrondi = (v: number) => Math.round(v * 100) / 100;

/** Libellé d'une ligne de frais : espaces nettoyés, première lettre en majuscule. */
const propre = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function plageMois(t: Douze): string {
  const i = t.map((v, k) => (v != null ? k : -1)).filter((k) => k >= 0);
  if (!i.length) return '';
  return i.length === 1 ? MOIS_LONGS[i[0]] : `${MOIS_LONGS[i[0]]} à ${MOIS_LONGS[i[i.length - 1]]}`;
}

/**
 * Ce qu'on lit :
 * - l'année : premier « 20xx » d'un titre ;
 * - onglet des mois : la ligne d'en-tête janvier → décembre, puis les lignes « Production » de chaque bloc
 *   (Dépannages / OPERA, Chantiers / BATIGEST, N-1) ; les lignes de cumul et d'écart sont ignorées ;
 * - au-dessus : objectifs et coefficients (« OPERA : 212 606 | 2 », « BATIGEST : 570 000 | 1,6 ») ;
 * - en dessous : le carnet de commandes (« accepté », « facturé », date « au 28/09 ») ;
 * - onglet « Plan » : totaux dépannage et chantier, achats matière (%), sous-traitance, salaires,
 *   charges (%), impôts, et les frais généraux entre la marge brute et le total des frais généraux.
 */
export function lireFichierPilotage(feuilles: FeuilleLue[]): LecturePilotage {
  const L: LecturePilotage = {
    annee: null, budget: {}, dep: Array(12).fill(null), cha: Array(12).fill(null), n1: Array(12).fill(null), lu: [], manque: [],
  };
  const b = L.budget;

  for (const f of feuilles) {
    for (const r of f.rangees) {
      for (const c of r) {
        const a = /\b(20\d\d)\b/.exec(c ?? '');
        if (a && L.annee == null && /production|budget|plan|pilotage|tableau|previsionnel/i.test(normaliser(c))) L.annee = Number(a[1]);
      }
    }
  }

  // ----- Onglet des mois -----
  let carnetDate: string | null = null;
  for (const f of feuilles) {
    const R = f.rangees;
    const h = R.findIndex((r) => enteteMois(r));
    if (h < 0) continue;
    const cols = enteteMois(R[h])!;
    const avant = cols[0];

    // Objectifs et coefficients, au-dessus de l'en-tête.
    for (let i = 0; i < h; i++) {
      const r = R[i];
      for (let c = 0; c < r.length; c++) {
        const bloc = blocDe(r[c] ?? '');
        if (bloc !== 'depannage' && bloc !== 'chantier') continue;
        const o = nombreApres(r, c);
        if (!o || o.v < 100) continue;
        const coef = nombreApres(r, o.k);
        if (bloc === 'depannage' && b.objectif_depannage == null) {
          b.objectif_depannage = arrondi(o.v);
          if (coef && coef.v >= 1 && coef.v <= 10) b.coef_depannage = coef.v;
        }
        if (bloc === 'chantier' && b.objectif_chantier == null) {
          b.objectif_chantier = arrondi(o.v);
          if (coef && coef.v >= 1 && coef.v <= 10) b.coef_chantier = coef.v;
        }
        break;
      }
    }

    // Lignes de production, sous l'en-tête : pour chaque bloc, la ligne « Production » qui a le plus de mois remplis
    // (une ligne « Production n-1 : 701 638 » qui ne donne que le total de l'année ne compte pas).
    let bloc: Bloc = null;
    let horsBloc = false;
    const choix = new Map<Bloc, Douze>();
    for (let i = h + 1; i < R.length; i++) {
      const r = R[i];
      if (enteteMois(r)) break; // un second tableau (résultat théorique) : on s'arrête
      const tete = r.slice(0, avant);
      // Un titre de bloc qui n'est pas de la production (« Résultat théorique ») : ses lignes ne comptent pas.
      if ((tete[0] ?? '').trim()) {
        bloc = blocDe(tete[0]);
        horsBloc = !bloc;
      }
      if (horsBloc) continue;
      const lib = normaliser(tete.join(' '));
      const ligneProduction = !/cumul|objectif|ecart|marge|resultat|salaire|charge/.test(lib) && (/production|realise|facture/.test(lib) || !!blocDe(lib));
      const blocLigne = blocDe(tete.slice(1).join(' ')) ?? bloc;
      if (!ligneProduction || !blocLigne || blocLigne === 'total') continue;
      const valeurs: Douze = cols.map((c) => ((v) => (v == null ? null : arrondi(v)))(nombreCellule(r[c])));
      const remplis = (t: Douze) => t.filter((v) => v != null).length;
      const deja = choix.get(blocLigne);
      if (!deja || remplis(valeurs) > remplis(deja)) choix.set(blocLigne, valeurs);
    }
    if (choix.has('depannage')) L.dep = choix.get('depannage')!;
    if (choix.has('chantier')) L.cha = choix.get('chantier')!;
    if (choix.has('n1')) L.n1 = choix.get('n1')!;

    // Carnet de commandes : « accepté » et « facturé », et la date « au 28/09 ».
    for (let i = h + 1; i < R.length; i++) {
      const r = R[i];
      for (let c = 0; c < r.length; c++) {
        const t = normaliser(r[c] ?? '');
        const d = /^au (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
        if (d && !carnetDate) carnetDate = `${d[3] ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : '%A'}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
        if (t === 'accepte' || t === 'accepte :' || t === 'devis acceptes') {
          const o = nombreApres(r, c);
          if (o && b.carnet_accepte == null) b.carnet_accepte = arrondi(o.v);
        }
        if (t === 'facture' || t === 'facture :' || t === 'deja facture') {
          const o = nombreApres(r, c);
          if (o && b.carnet_facture == null) b.carnet_facture = arrondi(o.v);
        }
      }
    }
  }

  // ----- Onglet « Plan » -----
  for (const f of feuilles) {
    const R = f.rangees;
    const libs = R.map((r) => {
      const c = r.findIndex((x) => /[a-z]/i.test(x ?? '') && nombreCellule(x) == null);
      return { c, t: c >= 0 ? normaliser(r[c]) : '' };
    });
    const debutFrais = libs.findIndex((l) => /marge brute/.test(l.t));
    const finFrais = libs.findIndex((l) => /^total frais generaux/.test(l.t));
    if (finFrais < 0) continue;
    let resultat: number | null = null, impots: number | null = null;
    const frais: FraisBudget[] = [];
    R.forEach((r, i) => {
      const { c, t } = libs[i];
      if (c < 0) return;
      const o = nombreApres(r, c);
      if (!o) return;
      const suivant = nombreApres(r, o.k);
      if (/^total depannage/.test(t) && b.objectif_depannage == null) b.objectif_depannage = arrondi(o.v);
      else if (/^total chantier/.test(t) && b.objectif_chantier == null) b.objectif_chantier = arrondi(o.v);
      else if (/^achats? (de )?matiere/.test(t) && suivant) b.achats_pc = pourcent(suivant.v);
      else if (/^sous-? ?traitance/.test(t) && i < finFrais && (debutFrais < 0 || i < debutFrais)) b.sous_traitance = arrondi(o.v);
      else if (/^salaires?\b/.test(t) && i < finFrais) b.salaires = arrondi(o.v);
      else if (/^charges? soc/.test(t) && i < finFrais) {
        if (suivant && suivant.v <= 2) b.charges_pc = pourcent(suivant.v);
        else if (b.salaires) b.charges_pc = Math.round((o.v / b.salaires) * 10000) / 100;
      } else if (/^resultat( d'exploitation)?$/.test(t) && i > finFrais) resultat = o.v;
      else if (/^impots?$/.test(t) && i > finFrais) impots = o.v;
      else if (debutFrais >= 0 && i > debutFrais && i < finFrais && !/^%/.test(t)) frais.push({ libelle: propre(r[c]), montant: arrondi(o.v) });
    });
    if (frais.length) b.frais = frais;
    if (resultat && impots != null) b.impot_pc = Math.round((impots / resultat) * 100);
    break;
  }

  if (carnetDate && (b.carnet_accepte != null || b.carnet_facture != null)) b.carnet_le = carnetDate.replace('%A', String(L.annee ?? new Date().getFullYear()));

  // ----- Ce qui a été lu -----
  const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;
  const plages: [string, Douze][] = [['Dépannages', L.dep], ['Chantiers', L.cha], ['Année précédente', L.n1]];
  for (const [nom, t] of plages) {
    const nb = t.filter((v) => v != null).length;
    if (nb) L.lu.push(`${nom} : ${nb} mois (${plageMois(t)}), ${eur(t.reduce<number>((s, v) => s + (v ?? 0), 0))}`);
    else L.manque.push(`${nom} : aucun mois trouvé`);
  }
  if (b.objectif_depannage != null || b.objectif_chantier != null)
    L.lu.push(`Objectifs : dépannages ${eur(b.objectif_depannage ?? 0)}, chantiers ${eur(b.objectif_chantier ?? 0)}`);
  else L.manque.push('Objectifs de l’année');
  if (b.coef_depannage != null || b.coef_chantier != null)
    L.lu.push(`Coefficients : ${String(b.coef_depannage ?? '—').replace('.', ',')} en dépannage, ${String(b.coef_chantier ?? '—').replace('.', ',')} en chantier`);
  if (b.frais?.length) L.lu.push(`Frais généraux : ${b.frais.length} lignes, ${eur(b.frais.reduce((s, x) => s + x.montant, 0))} (hors salaires)`);
  else L.manque.push('Frais généraux (onglet « Plan »)');
  if (b.salaires != null) L.lu.push(`Salaires : ${eur(b.salaires)}${b.charges_pc != null ? `, charges ${String(b.charges_pc).replace('.', ',')} %` : ''}`);
  if (b.achats_pc != null || b.sous_traitance != null)
    L.lu.push(`Achats : matière ${String(b.achats_pc ?? 0).replace('.', ',')} %, sous-traitance ${eur(b.sous_traitance ?? 0)}`);
  if (b.carnet_accepte != null) L.lu.push(`Carnet de commandes : ${eur(b.carnet_accepte)} acceptés, ${eur(b.carnet_facture ?? 0)} déjà facturés`);
  return L;
}
