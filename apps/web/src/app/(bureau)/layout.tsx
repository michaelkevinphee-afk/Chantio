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
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr] lg:bg-[linear-gradient(to_right,rgb(255_255_255/0.8)_271px,var(--color-trait)_271px_272px,transparent_272px)]">
      <aside className="flex flex-col gap-6 border-b border-trait bg-white/80 p-4 backdrop-blur-md lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:p-5">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={entreprise.nom} className="h-12 max-w-[200px] object-contain" />
          ) : (
            <p className="text-2xl font-extrabold leading-none tracking-[-0.03em]">{entreprise.nom}</p>
          )}
        </div>
        <LienBouton href="/interventions/nouvelle" className="w-full whitespace-nowrap !px-4">
          <Icone nom="plus" taille={18} /> Nouvelle intervention
        </LienBouton>
        <Navigation />
        <div className="mt-auto hidden space-y-4 lg:block">
          <Link href="/equipe#profil" className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-doux">
            <Avatar url={photo} initiales={initiales(membre.prenom, membre.nom)} taille={40} className="ring-2 ring-cobalt ring-offset-2 ring-offset-white" />
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {membre.prenom} {membre.nom}
              </span>
              <span className="block text-xs text-gris">{LIBELLE_ROLE[membre.role]}</span>
            </span>
          </Link>
          <BoutonDeconnexion className="px-2 text-sm text-gris hover:text-encre" />
          <div className="border-t border-trait px-2 pt-4 text-xs text-gris">
            Propulsé par <Logo taille={18} />
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
