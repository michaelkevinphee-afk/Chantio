import type { ReactNode } from 'react';

/**
 * Page pleine, sans menu (éditeur de devis ou de facture, fiche d'achat, « Gérer vos entreprises ») :
 * tant qu'elle est affichée, globals.css masque les éléments [data-menu] du cadre et donne toute
 * la largeur à [data-contenu], sans marges. Composant serveur, sans JavaScript.
 */
export function PleinEcran({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ed-plein min-h-dvh ${className}`}>{children}</div>;
}
