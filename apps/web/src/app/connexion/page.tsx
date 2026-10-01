import { Logo } from '@/components/ui';
import FormulaireConnexion from './formulaire';

export const metadata = { title: 'Connexion · Chantio' };

export default function Connexion() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-marine p-12 text-white lg:flex">
        <Logo clair />
        <div>
          <p className="font-titre text-5xl font-extrabold uppercase leading-none">
            Les fiches d’intervention,
            <br />
            <span className="text-jaune">simplement.</span>
          </p>
          <p className="mt-4 max-w-md text-white/70">
            Planifiez, suivez et validez les interventions de vos équipes. Vos techniciens remplissent la fiche sur
            leur téléphone, même sans réseau.
          </p>
        </div>
        <p className="text-sm text-white/50">Plomberie · Chauffage · Génie climatique</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>
          <FormulaireConnexion />
        </div>
      </section>
    </main>
  );
}
