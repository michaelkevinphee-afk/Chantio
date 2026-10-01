import type { CSSProperties } from 'react';
import { initiales, LIBELLE_ROLE, type Membre, type RoleMembre } from '@chantio/shared';
import { EnvoiPhoto } from '@/components/envoi-photo';
import { Avatar, Bouton, Puce, Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { contexteBureau } from '@/lib/session';
import { changerActif, inviter } from './actions';

export const metadata = { title: 'Équipe · Chantio' };

const ROLES_INVITABLES: RoleMembre[] = ['technicien', 'chef_chantier', 'assistant', 'apprenti', 'sous_traitant', 'dirigeant'];

export default async function Equipe({ searchParams }: PageProps<'/equipe'>) {
  const { supabase, membre: moi, entreprise } = await contexteBureau();
  const { erreur, invite, sansmail } = await searchParams;
  const { data } = await supabase.from('membres').select('*').order('actif', { ascending: false }).order('prenom');
  const membres = (data ?? []) as Membre[];
  const dirigeant = moi.role === 'dirigeant';
  const liens = await liensProfils(supabase, [entreprise.logo_chemin, ...membres.map((m) => m.photo_chemin)]);
  const photo = (chemin: string | null) => (chemin ? liens.get(chemin) : null);
  const moiComplet = membres.find((m) => m.id === moi.id) ?? moi;

  return (
    <>
      <Titre sous="Les personnes qui utilisent Chantio dans votre entreprise">Équipe</Titre>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="space-y-2.5 self-start">
          {membres.map((m, n) => (
            <li
              key={m.id}
              style={{ '--i': n } as CSSProperties}
              className={`carte apparition flex flex-wrap items-center gap-3 p-3 pr-4 ${m.actif ? '' : 'opacity-50'}`}
            >
              <Avatar url={photo(m.photo_chemin)} initiales={initiales(m.prenom, m.nom)} taille={48} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {m.prenom} {m.nom} {m.id === moi.id && <span className="text-gris">(vous)</span>}
                </span>
                <span className="block truncate text-sm text-gris">{m.email}</span>
              </span>
              <Puce ton={m.role === 'dirigeant' ? 'bleu' : 'gris'}>{LIBELLE_ROLE[m.role]}</Puce>
              {!m.user_id && <Puce ton="violet">Invité</Puce>}
              {dirigeant && m.id !== moi.id && (
                <form action={changerActif.bind(null, m.id, !m.actif)}>
                  <button className="text-sm font-semibold text-gris underline">{m.actif ? 'Désactiver' : 'Réactiver'}</button>
                </form>
              )}
            </li>
          ))}
        </ul>

        <div className="space-y-6 self-start">
        <section id="profil" className="carte apparition flex flex-col items-center p-6 text-center">
          <Avatar url={photo(moiComplet.photo_chemin)} initiales={initiales(moi.prenom, moi.nom)} taille={104} anneau />
          <p className="mt-4 text-2xl font-extrabold">
            {moi.prenom} {moi.nom}
          </p>
          <p className="mb-4 text-sm text-gris">{LIBELLE_ROLE[moi.role]}</p>
          <EnvoiPhoto
            entrepriseId={entreprise.id}
            membreId={moi.id}
            libelle={moiComplet.photo_chemin ? 'Changer ma photo' : 'Ajouter ma photo'}
          />
        </section>

        {dirigeant && (
          <section className="carte apparition p-5" style={{ '--i': 1 } as CSSProperties}>
            <h2 className="text-xl font-extrabold">Logo de l’entreprise</h2>
            <p className="mb-4 text-sm text-gris">Affiché dans le menu et, bientôt, sur les rapports envoyés aux clients.</p>
            {entreprise.logo_chemin && photo(entreprise.logo_chemin) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo(entreprise.logo_chemin)!} alt="" className="mb-4 h-16 rounded-xl bg-doux object-contain p-2" />
            )}
            <EnvoiPhoto
              entrepriseId={entreprise.id}
              logo
              libelle={entreprise.logo_chemin ? 'Changer le logo' : 'Ajouter le logo'}
            />
          </section>
        )}

        {dirigeant && (
          <form action={inviter} className="carte apparition space-y-3 p-5" style={{ '--i': 2 } as CSSProperties}>
            <h2 className="text-xl font-extrabold">Ajouter quelqu’un</h2>
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
                {sansmail
                  ? `C’est noté, mais l’e-mail n’a pas pu partir. Dites à ${invite} d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » avec cette adresse.`
                  : `C’est noté. Un e-mail avec un code vient de partir. Dites à ${invite} d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » (pensez aux spams).`}
              </p>
            )}
            <Bouton className="w-full">Ajouter à l’équipe</Bouton>
          </form>
        )}
        </div>
      </div>
    </>
  );
}
