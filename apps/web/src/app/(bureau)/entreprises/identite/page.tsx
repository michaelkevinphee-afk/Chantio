import { LIBELLE_IDENTITE, TON_IDENTITE, type Entreprise } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { BoutonEnvoi } from '@/components/retour';
import { BarrePleine } from '@/components/barre-pleine';
import { PleinEcran } from '@/components/plein-ecran';
import { LienBouton, Puce } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { formaterNumero } from '@/lib/siret';
import { definirSiren, verifierRegistre } from '../actions';
import { Justificatifs } from './justificatifs';

export const metadata = { title: 'Vérifier mon identité · Chantio' };

const RESULTATS: Record<string, { ton: 'vert' | 'rouge'; texte: string }> = {
  verifiee: { ton: 'vert', texte: '✓ Votre nom figure au registre : votre identité est vérifiée.' },
  en_attente: { ton: 'vert', texte: '✓ Votre nom figure au registre. Chantio confirme votre identité sous peu.' },
  absent: { ton: 'rouge', texte: 'Votre nom n’apparaît pas parmi les dirigeants déclarés. Déposez vos justificatifs ci-dessous.' },
  indisponible: { ton: 'rouge', texte: 'Le registre ne répond pas pour le moment. Réessayez plus tard ou déposez vos justificatifs.' },
};

const CORPS = 'mx-auto max-w-2xl px-5 pt-10 pb-16 max-[760px]:px-4 max-[760px]:pt-6 max-[760px]:pb-12';

// Vérification d'identité du dirigeant de l'entreprise ouverte :
// au registre si son nom figure parmi les dirigeants déclarés, sinon par justificatifs.
export default async function Identite({ searchParams }: PageProps<'/entreprises/identite'>) {
  const { membre, entreprise } = await contexteBureau();
  const { registre, erreur } = await searchParams;
  const e = entreprise as Entreprise;
  const statut = e.identite_statut ?? 'a_verifier';
  const resultat = registre ? RESULTATS[String(registre)] : null;

  if (membre.role !== 'dirigeant') {
    return (
      <PleinEcran className="bg-white">
        <BarrePleine titre="Vérifier mon identité" retour="/entreprises" libelleRetour="Fermer et revenir à vos entreprises" />
        <div className={CORPS}>
          <p className="carte p-5 text-gris">Seul le dirigeant de {e.nom} peut vérifier son identité.</p>
        </div>
      </PleinEcran>
    );
  }

  return (
    <PleinEcran className="bg-white">
      <BarrePleine titre="Vérifier mon identité" retour="/entreprises" libelleRetour="Fermer et revenir à vos entreprises" />
      <div className={`${CORPS} space-y-6`}>
        <p className="text-gris">{e.nom}</p>

        {resultat && <p className={`apparition rounded-[14px] px-4 py-3 text-sm font-semibold ${resultat.ton === 'vert' ? 'bg-vert-doux text-vert' : 'bg-rouge-doux text-rouge'}`}>{resultat.texte}</p>}
        {erreur && <p className="apparition rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}

        <section className="apparition carte flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-doux text-cobalt">
            <Icone nom="bouclier" taille={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">
              {membre.prenom} {membre.nom}
            </p>
            <p className="text-sm text-gris">Dirigeant de {e.nom}{e.siren ? ` · SIREN ${formaterNumero(e.siren)}` : ''}</p>
          </div>
          <Puce ton={TON_IDENTITE[statut]}>{LIBELLE_IDENTITE[statut]}</Puce>
        </section>

        {statut === 'verifiee' && (
          <p className="carte p-5 text-sm">
            C’est fait : l’identité du dirigeant est vérifiée. La facturation électronique pourra être activée dès qu’elle sera disponible dans Chantio.
          </p>
        )}
        {statut === 'en_attente' && (
          <p className="carte p-5 text-sm">
            Votre demande est entre les mains de Chantio. Vous pouvez continuer à utiliser la plateforme normalement en attendant.
          </p>
        )}

        {(statut === 'a_verifier' || statut === 'refusee') && (
          <>
            <section className="apparition carte space-y-3 p-5" style={{ '--i': 1 } as React.CSSProperties}>
              <p className="text-xs font-bold tracking-[0.08em] text-gris uppercase">1. Au registre, en un clic</p>
              {e.siren ? (
                <>
                  <p className="text-sm text-gris">
                    Si votre prénom et votre nom figurent parmi les dirigeants déclarés de l’entreprise, votre identité est vérifiée tout de suite.
                  </p>
                  <form action={verifierRegistre}>
                    <BoutonEnvoi enCours="Vérification…">Vérifier au registre</BoutonEnvoi>
                  </form>
                </>
              ) : (
                <form action={definirSiren} className="space-y-2">
                  <label className="etiquette" htmlFor="siren">
                    SIREN de l’entreprise
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input id="siren" name="siren" className="champ max-w-xs" inputMode="numeric" pattern="\s*(\d\s*){9}" title="9 chiffres" placeholder="123 456 789" required />
                    <BoutonEnvoi enCours="Recherche…">Renseigner</BoutonEnvoi>
                  </div>
                  <p className="text-xs text-gris">La fiche (adresse, forme juridique, TVA) est reprise de l’annuaire officiel.</p>
                </form>
              )}
            </section>

            <section className="apparition carte space-y-3 p-5" style={{ '--i': 2 } as React.CSSProperties}>
              <p className="text-xs font-bold tracking-[0.08em] text-gris uppercase">2. Sinon, par justificatifs</p>
              <p className="text-sm text-gris">
                Une pièce d’identité (carte, passeport) et un Kbis de moins de 3 mois, ou le pouvoir signé par le représentant légal. Les fichiers ne sont
                visibles que des dirigeants et de Chantio.
              </p>
              <Justificatifs entrepriseId={e.id} />
            </section>
          </>
        )}

        <LienBouton href="/entreprises" variante="secondaire">
          Retour à vos entreprises
        </LienBouton>
      </div>
    </PleinEcran>
  );
}
