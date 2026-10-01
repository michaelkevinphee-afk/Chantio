import type { CSSProperties } from 'react';
import { initiales, LIBELLE_ROLE, type Membre } from '@chantio/shared';
import { EnvoiPhoto } from '@/components/envoi-photo';
import { Icone } from '@/components/icones';
import { Avatar, LienBouton, Puce, Titre } from '@/components/ui';
import { Volet } from '@/components/volet';
import { liensProfils } from '@/lib/profils';
import { contexteBureau } from '@/lib/session';
import { changerActif, renvoyer } from './actions';
import { FormulaireCollaborateur } from './formulaire-collaborateur';

export const metadata = { title: 'Équipe · Chantio' };

export default async function Equipe({ searchParams }: PageProps<'/equipe'>) {
  const { supabase, membre: moi, entreprise } = await contexteBureau();
  const { erreur, invite, renvoi, sansmail, nouveau } = await searchParams;
  const { data } = await supabase.from('membres').select('*').order('actif', { ascending: false }).order('prenom');
  const membres = (data ?? []) as Membre[];
  const dirigeant = moi.role === 'dirigeant';
  const liens = await liensProfils(supabase, [entreprise.logo_chemin, ...membres.map((m) => m.photo_chemin)]);
  const photo = (chemin: string | null) => (chemin ? liens.get(chemin) : null);
  const moiComplet = membres.find((m) => m.id === moi.id) ?? moi;

  return (
    <>
      <Titre
        sous="Les personnes qui utilisent Chantio dans votre entreprise"
        actions={
          dirigeant && (
            <LienBouton href="/equipe?nouveau=1" scroll={false}>
              <Icone nom="plus" taille={18} /> Nouveau collaborateur
            </LienBouton>
          )
        }
      >
        Équipe
      </Titre>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2.5 self-start">
        {erreur && !nouveau && <p className="rounded-xl bg-rouge-doux p-3 text-sm font-semibold text-rouge">{erreur}</p>}
        {invite && (
          <p className="apparition rounded-xl bg-vert-doux p-3 text-sm text-vert">
            {sansmail
              ? `${invite} fait partie de l’équipe, mais l’e-mail n’a pas pu partir (${sansmail}). Dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » avec son adresse.`
              : `✓ ${invite} fait partie de l’équipe. Un e-mail avec un code vient de partir : dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » (pensez aux spams).`}
          </p>
        )}
        {renvoi && (
          <p className={`rounded-xl p-3 text-sm ${sansmail ? 'bg-rouge-doux text-rouge' : 'bg-vert-doux text-vert'}`}>
            {sansmail
              ? `L’e-mail pour ${renvoi} n’a pas pu partir : ${sansmail}.`
              : `E-mail renvoyé à ${renvoi}, avec un nouveau code. Pensez aux spams.`}
          </p>
        )}
        <ul className="space-y-2.5">
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
              {dirigeant && !m.user_id && m.actif && (
                <form action={renvoyer.bind(null, m.id)}>
                  <button className="text-sm font-semibold text-bleu underline">Renvoyer l’e-mail</button>
                </form>
              )}
              {dirigeant && m.id !== moi.id && (
                <form action={changerActif.bind(null, m.id, !m.actif)}>
                  <button className="text-sm font-semibold text-gris underline">{m.actif ? 'Désactiver' : 'Réactiver'}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        </div>

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

        </div>
      </div>

      {dirigeant && nouveau && (
        <Volet fermer="/equipe" titre="Nouveau collaborateur" sous="Un code part par e-mail pour sa première connexion">
          <FormulaireCollaborateur erreur={typeof erreur === 'string' ? erreur : undefined} />
        </Volet>
      )}
    </>
  );
}
