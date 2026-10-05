import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  argentProchaine,
  chiffresFiche,
  contientMots,
  etatDocumentSeul,
  etatHistorique,
  etatProchaine,
  historiqueDe,
  initialesClient,
  montantHistorique,
  prochainesDe,
  quandIntervention,
  quandPhrase,
  siteDuDocument,
  titreHistorique,
  trouveDans,
  type DocumentSuivi,
  type InterventionFiche,
} from './suivi-client.ts';

// Cartes « Mes clients » et fiche client : mêmes résultats que le bac (42-clients-equipe.js).

const AJD = '2026-10-04';
const plat = (s: string) => s.replace(/[  ]/g, ' ');

function inter(o: Partial<InterventionFiche>): InterventionFiche {
  return {
    id: 'i1', motif: 'Fuite sous évier', type: 'depannage', statut: 'a_planifier', urgence: 'normale', date_prevue: null, cree_le: '2026-09-01T08:00:00Z',
    devis_id: null, adresse: null, occupant: null, techniciens: [], fiche: null, reference: null, heure_prevue: null, ordre_service: null, site_id: null, ...o,
  };
}
function doc(o: Partial<DocumentSuivi>): DocumentSuivi {
  return {
    id: 'd1', genre: 'devis', type_facture: null, numero: null, statut: 'envoye', objet: 'Salle de bain', date_document: '2026-09-01',
    echeance: null, envoye_le: null, signe_le: null, paye_le: null, total_ht: 1000, net_a_payer: 1200, devis_id: null, conditions: null, ...o,
  };
}

test('initiales du bac', () => {
  assert.equal(initialesClient('Cabinet Dupré Gestion'), 'DG');
  assert.equal(initialesClient('M. et Mme Lambert'), 'L');
  assert.equal(initialesClient('Mme Sophie Martin'), 'SM');
  assert.equal(initialesClient('Hôtel Les Tilleuls'), 'LT');
  assert.equal(initialesClient('Mairie du 16e arrondissement'), 'MD');
  assert.equal(initialesClient('12 rue de la Pompe'.replace(/^\d+\s+/, '')), 'RD');
  assert.equal(initialesClient('Exemple · M. Benali'), 'EM');
});

test('recherche : chaque mot, sans accents', () => {
  assert.ok(contientMots('Cabinet Dupré Gestion', 'dupre CAB'));
  assert.ok(!contientMots('Cabinet Dupré Gestion', 'dupre passy'));
  const imms = [
    { adresse: '12 rue de la Pompe', code_postal: '75016', ville: 'Paris', occupants: [{ nom: 'Mme Martin', lot: '3e gauche' }, { nom: 'Parties communes', lot: null }] },
    { adresse: '48 avenue Mozart', code_postal: '75016', ville: 'Paris', occupants: [{ nom: 'Mme Royer', lot: '2e face' }] },
  ];
  assert.equal(trouveDans('Cabinet Dupré Gestion M. Leroy', imms, 'martin'), 'Trouvé : Mme Martin, 3e gauche, 12 rue de la Pompe');
  assert.equal(trouveDans('Cabinet Dupré Gestion M. Leroy', imms, 'mozart'), 'Trouvé : immeuble 48 avenue Mozart');
  assert.equal(trouveDans('Cabinet Dupré Gestion M. Leroy', imms, 'royer mozart'), 'Trouvé : Mme Royer, 2e face, 48 avenue Mozart');
  assert.equal(trouveDans('Cabinet Dupré Gestion M. Leroy', imms, 'leroy'), '');
});

test('prochaines interventions : en cours, puis datées, puis sans date', () => {
  const l = prochainesDe([
    inter({ id: 'a', statut: 'a_planifier', souhaitee_le: '2026-10-20' }),
    inter({ id: 'b', statut: 'planifiee', date_prevue: '2026-10-06', date_fin: '2026-10-07' }),
    inter({ id: 'c', statut: 'en_cours', date_prevue: AJD, heure_prevue: '09:00:00', fiche: { resultat: null, fin: null, debut: '2026-10-04T07:05:00Z' } }),
    inter({ id: 'd', statut: 'validee', date_prevue: '2026-10-01' }),
    inter({ id: 'e', statut: 'a_planifier' }),
  ]);
  assert.deepEqual(l.map((i) => i.id), ['c', 'b', 'a', 'e']);
  assert.equal(quandIntervention(l[0], AJD), 'Aujourd’hui, 09:00');
  assert.equal(quandIntervention(l[1], AJD), 'Du mardi 6 octobre au mercredi 7 octobre');
  assert.equal(quandIntervention(l[2], AJD), 'Souhaitée vers le 20/10/2026');
  assert.equal(quandIntervention(l[3], AJD), 'Date à choisir');
  assert.equal(quandIntervention(inter({ date_prevue: '2027-01-01' }), AJD), 'Vendredi 1er janvier 2027, matin');
  assert.equal(quandPhrase(inter({ date_prevue: '2026-10-05', heure_prevue: '14:00:00' }), AJD), 'demain à 14:00');
  assert.deepEqual(etatProchaine(l[0], AJD), { ton: 'cobalt', texte: 'Sur place depuis 09:05' });
  assert.deepEqual(etatProchaine(l[1], AJD), { ton: 'bleu', texte: 'Prévue' });
  assert.deepEqual(etatProchaine(l[2], AJD), { ton: 'gris', texte: 'Pas encore de date' });
});

