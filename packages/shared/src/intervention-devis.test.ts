import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientVide } from './devis.ts';
import { decouperAdresse, interventionDepuisDevis } from './intervention-devis.ts';

test('découpe une adresse imprimée sur un devis', () => {
  assert.deepEqual(decouperAdresse('18 avenue Mozart, 75016 Paris'), { adresse: '18 avenue Mozart', code_postal: '75016', ville: 'Paris' });
  assert.deepEqual(decouperAdresse('3 rue de la Paix 92200 Neuilly-sur-Seine'), {
    adresse: '3 rue de la Paix',
    code_postal: '92200',
    ville: 'Neuilly-sur-Seine',
  });
  assert.deepEqual(decouperAdresse('Chez M. Dupont'), { adresse: 'Chez M. Dupont', code_postal: '', ville: '' });
});

test('pré-remplit l’intervention avec le client, le chantier et les ouvrages', () => {
  const r = interventionDepuisDevis({
    numero: 'DE-2026-0147',
    objet: 'Remplacement du chauffe-eau',
    client: { ...clientVide(), civ: 'Mme', prenom: 'Sophie', nom: 'Martin', tel: '06 12 34 56 78', adresse: '18 avenue Mozart, 75016 Paris' },
    lignes: [
      { designation: 'Chauffe-eau 200 L', quantite: 1, unite: 'u', prix_unitaire: 689, tva: 10 },
      { designation: 'Main d’oeuvre plombier', quantite: 4, unite: 'h', prix_unitaire: 58, tva: 10 },
      { designation: 'Déplacement Paris', quantite: 1, unite: 'forfait', prix_unitaire: 35, tva: 10 },
    ],
  });
  assert.equal(r.client.nom, 'Mme Sophie Martin');
  assert.equal(r.client.type, 'particulier');
  assert.equal(r.adresse, '18 avenue Mozart');
  assert.equal(r.code_postal, '75016');
  assert.equal(r.motif, 'Remplacement du chauffe-eau');
  assert.equal(r.type, 'installation');
  assert.equal(r.description, 'D’après le devis DE-2026-0147 :\n• 1 u · Chauffe-eau 200 L');
});

test('prend l’adresse du chantier quand elle diffère de celle du client', () => {
  const r = interventionDepuisDevis({
    numero: null,
    objet: '',
    client: { ...clientVide(), type: 'pro', raison: 'Syndic Lamartine', adresse: '1 rue A, 75001 Paris', identique: false, adresseChantier: '9 rue B, 75016 Paris' },
    lignes: [],
  });
  assert.equal(r.client.type, 'syndic');
  assert.equal(r.adresse, '9 rue B');
  assert.equal(r.motif, 'D’après le devis (brouillon)');
});
