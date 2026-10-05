import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numeroIntervention, prefixeIntervention } from './format.ts';
import {
  chiffresClient,
  chosesAFaire,
  contratPourSuivi,
  resumeClient,
  type ContratAvecSuivi,
  type DocumentSuivi,
  type InterventionSuivi,
} from './suivi-client.ts';

const AJD = '2026-10-04';
/** Les phrases ont des espaces insécables (comme le bac) : on les compare en espaces simples. */
const plat = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const textes = (l: { texte: string }[]) => l.map((x) => plat(x.texte));

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
function contrat(o: Partial<ContratAvecSuivi>): ContratAvecSuivi {
  return {
    id: 'k1', client_id: 'c1', site_id: 's1', objet: 'Entretien chaufferie collective', debut: '2025-12-01', fin: '2026-11-30', tacite: false,
    preavis_mois: 3, visites_par_an: 4, derniere_visite: '2026-09-01', site: { adresse: '12 rue de la Pompe' }, interventions: [], renouvellement: null, ...o,
  };
}
const syndic = { id: 'c1', type: 'syndic' as const, facturation: 'intervention' as const, immeubles: 2 };
const particulier = { id: 'c2', type: 'particulier' as const, immeubles: 1 };

test('numéro par type, ou l’ancien numéro', () => {
  assert.equal(numeroIntervention({ reference: 'DEP-2026-0012', numero: 42 }), 'DEP-2026-0012');
  assert.equal(numeroIntervention({ reference: null, numero: 42 }), 'N° 0042');
  assert.equal(prefixeIntervention('sav'), 'DEP');
  assert.equal(prefixeIntervention('entretien'), 'ENT');
  assert.equal(prefixeIntervention('installation'), 'CH');
});

test('urgent : facture en retard (avoirs déduits) et intervention urgente, avec espaces insécables', () => {
  const l = chosesAFaire(
    particulier,
    [inter({ urgence: 'urgente' }), inter({ id: 'i2', motif: 'Robinet qui goutte' }), inter({ id: 'i3', urgence: 'astreinte', motif: 'Dégât des eaux', date_prevue: '2026-10-05' })],
    [
      doc({ genre: 'facture', type_facture: 'totale', numero: 'FA-2026-0012', statut: 'a_encaisser', echeance: '2026-09-20', net_a_payer: 2480 }),
      doc({ id: 'av', genre: 'facture', type_facture: 'avoir', numero: 'AV-2026-0001', statut: 'a_encaisser', facture_id: 'd1', net_a_payer: -480, total_ht: -400 }),
    ],
    AJD,
  );
  assert.equal(l[0].texte, 'La facture FA-2026-0012 de 2\u202f000,00\u00a0€\u00a0TTC devait être payée le 20/09/2026 : 14 jours de retard.');
  assert.deepEqual(
    { cle: l[0].cle, niveau: l[0].niveau, bouton: l[0].bouton, lien: l[0].lien },
    { cle: 'retard:d1', niveau: 'urgent', bouton: 'Voir la facture', lien: '/devis/d1' },
  );
  assert.equal(plat(l[1].texte), 'Intervention urgente « Fuite sous évier » : pas encore de date ni de technicien.');
  assert.equal(l[1].bouton, 'Choisir une date');
  assert.equal(l[1].lien, '/interventions?fiche=i1');
  assert.equal(plat(l[2].texte), 'Intervention d’astreinte « Dégât des eaux » : prévue le 05/10/2026, pas encore de technicien.');
  assert.equal(l[2].bouton, 'Choisir un technicien');
  assert.equal(plat(l[3].texte), '« Robinet qui goutte » n’a pas encore de date ni de technicien.');
  assert.equal(l[3].niveau, 'afaire');
  assert.deepEqual(resumeClient(l, true), { urgent: 3, afaire: 1, ton: 'rouge', etiquette: 'Urgent · 4 choses à faire' });
});

