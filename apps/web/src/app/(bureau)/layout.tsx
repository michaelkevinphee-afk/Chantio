import Link from 'next/link';
import { initiales, LIBELLE_ROLE } from '@chantio/shared';
import { BoutonDeconnexion } from '@/components/deconnexion';
import { Icone } from '@/components/icones';
import { Navigation } from '@/components/navigation';
import { Avatar, LienBouton, Logo } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { contexteBureau } from '@/lib/session';

export default async function LayoutBureau({ children }: LayoutProps<'/'>) {
  const { supabase, membre, entreprise } = await contexteBureau();
  const liens = await liensProfils(supabase, [membre.photo_chemin, entreprise.logo_chemin]);
  const logo = entreprise.logo_chemin ? liens.get(entreprise.logo_chemin) : null;
  const photo = membre.photo_chemin ? liens.get(membre.photo_chemin) : null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr] lg:bg-[linear-gradient(to_right,var(--color-marine)_256px,transparent_256px)]">
      <aside className="flex flex-col gap-6 bg-marine p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:p-5">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={entreprise.nom} className="h-12 max-w-[200px] rounded-xl bg-white object-contain p-1.5" />
          ) : (
            <p className="font-titre text-3xl font-extrabold uppercase leading-none">{entreprise.nom}</p>
          )}
        </div>
        <LienBouton href="/interventions/nouvelle" className="w-full">
          <Icone nom="plus" taille={18} /> Nouvelle intervention
        </LienBouton>
        <Navigation />
        <div className="mt-auto hidden space-y-4 lg:block">
          <Link href="/equipe#profil" className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/5">
            <Avatar url={photo} initiales={initiales(membre.prenom, membre.nom)} taille={40} className="ring-2 ring-jaune" />
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {membre.prenom} {membre.nom}
              </span>
              <span className="block text-xs text-white/55">{LIBELLE_ROLE[membre.role]}</span>
            </span>
          </Link>
          <BoutonDeconnexion className="px-2 text-sm text-white/60 hover:text-white" />
          <div className="px-2 text-xs text-white/40">
            Propulsé par <Logo clair taille={18} />
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
