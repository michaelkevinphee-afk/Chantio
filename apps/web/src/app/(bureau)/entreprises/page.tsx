import type { ReactNode } from 'react';
import Link from 'next/link';
import { libelleAcces, LIBELLE_FORMULE, type MonEntreprise, type ReglagesFacturation, type RoleMembre } from '@chantio/shared';
import { BarrePleine } from '@/components/barre-pleine';
import { Icone } from '@/components/icones';
import { PleinEcran } from '@/components/plein-ecran';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton, Puce } from '@/components/ui';
import { contexteBureau, mesEntreprises } from '@/lib/session';
import { formaterNumero } from '@/lib/siret';
import { adresseComplete } from '../parametres/valeurs';
import { choisirEntreprise, rejoindre } from './actions';
import { BandeauPdp, ReponseDemande } from './fenetres';

export const metadata = { title: 'Gérer vos entreprises · Chantio' };

const MESSAGES_IDENTITE: Record<string, string> = {
  verifiee: 'Votre nom figure au registre : votre identité est vérifiée.',
  en_attente: 'Votre nom figure au registre : Chantio confirme votre identité sous peu.',
  absent: 'Votre nom n’apparaît pas parmi les dirigeants déclarés : déposez une pièce d’identité pour vérifier votre identité.',
  indisponible: 'Le registre ne répond pas : vous pourrez vérifier votre identité plus tard.',
  sans_siren: 'Pensez à vérifier votre identité dès que votre SIRET est attribué.',
};

type Demande = { id: string; entreprise_id: string; user_id: string; email: string; prenom: string; nom: string | null; message: string | null; statut: string; cree_le: string };
type Invitation = { membre_id: string; entreprise: string; role: RoleMembre; cree_le: string };

const date = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const BANDEAU = 'apparition mb-6 rounded-[14px] px-4 py-3 text-sm font-semibold';
// Petits boutons des lignes (Rejoindre, Accepter, Refuser), comme « bouton petit » du bac.
const PETIT = '!rounded-[10px] !px-3 !py-1.5 !text-[13px]';

/**
 * Gérer vos entreprises, en pleine page comme le bac : une carte par entreprise (avec ses demandes d'accès
 * et le bandeau de la facturation électronique), les invitations reçues au-dessus, ✕ pour revenir.
 */
