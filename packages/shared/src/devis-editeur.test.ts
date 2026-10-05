import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionsDocument,
  annuleeParAvoirs,
  appliquerForfaits,
  attacherForfaits,
  chercherProduits,
  clientDocumentDe,
  dateBac,
  delaiDocument,
  echeanceDocument,
  echeanceValidation,
  etatDocumentTexte,
  finValidite,
  forfaitsDesLignes,
  ligneProduit,
  lignesAvoir,
  lignesFactureDevis,
  lignesDeDepart,
  morceauxSurlignes,
  nombreBac,
  parcoursDocument,
  partDejaFacturee,
  prixForfait,
  produitsCatalogue,
  statutDocument,
  texteDelai,
  type DocumentEtat,
} from './devis-editeur.ts';
import { calculer, clientVide, conditionsParDefaut, type DocumentACalculer } from './devis.ts';
import { REGLAGES_DEPANNAGE_DEFAUT, REGLAGES_PRIX_DEFAUT } from './rentabilite.ts';

const rd = REGLAGES_DEPANNAGE_DEFAUT;
const rp = REGLAGES_PRIX_DEFAUT;
const AUJ = '2026-10-04';

const doc = (o: Partial<DocumentEtat>): DocumentEtat => ({ genre: 'devis', type_facture: null, statut: 'brouillon', date_document: AUJ, ...o });

test('formats du bac', () => {
  assert.equal(nombreBac(1.45), '1,45');
  assert.equal(nombreBac(30), '30');
  assert.equal(dateBac('2026-10-04T08:00:00Z'), '04/10/2026');
  assert.equal(dateBac(null), '—');
});

test('délai de paiement : jours, texte, échéance', () => {
  assert.equal(delaiDocument({ delai: 'À réception de facture' }), 0);
  assert.equal(delaiDocument({ delai: '45 jours fin de mois' }), 45);
  assert.equal(delaiDocument({ delai: '', delaiJours: 15 }), 15);
  assert.equal(delaiDocument({ delaiJours: 'perso' }), 'perso');
  assert.equal(texteDelai(30), '30 jours date de facture');
  assert.equal(texteDelai(0), 'À réception de facture');
  assert.equal(texteDelai('perso', '2026-11-12'), 'Au plus tard le 12/11/2026');
  assert.equal(echeanceDocument('2026-10-01', { delaiJours: 30 }), '2026-10-31');
  assert.equal(echeanceDocument('2026-10-01', { delaiJours: 'perso' }, '2026-12-01'), '2026-12-01');
  // À la validation : la date choisie si elle n'est pas passée, sinon aujourd'hui + délai.
  assert.equal(echeanceValidation({ delaiJours: 'perso' }, '2026-12-01', AUJ), '2026-12-01');
  assert.equal(echeanceValidation({ delaiJours: 'perso' }, '2026-09-01', AUJ), '2026-11-03');
  assert.equal(echeanceValidation({ delaiJours: 15 }, null, AUJ), '2026-10-19');
});

test('fin de validité', () => {
  assert.equal(finValidite('2026-10-03', '3 mois'), '2027-01-03');
  assert.equal(finValidite('2026-01-31', '1 mois'), '2026-02-28');
  assert.equal(finValidite('2026-10-03', '30 jours'), '2026-11-02');
});

test('statut et texte d’état', () => {
  assert.deepEqual(statutDocument({ genre: 'facture', statut: 'annule' }), { libelle: 'Annulée par un avoir', ton: 'gris' });
  assert.deepEqual(statutDocument({ genre: 'facture', statut: 'a_encaisser' }), { libelle: 'À encaisser', ton: 'violet' });
  assert.equal(etatDocumentTexte(doc({}), 0, AUJ), 'Brouillon enregistré automatiquement');
  assert.equal(
    etatDocumentTexte(doc({ conditions: { ao: true, aoLimite: '2026-10-20' } }), 0, AUJ),
    'Réponse à rendre avant le 20/10/2026',
  );
  assert.equal(etatDocumentTexte(doc({ statut: 'envoye', envoye_le: '2026-10-02T09:00:00Z' }), 0, AUJ), 'Envoyé le 02/10/2026');
  assert.equal(
    etatDocumentTexte(doc({ statut: 'envoye', conditions: { ao: true }, finalise_le: '2026-10-01T09:00:00Z' }), 0, AUJ),
    'Réponse envoyée le 01/10/2026 · résultat attendu',
  );
  assert.equal(etatDocumentTexte(doc({ statut: 'signe', signe_le: '2026-09-23T10:00:00Z' }), 30, AUJ), 'Signé le 23/09/2026 · facturé 30 %');
  assert.equal(etatDocumentTexte(doc({ statut: 'refuse', conditions: { ao: true } }), 0, AUJ), 'Appel d’offres perdu');
  const f = (o: Partial<DocumentEtat>) => doc({ genre: 'facture', type_facture: 'totale', ...o });
  assert.equal(etatDocumentTexte(f({ statut: 'a_encaisser', echeance: '2026-11-03' }), 0, AUJ), 'À encaisser avant le 03/11/2026');
  assert.equal(etatDocumentTexte(f({ statut: 'a_encaisser', echeance: '2026-09-03' }), 0, AUJ), 'En retard depuis le 03/09/2026');
  assert.equal(etatDocumentTexte(f({ statut: 'payee', paye_le: '2026-10-01T10:00:00Z' }), 0, AUJ), 'Payée le 01/10/2026');
  assert.equal(etatDocumentTexte(f({ statut: 'payee', type_facture: 'avoir' }), 0, AUJ), 'Avoir émis');
  assert.equal(etatDocumentTexte(f({ statut: 'annule' }), 0, AUJ), 'Annulée par un avoir');
});

