// Listes de « Créer une entreprise » (TAILLES et TRANCHES_CA du bac), lues par la page et par l'action serveur.

export const TAILLES = [
  '0 salarié',
  '1 ou 2 salariés',
  '3 à 5 salariés',
  '6 à 9 salariés',
  '10 à 19 salariés',
  '20 à 49 salariés',
  '50 à 249 salariés',
  '250 salariés et plus',
] as const;

export const TRANCHES_CA = ['Moins de 100 000 €', 'De 100 000 à 500 000 €', 'De 500 000 € à 1 M€', 'De 1 à 2 M€', 'De 2 à 10 M€', 'Plus de 10 M€'] as const;

/** Ordre des champs de la fiche : le premier en erreur reçoit le focus (comme creerEntreprise() du bac). */
export const ORDRE_CHAMPS = ['nom', 'adresse', 'siret', 'forme_juridique', 'capital', 'taille', 'ca', 'atteste'] as const;
