import '../devis/devis.css';
import './achats.css';

// Le module « Achats » reprend l'apparence du module « Devis et factures ».
export default function LayoutAchats({ children }: LayoutProps<'/achats'>) {
  return children;
}
