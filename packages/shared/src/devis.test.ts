import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELES_MAIL,
  calculer,
  remplirModele,
  clauses,
  cleTva,
  clientVide,
  conditionsParDefaut,
  controlerSiret,
  estAppelOffres,
  etatDocument,
  joursAvantLimite,
  euro,
  luhn,
  nombre,
  type DocumentACalculer,
} from './devis.ts';

const lignes = [
  { titre: true, designation: 'Salle de bain', quantite: 0, unite: 'u', prix_unitaire: 0, tva: 10 },
  { designation: 'Receveur extra-plat', quantite: 1, unite: 'u', prix_unitaire: 1000, tva: 10, avancement: 50, avancement_precedent: 20 },
  { designation: 'Main-d’œuvre plombier', quantite: 10, unite: 'h', prix_unitaire: 100, tva: 20, avancement: 100, avancement_precedent: 0 },
];

const base: DocumentACalculer = {
  genre: 'devis',
  type_facture: null,
  remise: 0,
  pourcentage: 30,
  avancement: 60,
  avancement_precedent: 30,
  client: { type: 'particulier' },
  conditions: { retenue: false, caution: false, autoliq: false, aide: false, aideMontant: '0' },
  lignes,
};

test('devis : TVA par taux, titres ignorés', () => {
  const T = calculer(base);
  assert.equal(T.ht, 2000);
  assert.deepEqual(T.tva, [
    { taux: 10, base: 1000, montant: 100 },
    { taux: 20, base: 1000, montant: 200 },
  ]);
  assert.equal(T.ttc, 2300);
  assert.equal(T.net, 2300);
});

test('remise appliquée avant TVA', () => {
  const T = calculer({ ...base, remise: 10 });
  assert.equal(T.marcheHT, 1800);
  assert.equal(T.remise, 200);
  assert.equal(T.ttc, 2070);
});

test('prime déduite du reste à payer sur un devis', () => {
  const T = calculer({ ...base, conditions: { ...base.conditions, aide: true, aideMontant: '800' } });
  assert.equal(T.aide, 800);
  assert.equal(T.net, 1500);
});

test('facture d’acompte : un pourcentage du marché', () => {
  const T = calculer({ ...base, genre: 'facture', type_facture: 'acompte' });
  assert.equal(T.ht, 600);
});

test('facture d’avancement : avancement moins le déjà facturé', () => {
  const T = calculer({ ...base, genre: 'facture', type_facture: 'avancement' });
  assert.equal(T.ht, 600);
  assert.equal(T.dejaFacture, 600);
});

test('situation : ligne par ligne, en cumulé', () => {
  const T = calculer({ ...base, genre: 'facture', type_facture: 'situation' });
  assert.equal(T.ht, 300 + 1000);
  assert.equal(T.cumulSituation, 500 + 1000);
  assert.equal(T.dejaFacture, 200);
});

test('solde : le reste du marché, retenue de garantie 5 % du TTC', () => {
  const T = calculer({
    ...base,
    genre: 'facture',
    type_facture: 'solde',
    avancement_precedent: 70,
    conditions: { ...base.conditions, retenue: true },
  });
  assert.equal(T.ht, 600);
  assert.equal(T.ttc, 690);
  assert.equal(T.retenue, 34.5);
  assert.equal(T.net, 655.5);
});

test('caution bancaire : pas de retenue', () => {
  const T = calculer({ ...base, genre: 'facture', type_facture: 'totale', conditions: { ...base.conditions, retenue: true, caution: true } });
  assert.equal(T.retenue, 0);
});

test('avoir : montants négatifs', () => {
  const T = calculer({ ...base, genre: 'facture', type_facture: 'avoir' });
  assert.equal(T.ttc, -2300);
});

test('autoliquidation : pas de TVA pour un sous-traitant', () => {
  const T = calculer({ ...base, client: { type: 'pro' }, conditions: { ...base.conditions, autoliq: true } });
  assert.equal(T.tva.length, 0);
  assert.equal(T.ttc, 2000);
  const L = clauses({ genre: 'devis', date: '02/10/2026', client: { ...clientVide(), type: 'pro' }, conditions: conditionsParDefaut() }, T);
  assert.ok(L.some(([t, x]) => t === 'TVA' && x.includes('283-2 nonies')));
  assert.ok(L.some(([t, x]) => t === 'Retard de paiement' && x.includes('40 €')));
  assert.ok(!L.some(([t]) => t === 'Médiation'));
});

