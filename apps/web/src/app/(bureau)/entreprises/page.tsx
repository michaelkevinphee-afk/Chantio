import type { CSSProperties } from 'react';
import {
  LIBELLE_FORMULE,
  LIBELLE_IDENTITE,
  LIBELLE_ROLE,
  PRIX_FORMULE,
  TON_IDENTITE,
  type Formule,
  type MonEntreprise,
  type RoleMembre,
} from '@chantio/shared';
import { Icone } from '@/components/icones';
import { BoutonEnvoi, LienEnvoi } from '@/components/retour';
import { LienBouton, Panneau, Puce, Titre } from '@/components/ui';
import { contexteBureau, mesEntreprises } from '@/lib/session';
import { formaterNumero } from '@/lib/siret';
import { changerFormule, choisirEntreprise, rejoindre, traiterDemande } from './actions';

export const metadata = { title: 'Vos entreprises · Chantio' };

const MESSAGES_IDENTITE: Record<string, string> = {
  verifiee: 'Votre nom figure au registre : votre identité est vérifiée.',
  en_attente: 'Votre nom figure au registre : Chantio confirme votre identité sous peu.',
  absent: 'Votre nom n’apparaît pas parmi les dirigeants déclarés : déposez une pièce d’identité pour vérifier votre identité.',
  indisponible: 'Le registre ne répond pas : vous pourrez vérifier votre identité plus tard.',
  sans_siren: 'Pensez à vérifier votre identité dès que votre SIRET est attribué.',
};

const ROLES_PROPOSES: RoleMembre[] = ['technicien', 'assistant', 'chef_chantier', 'apprenti', 'sous_traitant', 'dirigeant'];

type Demande = { id: string; entreprise_id: string; user_id: string; email: string; prenom: string; nom: string | null; message: string | null; statut: string; cree_le: string };
type Invitation = { membre_id: string; entreprise: string; role: RoleMembre };

