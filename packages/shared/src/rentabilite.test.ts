import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LigneDocument } from './devis.ts';
import { lireDpgf, normaliserUnite, retrouverOuvrage } from './dpgf.ts';
import {
  appliquerPrix,
  coefficientMinimum,
  coefficientPlancher,
  margeLigne,
  prixLigne,
  quantiteMetre,
  reglagesPrix,
  rentabilite,
  texteMetre,
} from './rentabilite.ts';

const rp = reglagesPrix({ cout_horaire: 40, frais_generaux: 30, coefficient: 1.5, marge_min: 8, chute: 10 });

const ligne = (p: Partial<LigneDocument>): LigneDocument => ({ designation: 'Ligne', quantite: 1, unite: 'u', prix_unitaire: 0, tva: 10, ...p });

test('réglages de prix : valeurs par défaut et bornes', () => {
  assert.deepEqual(reglagesPrix({}), { cout_horaire: 42, frais_generaux: 30, coefficient: 1.45, marge_min: 8, chute: 10 });
  assert.equal(reglagesPrix({ coefficient: 0.1 }).coefficient, 1.45);
  assert.equal(reglagesPrix({ cout_horaire: 55 }).cout_horaire, 55);
  // 1,3 / 0,92 = 1,413… arrondi au centième supérieur.
  assert.equal(coefficientPlancher(rp), 1.42);
});

test('prix calculé : (fourniture + pose × coût horaire) × coefficient, global ou propre', () => {
  const l = ligne({ achat: 100, heures: 2, prix_calcule: true });
  assert.equal(prixLigne(l, 1.5, rp), 270); // (100 + 80) × 1,5
  assert.equal(prixLigne({ ...l, coefficient: 2 }, 1.5, rp), 360);
  // Prix fixe : le prix saisi reste, même avec un coût connu.
  assert.equal(prixLigne(ligne({ achat: 100, heures: 2, prix_unitaire: 250 }), 1.5, rp), 250);
  const [a, b] = appliquerPrix([l, ligne({ prix_unitaire: 99 })], 1.2, rp);
  assert.equal(a.prix_unitaire, 216);
  assert.equal(b.prix_unitaire, 99);
});

test('rentabilité : déboursé, frais généraux, marges, coefficient réel', () => {
  const lignes = [
    ligne({ titre: true, designation: 'Lot 1', quantite: 0 }),
    ligne({ achat: 100, heures: 2, prix_calcule: true, quantite: 2, prix_unitaire: 270 }),
    ligne({ prix_unitaire: 50 }),
  ];
  const r = rentabilite({ lignes, remise: 0 }, rp);
  assert.equal(r.fournitures, 200);
  assert.equal(r.mainOeuvre, 160);
  assert.equal(r.heures, 4);
  assert.equal(r.debourse, 360);
  assert.equal(r.fraisGeneraux, 108);
  assert.equal(r.prixRevient, 468);
  assert.equal(r.prixVente, 590);
  assert.equal(r.margeBrute, 230);
  assert.equal(r.margeNette, 122);
  assert.equal(r.sansCout, 1);
  assert.equal(r.sousMinimum, false);
  assert.ok(Math.abs(r.coefficientReel - 590 / 360) < 1e-9);
  // La remise baisse le prix de vente, pas le coût.
  assert.equal(rentabilite({ lignes, remise: 10 }, rp).prixVente, 531);
});

test('coefficient minimum pour la marge nette, et marge de chaque ligne', () => {
  const lignes = [ligne({ achat: 100, heures: 0, prix_calcule: true, quantite: 1, prix_unitaire: 120 })];
  assert.equal(rentabilite({ lignes, remise: 0 }, rp).sousMinimum, true);
  const k = coefficientMinimum({ lignes, remise: 0 }, rp)!;
  assert.equal(k, coefficientPlancher(rp));
  assert.equal(rentabilite({ lignes: appliquerPrix(lignes, k, rp), remise: 0 }, rp).sousMinimum, false);
  // Sans ligne qui suit le coefficient global : il n'y peut rien.
  assert.equal(coefficientMinimum({ lignes: [ligne({ achat: 100, prix_unitaire: 90 })], remise: 0 }, rp), null);
  const m = margeLigne(ligne({ achat: 100, prix_calcule: true, prix_unitaire: 150 }), 1.5, rp);
  assert.equal(m.coefficient, 1.5);
  assert.ok(Math.abs(m.tauxMargeNette - ((150 - 130) / 150) * 100) < 1e-9);
});