export default async function Entreprises({ searchParams }: PageProps<'/entreprises'>) {
  const { supabase, user, entreprise: active } = await contexteBureau();
  const { cree, identite, demande, erreur, depuis } = await searchParams;
  const [entreprises, { data: demandesBrutes }, { data: invitationsBrutes }] = await Promise.all([
    mesEntreprises(),
    supabase.from('demandes_acces').select('*').eq('statut', 'en_attente').order('cree_le'),
    supabase.rpc('invitations_recues'),
  ]);
  const demandes = (demandesBrutes ?? []) as Demande[];
  const envoyees = demandes.filter((d) => d.user_id === user.id);
  const invitations = (invitationsBrutes ?? []) as Invitation[];
  // Seuls les réglages de l'entreprise ouverte sont lisibles (SIRET en cours d'attribution, facturation électronique).
  const reglages = (active.facturation ?? {}) as ReglagesFacturation;
  const retour = depuis === 'profil' ? '/parametres?rubrique=profil' : '/';

  return (
    <PleinEcran className="bg-white">
      <BarrePleine titre="Gérer vos entreprises" retour={retour} libelleRetour="Fermer et revenir à l’écran d’avant" />
      <div className="mx-auto max-w-[1000px] px-5 pt-10 pb-16 max-[760px]:px-4 max-[760px]:pt-6 max-[760px]:pb-12">
        <h2 className="text-[32px] leading-tight font-extrabold max-[760px]:text-2xl">Votre espace multi-entreprises Chantio</h2>
        <p className="mt-2.5 mb-[30px] max-w-[72ch] text-base text-gris max-[760px]:mb-[22px] max-[760px]:text-[14.5px]">
          Chaque entreprise a ses propres clients, interventions, devis, factures, achats et sa propre équipe. Vous passez de l’une à l’autre en haut du
          menu, sans vous reconnecter.
        </p>

        {cree && (
          <p className={`${BANDEAU} bg-vert-doux text-vert`}>
            ✓ Entreprise créée, c’est celle qui est ouverte. {MESSAGES_IDENTITE[String(identite)] ?? ''}
          </p>
        )}
        {demande && (
          <p className={`${BANDEAU} bg-vert-doux text-vert`}>✓ Demande envoyée à {demande}. Son dirigeant va l’accepter et choisir votre rôle.</p>
        )}
        {erreur && <p className={`${BANDEAU} bg-rouge-doux text-rouge`}>{erreur}</p>}

        {invitations.length > 0 && (
          <section aria-labelledby="ge-inv" className="mb-[26px] flex flex-col gap-2">
            <h3 id="ge-inv" className="text-lg font-extrabold">
              Invitations en attente
            </h3>
            {invitations.map((i) => (
              <Ligne
                key={i.membre_id}
                titre={
                  <>
                    <b className="font-extrabold">{i.entreprise}</b> vous invite comme {libelleAcces(i.role).toLowerCase()}
                  </>
                }
                detail={`Invitation de son dirigeant le ${date(i.cree_le)}`}
              >
                <form action={rejoindre.bind(null, i.membre_id)}>
                  <BoutonEnvoi className={PETIT} enCours="…">
                    Rejoindre
                  </BoutonEnvoi>
                </form>
              </Ligne>
            ))}
          </section>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[22px] font-extrabold">Vos entreprises ({entreprises.length})</h3>
          <LienBouton href="/entreprises/nouvelle">
            <span aria-hidden="true">+</span> Ajouter une entreprise
          </LienBouton>
        </div>

        {/* L'entreprise ouverte en premier, comme le bac. */}
        {[...entreprises].sort((a, b) => Number(b.active) - Number(a.active)).map((e) => (
          <CarteEntreprise
            key={e.id}
            e={e}
            reglages={e.active ? reglages : null}
            demandes={e.role === 'dirigeant' ? demandes.filter((d) => d.entreprise_id === e.id && d.user_id !== user.id) : []}
          />
        ))}

        {envoyees.length > 0 && (
          <section aria-labelledby="ge-env" className="mt-[26px] flex flex-col gap-2">
            <h3 id="ge-env" className="text-lg font-extrabold">
              Vos demandes en attente
            </h3>
            {envoyees.map((d) => (
              <Ligne key={d.id} titre={`Demande envoyée le ${date(d.cree_le)}`}>
                <Puce ton="violet">En attente du dirigeant</Puce>
              </Ligne>
            ))}
          </section>
        )}

        <p className="mt-2.5 text-sm text-gris">Chaque entreprise a sa propre formule (Artisan, Équipe ou Entreprise).</p>
      </div>
    </PleinEcran>
  );
}

/** Ligne sur fond gris (invitation, demande d'accès) : texte à gauche, boutons à droite, qui passent dessous si la place manque. */
function Ligne({ titre, detail, children }: { titre: ReactNode; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[12px] bg-fond px-3 py-2.5">
      <span className="flex min-w-0 flex-[1_1_260px] flex-col [overflow-wrap:anywhere]">
        <span>{titre}</span>
        {detail && <small className="text-[13px] text-gris">{detail}</small>}
      </span>
      {children}
    </div>
  );
}

function EtatIdentite({ e }: { e: MonEntreprise }) {
  switch (e.identite_statut) {
    case 'verifiee':
      return <Puce ton="vert">{e.identite_mode === 'registre' ? 'Vérifiée au registre' : 'Vérifiée'}</Puce>;
    case 'en_attente':
      return <Puce ton="cobalt">Vérification en cours</Puce>;
    case 'refusee':
      return <Puce ton="rouge">Vérification refusée</Puce>;
    default:
      return <Puce ton="violet">À vérifier</Puce>;
  }
}

function CarteEntreprise({ e, reglages, demandes }: { e: MonEntreprise; reglages: ReglagesFacturation | null; demandes: Demande[] }) {
  const dirigeant = e.role === 'dirigeant';
  const attente = !!reglages?.siret_attente;
  const pdp = reglages?.pdp;
  const aVerifier = e.identite_statut === 'a_verifier' || e.identite_statut === 'refusee';
  const lien = 'font-bold text-cobalt hover:underline';

  return (
    <article aria-labelledby={`ge-${e.id}`} className="mb-[18px] overflow-hidden rounded-[18px] border border-trait bg-white">
      <div className="flex gap-4 px-[22px] py-5 max-[760px]:flex-wrap max-[760px]:p-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-doux text-cobalt" aria-hidden="true">
          <Icone nom="p_immeuble" taille={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-gris [overflow-wrap:anywhere] [&_b]:text-encre">
          <h3 id={`ge-${e.id}`} className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-encre">
            {e.nom}
            {e.active && <Puce ton="cobalt">Ouverte</Puce>}
          </h3>
          <p>
            <b>Siret :</b> {attente ? 'en cours d’attribution' : e.siret ? formaterNumero(e.siret) : '—'}
          </p>
          <p>
            <b>Adresse :</b> {adresseComplete(e) || '—'}
          </p>
          <p>
            <b>Votre rôle :</b> {libelleAcces(e.role)} · formule {LIBELLE_FORMULE[e.formule]}
          </p>
          {dirigeant && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <b>Identité du dirigeant :</b> <EtatIdentite e={e} />
              {aVerifier &&
                (e.active ? (
                  <Link href="/entreprises/identite" className={lien}>
                    Vérifier mon identité
                  </Link>
                ) : (
                  <form action={choisirEntreprise.bind(null, e.id, '/entreprises/identite')} className="contents">
                    <button className={lien}>Vérifier mon identité</button>
                  </form>
                ))}
              {e.identite_statut === 'refusee' && e.identite_motif && <span className="w-full text-[13px] text-rouge">{e.identite_motif}</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <b>Adresse de facturation électronique :</b>{' '}
            {!reglages ? (
              <span className="text-[13px]">visible une fois l’entreprise ouverte</span>
            ) : pdp?.statut === 'inscrite' ? (
              <>
                <Puce ton="vert">Inscrite</Puce> <span className="font-mono text-[13px]">{e.siren ? formaterNumero(e.siren) : ''}</span>
              </>
            ) : pdp?.statut === 'demandee' ? (
              <Puce ton="bleu">Inscription demandée le {date(pdp.le)}</Puce>
            ) : (
              <Puce ton="gris">Non inscrit</Puce>
            )}
          </div>
          {demandes.length > 0 && (
            <div className="mt-1 flex flex-col gap-2 border-t border-trait pt-3 text-encre">
              <b className="font-extrabold">
                {demandes.length} {demandes.length > 1 ? 'demandes d’accès' : 'demande d’accès'}
              </b>
              {demandes.map((d) => {
                const nom = [d.prenom, d.nom].filter(Boolean).join(' ');
                return (
                  <Ligne
                    key={d.id}
                    titre={
                      <>
                        <b className="font-extrabold">{nom}</b> · {d.email}
                      </>
                    }
                    detail={`Demande l’accès le ${date(d.cree_le)}${d.message ? ` : « ${d.message} »` : ''}`}
                  >
                    <ReponseDemande id={d.id} nom={nom} email={d.email} entreprise={e.nom} />
                  </Ligne>
                );
              })}
            </div>
          )}
        </div>
        {!e.active && (
          <form action={choisirEntreprise.bind(null, e.id, '/')} className="flex-none max-[760px]:w-full">
            <BoutonEnvoi variante="secondaire" className="max-[760px]:w-full" enCours="Ouverture…">
              Ouvrir
            </BoutonEnvoi>
          </form>
        )}
      </div>
      {dirigeant && pdp?.statut !== 'inscrite' && pdp?.statut !== 'demandee' && (
        <BandeauPdp
          e={{
            id: e.id,
            nom: e.nom,
            siren: e.siren ? formaterNumero(e.siren) : '',
            active: e.active,
            identite: e.identite_statut,
            siret: !!e.siret && !attente,
          }}
        />
      )}
    </article>
  );
}
