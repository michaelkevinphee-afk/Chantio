import assert from 'node:assert/strict';
import { test } from 'node:test';
import { phraseAttente, resumeAFaire, SANS_CLIENT, toutAFaire, type AchatAFaire, type ClientAFaire, type DonneesAFaire } from './a-faire.ts';
import type { DocumentSuivi, InterventionSuivi } from './suivi-client.ts';

const AJD = '2026-10-04';
const plat = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

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
function achat(o: Partial<AchatAFaire>): AchatAFaire {
  return { id: 'a1', numero: 'TN-2026-3381', statut: 'a_payer', echeance: '2026-09-24', montant_ttc: 2612.4, paye: 0, fournisseur: 'Thermo Négoce IDF', ...o };
}
const client = (id: string, nom: string, o: Partial<ClientAFaire> = {}): ClientAFaire => ({ id, nom, type: 'particulier', immeubles: 1, ...o });
function donnees(o: Partial<DonneesAFaire> & { inter?: Record<string, InterventionSuivi[]>; docs?: Record<string, DocumentSuivi[]> }): DonneesAFaire {
  return {
    clients: [],
    interventions: new Map(Object.entries(o.inter ?? {})),
    documents: new Map(Object.entries(o.docs ?? {})),
    aujourdhui: AJD,
    ...o,
  };
}

test('client par client (ordre alphabétique), l’urgent d’abord, tri stable', () => {
  const L = toutAFaire(
    donnees({
      clients: [client('m', 'Mme Sophie Martin'), client('b', 'Boulangerie du Ranelagh', { type: 'entreprise' }), client('a', 'Auteuil Promotion', { type: 'entreprise' })],
      inter: {
        m: [inter({ id: 'm1', statut: 'validee', motif: 'Ballon d’eau chaude qui ne chauffe plus', date_prevue: '2026-09-30' })],
        b: [inter({ id: 'b1', motif: 'Évacuation lente du lave-mains' }), inter({ id: 'b2', urgence: 'urgente', motif: 'Plus d’eau chaude' })],
      },
      docs: {
        a: [doc({ id: 'ao', objet: 'Résidence Auteuil, 24 logements · Lot 11 Plomberie', conditions: { ao: true, aoLimite: '2026-10-17' } })],
        m: [doc({ id: 'dm', objet: 'Remplacement du chauffe-eau électrique 200 L' })],
      },
    }),
  );
  assert.deepEqual(
    L.map((x) => [x.niveau, x.client?.nom, plat(x.texte)]),
    [
      ['urgent', 'Boulangerie du Ranelagh', 'Intervention urgente « Plus d’eau chaude » : pas encore de date ni de technicien.'],
      ['afaire', 'Auteuil Promotion', 'Appel d’offres « Résidence Auteuil, 24 logements · Lot 11 Plomberie » : réponse à rendre avant le 17/10/2026 (dans 13 jours).'],
      ['afaire', 'Boulangerie du Ranelagh', '« Évacuation lente du lave-mains » n’a pas encore de date ni de technicien.'],
      ['afaire', 'Mme Sophie Martin', '« Ballon d’eau chaude qui ne chauffe plus », fait le 30/09/2026, est validé : il reste à le facturer.'],
      ['afaire', 'Mme Sophie Martin', 'Le devis « Remplacement du chauffe-eau électrique 200 L » est commencé mais pas encore envoyé.'],
    ],
  );
  assert.deepEqual(L[0].client, { id: 'b', nom: 'Boulangerie du Ranelagh' });
  assert.equal(new Set(L.map((x) => x.cle)).size, L.length, 'clés uniques');
  // Un appel d'offres à 3 jours passe en urgent, donc en tête.
  const ao = toutAFaire(donnees({ clients: [client('a', 'Auteuil Promotion'), client('z', 'Zoé')], inter: { a: [inter({})] }, docs: { z: [doc({ conditions: { ao: true, aoLimite: '2026-10-07' } })] } }));
  assert.deepEqual(ao.map((x) => [x.niveau, x.client?.nom]), [['urgent', 'Zoé'], ['afaire', 'Auteuil Promotion']]);
});