export default async function Entreprises({ searchParams }: PageProps<'/entreprises'>) {
  const { supabase, user } = await contexteBureau();
  const { cree, identite, demande, erreur } = await searchParams;
  const [entreprises, { data: demandesBrutes }, { data: invitationsBrutes }] = await Promise.all([
    mesEntreprises(),
    supabase.from('demandes_acces').select('*').eq('statut', 'en_attente').order('cree_le'),
    supabase.rpc('invitations_recues'),
  ]);
  const demandes = (demandesBrutes ?? []) as Demande[];
  const aTraiter = demandes.filter((d) => d.user_id !== user.id);
  const envoyees = demandes.filter((d) => d.user_id === user.id);
  const invitations = (invitationsBrutes ?? []) as Invitation[];
  const nomDe = (id: string) => entreprises.find((e) => e.id === id)?.nom ?? '';
  const aVerifier = entreprises.filter((e) => e.role === 'dirigeant' && e.identite_statut !== 'verifiee');

  return (
    <>
      <Titre
        sous="Passez de l’une à l’autre depuis le menu, en haut à gauche"
        actions={
          <LienBouton href="/entreprises/nouvelle">
            <Icone nom="plus" taille={18} /> Ajouter une entreprise
          </LienBouton>
        }
      >
        Vos entreprises
      </Titre>

      {cree && (
        <p className="apparition mb-6 rounded-[14px] bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          ✓ Entreprise créée, c’est celle qui est ouverte. {MESSAGES_IDENTITE[String(identite)] ?? ''}
        </p>
      )}
      {demande && (
        <p className="apparition mb-6 rounded-[14px] bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          ✓ Demande envoyée à {demande}. Son dirigeant va l’accepter et choisir votre rôle.
        </p>
      )}
      {erreur && <p className="apparition mb-6 rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}

      {aVerifier.length > 0 && (
        <div className="apparition carte mb-6 flex flex-wrap items-center gap-4 border-lavande bg-doux p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-cobalt">
            <Icone nom="bouclier" taille={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">Facturation électronique : je me mets en conformité</p>
            <p className="text-sm text-gris">
              Toutes les entreprises doivent pouvoir recevoir des factures électroniques dès septembre 2026, et les émettre en 2027
              pour les TPE et PME. Il faut d’abord vérifier l’identité du dirigeant.
            </p>
          </div>
          {aVerifier.some((e) => e.active && (e.identite_statut === 'a_verifier' || e.identite_statut === 'refusee')) && (
            <LienBouton href="/entreprises/identite" variante="secondaire">
              Vérifier mon identité
            </LienBouton>
          )}
        </div>
      )}

      {invitations.length > 0 && (
        <Panneau titre="Invitations reçues" nombre={invitations.length} className="apparition mb-6">
          <ul className="divide-y divide-trait">
            {invitations.map((i) => (
              <li key={i.membre_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{i.entreprise}</span>
                  <span className="text-sm text-gris">Vous invite comme {LIBELLE_ROLE[i.role].toLowerCase()}</span>
                </span>
                <form action={rejoindre.bind(null, i.membre_id)}>
                  <BoutonEnvoi className="!px-4 !py-2 text-sm" enCours="…">
                    Rejoindre
                  </BoutonEnvoi>
                </form>
              </li>
            ))}
          </ul>
        </Panneau>
      )}

      {aTraiter.length > 0 && (
        <Panneau titre="Demandes d’accès" nombre={aTraiter.length} className="apparition mb-6">
          <ul className="divide-y divide-trait">
            {aTraiter.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">
                    {d.prenom} {d.nom}
                    <span className="font-semibold text-gris"> · {d.email}</span>
                  </span>
                  <span className="block text-sm text-gris">
                    Veut rejoindre <b className="text-encre">{nomDe(d.entreprise_id)}</b>
                    {d.message && ` · « ${d.message} »`}
                  </span>
                </span>
                <form action={traiterDemande.bind(null, d.id, true)} className="flex items-center gap-2">
                  <select name="role" defaultValue="technicien" className="champ !w-auto !py-2 text-sm" aria-label="Rôle">
                    {ROLES_PROPOSES.map((r) => (
                      <option key={r} value={r}>
                        {LIBELLE_ROLE[r]}
                      </option>
                    ))}
                  </select>
                  <BoutonEnvoi className="!px-4 !py-2 text-sm" enCours="…">
                    Accepter
                  </BoutonEnvoi>
                </form>
                <form action={traiterDemande.bind(null, d.id, false)}>
                  <LienEnvoi className="text-sm font-bold text-gris hover:text-rouge">Refuser</LienEnvoi>
                </form>
              </li>
            ))}
          </ul>
        </Panneau>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {entreprises.map((e, n) => (
          <CarteEntreprise key={e.id} e={e} n={n} />
        ))}
      </div>

      {envoyees.length > 0 && (
        <Panneau titre="Vos demandes en attente" nombre={envoyees.length} className="apparition mt-6">
          <ul className="divide-y divide-trait">
            {envoyees.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                <span className="flex-1">Demande envoyée le {new Date(d.cree_le).toLocaleDateString('fr-FR')}</span>
                <Puce ton="violet">En attente du dirigeant</Puce>
              </li>
            ))}
          </ul>
        </Panneau>
      )}
    </>
  );
}

function CarteEntreprise({ e, n }: { e: MonEntreprise; n: number }) {
  const dirigeant = e.role === 'dirigeant';
  const lieu = [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return (
    <section style={{ '--i': n } as CSSProperties} className={`apparition carte flex flex-col p-5 ${e.active ? 'ring-2 ring-cobalt' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bleu-doux text-xl font-extrabold text-bleu">
          {e.nom.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{e.nom}</p>
          <p className="text-sm text-gris">
            {[e.forme_juridique, e.siret ? `SIRET ${formaterNumero(e.siret)}` : e.siren ? `SIREN ${formaterNumero(e.siren)}` : 'SIRET à renseigner']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {e.active && <Puce ton="cobalt">Ouverte</Puce>}
      </div>

      <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {lieu && (
          <>
            <dt className="text-gris">Adresse</dt>
            <dd className="font-semibold">{lieu}</dd>
          </>
        )}
        <dt className="text-gris">Votre rôle</dt>
        <dd>
          <Puce ton={dirigeant ? 'bleu' : 'gris'}>{LIBELLE_ROLE[e.role]}</Puce>
        </dd>
        <dt className="text-gris">Formule</dt>
        <dd className="font-semibold">
          {dirigeant && e.active ? (
            <span className="inline-flex flex-wrap gap-1 rounded-[12px] border border-trait bg-white p-0.5">
              {(Object.keys(LIBELLE_FORMULE) as Formule[]).map((f) => (
                <form key={f} action={changerFormule.bind(null, e.id, f)}>
                  <button
                    title={PRIX_FORMULE[f]}
                    className={`rounded-[10px] px-2.5 py-1 text-xs font-extrabold transition ${e.formule === f ? 'degrade text-white' : 'text-gris hover:text-encre'}`}
                  >
                    {LIBELLE_FORMULE[f]}
                  </button>
                </form>
              ))}
            </span>
          ) : (
            `${LIBELLE_FORMULE[e.formule]} · ${PRIX_FORMULE[e.formule]}`
          )}
        </dd>
        {dirigeant && (
          <>
            <dt className="text-gris">Identité du dirigeant</dt>
            <dd>
              <Puce ton={TON_IDENTITE[e.identite_statut]}>{LIBELLE_IDENTITE[e.identite_statut]}</Puce>
              {e.identite_statut === 'refusee' && e.identite_motif && <span className="mt-1 block text-xs text-rouge">{e.identite_motif}</span>}
            </dd>
            <dt className="text-gris">Facturation électronique</dt>
            <dd className="text-gris">{e.identite_statut === 'verifiee' ? 'Bientôt disponible' : 'Après vérification de l’identité'}</dd>
          </>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {e.active ? (
          dirigeant &&
          (e.identite_statut === 'a_verifier' || e.identite_statut === 'refusee') && (
            <LienBouton href="/entreprises/identite" className="!px-4 !py-2 text-sm">
              <Icone nom="bouclier" taille={16} /> Vérifier mon identité
            </LienBouton>
          )
        ) : (
          <form action={choisirEntreprise.bind(null, e.id, '/entreprises')}>
            <BoutonEnvoi variante="secondaire" className="!px-4 !py-2 text-sm" enCours="Ouverture…">
              Ouvrir cette entreprise
            </BoutonEnvoi>
          </form>
        )}
      </div>
    </section>
  );
}
