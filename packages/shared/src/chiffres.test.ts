import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chargeSemaine,
  chiffresBureau,
  contexteParcours,
  dossiersPrevuRealise,
  parcoursFacture,
  sourcePrevu,
  type DocumentChiffres,
  type InterventionLiee,
  type InterventionPrevu,
  type LiensFactures,
} from './chiffres.ts';

const AJD = '2026-10-04';

function doc(o: Partial<DocumentChiffres>): DocumentChiffres {
  return {
    id: 'd1', genre: 'facture', type_facture: 'totale', numero: 'FA-2026-0001', statut: 'a_encaisser', objet: 'Travaux', date_document: '2026-09-01',
    echeance: null, envoye_le: null, signe_le: null, paye_le: null, total_ht: 1000, net_a_payer: 1100, devis_id: null, conditions: null, ...o,
  };
}
const inter = (o: Partial<InterventionLiee>): InterventionLiee => ({ id: 'i1', type: 'depannage', contrat_id: null, devis_id: null, ...o });
const SANS: LiensFactures = { interventions: [] };
const type = (f: DocumentChiffres, autres: DocumentChiffres[] = [], liens: LiensFactures = SANS) => parcoursFacture(f, contexteParcours([f, ...autres], liens));

test('parcoursFacture : le type choisi passe avant tout, puis celui du devis', () => {
  assert.equal(type(doc({ conditions: { parcours: 'chantier', contrat_id: 'c1' } })), 'chantier');
  const dv = doc({ id: 'dv', genre: 'devis', type_facture: null, statut: 'signe', conditions: { parcours: 'contrat' } });
  assert.equal(type(doc({ devis_id: 'dv' }), [dv]), 'contrat');
  // Une valeur inconnue est ignorée.
  assert.equal(type(doc({ conditions: { parcours: 'ao' } })), 'depannage');
});

test('parcoursFacture : un avoir suit la facture qu’il corrige', () => {
  const f = doc({ id: 'f', conditions: { parcours: 'chantier' } });
  assert.equal(type(doc({ id: 'av', type_facture: 'avoir', facture_id: 'f' }), [f]), 'chantier');
  // Avec son propre type, il garde le sien.
  assert.equal(type(doc({ id: 'av', type_facture: 'avoir', facture_id: 'f', conditions: { parcours: 'depannage' } }), [f]), 'depannage');
});

test('parcoursFacture : contrat d’entretien par conditions.contrat_id, renouvellement ou objet', () => {
  assert.equal(type(doc({ conditions: { contrat_id: 'ct' } })), 'contrat');
  const dv = doc({ id: 'dv', genre: 'devis', type_facture: null, statut: 'signe', objet: 'Remplacement chaudière' });
  assert.equal(type(doc({ devis_id: 'dv' }), [dv], { interventions: [], renouvellements: ['dv'] }), 'contrat');
  const renouv = doc({ id: 'dv2', genre: 'devis', type_facture: null, statut: 'signe', objet: 'Renouvellement du contrat CT-2026-0001 · Entretien chaufferie' });
  assert.equal(type(doc({ devis_id: 'dv2' }), [renouv]), 'contrat');
});

test('parcoursFacture : intervention liée (facture, puis interventions du devis, puis origine du devis)', () => {
  const liens = (...L: InterventionLiee[]): LiensFactures => ({ interventions: L });
  // Facture faite depuis une intervention.
  assert.equal(type(doc({ conditions: { intervention_id: 'i1' } }), [], liens(inter({ type: 'sav' }))), 'depannage');
  assert.equal(type(doc({ conditions: { intervention_id: 'i1' } }), [], liens(inter({ type: 'installation' }))), 'chantier');
  assert.equal(type(doc({ conditions: { intervention_id: 'i1' } }), [], liens(inter({ type: 'entretien' }))), 'contrat');
  // Visite d'un contrat, quel que soit son type.
  assert.equal(type(doc({ conditions: { intervention_id: 'i1' } }), [], liens(inter({ type: 'depannage', contrat_id: 'ct' }))), 'contrat');
  // Intervention créée depuis le devis de la facture : elle l'emporte sur la visite d'où vient le devis.
  const dv = doc({ id: 'dv', genre: 'devis', type_facture: null, statut: 'signe', conditions: { intervention_id: 'visite' } });
  const L = liens(inter({ id: 'visite', type: 'depannage' }), inter({ id: 'ch', type: 'chantier', devis_id: 'dv' }));
  assert.equal(type(doc({ devis_id: 'dv' }), [dv], L), 'chantier');
  // Sans intervention créée depuis le devis : la visite d'origine.
  assert.equal(type(doc({ devis_id: 'dv' }), [dv], liens(inter({ id: 'visite', type: 'depannage' }))), 'depannage');
});

