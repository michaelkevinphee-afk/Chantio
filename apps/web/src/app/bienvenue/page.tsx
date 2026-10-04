import { redirect } from 'next/navigation';
import { LIBELLE_ROLE, type RoleMembre } from '@chantio/shared';
import { rejoindre } from '@/app/(bureau)/entreprises/actions';
import { AjoutEntreprise } from '@/components/ajout-entreprise';
import { BoutonDeconnexion } from '@/components/deconnexion';
import { BoutonEnvoi } from '@/components/retour';
import { Logo } from '@/components/ui';
import { supabaseServeur } from '@/lib/supabase/server';

export const metadata = { title: 'Bienvenue · Chantio' };

// Premier lancement d'un compte qui n'appartient à aucune entreprise : rejoindre celle
// qui l'a invité, demander l'accès à une entreprise déjà inscrite, ou créer la sienne.
export default async function Bienvenue({ searchParams }: PageProps<'/bienvenue'>) {
  const supabase = await supabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');
  const { data: membre } = await supabase.rpc('membre_actif').maybeSingle();
  if (membre) redirect('/');
  const { demande } = await searchParams;
  const [{ data: invitations }, { data: demandes }] = await Promise.all([
    supabase.rpc('invitations_recues'),
    supabase.from('demandes_acces').select('id, statut').eq('user_id', user.id).eq('statut', 'en_attente'),
  ]);
  const recues = (invitations ?? []) as { membre_id: string; entreprise: string; role: RoleMembre }[];

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Logo />
      <h1 className="mt-10 text-4xl font-extrabold text-encre">Bienvenue</h1>
      <p className="mt-2 text-gris">
        Connecté avec <b className="text-encre">{user.email}</b>. Si votre patron vous a invité, demandez-lui de vérifier cette adresse.
      </p>

      {demande && (
        <p className="mt-6 rounded-[14px] bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          ✓ Demande envoyée à {demande}. Vous pourrez entrer dès que son dirigeant l’aura acceptée.
        </p>
      )}
      {!demande && !!demandes?.length && (
        <p className="mt-6 rounded-[14px] bg-violet-doux px-4 py-3 text-sm font-semibold text-violet">
          Votre demande d’accès attend la réponse du dirigeant. Revenez un peu plus tard.
        </p>
      )}

      {recues.length > 0 && (
        <section className="carte mt-8 divide-y divide-trait">
          {recues.map((i) => (
            <div key={i.membre_id} className="flex flex-wrap items-center gap-3 p-5">
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{i.entreprise}</span>
                <span className="text-sm text-gris">Vous invite comme {LIBELLE_ROLE[i.role].toLowerCase()}</span>
              </span>
              <form action={rejoindre.bind(null, i.membre_id)}>
                <BoutonEnvoi enCours="…">Rejoindre</BoutonEnvoi>
              </form>
            </div>
          ))}
        </section>
      )}

      <h2 className="mt-10 mb-4 text-xl font-extrabold">Inscrire votre entreprise</h2>
      <AjoutEntreprise retour="bienvenue" />

      <div className="mt-10 text-center">
        <BoutonDeconnexion className="text-gris hover:text-encre" />
      </div>
    </main>
  );
}