test('syndic : lieu de l’intervention, fiche à valider, facture à créer ou relevé du mois, immeubles manquants', () => {
  const fiche = { resultat: 'termine' as const, fin: '2026-10-04T07:50:00Z', envoyee_le: '2026-10-04T07:55:00Z', auteur: 'Karim B.' };
  const l = chosesAFaire(
    syndic,
    [
      inter({ id: 'a', statut: 'terminee', adresse: '12 rue de la Pompe', occupant: 'Mme Martin', techniciens: ['Karim B.', 'Julien P.'], fiche }),
      inter({ id: 'b', statut: 'terminee', motif: 'Colonne qui fuit', adresse: '12 rue de la Pompe', occupant: 'Parties communes', techniciens: ['Karim B.', 'Julien P.'] }),
      inter({ id: 'c', statut: 'validee', motif: 'Radiateur froid dans la chambre', adresse: '12 rue de la Pompe', date_prevue: '2026-10-01', date_fin: '2026-10-02' }),
      inter({ id: 'd', statut: 'terminee', motif: 'Vanne', adresse: '8 rue Singer', fiche: { ...fiche, envoyee_le: '2026-10-02T12:10:00Z', auteur: null }, techniciens: ['Mehdi A.'] }),
    ],
    [],
    AJD,
  );
  assert.deepEqual(textes(l), [
    'Karim B. a terminé « Fuite sous évier » chez Mme Martin (12 rue de la Pompe) aujourd’hui à 09:55. La fiche attend votre validation.',
    'Karim B., Julien P. ont terminé « Colonne qui fuit » dans les parties communes du 12 rue de la Pompe. La fiche attend votre validation.',
    'Mehdi A. a terminé « Vanne » au 8 rue Singer le 02/10/2026 à 14:10. La fiche attend votre validation.',
    '« Radiateur froid dans la chambre » au 12 rue de la Pompe, fait le 02/10/2026, est validé : il reste à le facturer.',
  ]);
  assert.equal(l[0].bouton, 'Voir et valider');
  assert.equal(l[0].lien, '/interventions?fiche=a');
  assert.deepEqual(
    { bouton: l[3].bouton, lien: l[3].lien, geste: l[3].geste },
    { bouton: 'Créer la facture', lien: '/interventions?fiche=c&facturer=1', geste: { action: 'facturer-intervention', id: 'c' } },
  );
  const mensuel = chosesAFaire({ ...syndic, facturation: 'mensuel' }, [inter({ statut: 'validee', date_prevue: '2026-10-01' })], [], AJD);
  assert.equal(plat(mensuel[0].texte), '« Fuite sous évier », fait le 01/10/2026, est validé : il reste à le mettre sur le relevé du mois.');
  assert.deepEqual({ bouton: mensuel[0].bouton, lien: mensuel[0].lien, geste: mensuel[0].geste }, { bouton: 'Voir l’intervention', lien: '/interventions?fiche=i1', geste: undefined });
  // Un particulier : pas de lieu dans la phrase.
  const p = chosesAFaire(particulier, [inter({ statut: 'terminee', adresse: '3 rue Molitor' })], [], AJD);
  assert.equal(plat(p[0].texte), 'Le technicien a terminé « Fuite sous évier ». La fiche attend votre validation.');
  const vide = chosesAFaire({ ...syndic, immeubles: 0 }, [], [], AJD);
  assert.deepEqual(
    { texte: vide[0].texte, bouton: vide[0].bouton, lien: vide[0].lien },
    { texte: 'Ajoutez ses immeubles pour pouvoir créer des interventions.', bouton: 'Ajouter un immeuble', lien: '/clients/c1?immeuble=nouveau' },
  );
});

