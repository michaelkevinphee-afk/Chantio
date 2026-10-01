import { LIBELLE_ROLE } from '@chantio/shared';
import { BoutonDeconnexion } from '@/components/deconnexion';
import { Navigation } from '@/components/navigation';
import { LienBouton, Logo } from '@/components/ui';
import { contexteBureau } from '@/lib/session';

export default async function LayoutBureau({ children }: LayoutProps<'/'>) {
  const { membre, entreprise } = await contexteBureau();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] lg:bg-[linear-gradient(to_right,var(--color-marine)_240px,transparent_240px)]">
      <aside className="flex flex-col gap-6 bg-marine p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:p-5">
        <div>
          <p className="font-titre text-3xl font-extrabold uppercase leading-none">{entreprise.nom}</p>
          <p className="mt-1 text-xs text-white/50">
            {membre.prenom} · {LIBELLE_ROLE[membre.role]}
          </p>
        </div>
        <LienBouton href="/interventions/nouvelle" className="w-full">
          + Nouvelle intervention
        </LienBouton>
        <Navigation />
        <div className="mt-auto hidden space-y-4 lg:block">
          <BoutonDeconnexion className="text-white/60 hover:text-white" />
          <div className="text-xs text-white/40">
            Propulsé par <Logo clair taille={18} />
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-10">{children}</main>
    </div>
  );
}
