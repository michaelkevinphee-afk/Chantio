// « Mes premiers pas » : six missions pour prendre Chantio en main, sur l'Accueil.
// Chaque mission web est une visite guidée : une bulle montre le vrai bouton (il clignote),
// l'utilisateur clique lui-même et la bulle passe au geste suivant (components/guide/visite.tsx).
// Module sans 'use client' : lu par l'Accueil (serveur) comme par la visite (client).

export type IdMission = 'client' | 'inter' | 'fiche' | 'facture' | 'devis' | 'idee';

/**
 * Le bouton ou le champ montré : le premier élément visible qui répond à `sel`
 * (et dont le texte vaut `texte`, ou commence par lui si `debut`).
 */
export type Cible = { sel: string; texte?: string; debut?: boolean };

/**
 * Un geste : `clic` passe à la suite quand on clique la cible, `choix` quand on change
 * la liste déroulante, `fait` quand on appuie sur « C'est fait » dans la bulle.
 */
export type Geste = { cible: Cible; texte: string; action: 'clic' | 'choix' | 'fait' };

export type Mission = {
  id: IdMission;
  titre: string;
  phrase: string;
  duree: string;
  bravo: string;
  /** Gestes de la visite guidée ; absent : la mission se fait sur le téléphone (lien vers l'Aide). */
  gestes?: Geste[];
  /** Section de la page Aide qui l'explique. */
  aide: string;
  /** Page où la visite commence (on y va en la lançant) ; absent : là où l'on est. */
  depart?: string;
};

const lien = (href: string): Cible => ({ sel: `[data-menu] a[href="${href}"], [data-contenu] a[href="${href}"]` });
const bouton = (texte: string, debut = false): Cible => ({ sel: 'a, button, [role="tab"]', texte, debut });

