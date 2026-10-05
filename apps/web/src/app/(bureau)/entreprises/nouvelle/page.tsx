import type { ReactNode } from 'react';
import { BarrePleine } from '@/components/barre-pleine';
import { Icone } from '@/components/icones';
import { PleinEcran } from '@/components/plein-ecran';
import { LienBouton } from '@/components/ui';
import { contexteBureau, mesEntreprises } from '@/lib/session';
import { CreationEntreprise } from './creation';

export const metadata = { title: 'Créer une entreprise · Chantio' };

/**
 * « Créer une entreprise », en pleine page comme le bac (✕ ramène à « Gérer vos entreprises ») :
 * deux étapes (annuaire, puis fiche), puis l'écran « … est prête » (`?cree=1`, l'entreprise créée est ouverte).
 */
export default async function NouvelleEntreprise({ searchParams }: PageProps<'/entreprises/nouvelle'>) {
  const [{ membre, entreprise }, entreprises, { cree, identite, annuaire }] = await Promise.all([contexteBureau(), mesEntreprises(), searchParams]);

  if (!cree) {
    return (
      <PleinEcran className="bg-white">
        <CreationEntreprise miennes={entreprises.map((e) => ({ id: e.id, nom: e.nom, siren: e.siren }))} prenom={membre.prenom} nom={membre.nom ?? ''} />
      </PleinEcran>
    );
  }

  // Fin de la création (étape 3 du bac) : où en est la vérification d'identité, puis « Ouvrir … ».
  const statut = entreprise.identite_statut ?? 'a_verifier';
  const nomComplet = [membre.prenom, membre.nom].filter(Boolean).join(' ');
  let info: ReactNode;
  if (statut === 'verifiee')
    info = (
      <>
        <b>Identité vérifiée.</b> {nomComplet} est inscrit comme dirigeant au registre : rien d’autre à fournir.
      </>
    );
  else if (statut === 'en_attente')
    info = (
      <>
        <b>Vérification en cours.</b> Votre nom figure au registre : Chantio confirme votre identité sous peu. Tout fonctionne déjà, sauf la facturation
        électronique.
      </>
    );
  else
    info = (
      <>
        <b>Une dernière vérification.</b>{' '}
        {identite === 'indisponible'
          ? 'Le registre ne répond pas pour le moment.'
          : annuaire === '1'
            ? 'Votre nom n’apparaît pas parmi les dirigeants inscrits au registre.'
            : 'Cette entreprise n’est pas encore dans l’annuaire.'}{' '}
        Envoyez une pièce d’identité pour activer la facturation électronique. Tout le reste fonctionne déjà.
      </>
    );
  const verifiee = statut === 'verifiee';

  return (
    <PleinEcran className="bg-white">
      <BarrePleine titre="Créer une entreprise" retour="/entreprises" libelleRetour="Fermer et revenir à vos entreprises" />
      <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
        <i className="h-1 bg-cobalt" />
        <i className="h-1 bg-cobalt" />
      </div>
      <div className="mx-auto max-w-[760px] px-5 pt-9 pb-16 text-center max-[760px]:px-4 max-[760px]:pt-6">
        <span className="mb-3.5 inline-grid h-14 w-14 place-items-center rounded-full bg-vert-doux text-vert" aria-hidden="true">
          <Icone nom="coche" taille={28} />
        </span>
        <h2 className="mb-[22px] text-[28px] leading-tight font-extrabold max-[760px]:text-2xl">{entreprise.nom} est prête</h2>
        <p className="mb-5 flex items-start gap-2.5 rounded-[12px] bg-fond px-3.5 py-3 text-left text-[13.5px]">
          <Icone nom="bouclier" taille={20} className={`shrink-0 ${verifiee ? 'text-vert' : 'text-cobalt'}`} />
          <span>{info}</span>
        </p>
        <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
          {statut !== 'verifiee' && statut !== 'en_attente' && (
            <LienBouton href="/entreprises/identite" variante="secondaire">
              Vérifier mon identité
            </LienBouton>
          )}
          <LienBouton href="/">Ouvrir {entreprise.nom}</LienBouton>
        </div>
        <p className="mt-4 text-[13.5px] text-gris">Ensuite : ajoutez votre équipe et vos clients, ou importez-les depuis votre ancien logiciel.</p>
      </div>
    </PleinEcran>
  );
}