test('argent d’une intervention à venir : devis signé déjà facturé en partie', () => {
  const D = [
    doc({ id: 'dv', statut: 'signe', total_ht: 5267 }),
    doc({ id: 'fa', genre: 'facture', type_facture: 'acompte', statut: 'payee', devis_id: 'dv', total_ht: 1580.1, net_a_payer: 1896 }),
  ];
  assert.equal(plat(argentProchaine(inter({ devis_id: 'dv' }), D)), 'Devis signé : 5 267 € HT · déjà facturé 30 % (1 580 € HT), payé');
  assert.equal(plat(argentProchaine(inter({ devis_id: 'x' }), [doc({ id: 'x', total_ht: 900 })])), 'Devis 900 € HT envoyé, en attente de réponse');
});

test('historique : interventions passées et documents seuls, du plus récent au plus ancien', () => {
  const I = [
    inter({ id: 'i1', statut: 'terminee', date_prevue: '2026-10-04', reference: 'DEP-2026-0145' }),
    inter({ id: 'i2', statut: 'validee', date_prevue: '2026-10-02', reference: 'DEP-2026-0144' }),
    inter({ id: 'i3', statut: 'facturee', date_prevue: '2026-09-17', reference: 'DEP-2026-0141' }),
    inter({ id: 'i4', statut: 'planifiee', date_prevue: '2026-10-06' }),
  ];
  const D = [
    doc({ id: 'f3', genre: 'facture', type_facture: 'totale', statut: 'payee', numero: 'FA-2026-0396', date_document: '2026-09-18', total_ht: 243.16, net_a_payer: 291.79, conditions: { intervention_id: 'i3' } }),
    doc({ id: 'dl', genre: 'devis', statut: 'signe', numero: 'DE-2026-0150', objet: 'Remplacement colonne', date_document: '2026-08-01' }),
    doc({ id: 'br', genre: 'devis', statut: 'brouillon', date_document: '2026-10-01' }),
  ];
  const h = historiqueDe(I, D);
  assert.deepEqual(h.map((l) => l.cle), ['i:i1', 'i:i2', 'i:i3', 'd:dl']);
  assert.deepEqual(etatHistorique(I[0], D, 'intervention', AJD), { ton: 'violet', texte: 'Fiche à valider' });
  assert.deepEqual(etatHistorique(I[1], D, 'intervention', AJD), { ton: 'bleu', texte: 'À facturer' });
  assert.deepEqual(etatHistorique(I[1], D, 'mensuel', AJD), { ton: 'bleu', texte: 'À mettre sur le relevé du mois' });
  assert.deepEqual(etatHistorique(I[2], D, 'intervention', AJD), { ton: 'vert', texte: 'Payée' });
  assert.equal(plat(montantHistorique(I[2], D)), '243 € HT');
  assert.deepEqual(etatDocumentSeul(D[1], D, AJD), { ton: 'vert', texte: 'Devis signé' });
  assert.equal(plat(titreHistorique(D[1])), 'Devis « Remplacement colonne »');
  assert.equal(siteDuDocument(D[0], [{ ...I[2], site_id: 's1' }], D), 's1');
});

test('chiffres de la fiche : facturé, reste à payer, devis en attente, travaux signés', () => {
  const D = [
    doc({ id: 'a', genre: 'facture', type_facture: 'totale', statut: 'payee', date_document: '2026-03-01', total_ht: 1000, net_a_payer: 1200 }),
    doc({ id: 'b', genre: 'facture', type_facture: 'totale', statut: 'a_encaisser', date_document: '2026-09-01', echeance: '2026-09-30', total_ht: 500, net_a_payer: 600 }),
    doc({ id: 'c', genre: 'facture', type_facture: 'totale', statut: 'a_encaisser', date_document: '2026-10-01', echeance: '2026-10-31', total_ht: 100, net_a_payer: 120 }),
    doc({ id: 'd', genre: 'devis', statut: 'envoye', total_ht: 800 }),
    doc({ id: 'e', genre: 'devis', statut: 'signe', total_ht: 2000 }),
    doc({ id: 'f', genre: 'facture', type_facture: 'acompte', statut: 'payee', devis_id: 'e', date_document: '2025-12-01', total_ht: 600, net_a_payer: 720 }),
    doc({ id: 'g', genre: 'devis', statut: 'signe', total_ht: 3000, objet: 'Renouvellement du contrat CT-2026-0001 · Entretien · 2027' }),
  ];
  const c = chiffresFiche(D, AJD);
  assert.equal(c.facture, 1600);
  assert.equal(c.factures, 3);
  assert.equal(c.factureAvant, 600);
  assert.equal(c.montrerAvant, false);
  assert.equal(c.reste, 720);
  assert.equal(c.enRetard, 600);
  assert.equal(c.prochaineEcheance, '2026-10-31');
  assert.equal(c.devisEnvoyes, 800);
  assert.equal(c.nbDevisEnvoyes, 1);
  assert.equal(Math.round(c.travauxAFacturer), 1400);
  assert.ok(c.actif && c.dejaEmis);
});
