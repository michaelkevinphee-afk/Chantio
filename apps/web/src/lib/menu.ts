import type { NomIcone } from '@/components/icones';

// Le menu du bureau, comme le bac à sable : Accueil, Planning, Interventions, Ventes (Factures, Devis,
// Clients, Produits et services), Achats (Factures, Fournisseurs), Chiffres ; Paramètres en bas.
// Sur téléphone : une barre de cinq boutons (Accueil, Planning, Interventions, Ventes, Achats),
// Chiffres passe dans la page Ventes et Paramètres en haut à droite.
// Module sans 'use client' : utilisable par la mise en page (serveur) comme par le menu (client).

/** Entrée du menu allumée pour la page affichée ('ventes' : la page Ventes du téléphone). */
export type CleMenu =
  | 'accueil'
  | 'planning'
  | 'interventions'
  | 'factures'
  | 'devis'
  | 'clients'
  | 'produits'
  | 'ach-factures'
  | 'fournisseurs'
  | 'chiffres'
  | 'parametres'
  | 'aide'
  | 'ventes';

/** Une entrée : `pastille` est la clé de son compteur dans `pastilles` (voir Navigation). */
export type EntreeMenu = { cle: CleMenu; libelle: string; href: string; icone: NomIcone; pastille?: string };
export type GroupeMenu = { groupe: 'ventes' | 'achats'; libelle: string; icone: NomIcone; pastille?: string; entrees: EntreeMenu[] };

export const MENU: (EntreeMenu | GroupeMenu)[] = [
  { cle: 'accueil', libelle: 'Accueil', href: '/', icone: 'maison', pastille: '/' },
  { cle: 'planning', libelle: 'Planning', href: '/planning', icone: 'calendrier' },
  { cle: 'interventions', libelle: 'Interventions', href: '/interventions', icone: 'cle', pastille: '/interventions' },
  {
    groupe: 'ventes',
    libelle: 'Ventes',
    icone: 'etiquette',
    entrees: [
      { cle: 'factures', libelle: 'Factures', href: '/factures', icone: 'ticket' },
      { cle: 'devis', libelle: 'Devis', href: '/devis', icone: 'devis' },
      { cle: 'clients', libelle: 'Clients', href: '/clients', icone: 'immeuble' },
      { cle: 'produits', libelle: 'Produits et services', href: '/produits-services', icone: 'cube' },
    ],
  },
  {
    groupe: 'achats',
    libelle: 'Achats',
    icone: 'achats_entree',
    pastille: '/achats',
    entrees: [
      { cle: 'ach-factures', libelle: 'Factures', href: '/achats', icone: 'ticket' },
      { cle: 'fournisseurs', libelle: 'Fournisseurs', href: '/achats/fournisseurs', icone: 'camion' },
    ],
  },
  { cle: 'chiffres', libelle: 'Chiffres', href: '/chiffres', icone: 'chiffres' },
];

/** Paramètres, séparé en bas du menu (et roue en haut à droite sur téléphone). */
export const PARAMETRES: EntreeMenu = { cle: 'parametres', libelle: 'Paramètres', href: '/parametres', icone: 'engrenage' };

/** Aide (guide tâche par tâche), au-dessus de Paramètres (point d'interrogation en haut à droite sur téléphone). */
export const AIDE: EntreeMenu = { cle: 'aide', libelle: 'Aide', href: '/aide', icone: 'aide' };

/** Barre du bas du téléphone : `allume` liste les pages où le bouton est allumé. */
export const BARRE_TELEPHONE: (EntreeMenu & { allume: CleMenu[] })[] = [
  { cle: 'accueil', libelle: 'Accueil', href: '/', icone: 'maison', pastille: '/', allume: ['accueil'] },
  { cle: 'planning', libelle: 'Planning', href: '/planning', icone: 'calendrier', allume: ['planning'] },
  { cle: 'interventions', libelle: 'Interventions', href: '/interventions', icone: 'cle', pastille: '/interventions', allume: ['interventions'] },
  {
    cle: 'ventes',
    libelle: 'Ventes',
    href: '/ventes',
    icone: 'etiquette',
    allume: ['ventes', 'factures', 'devis', 'clients', 'produits', 'chiffres'],
  },
  { cle: 'ach-factures', libelle: 'Achats', href: '/achats', icone: 'achats_entree', pastille: '/achats', allume: ['ach-factures', 'fournisseurs'] },
];

/** Pages rangées dans chaque groupe : l'en-tête du groupe replié s'allume quand on y est. */
export const DANS_GROUPE: Record<GroupeMenu['groupe'], CleMenu[]> = {
  ventes: ['factures', 'devis', 'clients', 'produits', 'ventes'],
  achats: ['ach-factures', 'fournisseurs'],
};

const commencePar = (chemin: string, base: string) => chemin === base || chemin.startsWith(base + '/');

/**
 * L'entrée allumée pour un chemin (sans paramètres), du plus précis au moins précis.
 * /devis/[id], /devis/import… allument Devis ; /clients/immeubles, /clients/[id] allument Clients ;
 * /equipe (ancienne page) allume Paramètres ; /entreprises n'allume rien.
 */
export function entreeActive(chemin: string): CleMenu | null {
  if (chemin === '/') return 'accueil';
  if (commencePar(chemin, '/planning')) return 'planning';
  if (commencePar(chemin, '/interventions')) return 'interventions';
  if (commencePar(chemin, '/ventes')) return 'ventes';
  if (commencePar(chemin, '/factures')) return 'factures';
  if (commencePar(chemin, '/produits-services') || commencePar(chemin, '/devis/catalogue')) return 'produits';
  if (commencePar(chemin, '/devis')) return 'devis';
  if (commencePar(chemin, '/clients')) return 'clients';
  if (commencePar(chemin, '/achats/fournisseurs')) return 'fournisseurs';
  if (commencePar(chemin, '/achats')) return 'ach-factures';
  if (commencePar(chemin, '/chiffres')) return 'chiffres';
  if (commencePar(chemin, '/aide')) return 'aide';
  if (commencePar(chemin, '/parametres') || commencePar(chemin, '/equipe')) return 'parametres';
  return null;
}

/** État du menu mémorisé dans le navigateur (cookie, relu par la mise en page pour un premier affichage sans saut). */
export type EtatMenu = { reduit: boolean; ventes: boolean; achats: boolean };
export const COOKIE_MENU = 'chantio-menu';
export const ETAT_MENU_DEFAUT: EtatMenu = { reduit: false, ventes: true, achats: true };

/** Valeur du cookie : mots séparés par des points (« reduit.ventes-ferme »), vide = menu ouvert par défaut. */
export function lireEtatMenu(valeur: string | undefined | null): EtatMenu {
  const mots = new Set((valeur ?? '').split('.'));
  return { reduit: mots.has('reduit'), ventes: !mots.has('ventes-ferme'), achats: !mots.has('achats-ferme') };
}

export function ecrireEtatMenu(e: EtatMenu): string {
  return [e.reduit && 'reduit', !e.ventes && 'ventes-ferme', !e.achats && 'achats-ferme'].filter(Boolean).join('.');
}
