import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifierFiche, dureeDepuis, nouvelId, cheminPhoto } from './fiche.ts';
import { etatMesure } from './gabarit.ts';
import { dateCourte, duree, heure, numero, ajouterJours } from './format.ts';
import type { FicheAEnvoyer } from './types.ts';

const base: FicheAEnvoyer = {
  id: 'f',
  intervention_id: 'i',
  valeurs: { constat: ['Fuite'], travaux: 'Joint remplacé' },
  resultat: 'termine',
  duree_minutes: 45,
  fournitures: [{ designation: 'Joint fibre 1/2', quantite: 2 }],
  medias: [],
};

test('une fiche complète est prête à partir', () => {
  assert.deepEqual(verifierFiche(base), []);
});

test('il manque le constat, les travaux et le temps', () => {
  const manques = verifierFiche({ ...base, valeurs: {}, duree_minutes: null });
  assert.equal(manques.length, 3);
});

test('une signature sans nom est refusée', () => {
  assert.equal(verifierFiche({ ...base, signature_client: 'M0 0' }).length, 1);
});

test('la durée est arrondie aux 5 minutes', () => {
  const d = new Date('2026-10-01T08:00:00');
  assert.equal(dureeDepuis(d, new Date('2026-10-01T08:43:00')), 45);
  assert.equal(dureeDepuis(d, new Date('2026-10-01T08:01:00')), 5);
});

test('identifiants et chemins de photos', () => {
  assert.match(nouvelId(), /^[0-9a-f-]{36}$/);
  assert.equal(cheminPhoto('e', 'f', 'p'), 'e/f/p.jpg');
});

test('mesures hors plage signalées', () => {
  assert.equal(etatMesure('co', 12), 'ok');
  assert.equal(etatMesure('co', 80), 'alerte');
  assert.equal(etatMesure('co2', 7.5), 'alerte');
  assert.equal(etatMesure('co2', null), 'vide');
});

test('mise en forme en français', () => {
  assert.equal(dateCourte('2026-10-01', '2026-10-01'), "Aujourd'hui");
  assert.equal(dateCourte('2026-10-02', '2026-10-01'), 'Demain');
  assert.equal(ajouterJours('2026-10-31', 1), '2026-11-01');
  assert.equal(duree(75), '1 h 15');
  assert.equal(duree(45), '45 min');
  assert.equal(heure('08:30:00'), '8 h 30');
  assert.equal(numero(42), 'N° 0042');
});
