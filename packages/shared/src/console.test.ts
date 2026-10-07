import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depasseFormule, dureeLisible, joursRestants, peutConsole, prixMensuel, revenuMensuel, tailleLisible } from './console.ts';

test('prix mensuel : formule, utilisateurs en plus et options', () => {
  assert.equal(prixMensuel({ formule: 'equipe', statut: 'actif', prix_special: null, options: [], utilisateurs: 3 }), 79);
  assert.equal(prixMensuel({ formule: 'equipe', statut: 'actif', prix_special: null, options: [], utilisateurs: 5 }), 79 + 2 * 15);
  assert.equal(prixMensuel({ formule: 'entreprise', statut: 'actif', prix_special: null, options: ['compta'], utilisateurs: 10 }), 199 + 2 * 12 + 15);
  // L'Artisan n'a pas d'utilisateur en plus : le prix ne bouge pas, le dépassement est signalé.
  assert.equal(prixMensuel({ formule: 'solo', statut: 'actif', prix_special: null, options: [], utilisateurs: 4 }), 29);
  assert.ok(depasseFormule('solo', 3));
  assert.ok(!depasseFormule('equipe', 30));
});

test('prix particulier et revenu : seuls les clients payants comptent', () => {
  assert.equal(prixMensuel({ formule: 'equipe', statut: 'actif', prix_special: '39.50', options: ['compta'], utilisateurs: 9 }), 39.5);
  assert.equal(revenuMensuel({ formule: 'equipe', statut: 'offert', prix_special: null, options: [], utilisateurs: 6 }), 0);
  assert.equal(revenuMensuel({ formule: 'equipe', statut: 'essai', prix_special: null, options: [], utilisateurs: 1 }), 0);
  assert.equal(revenuMensuel({ formule: 'solo', statut: 'actif', prix_special: 0, options: [], utilisateurs: 1 }), 0);
});

test('droits de la console, comme la base', () => {
  assert.ok(peutConsole('proprietaire', 'equipe'));
  assert.ok(peutConsole('support', 'assistance'));
  assert.ok(!peutConsole('support', 'abonnement'));
  assert.ok(peutConsole('commercial', 'abonnement'));
  assert.ok(!peutConsole('commercial', 'assistance'));
  assert.ok(!peutConsole(null, 'voir'));
});

test('jours, durées et tailles lisibles', () => {
  assert.equal(joursRestants('2026-11-06', '2026-10-07'), 30);
  assert.equal(joursRestants('2026-10-06', '2026-10-07'), -1);
  assert.equal(dureeLisible(30), '30 min');
  assert.equal(dureeLisible(1440), '24 h');
  assert.equal(dureeLisible(90), '1 h 30');
  assert.equal(tailleLisible(512), '512 octets');
  assert.equal(tailleLisible(3_100_000_000), '3,1 Go');
});
