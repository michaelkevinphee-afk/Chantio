import './achats.css';
import { PanneauImports } from './imports';

// Achats : « Dépenses fournisseurs », fiche d'une facture fournisseur, fournisseurs.
// Le panneau d'importation reste affiché d'un écran à l'autre (masqué sur la fiche plein écran).
export default function LayoutAchats({ children }: LayoutProps<'/achats'>) {
  return (
    <>
      {children}
      <PanneauImports />
    </>
  );
}