test('particulier : médiateur, rétractation si signé à domicile', () => {
  const T = calculer(base);
  const L = clauses(
    { genre: 'devis', date: '02/10/2026', client: clientVide(), conditions: { ...conditionsParDefaut(), retract: true } },
    T,
  );
  assert.ok(L.some(([t]) => t === 'Médiation'));
  assert.ok(L.some(([t, x]) => t === 'Rétractation' && x.includes('L221-18')));
  assert.ok(L.some(([t]) => t === 'TVA à taux réduit'));
});

test('SIREN, SIRET et TVA intracommunautaire', () => {
  assert.ok(luhn('732829320'));
  assert.equal(cleTva('732829320'), 'FR44732829320');
  assert.equal(controlerSiret('732 829 320'), null);
  assert.equal(controlerSiret('732829321'), 'Numéro invalide (clé de contrôle)');
  assert.equal(controlerSiret('1234'), '9 chiffres (SIREN) ou 14 (SIRET)');
});

test('état : facture en retard calculée à la date du jour', () => {
  const e = etatDocument({ genre: 'facture', statut: 'a_encaisser', echeance: '2026-09-20' }, '2026-10-02');
  assert.equal(e.libelle, 'En retard de 12 jours');
  assert.equal(e.ton, 'rouge');
  assert.equal(etatDocument({ genre: 'devis', statut: 'envoye', echeance: null, relances: 1 }, '2026-10-02').libelle, 'Relancé');
});

test('état : réponse à un appel d’offres, puis gagné ou perdu', () => {
  const ao = (statut: 'brouillon' | 'envoye' | 'signe' | 'refuse', aoLimite?: string) =>
    etatDocument({ genre: 'devis', statut, echeance: null, conditions: { ao: true, aoLimite } }, '2026-10-04');
  assert.deepEqual(ao('brouillon', '2026-10-20'), { libelle: 'À rendre avant le 20/10', ton: 'violet', retard: 0 });
  assert.equal(ao('brouillon', '2026-10-06').ton, 'rouge');
  assert.equal(ao('brouillon', '2026-10-01').libelle, 'Date limite passée');
  assert.equal(ao('brouillon').libelle, 'Réponse à préparer');
  assert.equal(ao('envoye').libelle, 'Réponse envoyée');
  assert.equal(ao('signe').libelle, 'Gagné');
  assert.equal(ao('refuse').libelle, 'Perdu');
  // Une facture issue d'un appel d'offres reste une facture ordinaire.
  assert.equal(estAppelOffres({ genre: 'facture', conditions: { ao: true } }), false);
  assert.equal(joursAvantLimite('2026-10-07', '2026-10-04'), 3);
  assert.equal(joursAvantLimite('', '2026-10-04'), null);
});

test('nombres saisis à la française', () => {
  assert.equal(nombre('1 234,5'), 1234.5);
  assert.equal(nombre(''), 0);
  assert.equal(euro(1234.5), '1 234,50 €');
});

test('textes d’envoi : mots remplacés, numéro absent sans double espace', () => {
  const v = { titre: 'Devis', numero: '', objet: 'Salle de bain', client: 'Mme Martin', montant: '1 200,00 €' };
  assert.equal(remplirModele(MODELES_MAIL.mail_devis_objet, v), 'Devis · Salle de bain');
  assert.match(remplirModele(MODELES_MAIL.mail_devis_texte, v), /^Bonjour Mme Martin,\n\nVeuillez trouver ci-joint le devis pour : Salle de bain\.\nMontant : 1 200,00 €/);
  assert.equal(remplirModele('{inconnu} {client}', v), '{inconnu} Mme Martin');
});

test('conditions par défaut reprises des paramètres', () => {
  const c = conditionsParDefaut({ validite: '3 mois', acompte: '40', delai: '30 jours date de facture' });
  assert.deepEqual([c.validite, c.acompte, c.delai], ['3 mois', '40', '30 jours date de facture']);
  assert.equal(conditionsParDefaut().validite, '1 mois');
});
