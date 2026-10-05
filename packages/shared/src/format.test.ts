import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateMois, familleIntervention, jjmm, LIBELLE_FAMILLE, nomCourt, prefixeIntervention, TON_FAMILLE } from './format.ts';
import type { TypeIntervention } from './types.ts';

test('nomCourt : prénom et initiale du nom', () => {
  assert.equal(nomCourt('Christophe', 'Rambla'), 'Christophe R.');
  assert.equal(nomCourt(' Karim ', ' benali'), 'Karim B.');
  assert.equal(nomCourt('Julien', null), 'Julien');
  assert.equal(nomCourt('Julien', '  '), 'Julien');
});

test('dateMois : jour, mois court, année', () => {
  assert.equal(dateMois('2026-10-03'), '3 oct. 2026');
  assert.equal(dateMois('2026-02-28'), '28 févr. 2026');
  assert.equal(dateMois('2026-06-01'), '1 juin 2026');
  assert.equal(dateMois('2026-12-31T23:00:00Z'), '31 déc. 2026');
  assert.equal(dateMois(null), '');
  assert.equal(dateMois(''), '');
});

test('jjmm : jour et mois sur deux chiffres', () => {
  assert.equal(jjmm('2026-10-03'), '03/10');
  assert.equal(jjmm('2027-01-15T08:00:00Z'), '15/01');
  assert.equal(jjmm(undefined), '');
});

test('familleIntervention : même découpage que les préfixes de numéro', () => {
  const attendu: Record<TypeIntervention, string> = {
    depannage: 'depannage',
    sav: 'depannage',
    entretien: 'entretien',
    installation: 'chantier',
    mise_en_service: 'chantier',
    visite_technique: 'chantier',
    chantier: 'chantier',
  };
  const prefixes = { depannage: 'DEP', chantier: 'CH', entretien: 'ENT' } as const;
  for (const [type, famille] of Object.entries(attendu)) {
    assert.equal(familleIntervention(type), famille, type);
    assert.equal(prefixeIntervention(type), prefixes[familleIntervention(type)], type);
  }
  assert.equal(LIBELLE_FAMILLE.depannage, 'Dépannages');
  assert.deepEqual(TON_FAMILLE, { depannage: 'rouge', chantier: 'bleu', entretien: 'vert' });
});
