import { redirect } from 'next/navigation';

/** L'ancien « Catalogue » est devenu Ventes › Produits et services. */
export default function PageCatalogue() {
  redirect('/produits-services');
}
