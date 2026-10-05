import type { SVGProps } from 'react';

// Icônes au trait (style Lucide), comme sur les maquettes.
const TRACES = {
  pilotage: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  interventions: 'M9 4h6v3H9zM6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M9 13l2 2 4-4',
  clients: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6',
  equipe: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  alerte: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  valider: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  euro: 'M18 7a6 6 0 1 0 0 10M4 10h9M4 14h9',
  chevron: 'M9 18l6-6-6-6',
  telephone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  photo: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  fermer: 'M18 6 6 18M6 6l12 12',
  recherche: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  email: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 6l-10 7L2 6',
  lieu: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  calendrier: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  gauche: 'M15 18l-6-6 6-6',
  devis: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  achats: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM16 8H8M16 12H8M13 16H8',
  entreprise: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v8h4M18 9h2a2 2 0 0 1 2 2v11h-4M10 6h4M10 10h4M10 14h4M10 18h4',
  bouclier: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-4',
  haut_bas: 'M7 15l5 5 5-5M7 9l5-5 5 5',
  chiffres: 'M3 3v18h18M8 17v-6M13 17V7M18 17v-4',
  reglages: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  // Menu du bac à sable : maison (Accueil), clé (Interventions), étiquette (Ventes), ticket (Factures),
  // immeuble (Clients), cube (Produits et services), carré flèche (Achats), camion (Fournisseurs), roue (Paramètres).
  maison: 'M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5',
  cle: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  etiquette: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM6 7.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  ticket: 'M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4',
  immeuble: 'M3 21V8l7-5 7 5v13M10 21v-6h4v6M17 11h4v10',
  cube: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  achats_entree: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM9 9l6 6M15 9.5V15H9.5',
  camion: 'M2 6h11v10H2zM13 9h4l4 4v3h-8zM4.5 17.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  engrenage: 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  // « Réduire le menu » (double chevron, retourné pour « Agrandir »), chevron des groupes repliables.
  reduire: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  chevron_bas: 'M6 9l6 6 6-6',
  // Liste du sélecteur d'entreprise : coche, curseurs (Gérer vos entreprises), enveloppe (invitations), sortie (Se déconnecter).
  coche: 'M20 6 9 17l-5-5',
  curseurs: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  enveloppe: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6',
  sortie: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  // Pour les autres écrans : corbeille, crayon, drapeau (appel d'offres), téléchargement, flèche droite.
  corbeille: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  crayon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  drapeau: 'M4 22V3M4 4h14l-2.5 4.5L18 13H4',
  telecharger: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  droite: 'M5 12h14M13 6l6 6-6 6',
  // Rubriques de Paramètres (icônes IP du bac, cercles et rectangles réécrits en chemins).
  p_entreprise: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4',
  p_numerotation: 'M5 9h15M4 15h15M10 3 8 21M16 3l-2 18',
  p_banque: 'M3 10h18M12 3l9 5H3zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  p_efacture: 'M6 2h9l5 5v15H6zM14 2v6h6M12.5 11 10 15h4l-2.5 4',
  p_profil: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21c1-4 4-6 8-6s7 2 8 6',
  p_notifications: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  p_connectivite: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  p_perso:
    'M12 21a9 9 0 1 1 9-9c0 2.5-2 4-4.5 4H15a2 2 0 0 0-1.5 3.3A1.8 1.8 0 0 1 12 21zM6.5 11a1 1 0 1 0 2 0 1 1 0 1 0-2 0M10 7a1 1 0 1 0 2 0 1 1 0 1 0-2 0M15 8.5a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  p_abonnement: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 10h20M6 15h4',
  p_donnees: 'M4 5a8 3 0 1 0 16 0 8 3 0 1 0-16 0M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  p_membres: 'M5.5 8a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.9.7 3.1 2.5 3.5 5.4',
  p_cgv: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  p_prix: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8',
  p_compta: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5M9 7h7M9 11h5',
  // Carte d'une entreprise (« Gérer vos entreprises »).
  p_immeuble: 'M5.5 3h8a1.5 1.5 0 0 1 1.5 1.5V21H4V4.5A1.5 1.5 0 0 1 5.5 3zM15 9h4.5a.5.5 0 0 1 .5.5V21h-5M8 7h3M8 11h3M8 15h3',
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 20, ...props }: { nom: NomIcone; taille?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={TRACES[nom]} />
    </svg>
  );
}