test('actions de la barre du bas', () => {
  const o = { deja: 0, parcours: 'chantier' as const, interventionLiee: false, contratLie: false };
  const cles = (a: ReturnType<typeof actionsDocument>) => [a.principal?.cle ?? null, a.menu.map((m) => m.cle).join(',')];
  assert.deepEqual(cles(actionsDocument(doc({}), o)), ['valider', 'pdf,dupliquer,supprimer']);
  assert.equal(actionsDocument(doc({ genre: 'facture', type_facture: 'avoir' }), o).principal?.libelle, 'Valider l’avoir');
  assert.equal(actionsDocument(doc({ genre: 'facture', type_facture: 'acompte' }), o).principal?.libelle, 'Valider la facture');
  assert.deepEqual(cles(actionsDocument(doc({ statut: 'envoye' }), o)), ['signe', 'refuse,intervention,envoyer,relancer,pdf,dupliquer']);
  assert.equal(actionsDocument(doc({ statut: 'envoye', conditions: { ao: true } }), o).principal?.libelle, 'Marquer gagné');
  assert.deepEqual(cles(actionsDocument(doc({ statut: 'signe' }), { ...o, deja: 30, interventionLiee: true })), ['facturer', 'envoyer,pdf,dupliquer']);
  assert.equal(actionsDocument(doc({ statut: 'signe' }), { ...o, deja: 100 }).principal, null);
  assert.deepEqual(cles(actionsDocument(doc({ statut: 'signe' }), { ...o, parcours: 'contrat', contratLie: true })), ['facturer', 'appliquer,envoyer,pdf,dupliquer']);
  const fac = doc({ genre: 'facture', type_facture: 'totale', statut: 'a_encaisser' });
  assert.deepEqual(cles(actionsDocument(fac, o)), ['payee', 'avoir,envoyer,relancer,pdf,dupliquer']);
  assert.deepEqual(cles(actionsDocument({ ...fac, statut: 'payee' }, o)), [null, 'avoir,envoyer,encaissement,pdf,dupliquer']);
  assert.deepEqual(cles(actionsDocument({ ...fac, statut: 'annule' }, o)), [null, 'pdf,dupliquer']);
});

test('type de document', () => {
  assert.equal(parcoursDocument({ conditions: { parcours: 'contrat' } }), 'contrat');
  assert.equal(parcoursDocument({ conditions: {}, lignes: [{ titre: true, designation: 'Lot 1', quantite: 0, unite: 'u', prix_unitaire: 0, tva: 10 }] }), 'chantier');
  assert.equal(parcoursDocument({ conditions: {} }), 'depannage');
});

test('forfaits de dépannage et majorations', () => {
  assert.equal(prixForfait('depl', 'soir', rd), 45);
  assert.equal(prixForfait('heure', 'normale', rd), 65);
  assert.equal(prixForfait('heure', 'soir', rd), 97.5);
  assert.equal(prixForfait('heure', 'we', rd), 113.75);
  const l = lignesDeDepart('depannage', { rd, tva: 10 });
  assert.deepEqual(l.map((x) => [x.designation, x.unite, x.prix_unitaire]), [
    ['Déplacement Paris intra-muros', 'forfait', 45],
    ['Main d’œuvre dépannage', 'h', 65],
  ]);
  assert.equal(appliquerForfaits(l, 'we', rd)[1].prix_unitaire, 113.75);
  assert.deepEqual(lignesDeDepart('chantier', { rd, tva: 10 }).map((x) => x.designation), ['Lot 1 · Travaux']);
  assert.deepEqual(lignesDeDepart('chantier', { rd, tva: 10, ao: true }), []);
  // Aller-retour par conditions.forfaits (par position).
  const f = forfaitsDesLignes(l);
  assert.deepEqual(f, { '0': 'depl', '1': 'heure' });
  const lues = attacherForfaits(l.map((x) => ({ ...x, forfait: undefined })), { forfaits: f });
  assert.deepEqual(lues.map((x) => x.forfait), ['depl', 'heure']);
  assert.equal(forfaitsDesLignes([{ designation: 'x', quantite: 1, unite: 'u', prix_unitaire: 1, tva: 10 }]), undefined);
});