test('intervention validée : rien à facturer si c’est déjà fait ou si une facture est préparée', () => {
  const v = inter({ statut: 'validee', devis_id: 'dv' });
  const signe = doc({ id: 'dv', statut: 'signe', total_ht: 1000 });
  const facture = (o: Partial<DocumentSuivi>) => doc({ id: 'f', genre: 'facture', type_facture: 'totale', statut: 'payee', devis_id: 'dv', total_ht: 1000, ...o });
  const aFacturer = (D: DocumentSuivi[], i = v) => chosesAFaire(particulier, [i], D, AJD).some((x) => x.cle === `facturer:${i.id}`);
  assert.equal(aFacturer([signe]), true);
  assert.equal(aFacturer([signe, facture({})]), false, 'devis signé facturé à 100 %');
  assert.equal(aFacturer([signe, facture({ type_facture: 'acompte', total_ht: 300 })]), true, 'seulement un acompte');
  assert.equal(
    aFacturer([signe, facture({}), doc({ id: 'av', genre: 'facture', type_facture: 'avoir', statut: 'a_encaisser', facture_id: 'f', total_ht: -1000, net_a_payer: -1200 })]),
    true,
    'facture annulée par un avoir',
  );
  assert.equal(aFacturer([signe, facture({ statut: 'brouillon' })]), false, 'facture préparée depuis le devis');
  const seule = inter({ statut: 'validee' });
  assert.equal(aFacturer([facture({ devis_id: null, conditions: { intervention_id: 'i1' } })], seule), false, 'facture faite depuis l’intervention');
  assert.equal(aFacturer([facture({ devis_id: null, statut: 'brouillon', conditions: { intervention_id: 'i1' } })], seule), false);
  assert.equal(aFacturer([facture({ devis_id: null, conditions: { intervention_id: 'autre' } })], seule), true);
});

test('devis : relancer après 15 jours, sinon on attend ; signé sans intervention ; brouillons', () => {
  const l = chosesAFaire(
    particulier,
    [inter({ statut: 'planifiee', date_prevue: '2026-10-10', techniciens: ['Karim B.'], devis_id: 'e' })],
    [
      doc({ id: 'a', statut: 'envoye', envoye_le: '2026-09-18T09:00:00Z' }),
      doc({ id: 'b', statut: 'envoye', objet: 'Cuisine', envoye_le: '2026-09-19T09:00:00Z', total_ht: 2450.4 }),
      doc({ id: 'c', statut: 'signe', objet: 'Douche', signe_le: '2026-09-28T09:00:00Z' }),
      doc({ id: 'e', statut: 'signe', objet: 'Chantier prévu' }),
      doc({ id: 'f', statut: 'signe', objet: 'Renouvellement du contrat CT-2026-0001 · Entretien · 2027' }),
      doc({ id: 'g', statut: 'brouillon', objet: 'Devis' }),
      doc({ id: 'h', statut: 'envoye', objet: '', finalise_le: '2026-09-01T09:00:00Z', date_document: '2026-08-20' }),
    ],
    AJD,
  );
  assert.deepEqual(textes(l), [
    'Le devis sans titre est commencé mais pas encore envoyé.',
    'Le devis « Salle de bain » (1 000 € HT) a été envoyé le 18/09/2026 : pas encore de réponse. Pensez à relancer.',
    'Le devis « Devis » (1 000 € HT) a été envoyé le 01/09/2026 : pas encore de réponse. Pensez à relancer.',
    'Le devis « Douche » (1 000 € HT) est signé, mais aucune intervention n’est encore prévue.',
    'Le devis « Cuisine » (2 450 € HT) a été envoyé le 19/09/2026 : pas encore de réponse.',
  ]);
  assert.deepEqual(
    l.map((x) => [x.niveau, x.bouton, x.lien]),
    [
      ['afaire', 'Terminer le devis', '/devis/g'],
      ['afaire', 'Voir le devis', '/devis/a'],
      ['afaire', 'Voir le devis', '/devis/h'],
      ['afaire', 'Voir le devis', '/devis/c'],
      ['attente', 'Voir le devis', '/devis/b'],
    ],
  );
  // Facturé en entier : plus rien à prévoir.
  const facture = doc({ id: 'x', genre: 'facture', type_facture: 'totale', statut: 'payee', devis_id: 'c', total_ht: 1000 });
  assert.equal(chosesAFaire(particulier, [], [doc({ id: 'c', statut: 'signe' }), facture], AJD).length, 0);
  assert.deepEqual(resumeClient([], true), { urgent: 0, afaire: 0, ton: 'vert', etiquette: 'À jour' });
  assert.equal(resumeClient([], false).etiquette, 'Rien encore');
  assert.deepEqual(resumeClient(l, true), { urgent: 0, afaire: 4, ton: 'cobalt', etiquette: '4 choses à faire' });
});

