// Ce que la liste « Dépenses fournisseurs » garde en mémoire tant que l'appli est ouverte, comme le bac :
// en refermant une facture (✕ ou Échap), on retrouve la liste avec le même compteur, la même recherche
// et les mêmes filtres ; le menu, lui, rouvre la liste à neuf. Le tri des colonnes, lui, est gardé même
// en revenant par le menu (etat.achTri du bac n'est jamais remis à zéro).

export interface EtatListeAchats {
  seg: string;
  q: string;
  periode: string;
  echeance: string;
  responsable: string;
  montant: string;
}

export const memoireAchats: {
  etat: EtatListeAchats | null;
  retour: boolean;
  id: string | null;
  tri: { cle: string; sens: 'asc' | 'desc' } | null;
} = {
  etat: null,
  retour: false,
  id: null,
  tri: null,
};