test('parcoursFacture : lots ou appel d’offres → chantier ; rien → dépannage', () => {
  const dv = doc({ id: 'dv', genre: 'devis', type_facture: null, statut: 'signe' });
  assert.equal(type(doc({ devis_id: 'dv' }), [dv], { interventions: [], avecLots: ['dv'] }), 'chantier');
  assert.equal(type(doc({ id: 'f' }), [], { interventions: [], avecLots: ['f'] }), 'chantier');
  assert.equal(type(doc({ devis_id: 'dv' }), [doc({ ...dv, conditions: { ao: true } })]), 'chantier');
  assert.equal(type(doc({})), 'depannage');
  assert.equal(type(doc({ devis_id: 'dv' }), [dv]), 'depannage');
});

test('chiffresBureau : les quatre tuiles et la répartition par type', () => {
  const docs: DocumentChiffres[] = [
    // Payée ce mois-ci, chantier.
    doc({ id: 'f1', statut: 'payee', paye_le: '2026-10-02T09:00:00Z', total_ht: 10000, net_a_payer: 11000, conditions: { parcours: 'chantier' } }),
    // Payée le mois dernier : facturée cette année, pas encaissée ce mois-ci.
    doc({ id: 'f2', statut: 'payee', paye_le: '2026-09-20', total_ht: 200, net_a_payer: 220, conditions: { parcours: 'depannage' } }),
    // Payée le 30 septembre à 23 h 30 (UTC) : le 1er octobre à Paris.
    doc({ id: 'f3', statut: 'payee', paye_le: '2026-09-30T23:30:00Z', total_ht: 100, net_a_payer: 110, conditions: { parcours: 'contrat' } }),
    // À encaisser, en retard, avec un avoir de 300 € TTC.
    doc({ id: 'f4', statut: 'a_encaisser', echeance: '2026-09-15', total_ht: 1000, net_a_payer: 1200 }),
    doc({ id: 'av', type_facture: 'avoir', statut: 'a_encaisser', facture_id: 'f4', total_ht: -250, net_a_payer: -300 }),
    // À encaisser, pas en retard.
    doc({ id: 'f5', statut: 'a_encaisser', echeance: '2026-10-30', total_ht: 500, net_a_payer: 600, conditions: { parcours: 'chantier' } }),
    // Facture de l'an dernier : à encaisser, mais pas dans le facturé de l'année.
    doc({ id: 'f6', statut: 'a_encaisser', date_document: '2025-12-15', echeance: '2026-01-14', total_ht: 400, net_a_payer: 480 }),
    // Brouillon et annulée : ne comptent pas.
    doc({ id: 'f7', statut: 'brouillon', total_ht: 999, net_a_payer: 999 }),
    doc({ id: 'f8', statut: 'annule', total_ht: 999, net_a_payer: 999 }),
    // Devis envoyés (en attente) et signé.
    doc({ id: 'dv1', genre: 'devis', type_facture: null, statut: 'envoye', total_ht: 150 }),
    doc({ id: 'dv2', genre: 'devis', type_facture: null, statut: 'envoye', total_ht: 33 }),
    doc({ id: 'dv3', genre: 'devis', type_facture: null, statut: 'signe', total_ht: 5000 }),
  ];
  const c = chiffresBureau(docs, SANS, AJD);
  // L'avoir suit sa facture (dépannage, sans autre indice) et vient en déduction.
  assert.deepEqual(c.parType, { chantier: 10500, depannage: 200 + 1000 - 250, entretien: 100 });
  assert.equal(c.factureHT, 10500 + 950 + 100);
  assert.equal(c.encaisseMois, 11000 + 110);
  assert.equal(c.resteAEncaisser, 900 + 600 + 480);
  assert.equal(c.aEncaisser, 3);
  assert.equal(c.enRetard, 2);
  assert.equal(c.devisAttenteHT, 183);
  assert.equal(c.devisAttente, 2);
});

test('chiffresBureau : une facture entièrement couverte par un avoir n’est plus à encaisser ; un avoir payé ce mois-ci se déduit', () => {
  const docs = [
    doc({ id: 'f', statut: 'a_encaisser', net_a_payer: 1200 }),
    doc({ id: 'av', type_facture: 'avoir', statut: 'a_encaisser', facture_id: 'f', total_ht: -1000, net_a_payer: -1200 }),
    doc({ id: 'p', statut: 'payee', paye_le: '2026-10-01', net_a_payer: 500 }),
    doc({ id: 'avp', type_facture: 'avoir', statut: 'payee', paye_le: '2026-10-03', facture_id: 'p', total_ht: 100, net_a_payer: 120 }),
  ];
  const c = chiffresBureau(docs, SANS, AJD);
  assert.equal(c.aEncaisser, 0);
  assert.equal(c.resteAEncaisser, 0);
  // Le signe de l'avoir est forcé, même enregistré en positif.
  assert.equal(c.encaisseMois, 500 - 120);
});