test('factures et avoirs préparés', () => {
  const l = chosesAFaire(
    syndic,
    [inter({ id: 'iv', statut: 'validee', motif: 'Ballon d’eau chaude', adresse: '12 rue de la Pompe', occupant: 'M. Garnier' })],
    [
      doc({ id: 'a', genre: 'facture', type_facture: 'totale', objet: 'Ballon', conditions: { intervention_id: 'iv' } }),
      doc({ id: 'b', genre: 'facture', type_facture: 'acompte', objet: 'Acompte · Rénovation' }),
      doc({ id: 'c', genre: 'facture', type_facture: 'totale', objet: 'Facture' }),
      doc({ id: 'd', genre: 'facture', type_facture: 'avoir', objet: 'Avoir sur la facture FA-2026-0007', facture_id: 'f7', facture_numero: 'FA-2026-0007' }),
      doc({ id: 'e', genre: 'facture', type_facture: 'situation', objet: '' }),
    ],
    AJD,
  );
  assert.deepEqual(textes(l), [
    'La facture de « Ballon d’eau chaude » chez M. Garnier (12 rue de la Pompe) est préparée mais pas encore envoyée.',
    'La facture d’acompte de « Acompte · Rénovation » est préparée mais pas encore envoyée.',
    'La facture sans titre est préparée mais pas encore envoyée.',
    'L’avoir sur la facture FA-2026-0007 est préparé mais pas encore validé.',
    'La situation de travaux sans titre est préparée mais pas encore envoyée.',
  ]);
  assert.deepEqual(
    l.map((x) => x.bouton),
    ['Terminer la facture', 'Terminer la facture', 'Terminer la facture', 'Terminer l’avoir', 'Terminer la facture'],
  );
});

test('devis demandé par le technicien, fiche renvoyée', () => {
  const fiche = { resultat: 'devis_a_etablir' as const, fin: '2026-10-01T11:00:00Z', auteur: 'Mehdi A.', reste: 'Remplacer le ballon de 200 L.' };
  const l = chosesAFaire(
    particulier,
    [
      inter({ id: 'b', statut: 'validee', motif: 'Chauffe-eau à remplacer', date_prevue: '2026-10-01', fiche }),
      inter({ id: 'c', statut: 'a_reprendre', techniciens: ['Lucas M.'], fiche: { resultat: 'attente_piece', fin: null, reste: 'Joint à commander.' } }),
      inter({ id: 'd', statut: 'a_reprendre', motif: 'Robinet', fiche: null }),
    ],
    [],
    AJD,
  );
  const demande = l.find((x) => x.cle === 'devis-demande:b')!;
  assert.equal(plat(demande.texte), 'Mehdi A. demande un devis après son passage du 01/10/2026 : Remplacer le ballon de 200 L.');
  assert.deepEqual({ bouton: demande.bouton, lien: demande.lien, geste: demande.geste }, { bouton: 'Préparer le devis', lien: '/interventions?fiche=b&chiffrer=1', geste: { action: 'devis-intervention', id: 'b' } });
  assert.deepEqual(textes(l.filter((x) => x.niveau === 'attente')), [
    'La fiche « Fuite sous évier » a été renvoyée à Lucas M. pour être complétée (En attente de pièce : Joint à commander).',
    'La fiche « Robinet » a été renvoyée à son technicien pour être complétée.',
  ]);
  // Un devis lié à l'intervention, ou fait à la main depuis le passage : la demande est traitée.
  const lie = chosesAFaire(particulier, [inter({ statut: 'validee', fiche })], [doc({ statut: 'refuse', conditions: { intervention_id: 'i1' } })], AJD);
  assert.ok(!lie.some((x) => x.bouton === 'Préparer le devis'));
  const main = chosesAFaire(particulier, [inter({ statut: 'validee', date_prevue: '2026-10-01', fiche })], [doc({ date_document: '2026-10-02' })], AJD);
  assert.ok(!main.some((x) => x.bouton === 'Préparer le devis'));
  const ancien = chosesAFaire(particulier, [inter({ statut: 'validee', date_prevue: '2026-10-01', fiche })], [doc({ date_document: '2026-09-02' })], AJD);
  assert.ok(ancien.some((x) => x.bouton === 'Préparer le devis'));
});