test('recherche rapide', () => {
  const produits = produitsCatalogue([
    { id: 'a', designation: 'Faïence murale, pose collée', categorie: 'Ouvrages', unite: 'm²', prix_achat: 32, prix_vente: 0, heures: 1.1, tva: 10, utilisations: 7 },
    { id: 'b', designation: 'Mitigeur évier cuisine', categorie: 'Fournitures', unite: 'u', prix_achat: 65, prix_vente: 129, heures: 0, tva: 10, utilisations: 2 },
    { id: 'c', designation: 'Entretien annuel chaudière gaz', categorie: 'Forfaits', unite: 'forfait', prix_achat: 0, prix_vente: 145, heures: 0, tva: 10, utilisations: 0 },
    { id: 'd', designation: 'Main-d’œuvre plombier', categorie: 'Main-d’œuvre', unite: 'h', prix_achat: 0, prix_vente: 58, heures: 0, tva: 10, utilisations: 0 },
  ]);
  assert.deepEqual(chercherProduits(produits, '').map((p) => p.id), ['a', 'b', 'forfait-depl', 'forfait-heure', 'c', 'd']);
  assert.deepEqual(chercherProduits(produits, 'faience').map((p) => p.id), ['a']);
  assert.deepEqual(chercherProduits(produits, '', 'forfait').map((p) => p.id), ['forfait-depl', 'forfait-heure', 'c']);
  assert.deepEqual(chercherProduits(produits, 'zzz'), []);
  const ctx = { coef: 1.45, rp, rd, majoration: 'normale' as const, tva: 10 };
  const faience = ligneProduit(produits[0], ctx);
  assert.equal(faience.prix_calcule, true);
  assert.equal(faience.prix_unitaire, 113.39);
  assert.equal(ligneProduit(produits[1], ctx).prix_unitaire, 94.25);
  assert.equal(ligneProduit(produits[2], ctx).prix_unitaire, 145);
  assert.equal(ligneProduit(produits[2], ctx).prix_calcule, false);
  assert.equal(ligneProduit(produits[3], ctx).heures, 1);
  assert.equal(ligneProduit(produits.find((p) => p.id === 'forfait-heure')!, { ...ctx, majoration: 'soir' }).prix_unitaire, 97.5);
  assert.deepEqual(morceauxSurlignes('Faïence murale', 'faience'), [
    { t: 'Faïence', m: true },
    { t: ' murale', m: false },
  ]);
});

test('déjà facturé, avoirs', () => {
  const factures = [
    { id: 'f1', type_facture: 'acompte' as const, statut: 'payee' as const, total_ht: 300, total_ttc: 330 },
    { id: 'f2', type_facture: 'situation' as const, statut: 'brouillon' as const, total_ht: 200, total_ttc: 220 },
    { id: 'f3', type_facture: 'totale' as const, statut: 'annule' as const, total_ht: 1000, total_ttc: 1100 },
  ];
  assert.equal(partDejaFacturee(1000, factures, []), 50);
  assert.equal(partDejaFacturee(1000, factures, [], 'f2'), 30);
  // Acompte à moitié annulé par un avoir : il ne compte plus que pour 15 %.
  assert.equal(partDejaFacturee(1000, factures, [{ facture_id: 'f1', numero: 'AV-1', total_ttc: -165 }]), 35);
  assert.equal(annuleeParAvoirs(330, 330), true);
  assert.equal(annuleeParAvoirs(330, 165), false);
});

test('lignes d’un avoir', () => {
  const lignes = [
    { designation: 'Ballon', quantite: 1, unite: 'u', prix_unitaire: 1000, tva: 10 },
    { designation: 'Mitigeur', quantite: 1, unite: 'u', prix_unitaire: 100, tva: 20 },
  ];
  const base: DocumentACalculer & { numero: string } = {
    genre: 'facture',
    type_facture: 'acompte',
    remise: 0,
    pourcentage: 30,
    avancement: 0,
    avancement_precedent: 0,
    client: { type: 'particulier' },
    conditions: conditionsParDefaut(),
    lignes,
    numero: 'FA-2026-0001',
  };
  const a = lignesAvoir(base, lignes);
  assert.deepEqual(a.lignes.map((l) => [l.designation, l.prix_unitaire, l.tva]), [
    ['Facture d’acompte FA-2026-0001 (TVA 10 %)', 300, 10],
    ['Facture d’acompte FA-2026-0001 (TVA 20 %)', 30, 20],
  ]);
  const t = lignesAvoir({ ...base, type_facture: 'totale', remise: 5 }, lignes);
  assert.equal(t.lignes.length, 2);
  assert.equal(t.remise, 5);
});

