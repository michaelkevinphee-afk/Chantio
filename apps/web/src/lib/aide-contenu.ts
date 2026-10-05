import type { IdMission } from './premiers-pas';

// Le guide de Chantio, tâche par tâche : affiché par la page Aide et donné à l'assistant de la bulle
// (« Une question ») comme seule source. Les noms entre « » sont ceux des vrais boutons.
// Les captures (public/aide/) montrent une entreprise d'exemple.

export type SectionAide = {
  id: string;
  titre: string;
  quand: string;
  ou: string;
  etapes: string[];
  astuce?: string;
  image?: { src: string; alt: string; telephone?: boolean };
  /** Visite guidée qui montre la tâche sur les vrais boutons. */
  mission?: IdMission;
};

export const SECTIONS_AIDE: SectionAide[] = [
  {
    id: 'demarrer',
    titre: 'Se connecter',
    quand: 'Une fois sur l’ordinateur, une fois sur le téléphone. Ensuite, Chantio se souvient de vous.',
    ou: 'Page de connexion',
    etapes: [
      'La première fois, cliquez sur « Première connexion ou mot de passe oublié », tapez votre e-mail puis « Recevoir mon code ».',
      'Recopiez le code reçu par e-mail, choisissez votre mot de passe, puis « Valider et se connecter ».',
      'Les fois suivantes : e-mail, mot de passe, « Se connecter ».',
      'Sur le téléphone, ouvrez l’appli Chantio avec le même e-mail et le même mot de passe.',
    ],
    astuce: 'Mot de passe oublié ? Même lien qu’à la première fois : un nouveau code arrive par e-mail.',
  },
  {
    id: 'accueil',
    titre: 'Le matin : regarder l’Accueil',
    quand: 'Chaque matin. C’est la seule page à regarder pour savoir quoi faire.',
    ou: 'Menu › Accueil',
    etapes: [
      '« L’équipe aujourd’hui » : la carte des interventions du jour, et à droite la journée de chacun. « Sa journée → » montre ce que voit le technicien sur son téléphone.',
      '« En un coup d’œil » : chaque case compte ce qui attend une action. Cliquez une case pour voir ses lignes.',
      'Commencez par la case rouge « Paiements clients en retard ».',
      'Puis : « Interventions à placer », « Fiches à valider », « À facturer », « Devis », « Factures fournisseurs », « Le reste ».',
    ],
    astuce: 'Le chiffre rouge à côté d’Accueil dans le menu, c’est le nombre de choses à faire.',
    image: { src: '/aide/web-accueil.webp', alt: 'Accueil : l’équipe du jour et les cases En un coup d’œil' },
  },
  {
    id: 'appel',
    titre: 'Un client appelle : créer et planifier une intervention',
    quand: 'Une fuite, une chaudière en panne, un entretien à caler.',
    ou: 'Bouton « Nouvelle intervention », en haut à droite de l’Accueil, du Planning et des Interventions',
    etapes: [
      'Cliquez sur « Nouvelle intervention ».',
      'Choisissez le « Type » : Dépannage, Chantier ou Entretien. Le numéro est donné tout seul.',
      'Choisissez le client dans « Donneur d’ordre » (ou « + Nouveau client »), l’adresse et la personne à appeler sur place.',
      'Écrivez le « Motif » en quelques mots. Mettez l’« Urgence » si besoin.',
      'Donnez la « Date », le matin ou l’après-midi, et cochez le technicien. Pas de date ? Laissez vide : elle va dans « À placer ».',
      'Cliquez sur « Créer l’intervention ». Elle arrive dans le planning et sur le téléphone.',
    ],
    astuce: 'Dans le Planning, glissez une intervention sur une autre demi-journée pour la déplacer, ou depuis « À placer au planning » pour la placer.',
    image: { src: '/aide/web-planning.webp', alt: 'Planning de la semaine par personne et par demi-journée' },
    mission: 'inter',
  },
  {
    id: 'terrain',
    titre: 'Sur place : remplir la fiche sur le téléphone',
    quand: 'Chez le client, avant de partir. La fiche est signée avant de quitter le chantier.',
    ou: 'Appli téléphone › Ma journée',
    etapes: [
      'Ouvrez l’appli : « Ma journée » montre l’intervention en cours en grand, puis la suite.',
      'Chez le client, appuyez sur « Démarrer ». La fiche a 4 étapes, avec « Suivant » en bas.',
      'Constat : ce que vous avez trouvé, et les photos « avant ».',
      'Mesures : seulement si utile. Sinon « Passer ».',
      'Pièces : les pièces posées. Les pièces courantes sont proposées.',
      'Résultat : « Oui, terminé », à reprendre, en attente de pièce ou devis à établir ; travaux réalisés, temps passé, photos « après ».',
      'Faites signer le client avec le doigt (ou « Client absent ou refus de signer »), puis « Envoyer la fiche ».',
    ],
    astuce: 'Le bouton « Dicter » ouvre le micro du clavier. Sans réseau, la fiche est gardée et part dès que le réseau revient.',
    image: { src: '/aide/app-journee.webp', alt: 'Ma journée sur le téléphone, avec le bouton Démarrer', telephone: true },
  },
  {
    id: 'valider',
    titre: 'Au bureau : relire et valider la fiche',
    quand: 'Le soir ou le lendemain matin. Une fiche validée est prête à facturer.',
    ou: 'Accueil › case « Fiches à valider », ou Interventions › onglet « À valider »',
    etapes: [
      'Cliquez l’intervention « À valider » : la fiche s’ouvre à droite (constat, pièces, photos, signature).',
      'Tout est bon : « Valider la fiche ».',
      'Il manque quelque chose : « Renvoyer au technicien », écrivez ce qu’il faut reprendre, puis « Renvoyer ».',
      'Une fois validée, le bandeau vert propose « Créer la facture ».',
    ],
    astuce: 'Si la fiche dit « Devis à établir », le volet propose « Créer le devis ».',
    image: { src: '/aide/web-dfiche.webp', alt: 'Fiche à valider avec les boutons Valider la fiche et Renvoyer au technicien' },
    mission: 'facture',
  },
  {
    id: 'devis',
    titre: 'Faire un devis et le faire signer',
    quand: 'Pour un chantier ou un remplacement : chiffrer, envoyer, relancer.',
    ou: 'Menu › Ventes › Devis',
    etapes: [
      'Cliquez sur « Créer un devis », choisissez le type, le client et l’objet, puis « Créer le brouillon ».',
      'Ajoutez les lignes depuis « Produits et services » : vos prix sont déjà là. Le total se calcule tout seul.',
      'Vérifiez l’« Aperçu », puis « Valider le devis » : il reçoit son numéro et passe « Envoyé ».',
      'Pour l’envoyer : menu ⋮ › « Télécharger le PDF », puis « Envoyer par e-mail » (joignez le PDF).',
      'Le client accepte : « Marquer signé ». Puis menu ⋮ › « Créer l’intervention ».',
    ],
    astuce: 'Un ancien devis en PDF ? « Importer » : Chantio le lit, vous vérifiez, puis « Créer le devis avec ces champs ». Pas de réponse ? Menu ⋮ › « Relancer le client ».',
    image: { src: '/aide/web-devis.webp', alt: 'Liste des devis avec Brouillons, En attente, Signés, Refusés' },
    mission: 'devis',
  },
  {
    id: 'facture',
    titre: 'Facturer et suivre le paiement',
    quand: 'Après une fiche validée ou un devis signé.',
    ou: 'Menu › Ventes › Factures',
    etapes: [
      'Depuis une fiche validée : « Créer la facture ». Depuis un devis signé : « Facturer », puis Facture totale, Facture d’acompte, Situation de travaux ou Facture de solde, et « Préparer la facture ».',
      'Relisez, puis « Valider la facture » : elle passe « À encaisser ». Envoyez-la par le menu ⋮.',
      'Le paiement est arrivé : « Marquer payée ».',
      'En retard, elle remonte en rouge sur l’Accueil. Menu ⋮ › « Relancer le client » prépare l’e-mail.',
    ],
    astuce: 'Une erreur sur une facture validée ? On ne la supprime pas : menu ⋮ › « Créer un avoir », puis refaites la bonne facture.',
    mission: 'facture',
  },
  {
    id: 'achats',
    titre: 'Enregistrer une facture fournisseur',
    quand: 'Quand une facture Cedeo, Richardson, Point P… arrive.',
    ou: 'Menu › Achats › Factures',
    etapes: [
      'Cliquez sur « Importer » et choisissez le PDF, ou glissez-le sur la page. Une photo marche aussi.',
      'Chantio lit la facture tout seul. Elle arrive en « Reçu ».',
      'Ouvrez-la, vérifiez, puis « ✓ Approuver définitivement » : elle passe « À payer ».',
      'Une fois réglée : « + Déclarer un paiement ». Un souci : « Contester ».',
    ],
    astuce: 'Achats › Factures, ce sont les factures que vous recevez ; Ventes › Factures, celles que vous envoyez.',
    image: { src: '/aide/web-achats.webp', alt: 'Dépenses fournisseurs avec Reçu, En attente, À payer, Terminé' },
  },
  {
    id: 'chiffres',
    titre: 'Voir mes chiffres de l’année',
    quand: 'Une fois par semaine ou par mois.',
    ou: 'Menu › Chiffres',
    etapes: [
      '« Le point » : facturé, encaissé, charge de travail, prévu contre réalisé.',
      '« Mon année » : le tableau de production mois par mois. La première fois, « Importer un fichier » (votre Excel), puis « Enregistrer et afficher le tableau ».',
    ],
    image: { src: '/aide/web-annee.webp', alt: 'Chiffres, onglet Mon année' },
  },
  {
    id: 'clients',
    titre: 'Retrouver un client, un immeuble, un contrat',
    quand: 'Quand un client ou un syndic appelle.',
    ou: 'Menu › Ventes › Clients',
    etapes: [
      '« Nouveau client » pour en ajouter un : le nom et le téléphone suffisent pour commencer, puis « Créer le client ».',
      'Cliquez un client pour ouvrir sa fiche : où on en est, ses chiffres, ses interventions, ses immeubles.',
      'De là, « Nouvelle intervention » ou « Nouveau devis » : le client est déjà rempli.',
      'Onglet « Immeubles et contrats » : les contrats d’entretien. « Planifier les visites de l’année » les envoie dans « À placer ».',
    ],
    astuce: 'Vos prix sont dans Ventes › Produits et services.',
    mission: 'client',
  },
  {
    id: 'idee',
    titre: 'Une idée, un souci : la bulle',
    quand: 'Dès que quelque chose vous gêne ou vous manque.',
    ou: 'Rond foncé en bas à droite, sur toutes les pages',
    etapes: [
      'Cliquez la bulle, choisissez « Une idée ».',
      'Appuyez sur « Dicter » et parlez, ou écrivez.',
      'Cliquez la flèche pour envoyer. La page où vous êtes part avec le message.',
      'Une question sur l’utilisation ? Dans la bulle, choisissez « Une question » : l’assistant répond tout de suite.',
    ],
    astuce: 'Vos messages sont dans Paramètres › Retours sur Chantio.',
    mission: 'idee',
  },
];

/** Le guide en texte, pour l'assistant. */
export function guideEnTexte(): string {
  return SECTIONS_AIDE.map(
    (s) =>
      `## ${s.titre} [section: ${s.id}${s.mission ? `, visite: ${s.mission}` : ''}${s.image ? ', capture' : ''}]\nQuand : ${s.quand}\nOù : ${s.ou}\n${s.etapes
        .map((e, i) => `${i + 1}. ${e}`)
        .join('\n')}${s.astuce ? `\nBon à savoir : ${s.astuce}` : ''}`,
  ).join('\n\n');
}