test('à planifier : date souhaitée dans 30 jours au plus, triée par date souhaitée', () => {
  const l = chosesAFaire(
    particulier,
    [
      inter({ id: 'a', motif: 'Visite 2/4', souhaitee_le: '2026-11-03' }),
      inter({ id: 'b', motif: 'Visite 3/4', souhaitee_le: '2026-11-04' }),
      inter({ id: 'c', motif: 'Visite 1/4', souhaitee_le: '2026-10-20' }),
      inter({ id: 'd', motif: 'Fuite', techniciens: ['Karim B.'] }),
      inter({ id: 'e', motif: 'Ballon', date_prevue: '2026-10-08', souhaitee_le: '2026-10-07' }),
    ],
    [],
    AJD,
  );
  assert.deepEqual(textes(l), [
    '« Fuite » n’a pas encore de date.',
    '« Ballon » n’a pas encore de technicien (date prévue : 08/10/2026).',
    '« Visite 1/4 » n’a pas encore de date ni de technicien. Date souhaitée : vers le 20/10/2026.',
    '« Visite 2/4 » n’a pas encore de date ni de technicien. Date souhaitée : vers le 03/11/2026.',
  ]);
  assert.deepEqual(
    l.map((x) => x.bouton),
    ['Choisir une date', 'Choisir un technicien', 'Choisir une date', 'Choisir une date'],
  );
});