export const MISSIONS: Mission[] = [
  {
    id: 'client',
    depart: '/',
    titre: 'Ajouter votre premier client',
    phrase: 'Un client que vous avez cette semaine.',
    duree: '2 min',
    bravo: 'Votre carnet d’adresses commence ici.',
    aide: 'clients',
    gestes: [
      { cible: lien('/clients'), texte: 'Vos clients sont rangés dans Ventes. Cliquez sur « Clients », dans le menu à gauche.', action: 'clic' },
      { cible: bouton('Nouveau client'), texte: 'Cliquez sur « Nouveau client ».', action: 'clic' },
      { cible: { sel: 'input[name="nom"]' }, texte: 'Écrivez le nom du client, puis appuyez sur « C’est fait ».', action: 'fait' },
      { cible: { sel: 'input[name="telephone"]' }, texte: 'Son numéro de téléphone. Le reste peut attendre.', action: 'fait' },
      { cible: bouton('Créer le client'), texte: 'Cliquez sur « Créer le client ».', action: 'clic' },
    ],
  },
  {
    id: 'inter',
    depart: '/',
    titre: 'Planifier un dépannage',
    phrase: 'Le prochain appel que vous recevez.',
    duree: '3 min',
    bravo: 'Il est dans le planning et déjà sur votre téléphone.',
    aide: 'appel',
    gestes: [
      { cible: bouton('Nouvelle intervention'), texte: 'Un client appelle : cliquez sur « Nouvelle intervention ». Ce bouton est toujours en haut à droite.', action: 'clic' },
      { cible: { sel: 'select[name="type"]' }, texte: 'Choisissez le type : Dépannage, Chantier ou Entretien.', action: 'choix' },
      { cible: { sel: 'select[name="client_id"]' }, texte: 'Choisissez le client qui appelle (ou « + Nouveau client » en bas de la liste).', action: 'choix' },
      { cible: { sel: 'input[name="motif"]' }, texte: 'Écrivez le motif en quelques mots, par exemple « Fuite sous évier ».', action: 'fait' },
      { cible: { sel: 'input[name="date_prevue"]' }, texte: 'Choisissez la date. Pas encore de date ? Laissez vide, elle ira dans « À placer ».', action: 'fait' },
      { cible: bouton('Créer l’intervention'), texte: 'Cliquez sur « Créer l’intervention ».', action: 'clic' },
    ],
  },
  {
    id: 'fiche',
    titre: 'Remplir une fiche sur le téléphone',
    phrase: 'Chez le client, avant de partir.',
    duree: '5 min',
    bravo: 'Fiche signée avant de quitter le chantier.',
    aide: 'terrain',
  },
  {
    id: 'facture',
    depart: '/',
    titre: 'Valider la fiche et facturer',
    phrase: 'Le soir, au bureau.',
    duree: '3 min',
    bravo: 'Chantio vous prévient si elle n’est pas payée à temps.',
    aide: 'valider',
    gestes: [
      { cible: lien('/interventions'), texte: 'Cliquez sur « Interventions » dans le menu.', action: 'clic' },
      { cible: bouton('À valider', true), texte: 'Cliquez sur l’onglet « À valider » : les fiches envoyées depuis le téléphone.', action: 'clic' },
      { cible: { sel: '[data-contenu] a[href*="fiche="]' }, texte: 'Cliquez sur l’intervention pour ouvrir sa fiche.', action: 'clic' },
      { cible: bouton('Valider la fiche'), texte: 'Relisez la fiche : constat, pièces, photos, signature. Tout est bon ? Cliquez sur « Valider la fiche ».', action: 'clic' },
      { cible: bouton('Créer la facture'), texte: 'Elle est prête à facturer : cliquez sur « Créer la facture ».', action: 'clic' },
      { cible: bouton('Valider la facture'), texte: 'Tout est rempli d’après la fiche. Relisez, puis cliquez sur « Valider la facture ».', action: 'clic' },
    ],
  },
  {
    id: 'devis',
    depart: '/',
    titre: 'Faire un devis',
    phrase: 'Pour un remplacement à chiffrer.',
    duree: '8 min',
    bravo: 'Plus besoin de Word ni d’Excel pour les devis.',
    aide: 'devis',
    gestes: [
      { cible: lien('/devis'), texte: 'Les devis sont rangés dans Ventes. Cliquez sur « Devis ».', action: 'clic' },
      { cible: bouton('Créer un devis'), texte: 'Cliquez sur « Créer un devis ».', action: 'clic' },
      { cible: { sel: 'dialog[open] select' }, texte: 'Choisissez le client, écrivez l’objet du devis, puis appuyez sur « C’est fait ».', action: 'fait' },
      { cible: bouton('Créer le brouillon'), texte: 'Cliquez sur « Créer le brouillon ».', action: 'clic' },
      { cible: { sel: 'h2, h3', texte: 'Produits et services' }, texte: 'Ajoutez vos lignes ici, depuis vos prix. Le total se calcule tout seul. Appuyez sur « C’est fait » quand c’est prêt.', action: 'fait' },
      { cible: bouton('Valider le devis'), texte: 'Cliquez sur « Valider le devis » : il reçoit son numéro.', action: 'clic' },
    ],
  },
  {
    id: 'idee',
    titre: 'Dicter une idée avec la bulle',
    phrase: 'N’importe quoi qui vous gêne ou vous manque.',
    duree: '1 min',
    bravo: 'Merci ! C’est comme ça que Chantio s’améliore.',
    aide: 'idee',
    gestes: [
      { cible: { sel: 'button[data-bulle]' }, texte: 'Cliquez sur la bulle ronde, en bas à droite.', action: 'clic' },
      { cible: { sel: 'textarea[aria-label="Votre message"]' }, texte: 'Appuyez sur « Dicter » et parlez, ou écrivez. Puis « C’est fait ».', action: 'fait' },
      { cible: { sel: 'button[aria-label="Envoyer"]' }, texte: 'Cliquez sur la flèche pour envoyer.', action: 'clic' },
    ],
  },
];

export const mission = (id: string) => MISSIONS.find((m) => m.id === id);

/** Grade affiché selon le nombre de missions faites. */
export function grade(n: number): { nom: string; reste: string } {
  if (n >= 6) return { nom: 'Maître artisan', reste: 'Toutes les missions sont faites' };
  if (n >= 3) return { nom: 'Compagnon', reste: `Encore ${6 - n} pour Maître artisan` };
  return { nom: 'Apprenti', reste: `Encore ${3 - n} pour Compagnon` };
}
