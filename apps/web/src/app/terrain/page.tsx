import { Logo } from '@/components/ui';
import { contexte } from '@/lib/session';
import { BoutonDeconnexion } from '@/components/deconnexion';

// Un technicien qui ouvre le site : son outil, c'est l'appli mobile.
export default async function Terrain() {
  const { membre } = await contexte();
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <Logo />
      <h1 className="mt-10 font-titre text-4xl font-extrabold uppercase text-marine">Salut {membre.prenom}</h1>
      <p className="mt-3 text-gris">
        Le site est réservé au bureau. Tes interventions et tes fiches sont dans l’appli Chantio sur ton téléphone.
      </p>
      <div className="mt-8">
        <BoutonDeconnexion />
      </div>
    </main>
  );
}
