import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heureCourte, jourCourt, mentionsFacture, payeurTexte, quandLigneIntervention } from './format.ts';

test('jourCourt : jour abrégé, jour, mois abrégé', () => {
  assert.equal(jourCourt('2026-10-02'), 'Ven. 2 oct.');
  assert.equal(jourCourt('2026-09-30'), 'Mer. 30 sept.');
  assert.equal(jourCourt('2026-10-04'), 'Dim. 4 oct.');
  assert.equal(jourCourt(null), '');
});

test('heureCourte : HH:MM', () => {
  assert.equal(heureCourte('14:30:00'), '14:30');
  assert.equal(heureCourte('08:05'), '08:05');
  assert.equal(heureCourte(null), '');
});

test('quandLigneIntervention : textes de la colonne « Quand » du bac', () => {
  const jour = '2026-10-04';
  assert.equal(quandLigneIntervention({ date_prevue: null, heure_prevue: null }, jour), 'à placer');
  assert.equal(quandLigneIntervention({ date_prevue: null, heure_prevue: null, souhaitee_le: '2026-10-12' }, jour), 'souhaitée le 12/10');
  assert.equal(quandLigneIntervention({ date_prevue: '2026-10-12', heure_prevue: '08:00:00', date_fin: '2026-10-16' }, jour), 'du 12/10 au 16/10');
  assert.equal(quandLigneIntervention({ date_prevue: jour, heure_prevue: '14:30:00' }, jour), 'Aujourd’hui · 14:30');
  assert.equal(quandLigneIntervention({ date_prevue: '2026-10-05', heure_prevue: '09:00:00' }, jour), 'Lun. 5 oct. · 09:00');
  assert.equal(quandLigneIntervention({ date_prevue: '2026-10-02', heure_prevue: null, date_fin: '2026-10-02' }, jour), 'Ven. 2 oct.');
});

test('payeurTexte : la copropriété représentée par le syndic', () => {
  const site = { adresse: '12 rue de la Pompe', copropriete: 'Syndicat des copropriétaires du 12 rue de la Pompe' };
  assert.equal(
    payeurTexte({ nom: 'Cabinet Dupré Gestion', type: 'syndic' }, site),
    'Syndicat des copropriétaires du 12 rue de la Pompe, représenté par Cabinet Dupré Gestion',
  );
  assert.equal(
    payeurTexte({ nom: 'Cabinet Dupré Gestion', type: 'syndic' }, { adresse: '48 avenue Mozart', copropriete: null }),
    'Syndicat des copropriétaires du 48 avenue Mozart, représenté par Cabinet Dupré Gestion',
  );
  assert.equal(payeurTexte({ nom: 'SCI Les Érables', type: 'bailleur' }, { adresse: '8 rue de Chézy' }), 'SCI Les Érables');
  assert.equal(payeurTexte({ nom: 'Mme Martin', type: 'particulier' }, site), 'Mme Martin');
  assert.equal(payeurTexte(null), '');
});

test('mentionsFacture : ordre de service ou « à renseigner »', () => {
  assert.equal(
    mentionsFacture({ reference: 'DEP-2026-0145', adresse: '12 rue de la Pompe, 75016 Paris', occupant: 'Mme Martin', ordre_service: '55790' }),
    'intervention DEP-2026-0145, 12 rue de la Pompe, 75016 Paris, Mme Martin, ordre de service 55790',
  );
  assert.equal(
    mentionsFacture({ reference: 'DEP-2026-0149', adresse: '12 rue de la Pompe', occupant: null, ordre_service: '' }),
    'intervention DEP-2026-0149, 12 rue de la Pompe, n° d’ordre de service à renseigner',
  );
});