test('factures préparées depuis un devis (lignes au montant, comme le bac)', () => {
  const lignes = [
    { titre: true, designation: 'Lot 1 · Salle de bain', quantite: 0, unite: 'u', prix_unitaire: 0, tva: 10 },
    { designation: 'Receveur', quantite: 1, unite: 'u', prix_unitaire: 1000, tva: 10 },
    { designation: 'Faïence', quantite: 10, unite: 'm²', prix_unitaire: 50, tva: 10 },
  ];
  const devis = { numero: 'DE-2026-0213', objet: 'Salle de bain', remise: 10 };
  const acompte = lignesFactureDevis(devis, lignes, 'acompte', 30, 0);
  assert.deepEqual(acompte.map((l) => [l.designation, l.prix_unitaire, l.unite, l.prix_calcule]), [
    ['Acompte de 30 % sur le devis DE-2026-0213 · Salle de bain', 405, 'forfait', false],
  ]);
  const situation = lignesFactureDevis(devis, lignes, 'situation', 40, 30);
  assert.equal(situation[0].designation, 'Situation de travaux : avancement cumulé 70 % du devis DE-2026-0213, déjà facturé 30 %');
  assert.equal(situation[0].prix_unitaire, 540);
  const solde = lignesFactureDevis(devis, lignes, 'solde', 30, 70);
  assert.deepEqual(solde.slice(3).map((l) => [l.designation, l.prix_unitaire, !!l.titre]), [
    ['Remise 10 % sur le total HT', -150, false],
    ['Déjà facturé', 0, true],
    ['Acomptes et situations déjà facturés (70 % du devis DE-2026-0213)', -945, false],
  ]);
  // Le calcul garde le montant des lignes : 30 % du marché (1 350 € HT après remise) = 405 €.
  const fac = (type: 'acompte' | 'solde', l: typeof lignes): DocumentACalculer => ({
    genre: 'facture',
    type_facture: type,
    remise: 0,
    pourcentage: 30,
    avancement: 0,
    avancement_precedent: 70,
    client: { type: 'particulier' },
    conditions: { ...conditionsParDefaut(), lignesAuMontant: true },
    lignes: l,
  });
  assert.equal(calculer(fac('acompte', acompte)).ht, 405);
  assert.equal(calculer(fac('solde', solde)).ht, 405);
  // Plusieurs taux de TVA : une ligne par taux.
  const mixte = lignesFactureDevis({ ...devis, remise: 0 }, [...lignes, { designation: 'Robinet', quantite: 1, unite: 'u', prix_unitaire: 100, tva: 20 }], 'acompte', 50, 0);
  assert.deepEqual(mixte.map((l) => [l.designation.slice(-10), l.prix_unitaire, l.tva]), [
    ['(TVA 10 %)', 750, 10],
    ['(TVA 20 %)', 50, 20],
  ]);
  // L'avoir d'une facture au montant reprend ses lignes.
  const av = lignesAvoir({ ...fac('acompte', acompte), numero: 'FA-2026-0402' }, acompte);
  assert.equal(av.lignes[0].prix_unitaire, 405);
});

test('client du document', () => {
  const p = clientDocumentDe({ nom: 'Mme Sophie Martin', type: 'particulier', telephone: '01 00 00 00 00', adresse_facturation: '15 rue Exemple, 75016 Paris' });
  assert.equal(p.civ, 'Mme');
  assert.equal(p.nom, 'Sophie Martin');
  assert.equal(p.identique, true);
  const s = clientDocumentDe(
    { nom: 'Cabinet Exemple', type: 'syndic', adresse_facturation: '1 avenue Exemple, 75008 Paris', contact: 'M. Dupont' },
    { adresse: '12 rue de la Pompe', code_postal: '75016', ville: 'Paris' },
  );
  assert.equal(s.type, 'pro');
  assert.equal(s.raison, 'Syndicat des copropriétaires du 12 rue de la Pompe, représenté par Cabinet Exemple');
  assert.equal(s.identique, false);
  assert.equal(s.adresseChantier, '12 rue de la Pompe, 75016 Paris');
  assert.equal(clientVide().type, 'particulier');
});
