import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, longueurTrajet, ordreConseille, type Point } from './tournee.ts';

// Quatre adresses de l'ouest parisien, données dans un ordre qui fait des allers-retours.
const neuilly: Point = { lat: 48.884, lon: 2.269 };
const paris16: Point = { lat: 48.857, lon: 2.27 };
const neuilly2: Point = { lat: 48.887, lon: 2.262 };
const boulogne: Point = { lat: 48.835, lon: 2.241 };

test('Paris 16e – Boulogne fait environ 3 km', () => {
  const d = distanceKm(paris16, boulogne);
  assert.ok(d > 2.5 && d < 4, String(d));
});

test("l'ordre conseillé évite les allers-retours", () => {
  const pts = [neuilly, boulogne, neuilly2, paris16];
  const ordre = ordreConseille(pts, neuilly);
  assert.deepEqual([...ordre].sort(), [0, 1, 2, 3]);
  assert.ok(longueurTrajet(pts, ordre, neuilly) < longueurTrajet(pts, [0, 1, 2, 3], neuilly));
  assert.deepEqual(ordre, [0, 2, 3, 1]);
});

test('un chantier en cours reste en premier', () => {
  const pts = [neuilly, boulogne, neuilly2, paris16];
  assert.equal(ordreConseille(pts, neuilly, 1)[0], 1);
});

test('zéro ou un point', () => {
  assert.deepEqual(ordreConseille([]), []);
  assert.deepEqual(ordreConseille([paris16]), [0]);
});
