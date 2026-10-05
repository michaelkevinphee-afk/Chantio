import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aPlacer, demiJournees, deplacer, heuresDuJour, heuresSur, indexDemi, jourSemaine, numeroSemaine, occupe, periode, texteReserve } from './planning.ts';
import { prevuRealise, reglagesPrix } from './rentabilite.ts';

// Semaine du lundi 5 au dimanche 11 octobre 2026.
const chantier = { date_prevue: '2026-10-08', heure_prevue: '08:00:00', date_fin: '2026-10-13', fin_midi: true };

test('jour de la semaine, lundi = 0', () => {
  assert.equal(jourSemaine('2026-10-05'), 0);
  assert.equal(jourSemaine('2026-10-11'), 6);
});

test('numéro de semaine ISO 8601', () => {
  assert.equal(numeroSemaine('2026-09-28'), 40);
  assert.equal(numeroSemaine('2026-10-04'), 40);
  assert.equal(numeroSemaine('2026-10-05'), 41);
  assert.equal(numeroSemaine('2026-01-01'), 1);
  assert.equal(numeroSemaine('2026-12-31'), 53);
  assert.equal(numeroSemaine('2027-01-01'), 53);
  assert.equal(numeroSemaine('2027-01-04'), 1);
  assert.equal(numeroSemaine('2024-12-30'), 1);
  assert.equal(numeroSemaine('2021-01-03'), 53);
});

test('à placer au planning : à planifier (même datée), ou sans date ni validée ni facturée', () => {
  assert.equal(aPlacer({ statut: 'a_planifier', date_prevue: '2026-09-28' }), true);
  assert.equal(aPlacer({ statut: 'a_planifier', date_prevue: null }), true);
  assert.equal(aPlacer({ statut: 'planifiee', date_prevue: '2026-09-28' }), false);
  assert.equal(aPlacer({ statut: 'terminee', date_prevue: null }), true);
  assert.equal(aPlacer({ statut: 'validee', date_prevue: null }), false);
  assert.equal(aPlacer({ statut: 'facturee', date_prevue: null }), false);
});

test('un chantier saute le week-end, sauf ses premier et dernier jours', () => {
  assert.equal(occupe(chantier, '2026-10-07'), false);
  assert.equal(occupe(chantier, '2026-10-08'), true);
  assert.equal(occupe(chantier, '2026-10-10'), false);
  assert.equal(occupe(chantier, '2026-10-12'), true);
  assert.equal(occupe({ ...chantier, date_prevue: '2026-10-10' }, '2026-10-10'), true);
  assert.equal(occupe(chantier, '2026-10-14'), false);
});

test('demi-journées : début l’après-midi, fin à midi, dépannage long', () => {
  assert.deepEqual(demiJournees(chantier, '2026-10-08'), [true, true]);
  assert.deepEqual(demiJournees(chantier, '2026-10-13'), [true, false]);
  assert.deepEqual(demiJournees({ ...chantier, heure_prevue: '13:30' }, '2026-10-08'), [false, true]);
  assert.deepEqual(demiJournees({ date_prevue: '2026-10-08', heure_prevue: '15:00' }, '2026-10-08'), [false, true]);
  assert.deepEqual(demiJournees({ date_prevue: '2026-10-08', heure_prevue: '09:00', duree_prevue: 6 }, '2026-10-08'), [true, true]);
  assert.deepEqual(demiJournees({ date_prevue: '2026-10-08', heure_prevue: null }, '2026-10-08'), [true, false]);
});

test('heures comptées : 3,75 h par demi-journée de chantier, durée prévue sinon', () => {
  assert.equal(heuresDuJour(chantier, '2026-10-08'), 7.5);
  assert.equal(heuresDuJour(chantier, '2026-10-13'), 3.75);
  assert.equal(heuresDuJour({ date_prevue: '2026-10-08', heure_prevue: '09:00', duree_prevue: 2.5 }, '2026-10-08'), 2.5);
  assert.equal(heuresDuJour({ date_prevue: '2026-10-08', heure_prevue: '09:00' }, '2026-10-08'), 1);
  const semaine = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  assert.equal(heuresSur(chantier, semaine), 15);
});

test('déplacer un chantier attrapé par une demi-journée garde sa longueur', () => {
  // Attrapé le vendredi matin, déposé le vendredi après-midi : tout glisse d'une demi-journée.
  assert.deepEqual(deplacer(chantier, { jour: '2026-10-09', demi: 1 }, { jour: '2026-10-09', demi: 0 }), {
    date_prevue: '2026-10-08',
    heure_prevue: '13:30',
    date_fin: '2026-10-13',
    fin_midi: false,
  });
  // Depuis « À planifier » : commence sur la case visée, même nombre de jours.
  assert.deepEqual(deplacer(chantier, { jour: '2026-10-15', demi: 0 }), {
    date_prevue: '2026-10-15',
    heure_prevue: '08:00',
    date_fin: '2026-10-20',
    fin_midi: true,
  });
});

test('déplacer un dépannage : heure gardée dans la même demi-journée', () => {
  const d = { date_prevue: '2026-10-08', heure_prevue: '10:15:00' };
  assert.equal(deplacer(d, { jour: '2026-10-09', demi: 0 }).heure_prevue, '10:15');
  assert.equal(deplacer(d, { jour: '2026-10-09', demi: 1 }).heure_prevue, '14:00');
  assert.equal(deplacer({ date_prevue: null, heure_prevue: null }, { jour: '2026-10-09', demi: 0 }).heure_prevue, '08:30');
});

test('réserve d’urgences', () => {
  assert.equal(indexDemi('2026-10-08', 1), 7);
  assert.equal(texteReserve([7]), 'jeudi après-midi');
  assert.equal(texteReserve([7, 6, 0]), 'lundi matin et jeudi');
});

test('période d’un chantier', () => {
  assert.equal(periode(chantier), 'du jeudi 8 au mardi 13 octobre, fin à midi');
  assert.equal(periode({ date_prevue: '2026-10-08', heure_prevue: null }), null);
});

test('prévu au devis contre réalisé', () => {
  const rp = reglagesPrix({ cout_horaire: 40, frais_generaux: 30 });
  const r = prevuRealise(
    {
      remise: 0,
      lignes: [
        { designation: 'Robinet thermostatique', quantite: 2, unite: 'u', prix_unitaire: 90, tva: 10, achat: 30, heures: 0.5, prix_calcule: true },
        { designation: 'Main-d’œuvre', quantite: 1, unite: 'h', prix_unitaire: 60, tva: 10, heures: 1 },
      ],
    },
    {
      minutes: 150,
      pieces: [
        { designation: 'robinet  thermostatique', quantite: 2 },
        { designation: 'Joint fibre', reference: 'JF-12', quantite: 4 },
        { designation: 'Raccord inconnu', quantite: 1 },
      ],
    },
    [{ designation: 'Joint', reference: 'jf-12', prix_achat: 0.5 }],
    rp,
  );
  assert.equal(r.heuresPrevues, 2);
  assert.equal(r.heuresPassees, 2.5);
  assert.equal(r.fournituresPrevues, 60);
  assert.equal(r.fournituresUtilisees, 62);
  assert.equal(r.piecesSansPrix, 1);
  assert.equal(r.prixVente, 240);
  // Prévu : 240 − (60 + 80) × 1,3 = 58 ; réel : 240 − (62 + 100) × 1,3 = 29,4.
  assert.equal(r.margeNettePrevue, 58);
  assert.equal(r.margeNetteReelle, 29.4);
});
