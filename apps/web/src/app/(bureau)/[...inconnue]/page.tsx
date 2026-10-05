import { notFound } from 'next/navigation';

// Adresse inconnue dans le bureau : la page « introuvable » s'affiche dans le cadre, avec le menu.
export default function PageInconnue() {
  notFound();
}
