import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  achatsDepuisJanvier,
  compterSegments,
  dansPeriodeAchat,
  dansSegment,
  euroAchat,
  filtrerAchats,
  LIBELLE_RECEPTION,
  resteFournisseur,
  SEGMENTS_ACHAT,
  segmentInitial,
  type AchatFiltrable,
  type StatutAchat,
} from './achats.ts';

const JOUR = '2026-10-04';

type Ligne = AchatFiltrable & { avoir: boolean; id: string };
const ligne = (id: string, p: Partial<Ligne> = {}): Ligne => ({
  id,
  numero: `N-${id}`,
  statut: 'a_payer',
  date_facture: '2026-09-20',
  echeance: '2026-10-20',
  montant_ttc: 120,
  responsable_id: null,
  paye: 0,
  avoir: false,
  fournisseur: { nom: 'Distri-Plomb Paris', siret: '41236587400025' },
  ...p,
});

test('les cinq compteurs du bac, dans l’ordre', () => {
  assert.deepEqual(
    SEGMENTS_ACHAT.map((s) => [s.cle, s.libelle, s.ton]),
    [
      ['tous', 'Tous', 'gris'],
      ['recu', 'Reçu', 'cobalt'],
      ['attente', 'En attente', 'violet'],
      ['a_payer', 'À payer', 'encre'],
      ['termine', 'Terminé', 'vert'],
    ],
  );
  assert.equal(SEGMENTS_ACHAT[0].sous, 'Toutes les factures & avoirs');
  assert.equal(SEGMENTS_ACHAT[2].sous, 'Planifié ou suspendu');
  assert.equal(SEGMENTS_ACHAT[4].sous, 'Payées ou refusées');
});

test('regroupement des statuts : En attente = planifié + contesté, Terminé = payé + refusé', () => {
  const st = (s: StatutAchat) => ({ statut: s });
  assert.ok(dansSegment(st('planifie'), 'attente'));
  assert.ok(dansSegment(st('suspendu'), 'attente'));
  assert.ok(!dansSegment(st('planifie'), 'a_payer'));
  assert.ok(dansSegment(st('a_payer'), 'a_payer'));
  assert.ok(dansSegment(st('payee'), 'termine'));
  assert.ok(dansSegment(st('refusee'), 'termine'));
  assert.ok(dansSegment(st('refusee'), 'tous'));
  assert.ok(dansSegment(st('recu'), 'inconnu'));
});

test('compteur ouvert à l’arrivée', () => {
  assert.equal(segmentInitial(null, ['a_payer', 'recu']), 'recu');
  assert.equal(segmentInitial(undefined, ['a_payer', 'payee']), 'tous');
  assert.equal(segmentInitial('termine', ['recu']), 'termine');
  assert.equal(segmentInitial('tous', ['recu']), 'tous');
  assert.equal(segmentInitial('suspendu', ['recu']), 'attente');
  assert.equal(segmentInitial('n_importe', []), 'tous');
});

test('compteurs : nombres et montants signés (TTC pour Reçu, reste pour À payer)', () => {
  const base = [
    ligne('1', { statut: 'recu', montant_ttc: 92.3 }),
    ligne('2', { statut: 'recu', montant_ttc: 637.44 }),
    ligne('3', { statut: 'recu', montant_ttc: 50, avoir: true }),
    ligne('4', { statut: 'a_payer', montant_ttc: 200, paye: 50 }),
    ligne('5', { statut: 'a_payer', montant_ttc: 30, avoir: true }),
    ligne('6', { statut: 'planifie' }),
    ligne('7', { statut: 'payee', paye: 120 }),
  ];
  const c = Object.fromEntries(compterSegments(base).map((s) => [s.cle, s]));
  assert.equal(c.tous.nombre, 7);
  assert.equal(c.recu.nombre, 3);
  assert.equal(c.recu.total, 679.74);
  assert.equal(c.a_payer.nombre, 2);
  assert.equal(c.a_payer.total, 120);
  assert.equal(c.attente.nombre, 1);
  assert.equal(c.termine.nombre, 1);
});

test('périodes de la date de facturation', () => {
  assert.ok(dansPeriodeAchat('2026-10-01', 'mois', JOUR));
  assert.ok(!dansPeriodeAchat('2026-09-30', 'mois', JOUR));
  assert.ok(dansPeriodeAchat('2026-09-01', 'mois_prec', JOUR));
  assert.ok(!dansPeriodeAchat('2026-10-01', 'mois_prec', JOUR));
  assert.ok(!dansPeriodeAchat('2026-08-31', 'mois_prec', JOUR));
  assert.ok(dansPeriodeAchat('2026-08-01', 'trimestre', JOUR));
  assert.ok(!dansPeriodeAchat('2026-07-31', 'trimestre', JOUR));
  assert.ok(dansPeriodeAchat('2026-01-01', 'annee', JOUR));
  assert.ok(!dansPeriodeAchat('2025-12-31', 'annee', JOUR));
  assert.ok(dansPeriodeAchat('2025-12-31', 'annee_prec', JOUR));
  assert.ok(!dansPeriodeAchat('2026-01-01', 'annee_prec', JOUR));
  assert.ok(dansPeriodeAchat(null, 'tout', JOUR));
  assert.ok(!dansPeriodeAchat(null, 'mois', JOUR));
  // Janvier : le mois dernier est décembre de l'année précédente.
  assert.ok(dansPeriodeAchat('2025-12-15', 'mois_prec', '2027-01-10') === false);
  assert.ok(dansPeriodeAchat('2026-12-15', 'mois_prec', '2027-01-10'));
  assert.ok(dansPeriodeAchat('2026-11-02', 'trimestre', '2027-01-10'));
});