test('métré : surface, longueur, volume, ouvertures et chute', () => {
  assert.equal(quantiteMetre({ longueur: 9.6, largeur: 2.5, nombre: 1, deduction: 3.6, chute: 0 }, 'm²'), 20.4);
  assert.equal(quantiteMetre({ longueur: 2.4, largeur: 2, nombre: 1, deduction: 0, chute: 10 }, 'm²'), 5.28);
  assert.equal(quantiteMetre({ longueur: 6, largeur: 0, nombre: 3, deduction: 0, chute: 0 }, 'ml'), 18);
  assert.equal(quantiteMetre({ longueur: 2, largeur: 1.5, hauteur: 0.1, nombre: 1, deduction: 0, chute: 0 }, 'm³'), 0.3);
  assert.equal(texteMetre({ longueur: 9.6, largeur: 2.5, nombre: 2, deduction: 3.6, chute: 10 }, 'm²'), '9,6 × 2,5 × 2 − 3,6 + 10 % de chute');
  assert.equal(texteMetre({ longueur: 6, largeur: 0, nombre: 3, deduction: 0, chute: 0 }, 'ml'), '6 × 3');
});

test('DPGF : en-tête repéré, lots, postes, quantités du client et ouvrages retrouvés', () => {
  const ouvrages = [
    { id: 'o1', designation: 'Colonne montante cuivre Ø28', unite: 'ml', prix_achat: 18.5, heures: 0.6 },
    { id: 'o2', designation: 'WC suspendu complet avec bâti', unite: 'u', prix_achat: 395, heures: 3.5 },
  ];
  const rangees = [
    ['Marché de rénovation', '', '', ''],
    ['N°', 'Désignation des ouvrages', 'U', 'Qté', 'P.U. HT', 'Montant HT'],
    ['11.1', 'Réseaux', '', ''],
    ['11.1.1', 'Colonne montante en cuivre Ø28', 'ML', '64'],
    ['11.1.2', 'Calorifuge des réseaux', 'ml', '474,5'],
    ['11.2', 'Appareils', '', ''],
    ['11.2.1', 'WC suspendu complet', 'U', '24'],
    ['', 'Total lot 11', '', ''],
  ];
  const r = lireDpgf(rangees, ouvrages, 10)!;
  assert.equal(r.postes, 3);
  assert.equal(r.retrouves, 2);
  assert.deepEqual(
    r.lignes.map((l) => [l.titre ?? false, l.reference ?? null, l.designation, l.unite, l.quantite]),
    [
      [true, null, '11.1 · Réseaux', 'u', 0],
      [false, '11.1.1', 'Colonne montante en cuivre Ø28', 'ml', 64],
      [false, '11.1.2', 'Calorifuge des réseaux', 'ml', 474.5],
      [true, null, '11.2 · Appareils', 'u', 0],
      [false, '11.2.1', 'WC suspendu complet', 'u', 24],
    ],
  );
  assert.equal(r.lignes[1].achat, 18.5);
  assert.equal(r.lignes[1].prix_calcule, true);
  assert.equal(r.lignes[2].achat, null);
  assert.equal(lireDpgf([['a', 'b'], ['1', '2']], ouvrages, 10), null);
  assert.equal(normaliserUnite('M2'), 'm²');
  assert.equal(normaliserUnite('Ens'), 'ens.');
  assert.equal(retrouverOuvrage('Peinture des murs', 'm²', ouvrages), null);
});

test('réglages de dépannage : valeurs par défaut, bornes et couleur des documents', async () => {
  const { reglagesDepannage, REGLAGES_DEPANNAGE_DEFAUT } = await import('./rentabilite.ts');
  const { couleurDocument, CODES_NAF, FORMES_JURIDIQUES } = await import('./libelles.ts');
  assert.deepEqual(reglagesDepannage({}), { taux_depannage: 65, deplacement: 45, maj_soir: 50, maj_we: 75 });
  assert.deepEqual(reglagesDepannage(null), REGLAGES_DEPANNAGE_DEFAUT);
  assert.equal(reglagesDepannage({ taux_depannage: 72 }).taux_depannage, 72);
  // Hors bornes : la valeur par défaut reste.
  assert.equal(reglagesDepannage({ maj_soir: -5 }).maj_soir, 50);
  assert.equal(reglagesDepannage({ maj_we: 900 }).maj_we, 75);
  assert.equal(couleurDocument({}), '#101A3D');
  assert.equal(couleurDocument({ couleur_doc: 'vert' }), '#067647');
  assert.equal(couleurDocument({ couleur_doc: 'inconnue' }), '#101A3D');
  assert.equal(CODES_NAF.length, 16);
  assert.equal(FORMES_JURIDIQUES[0], 'Entrepreneur individuel');
});