test('contrats d’entretien : préavis dépassé, à renouveler, renouvellement signé, visites', () => {
  const depasse = contratPourSuivi(contrat({}), AJD);
  assert.deepEqual(
    { etat: depasse.etat, fin: depasse.fin, limite: depasse.limite, visites: depasse.visites },
    { etat: 'Préavis dépassé', fin: '2026-11-30', limite: '2026-08-31', visites: [] },
  );
  const l = chosesAFaire(syndic, [], [], AJD, [depasse]);
  assert.equal(plat(l[0].texte), 'Le contrat d’entretien « Entretien chaufferie collective » du 12 rue de la Pompe s’arrête le 30/11/2026, et la date pour le renouveler (31/08/2026) est passée.');
  assert.deepEqual(
    { niveau: l[0].niveau, bouton: l[0].bouton, lien: l[0].lien, geste: l[0].geste },
    { niveau: 'urgent', bouton: 'Proposer le renouvellement', lien: '/clients/immeubles?site=s1&contrat=k1', geste: { action: 'renouveler', id: 'k1' } },
  );
  assert.deepEqual(resumeClient(l, true).etiquette, 'Urgent · 1 chose à faire');

  const lambert = contratPourSuivi(contrat({ id: 'k2', site_id: null, site: null, objet: 'Entretien chaudière murale gaz', debut: '2026-03-01', fin: '2027-02-28', visites_par_an: 1, derniere_visite: '2026-03-10' }), AJD);
  const p = chosesAFaire(particulier, [], [], AJD, [lambert]);
  assert.equal(plat(p[0].texte), 'Le contrat d’entretien « Entretien chaudière murale gaz » est à renouveler : envoyez la proposition avant le 30/11/2026 (dans 57 jours).');
  assert.deepEqual({ bouton: p[0].bouton, lien: p[0].lien }, { bouton: 'Préparer le renouvellement', lien: '/clients/immeubles?client=c2&contrat=k2' });
  const jourMeme = chosesAFaire(particulier, [], [], '2026-11-30', [contratPourSuivi(contrat({ fin: '2027-02-28', visites_par_an: 1, derniere_visite: '2026-03-10' }), '2026-11-30')]);
  assert.match(plat(jourMeme[0].texte), /avant le 30\/11\/2026 \(aujourd’hui\)\.$/);

  const signe = contratPourSuivi(contrat({ renouvellement: { id: 'dv', numero: 'DE-2026-0040', statut: 'signe' } }), AJD);
  const s = chosesAFaire(syndic, [], [doc({ id: 'dv', statut: 'signe', objet: 'Contrat 2027' })], AJD, [signe]);
  assert.deepEqual(textes(s), ['Le renouvellement du contrat « Entretien chaufferie collective » du 12 rue de la Pompe est signé : il reste à l’enregistrer sur le contrat.']);
  assert.deepEqual({ bouton: s[0].bouton, lien: s[0].lien }, { bouton: 'Voir le devis', lien: '/devis/dv' });

  // Visites : prévue dans 16 jours, déjà passée, ou dans plus de 30 jours (rien).
  const visite = (derniere: string) =>
    chosesAFaire(syndic, [], [], AJD, [contratPourSuivi(contrat({ debut: '2025-01-01', fin: '2027-12-31', tacite: true, visites_par_an: 1, derniere_visite: derniere }), AJD)]);
  const v = visite('2025-10-20');
  assert.equal(plat(v[0].texte), 'Une visite d’entretien du contrat « Entretien chaufferie collective » (12 rue de la Pompe) est prévue vers le 20/10/2026 et n’est pas encore au planning.');
  assert.deepEqual({ bouton: v[0].bouton, geste: v[0].geste }, { bouton: 'Planifier les visites', geste: { action: 'planifier-visites', id: 'k1' } });
  assert.match(plat(visite('2025-09-20')[0].texte), /était prévue vers le 20\/09\/2026/);
  assert.equal(visite('2025-11-04').length, 0, 'visite dans 31 jours : rien encore');
  assert.equal(visite('2025-11-03')[0].cle, 'visites:k1', 'visite dans 30 jours');
});

test('appels d’offres : urgent à 3 jours ou moins, l’ordre du bac est gardé', () => {
  const ao = (id: string, aoLimite: string | undefined, objet: string) => doc({ id, objet, conditions: { ao: true, ...(aoLimite ? { aoLimite } : {}) } });
  const l = chosesAFaire(
    particulier,
    [inter({ id: 'p', motif: 'Fuite' })],
    [ao('a', '2026-10-17', 'Résidence Auteuil'), ao('b', '2026-10-07', 'Mairie'), ao('c', undefined, 'Gymnase'), ao('d', '2026-10-01', 'École'), ao('e', '2026-10-08', 'Crèche')],
    AJD,
  );
  assert.deepEqual(
    l.map((x) => [x.niveau, plat(x.texte)]),
    [
      ['afaire', '« Fuite » n’a pas encore de date ni de technicien.'],
      ['urgent', 'Appel d’offres « École » : la date limite du 01/10/2026 est passée.'],
      ['urgent', 'Appel d’offres « Mairie » : réponse à rendre avant le 07/10/2026 (dans 3 jours).'],
      ['afaire', 'Appel d’offres « Crèche » : réponse à rendre avant le 08/10/2026 (dans 4 jours).'],
      ['afaire', 'Appel d’offres « Résidence Auteuil » : réponse à rendre avant le 17/10/2026 (dans 13 jours).'],
      ['afaire', 'Appel d’offres « Gymnase » : réponse à préparer.'],
    ],
  );
  assert.ok(l.slice(1).every((x) => x.bouton === 'Préparer la réponse' && x.lien.startsWith('/devis/')));
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
