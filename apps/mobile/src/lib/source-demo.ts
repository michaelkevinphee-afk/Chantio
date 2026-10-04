// Mode démo : données d'exemple en mémoire, rien n'est enregistré.
import { ajouterJours, aujourdhui, type Intervention, type Membre } from '@chantio/shared';

import type { InterventionVue, Profil, SourceDonnees } from './donnees';

const ENTREPRISE = { id: '00000000-0000-4000-8000-000000000001', nom: 'Verger' };
const MOI = { id: 'demo-moi', prenom: 'Christophe' };
const JULIEN = { id: 'demo-julien', prenom: 'Julien' };

const membreDemo: Membre = {
  id: MOI.id,
  entreprise_id: ENTREPRISE.id,
  user_id: null,
  email: 'demo@chantio.fr',
  prenom: MOI.prenom,
  nom: 'Rambla',
  telephone: null,
  role: 'dirigeant',
  actif: true,
  photo_chemin: null,
  cree_le: new Date().toISOString(),
};

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

function exemples(): InterventionVue[] {
  const t = aujourdhui();
  let n = 41;
  const base = (p: Partial<InterventionVue>): InterventionVue => ({
    id: `demo-${n}`,
    entreprise_id: ENTREPRISE.id,
    numero: n++,
    client_id: 'demo-client',
    site_id: 'demo-site',
    equipement_id: null,
    type: 'depannage',
    urgence: 'normale',
    motif: 'Intervention',
    description: null,
    date_prevue: t,
    heure_prevue: null,
    statut: 'planifiee',
    cree_par: null,
    cree_le: new Date().toISOString(),
    modifie_le: new Date().toISOString(),
    validee_par: null,
    validee_le: null,
    facturee_le: null,
    client: null,
    site: null,
    intervenants: [MOI],
    ...p,
  });
  return [
    base({
      type: 'entretien',
      motif: 'Entretien chaudière gaz',
      description: 'Entretien annuel. Chaudière Saunier Duval ThemaPlus, posée en 2016.',
      heure_prevue: '08:30:00',
      client: { nom: 'Mme Laurent', telephone: '01 23 45 67 89', contact: null },
      site: { adresse: '12 rue des Tilleuls', code_postal: '75016', ville: 'Paris', acces: 'Code 4512B · 3e étage gauche', consignes: 'Cliente âgée, sonner deux fois.', latitude: 48.853, longitude: 2.269 },
    }),
    base({
      motif: 'Fuite sous évier',
      description: 'Le client signale une fuite au niveau du siphon.',
      urgence: 'urgente',
      heure_prevue: '10:15:00',
      client: { nom: 'M. Benali', telephone: '06 12 34 56 78', contact: null },
      site: { adresse: '4 avenue Victor Hugo', code_postal: '92100', ville: 'Boulogne-Billancourt', acces: null, consignes: null, latitude: 48.8405, longitude: 2.241 },
    }),
    base({
      motif: 'Robinet qui goutte',
      heure_prevue: '14:00:00',
      statut: 'terminee',
      client: { nom: 'SCI Les Érables', telephone: null, contact: 'Gardien : M. Petit' },
      site: { adresse: '8 rue de Chézy', code_postal: '92200', ville: 'Neuilly-sur-Seine', acces: 'Loge du gardien', consignes: null, latitude: 48.886, longitude: 2.269 },
      intervenants: [JULIEN],
    }),
    base({
      type: 'entretien',
      motif: 'Désembouage radiateurs',
      heure_prevue: '16:00:00',
      client: { nom: 'M. Fontaine', telephone: '06 45 67 89 01', contact: null },
      site: { adresse: '30 rue de la Pompe', code_postal: '75116', ville: 'Paris', acces: '2e étage', consignes: null, latitude: 48.8605, longitude: 2.278 },
    }),
    base({
      type: 'sav',
      motif: 'Chauffe-eau en panne',
      heure_prevue: '16:30:00',
      client: { nom: 'Mme Garnier', telephone: '06 98 76 54 32', contact: null },
      site: { adresse: '17 rue Lepic', code_postal: '75018', ville: 'Paris', acces: null, consignes: 'Chien dans le jardin.', latitude: 48.8848, longitude: 2.3335 },
      intervenants: [JULIEN],
    }),
    base({
      motif: 'Panne chaudière',
      urgence: 'urgente',
      date_prevue: ajouterJours(t, 1),
      heure_prevue: '09:00:00',
      client: { nom: 'Mme Roux', telephone: '06 11 22 33 44', contact: null },
      site: { adresse: '3 rue de Naples', code_postal: '75008', ville: 'Paris', acces: null, consignes: null, latitude: 48.879, longitude: 2.319 },
    }),
    base({
      type: 'installation',
      motif: 'Pose robinet thermostatique',
      date_prevue: ajouterJours(t, 1),
      heure_prevue: '14:00:00',
      client: { nom: 'M. Perrin', telephone: null, contact: null },
      site: { adresse: '21 rue Poncelet', code_postal: '75017', ville: 'Paris', acces: null, consignes: null, latitude: 48.879, longitude: 2.296 },
      intervenants: [JULIEN],
    }),
    base({
      motif: 'Recherche de fuite',
      date_prevue: ajouterJours(t, 3),
      heure_prevue: '08:00:00',
      client: { nom: 'Syndic Foch', telephone: '01 40 00 00 00', contact: 'Mme Lefèvre' },
      site: { adresse: '40 avenue Foch', code_postal: '75116', ville: 'Paris', acces: 'Badge à récupérer chez le gardien', consignes: 'Prévenir les occupants du 2e.', latitude: 48.872, longitude: 2.283 },
    }),
  ];
}

let donnees: InterventionVue[] = exemples();
// Photo de profil choisie en démo : gardée sur le téléphone, rien n'est envoyé.
let photoDemo: string | null = null;
let partageDemo = false;

function changerStatut(id: string, statut: Intervention['statut']) {
  donnees = donnees.map((i) => (i.id === id ? { ...i, statut } : i));
}

export const sourceDemo: SourceDonnees = {
  mode: 'demo',
  async chargerProfil(): Promise<Profil> {
    donnees = exemples();
    return { membre: { ...membreDemo, photo_chemin: photoDemo, partage_position: partageDemo }, entreprise: ENTREPRISE };
  },
  async creerEntreprise() {},
  async listerEntreprises() {
    return [{ id: ENTREPRISE.id, nom: ENTREPRISE.nom, role: membreDemo.role, active: true }];
  },
  async choisirEntreprise() {},
  async listerInterventions() {
    await attendre(300);
    return donnees;
  },
  async demarrer(id) {
    changerStatut(id, 'en_cours');
  },
  async envoyerPhoto() {
    await attendre(150);
  },
  async envoyerFiche(fiche) {
    await attendre(400);
    changerStatut(fiche.intervention_id, fiche.resultat === 'termine' ? 'terminee' : 'a_reprendre');
  },
  async changerPhotoProfil(_membre, uriLocale) {
    await attendre(250);
    photoDemo = uriLocale;
    return uriLocale;
  },
  async retirerPhotoProfil() {
    photoDemo = null;
  },
  async urlPhotoProfil(chemin) {
    // En démo, le « chemin » est directement le fichier local.
    return chemin;
  },
  // En démo, la position ne quitte jamais le téléphone.
  async reglerPartagePosition(actif) {
    partageDemo = actif;
  },
  async partagerPosition() {
    return partageDemo;
  },
  async pointer() {},
};
