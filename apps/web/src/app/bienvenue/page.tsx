import { redirect } from 'next/navigation';
import { Bouton, Logo } from '@/components/ui';
import { supabaseServeur } from '@/lib/supabase/server';
import { creerEntreprise } from './actions';

export const metadata = { title: 'Bienvenue · Chantio' };

// Premier lancement d'un compte qui n'appartient à aucune entreprise.
export default async function Bienvenue({ searchParams }: PageProps<'/bienvenue'>) {
  const supabase = await supabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/connexion');
  const { data: membre } = await supabase.from('membres').select('id').eq('user_id', user.id).maybeSingle();
  if (membre) redirect('/');
  const { erreur } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Logo />
      <h1 className="mt-10 font-titre text-4xl font-extrabold uppercase text-marine">Bienvenue</h1>
      <p className="mt-2 text-gris">
        Créez votre entreprise pour commencer. Si votre patron vous a invité, demandez-lui de vérifier l’adresse
        e-mail utilisée : <b className="text-encre">{user.email}</b>.
      </p>
      <form action={creerEntreprise} className="carte mt-8 space-y-4 p-6">
        <div>
          <label className="etiquette" htmlFor="entreprise">
            Nom de l’entreprise
          </label>
          <input id="entreprise" name="entreprise" className="champ" required placeholder="Ex. : Verger" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiquette" htmlFor="prenom">
              Votre prénom
            </label>
            <input id="prenom" name="prenom" className="champ" required />
          </div>
          <div>
            <label className="etiquette" htmlFor="nom">
              Votre nom
            </label>
            <input id="nom" name="nom" className="champ" />
          </div>
        </div>
        {erreur && <p className="text-sm font-semibold text-rouge">{erreur}</p>}
        <Bouton className="w-full py-3">Créer mon entreprise</Bouton>
      </form>
    </main>
  );
}
