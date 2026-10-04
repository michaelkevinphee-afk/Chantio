import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numeroIntervention, prefixeIntervention } from './format.ts';
import { chiffresClient, chosesAFaire, resumeClient, type DocumentSuivi, type InterventionSuivi } from './suivi-client.ts';

const AJD = '2026-10-04';

function inter(o: Partial<InterventionSuivi>): InterventionSuivi {
  return {
    id: 'i1', motif: 'Fuite sous évier', type: 'depannage', statut: 'a_planifier', urgence: 'normale', date_prevue: null,
    cree_le: '2026-09-01T08:00:00Z', devis_id: null, adresse: null, occupant: null, techniciens: [], fiche: null, ...o,
  };
}
function doc(o: Partial<DocumentSuivi>): DocumentSuivi {
  return {
    id: 'd1', genre: 'devis', type_facture: null, numero: null, statut: 'brouillon', objet: 'Salle de bain', date_document: '2026-09-01',
    echeance: null, envoye_le: null, signe_le: null, paye_le: null, total_ht: 1000, net_a_payer: 1200, devis_id: null, conditions: null, ...o,
  };
}
const syndic = { id: 'c1', type: 'syndic' as const, facturation: 'mensuel' as const, immeubles: 2 };
const particulier = { id: 'c2', type: 'particulier' as const, immeubles: 1 };

test('numéro par type, ou l’ancien numéro', () => {
  assert.equal(numeroIntervention({ reference: 'DEP-2026-0012', numero: 42 }), 'DEP-2026-0012');
  assert.equal(numeroIntervention({ reference: null, numero: 42 }), 'N° 0042');
  assert.equal(prefixeIntervention('sav'), 'DEP');
  assert.equal(prefixeIntervention('entretien'), 'ENT');
  assert.equal(prefixeIntervention('installation'), 'CH');
});

test('urgent : facture en retard et intervention urgente sans date', () => {
  const l = chosesAFaire(
    particulier,
    [inter({ urgence: 'urgente' }), inter({ id: 'i2', motif: 'Robinet qui goutte' })],
    [doc({ genre: 'facture', type_facture: 'totale', numero: 'FA-2026-0012', statut: 'a_encaisser', echeance: '2026-09-20', net_a_payer: 480 })],
    AJD,
  );
  assert.equal(l[0].niveau, 'urgent');
  assert.equal(l[0].texte, 'La facture FA-2026-0012 de 480,00 € TTC devait être payée le 20/09 : 14 jours de retard.');
  assert.equal(l[0].lien, '/devis/d1');
  assert.equal(l[1].texte, 'Intervention urgente « Fuite sous évier » : pas encore de date ni de technicien.');
  assert.equal(l[2].niveau, 'afaire');
  assert.equal(l[2].texte, '« Robinet qui goutte » n’a pas encore de date ni de technicien.');
  assert.deepEqual(resumeClient(l, true), { urgent: 2, afaire: 1, ton: 'rouge', etiquette: 'Urgent · 3 choses à faire' });
});

test('syndic : immeuble et occupant, relevé du mois, immeubles manquants', () => {
  const l = chosesAFaire(
    syndic,
    [inter({ statut: 'validee', adresse: '12 rue de la Pompe', occupant: 'Mme Martin', fiche: { resultat: 'termine', fin: '2026-10-02T15:00:00Z' } })],
    [],
    AJD,
  );
  assert.equal(l.length, 1);
  assert.equal(l[0].texte, '« Fuite sous évier » au 12 rue de la Pompe, chez Mme Martin, fait le 02/10, est validé : il reste à le mettre sur le relevé du mois.');
  const vide = chosesAFaire({ ...syndic, immeubles: 0 }, [], [], AJD);
  assert.equal(vide[0].bouton, 'Ajouter un immeuble');
  assert.equal(vide[0].lien, '/clients?fiche=c1#immeubles');
});

