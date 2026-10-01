import { LIBELLE_ROLE, type Membre, type RoleMembre } from '@chantio/shared';
import { Bouton, Puce, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { changerActif, inviter } from './actions';

export const metadata = { title: 'Équipe · Chantio' };

const ROLES_INVITABLES: RoleMembre[] = ['technicien', 'chef_chantier', 'assistant', 'apprenti', 'sous_traitant', 'dirigeant'];

export default async function Equipe({ searchParams }: PageProps<'/equipe'>) {
  const { supabase, membre: moi } = await contexteBureau();
  const { erreur, invite } = await searchParams;
  const { data } = await supabase.from('membres').select('*').order('actif', { ascending: false }).order('prenom');
  const membres = (data ?? []) as Membre[];
  const dirigeant = moi.role === 'dirigeant';

  return (
    <>
      <Titre sous="Les personnes qui utilisent Chantio dans votre entreprise">Équipe</Titre>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="carte divide-y divide-trait self-start">
          {membres.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${m.actif ? '' : 'opacity-50'}`}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-marine font-bold text-jaune">
                {m.prenom.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {m.prenom} {m.nom} {m.id === moi.id && <span className="text-gris">(vous)</span>}
                </span>
                <span className="block truncate text-sm text-gris">{m.email}</span>
              </span>
              <Puce ton={m.role === 'dirigeant' ? 'bleu' : 'gris'}>{LIBELLE_ROLE[m.role]}</Puce>
              {!m.user_id && <Puce ton="jaune">Invité</Puce>}
              {dirigeant && m.id !== moi.id && (
                <form action={changerActif.bind(null, m.id, !m.actif)}>
                  <button className="text-sm font-semibold text-gris underline">{m.actif ? 'Désactiver' : 'Réactiver'}</button>
                </form>
              )}
            </li>
          ))}
        </ul>

        {dirigeant && (
          <form action={inviter} className="carte space-y-3 self-start p-5">
            <h2 className="font-titre text-xl font-extrabold uppercase">Ajouter quelqu’un</h2>
            <div className="grid grid-cols-2 gap-2">
              <input name="prenom" className="champ" required placeholder="Prénom" aria-label="Prénom" />
              <input name="nom" className="champ" placeholder="Nom" aria-label="Nom" />
            </div>
            <input name="email" type="email" className="champ" required placeholder="E-mail" aria-label="E-mail" />
            <input name="telephone" type="tel" className="champ" placeholder="Téléphone" aria-label="Téléphone" />
            <select name="role" className="champ" defaultValue="technicien" aria-label="Rôle">
              {ROLES_INVITABLES.map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
            </select>
            {erreur && <p className="text-sm font-semibold text-rouge">{erreur}</p>}
            {invite && (
              <p className="rounded-xl bg-vert-doux p-3 text-sm text-vert">
                C’est noté. Dites à {invite} d’installer l’appli Chantio et de se connecter avec cette adresse e-mail.
              </p>
            )}
            <Bouton className="w-full">Ajouter à l’équipe</Bouton>
          </form>
        )}
      </div>
    </>
  );
}
