import { deconnecter } from '@/app/actions-session';

/** Lien « Se déconnecter » (pages Bienvenue et Terrain, Paramètres › Mon profil). */
export function BoutonDeconnexion({ className = '' }: { className?: string }) {
  return (
    <form action={deconnecter}>
      <button className={`text-sm font-semibold underline ${className}`}>Se déconnecter</button>
    </form>
  );
}