test('devis : relancer après 15 jours, sinon on attend ; signé sans intervention', () => {
  const l = chosesAFaire(
    particulier,
    [],
    [
      doc({ id: 'a', statut: 'envoye', envoye_le: '2026-09-10T09:00:00Z' }),
      doc({ id: 'b', statut: 'envoye', objet: 'Cuisine', envoye_le: '2026-10-01T09:00:00Z', total_ht: 2450.4 }),
      doc({ id: 'c', statut: 'signe', objet: 'Douche', signe_le: '2026-09-28T09:00:00Z' }),
    ],
    AJD,
  );
  assert.equal(l[0].texte, 'Le devis « Salle de bain » (1 000 € HT) a été envoyé le 10/09 : pas encore de réponse. Pensez à relancer.');
  assert.equal(l[1].texte, 'Le devis « Douche » (1 000 € HT) est signé, mais aucune intervention n’est encore prévue.');
  assert.equal(l[2].niveau, 'attente');
  assert.equal(l[2].texte, 'Le devis « Cuisine » (2 450 € HT) a été envoyé le 01/10 : pas encore de réponse.');
  // Une intervention créée après la signature compte comme prévue.
  const avec = chosesAFaire(particulier, [inter({ statut: 'planifiee', cree_le: '2026-09-29T10:00:00Z' })], [doc({ statut: 'signe', signe_le: '2026-09-28' })], AJD);
  assert.equal(avec.length, 0);
  assert.deepEqual(resumeClient(avec, true), { urgent: 0, afaire: 0, ton: 'vert', etiquette: 'À jour' });
  assert.equal(resumeClient([], false).etiquette, 'Rien encore');
});

test('fiche à valider, devis demandé par le technicien, fiche renvoyée', () => {
  const l = chosesAFaire(
    particulier,
    [
      inter({ id: 'a', statut: 'terminee', techniciens: ['Karim', 'Julien'] }),
      inter({ id: 'b', statut: 'validee', motif: 'Chauffe-eau à remplacer', techniciens: ['Mehdi'], fiche: { resultat: 'devis_a_etablir', fin: '2026-10-01T11:00:00Z' } }),
      inter({ id: 'c', statut: 'a_reprendre', techniciens: ['Lucas'] }),
    ],
    [],
    AJD,
  );
  assert.equal(l[0].texte, 'Karim et Julien ont terminé « Fuite sous évier ». La fiche attend votre validation.');
  assert.equal(l[2].texte, 'Mehdi demande un devis après son passage du 01/10 : Chauffe-eau à remplacer.');
  assert.equal(l[3].texte, 'La fiche « Fuite sous évier » a été renvoyée à Lucas pour être complétée.');
  // Un devis fait depuis le passage : plus rien à demander.
  const fait = chosesAFaire(particulier, [inter({ statut: 'validee', fiche: { resultat: 'devis_a_etablir', fin: '2026-10-01T11:00:00Z' } })], [doc({ date_document: '2026-10-02', statut: 'envoye', envoye_le: '2026-10-02' })], AJD);
  assert.ok(!fait.some((x) => x.bouton === 'Préparer le devis'));
});

test('chiffres de l’année : avoirs déduits, reste à encaisser et retard', () => {
  const c = chiffresClient(
    [
      doc({ genre: 'facture', type_facture: 'totale', statut: 'payee', date_document: '2026-03-01', paye_le: '2026-03-20', total_ht: 1000, net_a_payer: 1100 }),
      doc({ genre: 'facture', type_facture: 'avoir', statut: 'payee', date_document: '2026-04-01', total_ht: -200, net_a_payer: -220 }),
      doc({ genre: 'facture', type_facture: 'totale', statut: 'a_encaisser', date_document: '2026-09-01', echeance: '2026-09-30', total_ht: 500, net_a_payer: 550 }),
      doc({ genre: 'facture', type_facture: 'totale', statut: 'payee', date_document: '2025-12-01', total_ht: 900, net_a_payer: 990 }),
    ],
    [inter({ date_prevue: '2026-02-01' }), inter({ date_prevue: '2025-11-01' })],
    AJD,
  );
  assert.deepEqual(c, { factureHT: 1300, encaisse: 1100, aEncaisser: 550, enRetard: 550, interventions: 1 });
});