test('chargeSemaine : tous les membres de terrain, dirigeant compris, par famille', () => {
  const semaine = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const equipe = [
    { id: 'c', prenom: 'Christophe', role: 'dirigeant' as const, heures_semaine: 35 },
    { id: 's', prenom: 'Sandrine', role: 'assistant' as const, heures_semaine: 35 },
    { id: 'k', prenom: 'Karim', role: 'technicien' as const, heures_semaine: 0 },
  ];
  const L = chargeSemaine(
    equipe,
    [
      { type: 'chantier', date_prevue: '2026-09-29', date_fin: '2026-09-30', heure_prevue: '08:00', fin_midi: false, duree_prevue: null, affectations: [{ membre_id: 'c' }] },
      { type: 'sav', date_prevue: '2026-10-01', heure_prevue: '09:00', duree_prevue: 2, affectations: [{ membre_id: 'c' }, { membre_id: 'k' }] },
      { type: 'entretien', date_prevue: '2026-10-12', heure_prevue: '09:00', duree_prevue: 1, affectations: [{ membre_id: 'c' }] },
    ],
    semaine,
  );
  assert.deepEqual(L.map((l) => l.membre.id), ['c', 'k']);
  assert.deepEqual(L[0].heures, { chantier: 15, depannage: 2, entretien: 0 });
  assert.equal(Math.round(L[0].taux), 49);
  // Sans heures par semaine : 0 %, pas de division par zéro.
  assert.equal(L[1].taux, 0);
});

test('sourcePrevu et dossiersPrevuRealise : devis signé seulement, sauf « devis à établir », sinon contrat', () => {
  const fiche = (o: Partial<InterventionPrevu['fiches'][number]> = {}) => ({ envoyee_le: '2026-10-01T10:00:00Z', duree_minutes: 90, resultat: 'termine', fournitures: [], ...o });
  const i = (o: Partial<InterventionPrevu>): InterventionPrevu => ({ id: 'i', statut: 'terminee', devis_id: null, contrat_id: null, fiches: [fiche()], ...o });
  const devis = [
    { id: 'brouillon', statut: 'brouillon' as const },
    { id: 'signe', statut: 'signe' as const },
    { id: 'refuse', statut: 'refuse' as const, conditions: { intervention_id: 'x' } },
    { id: 'depuis', statut: 'signe' as const, conditions: { intervention_id: 'v' } },
  ];
  assert.equal(sourcePrevu(i({ devis_id: 'brouillon' }), devis), null);
  assert.deepEqual(sourcePrevu(i({ devis_id: 'signe' }), devis), { genre: 'devis', id: 'signe' });
  // Devis préparé depuis l'intervention (conditions.intervention_id), comme d.interv dans le bac.
  assert.deepEqual(sourcePrevu(i({ id: 'v' }), devis), { genre: 'devis', id: 'depuis' });
  // Visite de diagnostic : sa fiche demande un devis, le devis n'est pas son « prévu ».
  assert.equal(sourcePrevu(i({ id: 'v', fiches: [fiche({ resultat: 'devis_a_etablir' })] }), devis), null);
  assert.deepEqual(sourcePrevu(i({ devis_id: 'brouillon', contrat_id: 'ct' }), devis), { genre: 'contrat' });

  const L = dossiersPrevuRealise(
    [
      i({ id: 'a', devis_id: 'signe', fiches: [fiche({ envoyee_le: '2026-09-20T10:00:00Z', duree_minutes: 60, fournitures: [{ designation: 'Joint', quantite: 2 }] }), fiche({ envoyee_le: '2026-09-21T10:00:00Z', duree_minutes: 30 })] }),
      i({ id: 'b', contrat_id: 'ct', fiches: [fiche({ envoyee_le: '2026-10-02T10:00:00Z' })] }),
      i({ id: 'pas-finie', statut: 'en_cours', contrat_id: 'ct' }),
      i({ id: 'sans-fiche', contrat_id: 'ct', fiches: [fiche({ envoyee_le: null })] }),
      i({ id: 'sans-source', devis_id: 'brouillon' }),
    ],
    devis,
  );
  assert.deepEqual(L.map((d) => d.intervention.id), ['b', 'a']);
  assert.equal(L[1].minutes, 90);
  assert.deepEqual(L[1].pieces, [{ designation: 'Joint', quantite: 2 }]);
});