test('achats : une facture échue, plusieurs, et les factures reçues', () => {
  const une = toutAFaire(donnees({ achats: [achat({}), achat({ id: 'a2', statut: 'recu', echeance: null }), achat({ id: 'a3', statut: 'recu' })] }));
  assert.deepEqual(
    une.map((x) => [x.niveau, x.module, plat(x.texte), x.bouton, x.lien]),
    [
      ['urgent', 'Achats', 'La facture n° TN-2026-3381 de Thermo Négoce IDF (2 612,40 € TTC) devait être payée le 24/09/2026.', 'Déclarer un paiement', '/achats/a1?payer=1'],
      ['afaire', 'Achats', '2 factures fournisseurs reçues à vérifier puis approuver.', 'Vérifier', '/achats?filtre=recu'],
    ],
  );
  const plusieurs = toutAFaire(
    donnees({
      achats: [
        achat({ paye: 612.4 }),
        achat({ id: 'a2', statut: 'planifie', fournisseur: null, montant_ttc: 100 }),
        achat({ id: 'a3', echeance: '2026-10-04' }),
        achat({ id: 'a4', statut: 'payee' }),
        achat({ id: 'a5', statut: 'recu' }),
      ],
    }),
  );
  assert.deepEqual(
    plusieurs.map((x) => [plat(x.texte), x.bouton, x.lien]),
    [
      ['2 factures fournisseurs ont dépassé leur échéance (2 100,00 € TTC).', 'Voir les factures', '/achats?filtre=a_payer'],
      ['1 facture fournisseur reçue à vérifier puis approuver.', 'Vérifier', '/achats?filtre=recu'],
    ],
  );
  const sansFournisseur = toutAFaire(donnees({ achats: [achat({ fournisseur: null, numero: null })] }));
  assert.equal(plat(sansFournisseur[0].texte), 'La facture de Fournisseur à vérifier (2 612,40 € TTC) devait être payée le 24/09/2026.');
});

test('entreprise (dirigeant) : identité à vérifier et demandes d’accès', () => {
  const L = toutAFaire(
    donnees({
      achats: [achat({ statut: 'recu' })],
      entreprise: { nom: 'Verger', identite_statut: 'a_verifier', demandes: [{ id: 'q1', prenom: 'Lucas', nom: 'Moreau' }, { id: 'q2', prenom: 'Inès', nom: null }] },
    }),
  );
  assert.deepEqual(
    L.map((x) => [x.module, x.texte, x.bouton, x.lien]),
    [
      ['Entreprise', 'Vérifiez votre identité de dirigeant : c’est nécessaire pour activer la facturation électronique.', 'Vérifier', '/entreprises/identite'],
      ['Entreprise', 'Lucas Moreau demande l’accès à Verger.', 'Répondre', '/entreprises'],
      ['Entreprise', 'Inès demande l’accès à Verger.', 'Répondre', '/entreprises'],
      ['Achats', '1 facture fournisseur reçue à vérifier puis approuver.', 'Vérifier', '/achats?filtre=recu'],
    ],
  );
  assert.equal(toutAFaire(donnees({ entreprise: { nom: 'Verger', identite_statut: 'refusee', demandes: [] } })).length, 1);
  assert.equal(toutAFaire(donnees({ entreprise: { nom: 'Verger', identite_statut: 'en_attente', demandes: [] } })).length, 0);
  assert.equal(toutAFaire(donnees({ entreprise: null })).length, 0);
});

test('résumé : « 15 choses à faire, dont 2 urgentes », sans compter ce qu’on attend', () => {
  const n = (niveau: 'urgent' | 'afaire' | 'attente', k: number) => Array.from({ length: k }, () => ({ niveau }));
  assert.deepEqual(resumeAFaire([...n('urgent', 2), ...n('afaire', 13), ...n('attente', 4)]), { u: 2, n: 15, texte: '15 choses à faire, dont 2 urgentes' });
  assert.deepEqual(resumeAFaire([...n('urgent', 1)]), { u: 1, n: 1, texte: '1 chose à faire, dont 1 urgente' });
  assert.deepEqual(resumeAFaire(n('afaire', 1)), { u: 0, n: 1, texte: '1 chose à faire' });
  assert.deepEqual(resumeAFaire(n('attente', 3)), { u: 0, n: 0, texte: 'rien à faire pour l’instant' });
});

