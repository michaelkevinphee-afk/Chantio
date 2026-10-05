import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocumentChiffres } from './chiffres.ts';
import { lireFichierPilotage, nombreCellule, type FeuilleLue } from './pilotage-import.ts';
import {
  budgetVide,
  calculerAnnee,
  devisChantierEnAttente,
  moisTermines,
  objectifAide,
  periodes,
  productionAnnee,
  resteAExecuter,
  totauxBudget,
  type BudgetPilotage,
  type ProductionAnnee,
} from './pilotage.ts';

// Chiffres inventés : le dépôt est public.
const BUDGET: BudgetPilotage = {
  ...budgetVide(2026),
  objectif_depannage: 120000, objectif_chantier: 360000, achats_pc: 10, sous_traitance: 60000,
  salaires: 90000, charges_pc: 50, frais: [{ libelle: 'Assurances', montant: 6000 }, { libelle: 'Loyer', montant: 24000 }],
};
const proche = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ''} ${a} ≠ ${b}`);

function doc(o: Partial<DocumentChiffres>): DocumentChiffres {
  return {
    id: 'd1', genre: 'facture', type_facture: 'totale', numero: null, statut: 'a_encaisser', objet: 'Travaux', date_document: '2026-03-10',
    echeance: null, envoye_le: null, signe_le: null, paye_le: null, total_ht: 1000, net_a_payer: 1200, devis_id: null, conditions: null, ...o,
  };
}

test('totauxBudget : chiffre d’affaires, achats, frais généraux et résultat comme l’onglet Plan', () => {
  const B = totauxBudget(BUDGET);
  assert.equal(B.ca, 480000);
  assert.equal(B.achats, 48000 + 60000);
  assert.equal(B.charges, 45000);
  assert.equal(B.fg, 30000 + 90000 + 45000);
  assert.equal(B.res, 480000 - 108000 - 165000);
  assert.equal(B.impot, B.res * 0.25);
  proche(objectifAide({ compagnons: 2, heures: 1600, taux: 60, part_pc: 50, fournitures_pc: 10 }), 105600);
});

test('productionAnnee : factures par mois et type, avoirs déduits, mois importés prioritaires, N-1', () => {
  const docs = [
    doc({ id: 'a', date_document: '2026-01-15', total_ht: 1000, conditions: { parcours: 'depannage' } }),
    doc({ id: 'b', date_document: '2026-01-20', total_ht: 500, conditions: { parcours: 'contrat' } }),
    doc({ id: 'c', date_document: '2026-02-03', total_ht: 4000, conditions: { parcours: 'chantier' } }),
    doc({ id: 'av', date_document: '2026-02-10', type_facture: 'avoir', total_ht: -1000, facture_id: 'c' }),
    doc({ id: 'brouillon', date_document: '2026-02-10', statut: 'brouillon', total_ht: 9999 }),
    doc({ id: 'devis', genre: 'devis', type_facture: null, statut: 'signe', date_document: '2026-02-10', total_ht: 9999 }),
    doc({ id: 'n1', date_document: '2025-03-01', total_ht: 700, conditions: { parcours: 'chantier' } }),
  ];
  const P = productionAnnee(2026, docs, { interventions: [] }, [
    { mois: '2026-02-01', famille: 'depannage', montant_ht: 2500 },
    { mois: '2025-01-01', famille: 'total', montant_ht: 8000 },
    { mois: '2025-02-01', famille: 'depannage', montant_ht: 100 },
    { mois: '2025-02-01', famille: 'chantier', montant_ht: 200 },
  ]);
  assert.deepEqual(P.dep.slice(0, 3), [1500, 2500, null]);
  assert.deepEqual(P.cha.slice(0, 3), [null, 3000, null]);
  assert.deepEqual(P.n1.slice(0, 4), [8000, 300, 700, null]);
  assert.deepEqual(P.importes.slice(0, 3), [false, true, false]);
});

test('resteAExecuter : devis de chantier signés moins le facturé dessus, plus le carnet hors Chantio', () => {
  const docs = [
    doc({ id: 'dv', genre: 'devis', type_facture: null, statut: 'signe', total_ht: 10000, conditions: { parcours: 'chantier' } }),
    doc({ id: 'f1', devis_id: 'dv', total_ht: 3000, conditions: { parcours: 'chantier' } }),
    doc({ id: 'dv2', genre: 'devis', type_facture: null, statut: 'signe', total_ht: 800, conditions: { parcours: 'depannage' } }),
    doc({ id: 'dv3', genre: 'devis', type_facture: null, statut: 'envoye', total_ht: 5000, conditions: { parcours: 'chantier' } }),
  ];
  assert.equal(resteAExecuter(docs, { interventions: [] }, null), 7000);
  assert.equal(resteAExecuter(docs, { interventions: [] }, { carnet_accepte: 50000, carnet_facture: 20000 }), 37000);
  assert.equal(devisChantierEnAttente(docs, { interventions: [] }), 5000);
});

const prod = (dep: (number | null)[], cha: (number | null)[], n1: number[], importes = false): ProductionAnnee => ({
  dep: [...dep, ...Array(12 - dep.length).fill(null)],
  cha: [...cha, ...Array(12 - cha.length).fill(null)],
  n1,
  importes: Array.from({ length: 12 }, (_, i) => importes && dep[i] != null),
});
const N1 = [10, 10, 10, 10, 10, 10, 10, 10, 10, 20, 20, 20].map((v) => v * 1000);

test('calculerAnnee : réel, prévision des dépannages et des chantiers, fourchette', () => {
  const P = prod([8000, 12000, 10000], [20000, 30000, 25000], N1);
  const A = calculerAnnee({ budget: BUDGET, production: P, reste: 90000, moisCourant: 3 });
  assert.equal(A.n, 3);
  assert.equal(A.moy, 10000);
  assert.equal(A.sd, 2000);
  assert.equal(A.fait!.cum, 105000);
  assert.ok(A.mois[3].enCours && !A.mois[4].enCours);
  // 9 mois restants : 10 000 de dépannages et 90 000 / 9 de chantiers par mois.
  assert.equal(A.mois[5].dep, 10000);
  assert.equal(A.mois[5].cha, 10000);
  proche(A.fin.cum, 105000 + 9 * 20000);
  proche(A.fin.cumBas, 105000 + 9 * (8000 + 8000));
  proche(A.fin.cumHaut, 105000 + 9 * (12000 + 10000));
  proche(A.fin.cumObj, 480000);
  // Résultat théorique : marge des travaux + salaires chargés − frais généraux, cumulés.
  const B = totauxBudget(BUDGET);
  const marge1 = 8000 * (1 - 1 / 2) + 20000 * (1 - 1 / 1.6);
  proche(A.mois[0].cumRes, marge1 + 135000 / 12 - B.fg / 12);

  // Trois derniers mois, saisons de l'an dernier, part des chantiers et devis retenus.
  proche(calculerAnnee({ budget: BUDGET, production: prod([6000, 9000, 12000, 15000], [], N1), reste: 0, moisCourant: 4 }, { mode: 'trois', part: 100, devis: 0 }).mois[6].dep, 12000);
  const saisons = calculerAnnee({ budget: BUDGET, production: P, reste: 90000, moisCourant: 3 }, { mode: 'n1', part: 50, devis: 18000 });
  assert.equal(saisons.mois[10].dep, 20000);
  assert.equal(saisons.mois[10].cha, (45000 + 18000) / 9);
});

test('calculerAnnee : le mois en cours garde le déjà facturé s’il dépasse la prévision ; janvier suit l’objectif', () => {
  const P = prod([8000, 12000, 10000, 30000], [20000, 30000, 25000, 1000], N1);
  const A = calculerAnnee({ budget: BUDGET, production: P, reste: 90000, moisCourant: 3 });
  assert.equal(A.mois[3].dep, 30000);
  assert.equal(A.mois[3].cha, 10000);
  const J = calculerAnnee({ budget: BUDGET, production: prod([], [], N1), reste: 0, moisCourant: 0 });
  assert.equal(J.n, 0);
  assert.equal(J.fait, null);
  assert.equal(J.mois[0].dep, 10000);
  // Un mois importé au-delà du mois en cours compte comme terminé.
  assert.equal(moisTermines(prod([1, 1, 1, 1, 1], [], N1, true), 2), 5);
});

test('periodes : trimestres et mois avec les mêmes totaux', () => {
  const A = calculerAnnee({ budget: BUDGET, production: prod([8000, 12000, 10000, 9000], [20000, 30000, 25000, 1000], N1), reste: 90000, moisCourant: 4 });
  const T = periodes(A, BUDGET, 'trim');
  const M = periodes(A, BUDGET, 'mois');
  assert.equal(T.length, 4);
  assert.equal(M.length, 12);
  assert.equal(T[0].tot, 105000);
  assert.equal(T[0].lib, 'T1');
  assert.equal(T[1].libL, '2e trimestre');
  assert.ok(T[0].reel && T[1].partiel && !T[2].reel);
  proche(T.reduce((s, p) => s + p.res, 0), A.fin.cumRes);
  proche(M.slice(0, 3).reduce((s, p) => s + p.res, 0), T[0].res);
  assert.equal(M[2].dans, 'en mars');
});

// ---------- Lecture du fichier ----------

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ligne = (a: string, b: string, valeurs: (number | null)[]) => [a, b, ...valeurs.map((v) => (v == null ? '' : String(v)))];
const PRODUCTION: FeuilleLue = {
  nom: 'Production',
  rangees: [
    ['TABLEAU DE PRODUCTION MENSUELLE 2026'],
    [],
    ['Objectif annuel'],
    ['OPERA  :', '120000', '2'],
    ['BATIGEST  :', '360000', '1.6'],
    [],
    ['', '', ...MOIS, 'Prod/mois'],
    ligne('Dépannages\n(OPERA)', 'Production', [8000, 12000.5, 10000]),
    ligne('', 'Production cumulé', [8000, 20000.5, 30000.5, 30000.5]),
    ligne('', 'Objectif cumulé', [10000, 20000, 30000]),
    ligne('Chantiers\n(BATIGEST)', 'Production', [20000, 30000, 25000]),
    ligne('', 'Ecart', [-1, -2, -3]),
    ligne('TOTAL', 'Production', [28000, 42000, 35000, 0, 0]),
    ['Production n-1  :', '', '150000'],
    ligne('N-1', 'Production n-1', N1),
    ['', '', 'au 28/09'],
    ['', 'accepté', '500000'],
    ['', 'facturé', '410000'],
    ['Résultat théorique cumulé', 'Dépannage', '1', '2', '3'],
    ['', 'Marge production', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  ],
};
const PLAN: FeuilleLue = {
  nom: 'Plan',
  rangees: [
    ['', '', 'ENTREPRISE'],
    ['3', 'Compagnons', '100000', '0.5'],
    ['', 'Total Dépannage', '999'],
    ['', 'Achat matière chantier/dépannage', '48000', '0.1', 'pourcentage 2025'],
    ['', 'Sous-traitance chantier', '60000'],
    ['MARGE BRUTE', '', '372000'],
    ['% de marge brute', '', '0.77'],
    ['', 'Assurances ', '6000'],
    ['', 'loyer  bureau', '24000', '2000', ' /mois'],
    ['', 'Salaires ', '90000'],
    ['', 'Charges soc et fis 60 %', '45000', '0.5'],
    ['TOTAL FRAIS GENERAUX', '', '165000'],
    ['RESULTAT', '', '207000'],
    ['', 'impôts', '51750'],
  ],
};

test('lireFichierPilotage : mois, N-1, objectifs, coefficients, carnet et budget', () => {
  const L = lireFichierPilotage([PLAN, PRODUCTION]);
  assert.equal(L.annee, 2026);
  assert.deepEqual(L.dep.slice(0, 4), [8000, 12000.5, 10000, null]);
  assert.deepEqual(L.cha.slice(0, 4), [20000, 30000, 25000, null]);
  assert.deepEqual(L.n1, N1);
  assert.deepEqual(L.budget, {
    objectif_depannage: 120000, coef_depannage: 2, objectif_chantier: 360000, coef_chantier: 1.6,
    carnet_accepte: 500000, carnet_facture: 410000, carnet_le: '2026-09-28',
    achats_pc: 10, sous_traitance: 60000, salaires: 90000, charges_pc: 50, impot_pc: 25,
    frais: [{ libelle: 'Assurances', montant: 6000 }, { libelle: 'Loyer bureau', montant: 24000 }],
  });
  assert.equal(L.manque.length, 0);
  assert.match(L.lu[0], /^Dépannages : 3 mois \(janvier à mars\)/);
});

test('lireFichierPilotage : un fichier sans budget dit ce qui manque', () => {
  const L = lireFichierPilotage([{ nom: 'Feuil1', rangees: [['', ...MOIS.map((m) => m.slice(0, 4) + '.')], ['Dépannages', '1 000,50', '2000']] }]);
  assert.deepEqual(L.dep.slice(0, 3), [1000.5, 2000, null]);
  assert.ok(L.manque.some((m) => /Chantiers/.test(m)));
  assert.ok(L.manque.some((m) => /Objectifs/.test(m)));
  assert.equal(nombreCellule('15 %'), 15);
  assert.equal(nombreCellule('Total'), null);
});
