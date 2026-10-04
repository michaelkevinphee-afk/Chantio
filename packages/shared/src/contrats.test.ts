import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterMois, etatContrat, limitePreavis, lignesRenouvellement, periodeEnCours, visitesAPlanifier, visitesAVenir } from './contrats.ts';

const contrat = { debut: '2026-01-01', fin: '2026-12-31', tacite: false, preavis_mois: 3, visites_par_an: 4, derniere_visite: '2026-07-15' };

test('mois ajoutés, fin de mois respectée', () => {
  assert.equal(ajouterMois('2026-01-31', 1), '2026-02-28');
  assert.equal(ajouterMois('2026-11-15', 3), '2027-02-15');
  assert.equal(ajouterMois('2026-03-15', -3), '2025-12-15');
});

test('date limite de préavis', () => {
  assert.equal(limitePreavis('2026-12-31', 3), '2026-09-30');
  assert.equal(limitePreavis('2027-03-14', 3), '2026-12-14');
  assert.equal(limitePreavis('2026-12-31', 0), '2026-12-31');
});

test('reconduction tacite : la période repart pour la même durée', () => {
  assert.deepEqual(periodeEnCours({ ...contrat, tacite: true }, '2027-02-10'), { debut: '2027-01-01', fin: '2027-12-31', reconduit: 1 });
  assert.deepEqual(periodeEnCours(contrat, '2027-02-10'), { debut: '2026-01-01', fin: '2026-12-31', reconduit: 0 });
});

test('état du contrat selon le préavis et le renouvellement', () => {
  assert.equal(etatContrat(contrat, null, '2026-05-01').etiquette, 'Actif');
  const proche = etatContrat(contrat, null, '2026-08-01');
  assert.equal(proche.etiquette, 'À renouveler');
  assert.ok(proche.aRenouveler);
  assert.match(proche.detail, /30\/09\/2026 \(dans 60 jours\)/);
  assert.equal(etatContrat(contrat, null, '2026-10-15').etiquette, 'Préavis dépassé');
  assert.equal(etatContrat({ ...contrat, tacite: true }, null, '2026-10-15').etiquette, 'Reconduit');
  assert.equal(etatContrat(contrat, null, '2027-01-05').etiquette, 'Terminé');
  assert.equal(etatContrat(contrat, { statut: 'envoye', numero: 'DE-2026-0040' }, '2026-10-15').etiquette, 'Renouvellement proposé');
  assert.equal(etatContrat(contrat, { statut: 'signe', numero: 'DE-2026-0040' }, '2026-10-15').etiquette, 'Renouvellement signé');
  assert.equal(etatContrat(contrat, { statut: 'refuse', numero: 'DE-2026-0040' }, '2026-10-15').etiquette, 'Préavis dépassé');
});

test('visites de l’année, rapprochées des interventions du contrat', () => {
  const inter = [{ id: 'a', reference: 'ENT-2026-0003', date_prevue: '2026-10-20', souhaitee_le: null, statut: 'planifiee' as const }];
  const v = visitesAVenir(contrat, inter, '2026-10-04');
  assert.deepEqual(
    v.map((x) => x.date),
    ['2026-10-15', '2027-01-15', '2027-04-15', '2027-07-15'],
  );
  assert.equal(v[0].intervention?.id, 'a');
  assert.ok(v.slice(1).every((x) => x.apresFin), 'après la fin du contrat sans reconduction');
  assert.equal(visitesAPlanifier(v).length, 0);
  assert.equal(visitesAPlanifier(visitesAVenir({ ...contrat, tacite: true }, inter, '2026-10-04')).length, 3);
});

test('une visite faite compte comme dernière visite', () => {
  const inter = [{ id: 'b', reference: null, date_prevue: '2026-09-01', souhaitee_le: null, statut: 'validee' as const }];
  const v = visitesAVenir({ ...contrat, tacite: true }, inter, '2026-10-04');
  assert.equal(v[0].date, '2026-12-01');
});

test('lignes du devis de renouvellement', () => {
  const l = lignesRenouvellement({ objet: 'Entretien chaufferie', visites_par_an: 4, fournitures_visite: 20, heures_visite: 2 }, 20);
  assert.equal(l.length, 5);
  assert.equal(l[1].designation, 'Visite d’entretien : entretien chaufferie');
  assert.equal(l[1].quantite, 4);
  assert.equal(l[4].heures, 3);
  assert.equal(lignesRenouvellement({ objet: 'Chaudière', visites_par_an: 1, fournitures_visite: 0, heures_visite: 1 }, 10).length, 3);
});
