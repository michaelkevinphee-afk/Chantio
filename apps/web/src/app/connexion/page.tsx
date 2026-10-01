import { Logo } from '@/components/ui';
import FormulaireConnexion from './formulaire';

export const metadata = { title: 'Connexion · Chantio' };

export default function Connexion() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bandeau hidden flex-col justify-between p-12 text-white lg:flex">
        <Logo clair />
        <div>
          <p className="surtitre text-[#C9D4FF]">Logiciel de fiches d’intervention</p>
          <p className="mt-4 text-5xl font-extrabold leading-[1.05] tracking-[-0.03em]">
            Les fiches d’intervention,
            <br />
            <span className="text-lavande">simplement.</span>
          </p>
          <p className="mt-4 max-w-md text-white/80">
            Planifiez, suivez et validez les interventions de vos équipes. Vos techniciens remplissent la fiche sur
            leur téléphone, même sans réseau.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Plomberie', 'Chauffage', 'Génie climatique'].map((m) => (
            <span key={m} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold ring-1 ring-white/30 ring-inset">
              {m}
            </span>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="carte w-full max-w-md p-8 sm:p-10">
          <div className="lg:hidden">
            <Logo />
          </div>
          <FormulaireConnexion />
        </div>
      </section>
    </main>
  );
}
