import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decrireHoraires, depuisQuand, enHeuresDeTravail, HORAIRES_POSITION } from './position.ts';

test('heures de travail, heure de Paris', () => {
  assert.equal(enHeuresDeTravail(null, new Date('2026-10-02T08:40:00Z')), true); // vendredi 10:40
  assert.equal(enHeuresDeTravail(null, new Date('2026-10-02T10:30:00Z')), false); // 12:30, pause
  assert.equal(enHeuresDeTravail(null, new Date('2026-10-02T17:00:00Z')), false); // 19:00
  assert.equal(enHeuresDeTravail(null, new Date('2026-10-03T08:00:00Z')), false); // samedi
  assert.equal(enHeuresDeTravail(null, new Date('2026-01-05T06:45:00Z')), true); // lundi 7:45 en hiver
});

test('description des horaires', () => {
  assert.equal(decrireHoraires(HORAIRES_POSITION), 'du lundi au vendredi, de 7:30 à 18:30, hors pause de 12:00 à 13:30');
  assert.equal(decrireHoraires({ jours: [1, 3], debut: '08:00', fin: '17:00' }), 'lundi, mercredi, de 8:00 à 17:00');
});

test('depuis quand', () => {
  const t = Date.parse('2026-10-02T08:40:00Z');
  assert.equal(depuisQuand('2026-10-02T08:39:20Z', t), 'il y a 40 s');
  assert.equal(depuisQuand('2026-10-02T08:37:00Z', t), 'il y a 3 min');
});