test('recherche : n° de facture, nom ou SIRET, sans accents ni majuscules', () => {
  const l = [
    ligne('a', { numero: 'T-88213', fournisseur: { nom: 'Station Auteuil Carburants', siret: '83017462500014' } }),
    ligne('b', { numero: 'MTC-2026-07', fournisseur: { nom: 'Morel Tôlerie Chauffage', siret: '90214785300019' } }),
    ligne('c', { numero: null, fournisseur: null }),
  ];
  const ids = (f: Parameters<typeof filtrerAchats>[1]) => filtrerAchats(l, f, JOUR).map((x) => x.id);
  assert.deepEqual(ids({ q: 't-882' }), ['a']);
  assert.deepEqual(ids({ q: 'tolerie' }), ['b']);
  assert.deepEqual(ids({ q: 'morel chauffage' }), ['b']);
  assert.deepEqual(ids({ q: '830174' }), ['a']);
  assert.deepEqual(ids({ q: '  ' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ q: 'zzz' }), []);
});

test('échéance : dépassée, 7 jours, 30 jours (seulement à payer ou planifiée)', () => {
  const l = [
    ligne('retard', { echeance: '2026-09-24' }),
    ligne('payee', { statut: 'payee', echeance: '2026-09-24', paye: 120 }),
    ligne('j5', { echeance: '2026-10-09' }),
    ligne('j20', { statut: 'planifie', echeance: '2026-10-24' }),
    ligne('j40', { echeance: '2026-11-13' }),
    ligne('recu', { statut: 'recu', echeance: '2026-10-06' }),
  ];
  const ids = (echeance: string) => filtrerAchats(l, { echeance }, JOUR).map((x) => x.id);
  assert.deepEqual(ids('retard'), ['retard']);
  assert.deepEqual(ids('semaine'), ['j5']);
  assert.deepEqual(ids('mois'), ['j5', 'j20']);
  assert.equal(ids('tout').length, 6);
});

test('responsable et montant TTC', () => {
  const l = [
    ligne('petit', { montant_ttc: 99.99, responsable_id: 'm1' }),
    ligne('cent', { montant_ttc: 100, responsable_id: 'm2' }),
    ligne('mille', { montant_ttc: 1000 }),
    ligne('gros', { montant_ttc: 1000.01, responsable_id: 'm1' }),
  ];
  const ids = (f: Parameters<typeof filtrerAchats>[1]) => filtrerAchats(l, f, JOUR).map((x) => x.id);
  assert.deepEqual(ids({ responsable: 'm1' }), ['petit', 'gros']);
  assert.deepEqual(ids({ responsable: 'tous' }).length, 4);
  assert.deepEqual(ids({ montant: 'm100' }), ['petit']);
  assert.deepEqual(ids({ montant: 'm1000' }), ['cent', 'mille']);
  assert.deepEqual(ids({ montant: 'p1000' }), ['gros']);
  assert.deepEqual(ids({ montant: 'p1000', responsable: 'm2' }), []);
});

test('achats depuis janvier et reste à payer d’un fournisseur', () => {
  const l = [
    ligne('1', { statut: 'payee', date_facture: '2026-03-01', montant_ttc: 500, paye: 500 }),
    ligne('2', { statut: 'a_payer', date_facture: '2026-09-01', montant_ttc: 200, paye: 50 }),
    ligne('3', { statut: 'refusee', date_facture: '2026-09-02', montant_ttc: 999 }),
    ligne('4', { statut: 'payee', date_facture: '2026-05-01', montant_ttc: 100, avoir: true, paye: 100 }),
    ligne('5', { statut: 'payee', date_facture: '2025-12-30', montant_ttc: 700, paye: 700 }),
    ligne('6', { statut: 'planifie', date_facture: '2026-09-10', montant_ttc: 60 }),
    ligne('7', { statut: 'recu', date_facture: '2026-10-01', montant_ttc: 10 }),
  ];
  assert.equal(achatsDepuisJanvier(l, JOUR), 670);
  assert.equal(resteFournisseur(l), 210);
});

test('libellés : réception par e-mail = Collecte automatique ; montant d’un avoir', () => {
  assert.equal(LIBELLE_RECEPTION.email, 'Collecte automatique');
  assert.equal(LIBELLE_RECEPTION.photo, 'Photo');
  assert.equal(euroAchat({ avoir: true }, 92.3), '− 92,30 €');
  assert.equal(euroAchat({ avoir: false }, 92.3), '92,30 €');
  assert.equal(euroAchat({ avoir: true }, 0), '0,00 €');
});
