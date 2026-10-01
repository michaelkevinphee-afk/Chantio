import type { CSSProperties } from 'react';
import { initiales, LIBELLE_ROLE, type Membre } from '@chantio/shared';
import { EnvoiPhoto } from '@/components/envoi-photo';
import { Icone } from '@/components/icones';
import { LienEnvoi } from '@/components/retour';
import { Avatar, LienBouton, Panneau, Puce, Titre } from '@/components/ui';
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

  const actifs = membres.filter((m) => m.actif).length;

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

      {erreur && !nouveau && (
        <p className="apparition mb-6 rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>
      )}
      {invite && (
        <p className="apparition mb-6 rounded-[14px] bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          {sansmail
            ? `${invite} fait partie de l’équipe, mais l’e-mail n’a pas pu partir (${sansmail}). Dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » avec son adresse.`
            : `✓ ${invite} fait partie de l’équipe. Un e-mail avec un code vient de partir : dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » (pensez aux spams).`}
        </p>
      )}
      {renvoi && (
        <p className={`apparition mb-6 rounded-[14px] px-4 py-3 text-sm font-semibold ${sansmail ? 'bg-rouge-doux text-rouge' : 'bg-vert-doux text-vert'}`}>
          {sansmail
            ? `L’e-mail pour ${renvoi} n’a pas pu partir : ${sansmail}.`
            : `E-mail renvoyé à ${renvoi}, avec un nouveau code. Pensez aux spams.`}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panneau titre="Membres" nombre={actifs} className="apparition">
          {/* Colonnes fixes : nom, rôle, état et actions tombent toujours au même endroit. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_108px_92px_150px] gap-4 border-b border-trait bg-fond/60 px-5 py-2.5 text-xs font-bold tracking-wide text-gris uppercase md:grid">
            <span>Nom</span>
            <span>Rôle</span>
            <span>État</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-trait">
            {membres.map((m, n) => (
              <li
                key={m.id}
                style={{ '--i': n } as CSSProperties}
                className="apparition grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_108px_92px_150px]"
              >
                <span className={`flex min-w-0 items-center gap-3 ${m.actif ? '' : 'opacity-55'}`}>
                  <Avatar url={photo(m.photo_chemin)} initiales={initiales(m.prenom, m.nom)} taille={42} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-extrabold">
                        {m.prenom} {m.nom}
                      </span>
                      {m.id === moi.id && <span className="shrink-0 rounded-full bg-doux px-2 py-0.5 text-[11px] font-bold text-cobalt">Vous</span>}
                    </span>
                    <span className="block truncate text-sm text-gris">{m.email}</span>
                  </span>
                </span>
                <span className="max-md:hidden">
                  <Puce ton={m.role === 'dirigeant' ? 'bleu' : 'gris'}>{LIBELLE_ROLE[m.role]}</Puce>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 md:block">
                  <span className="md:hidden">
                    <Puce ton={m.role === 'dirigeant' ? 'bleu' : 'gris'}>{LIBELLE_ROLE[m.role]}</Puce>
                  </span>
                  {!m.actif ? (
                    <Puce>Désactivé</Puce>
                  ) : !m.user_id ? (
                    <Puce ton="violet">Invité</Puce>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-vert">
                      <span className="h-2 w-2 rounded-full bg-menthe" /> Actif
                    </span>
                  )}
                </span>
                <span className="col-span-2 flex items-center gap-4 text-sm font-bold whitespace-nowrap md:col-span-1 md:justify-end">
                  {dirigeant && !m.user_id && m.actif && (
                    <form action={renvoyer.bind(null, m.id)}>
                      <LienEnvoi className="text-cobalt hover:underline" titre="Renvoyer l’e-mail avec un nouveau code">Renvoyer</LienEnvoi>
                    </form>
                  )}
                  {dirigeant && m.id !== moi.id && (
                    <form action={changerActif.bind(null, m.id, !m.actif)}>
                      <LienEnvoi className="text-gris hover:text-encre hover:underline">{m.actif ? 'Désactiver' : 'Réactiver'}</LienEnvoi>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panneau>

        <div className="grid gap-6">
          <Panneau titre="Mon profil" className="apparition" style={{ '--i': 1 } as CSSProperties}>
            <div id="profil" className="flex items-center gap-4 p-5">
              <Avatar url={photo(moiComplet.photo_chemin)} initiales={initiales(moi.prenom, moi.nom)} taille={72} anneau />
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold">
                  {moi.prenom} {moi.nom}
                </p>
                <p className="mb-3 text-sm text-gris">{LIBELLE_ROLE[moi.role]}</p>
                <EnvoiPhoto
                  entrepriseId={entreprise.id}
                  membreId={moi.id}
                  libelle={moiComplet.photo_chemin ? 'Changer ma photo' : 'Ajouter ma photo'}
                />
              </div>
            </div>
          </Panneau>

          {dirigeant && (
            <Panneau titre="Logo de l’entreprise" className="apparition" style={{ '--i': 2 } as CSSProperties}>
              <div className="flex items-center gap-4 p-5">
                <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-trait bg-fond p-2">
                  {entreprise.logo_chemin && photo(entreprise.logo_chemin) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo(entreprise.logo_chemin)!} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-2xl font-extrabold text-lavande">{entreprise.nom.slice(0, 1)}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="mb-3 text-sm text-gris">Affiché dans le menu et, bientôt, sur les rapports envoyés aux clients.</p>
                  <EnvoiPhoto entrepriseId={entreprise.id} logo libelle={entreprise.logo_chemin ? 'Changer le logo' : 'Ajouter le logo'} />
                </div>
              </div>
            </Panneau>
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