test('devis envoyé : 15 jours on attend, 16 jours on relance ; date souhaitée : 30 jours oui, 31 non', () => {
  const d = (envoye_le: string) => toutAFaire(donnees({ clients: [client('c', 'Client')], docs: { c: [doc({ statut: 'envoye', envoye_le })] } }))[0].niveau;
  assert.equal(d('2026-09-19'), 'attente');
  assert.equal(d('2026-09-18'), 'afaire');
  const s = (souhaitee_le: string) => toutAFaire(donnees({ clients: [client('c', 'Client')], inter: { c: [inter({ souhaitee_le })] } })).length;
  assert.equal(s('2026-11-03'), 1);
  assert.equal(s('2026-11-04'), 0);
});

test('« On attend aussi » : paiements pas encore en retard, devis récents, fiches renvoyées', () => {
  const base = { clients: [client('c', 'Client'), client('d', 'Autre')] };
  const a = phraseAttente(
    donnees({
      ...base,
      docs: {
        c: [
          doc({ id: 'f', genre: 'facture', type_facture: 'totale', numero: 'FA-1', statut: 'a_encaisser', echeance: '2026-10-30', net_a_payer: 4518.2 }),
          doc({ id: 'r', genre: 'facture', type_facture: 'totale', numero: 'FA-2', statut: 'a_encaisser', echeance: '2026-09-30', net_a_payer: 100 }),
          doc({ id: 'v', statut: 'envoye', envoye_le: '2026-10-01' }),
          doc({ id: 'w', statut: 'envoye', envoye_le: '2026-09-01' }),
        ],
      },
    }),
  )!;
  assert.equal(plat(a.texte), 'le paiement de 1 facture (4 518 € TTC, pas encore en retard) et la réponse à 1 devis envoyé il y a moins de 15 jours.');
  assert.deepEqual([a.factures, a.devis, a.renvoyees], [1, 1, 0]);
  assert.deepEqual(a.liens, [{ libelle: 'Voir les factures à encaisser', lien: '/factures?filtre=a_encaisser' }]);

  const b = phraseAttente(
    donnees({
      ...base,
      inter: { c: [inter({ statut: 'a_reprendre' })], d: [inter({ id: 'i2', statut: 'a_reprendre' })] },
      docs: {
        c: [doc({ genre: 'facture', type_facture: 'totale', statut: 'a_encaisser', net_a_payer: 200 })],
        d: [doc({ id: 'x', genre: 'facture', type_facture: 'totale', statut: 'a_encaisser', echeance: '2026-10-05', net_a_payer: 300.4 }), doc({ id: 'y', statut: 'envoye', envoye_le: '2026-10-02' }), doc({ id: 'z', statut: 'envoye', envoye_le: '2026-10-03' })],
      },
    }),
  )!;
  assert.equal(
    plat(b.texte),
    'le paiement de 2 factures (500 € TTC, pas encore en retard), la réponse à 2 devis envoyés il y a moins de 15 jours et 2 fiches renvoyées à un technicien pour être complétées.',
  );
  assert.deepEqual(
    b.liens.map((x) => x.libelle),
    ['Voir les factures à encaisser', 'Voir les fiches renvoyées'],
  );
  assert.equal(b.liens[1].lien, '/interventions?statut=a_reprendre');
  assert.equal(phraseAttente(donnees(base)), null);
});

test('devis et factures sans client : lignes « Sans client » après les clients', () => {
  const L = toutAFaire(
    donnees({
      clients: [client('c', 'Client')],
      achats: [achat({})],
      inter: { c: [inter({})] },
      docs: { [SANS_CLIENT]: [doc({ id: 'ao', objet: 'Résidence Les Tilleuls', conditions: { ao: true, aoLimite: '2026-09-29' } }), doc({ id: 'b', objet: 'Robinets' })] },
    }),
  );
  assert.deepEqual(
    L.map((x) => [x.niveau, x.client?.nom ?? x.module, plat(x.texte)]),
    [
      ['urgent', 'Sans client', 'Appel d’offres « Résidence Les Tilleuls » : la date limite du 29/09/2026 est passée.'],
      ['urgent', 'Achats', 'La facture n° TN-2026-3381 de Thermo Négoce IDF (2 612,40 € TTC) devait être payée le 24/09/2026.'],
      ['afaire', 'Client', '« Fuite sous évier » n’a pas encore de date ni de technicien.'],
      ['afaire', 'Sans client', 'Le devis « Robinets » est commencé mais pas encore envoyé.'],
    ],
  );
});
