import Link from 'next/link';
import { COULEUR_SANS_TECHNICIEN, LIBELLE_ROLE, type Membre, type ReglagesFacturation } from '@chantio/shared';
import { AvatarTechnicien, techniciensTerrain } from '@/components/accueil/techniciens';
import { Puce } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import type { contexteBureau } from '@/lib/session';
import { ActionsMembre, AnnonceRetour, FenetreMembre, type FicheMembre } from './fiche-membre';
import { Note } from './elements';

type Contexte = Awaited<ReturnType<typeof contexteBureau>>;
type Etat = 'actif' | 'invite' | 'desactive';
const ORDRE: Record<Etat, number> = { actif: 0, invite: 1, desactive: 2 };
const etatDe = (m: Membre): Etat => (!m.actif ? 'desactive' : m.user_id ? 'actif' : 'invite');
const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Paramètres › Membres : la liste du bac, les fenêtres Nouveau / Modifier, les retours d'invitation. */
export async function RubriqueMembres({ ctx, sp }: { ctx: Contexte; sp: Record<string, string | string[] | undefined> }) {
  const { supabase, entreprise, membre: moi } = ctx;
  const [{ data }, { count: demandes }] = await Promise.all([
    supabase.from('membres').select('*').order('cree_le'),
    supabase.from('demandes_acces').select('id', { count: 'exact', head: true }).eq('entreprise_id', entreprise.id).eq('statut', 'en_attente'),
  ]);
  // Actifs, invités, puis désactivés ; dans chaque groupe l'ordre des couleurs (dirigeant, arrivée, prénom),
  // comme le bac (état puis couleur) : des membres ajoutés ensemble gardent toujours la même place.
  const membres = ((data ?? []) as Membre[]).sort(
    (a, b) =>
      ORDRE[etatDe(a)] - ORDRE[etatDe(b)] ||
      Number(b.role === 'dirigeant') - Number(a.role === 'dirigeant') ||
      String(a.cree_le).localeCompare(String(b.cree_le)) ||
      a.prenom.localeCompare(b.prenom, 'fr'),
  );
  const liens = await liensProfils(
    supabase,
    membres.map((m) => m.photo_chemin),
  );
  // Avatar à la couleur du technicien, comme avatar(m) du bac : la même couleur qu'au Planning
  // (membres actifs de terrain) ; gris pour les assistant(e)s et les comptes désactivés.
  const couleurs = new Map(techniciensTerrain(membres.filter((m) => m.actif)).map((t) => [t.id, t.couleur]));
  const metiers = ((entreprise.facturation ?? {}) as ReglagesFacturation).metiers_membres ?? {};
  const fiche = (m: Membre): FicheMembre => ({
    id: m.id,
    prenom: m.prenom,
    nom: m.nom ?? '',
    email: m.email,
    telephone: m.telephone ?? '',
    role: m.role,
    metier: metiers[m.id] ?? '',
    heures: Number(m.heures_semaine ?? 35),
    compte: !!m.user_id,
    moi: m.id === moi.id,
  });

  const erreur = premier(sp.erreur);
  const invite = premier(sp.invite);
  const renvoi = premier(sp.renvoi);
  const sansmail = premier(sp.sansmail);
  const aModifier = premier(sp.modifier) ? membres.find((m) => m.id === premier(sp.modifier)) : undefined;
  const fenetreOuverte = !!premier(sp.nouveau) || !!aModifier;

  return (
    <div className="pt-4">
      {!!demandes && (
        <Link href="/entreprises" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-violet-doux px-4 py-3 text-sm font-semibold text-violet">
          {demandes} {demandes > 1 ? 'personnes demandent' : 'personne demande'} à rejoindre {entreprise.nom}.
          <span className="ml-auto font-extrabold underline">Répondre</span>
        </Link>
      )}
      {erreur && !fenetreOuverte && <p className="mb-4 rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}
      {invite && (
        <p className="mb-4 rounded-[14px] bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          {sansmail
            ? `${invite} fait partie de l’équipe, mais l’e-mail n’a pas pu partir (${sansmail}). Dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » avec son adresse.`
            : `✓ Invitation envoyée à ${invite}. Un e-mail avec un code vient de partir : dites-lui d’installer l’appli Chantio et de toucher « Première connexion ou mot de passe oublié » (pensez aux spams).`}
        </p>
      )}
      {renvoi && (
        <p className={`mb-4 rounded-[14px] px-4 py-3 text-sm font-semibold ${sansmail ? 'bg-rouge-doux text-rouge' : 'bg-vert-doux text-vert'}`}>
          {sansmail ? `L’e-mail pour ${renvoi} n’a pas pu partir : ${sansmail}.` : `Invitation renvoyée à ${renvoi}, avec un nouveau code. Pensez aux spams.`}
        </p>
      )}

      {membres.length ? (
        <ul className="flex flex-col">
          {membres.map((m) => {
            const etat = etatDe(m);
            const nom = [m.prenom, m.nom].filter(Boolean).join(' ');
            return (
              <li
                key={m.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-b border-trait px-1 py-3 min-[1300px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_minmax(0,0.9fr)_76px] min-[1300px]:gap-x-3 min-[1300px]:gap-y-2 ${
                  etat === 'desactive' ? '[&>*:not(:last-child)]:opacity-55' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <AvatarTechnicien prenom={m.prenom} nom={m.nom} couleur={couleurs.get(m.id) ?? COULEUR_SANS_TECHNICIEN} photo={m.photo_chemin ? liens.get(m.photo_chemin) : null} taille={34} />
                  <span className="min-w-0">
                    <b className="block truncate font-extrabold">{nom}</b>
                    <small className="block truncate text-xs font-medium text-gris">{m.email}</small>
                  </span>
                </span>
                <span className="col-span-full text-[13px] min-[1300px]:col-span-1 min-[1300px]:text-sm">
                  <b className="font-extrabold">{LIBELLE_ROLE[m.role]}</b>
                  {metiers[m.id] && <small className="block text-xs font-medium text-gris">{metiers[m.id]}</small>}
                </span>
                <span className="col-span-full text-[13px] tabular-nums min-[1300px]:col-span-1 min-[1300px]:text-sm">{m.telephone || '—'}</span>
                <span className="col-span-full text-[13px] min-[1300px]:col-span-1 min-[1300px]:text-sm">
                  {m.role !== 'assistant' ? `Oui · ${String(Number(m.heures_semaine ?? 35)).replace('.', ',')} h / sem.` : 'Non'}
                </span>
                <span className="col-start-2 row-start-1 justify-self-end min-[1300px]:col-start-auto min-[1300px]:row-start-auto">
                  {etat === 'actif' ? <Puce ton="vert">Actif</Puce> : etat === 'invite' ? <Puce ton="violet">Invité</Puce> : <Puce>Désactivé</Puce>}
                </span>
                <span className="col-span-full flex flex-wrap gap-1.5">
                  <ActionsMembre id={m.id} nom={nom} prenom={m.prenom} etat={etat} dirigeant={m.role === 'dirigeant'} moi={m.id === moi.id} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-gris">Aucun collaborateur. Commencez par vous-même avec « Nouveau collaborateur ».</p>
      )}
      <Note className="mt-3">
        Chaque invitation part par e-mail. La personne crée son compte avec cette adresse, valide le code reçu, puis rejoint l’entreprise avec son rôle. Si elle
        a déjà un compte Chantio, l’entreprise s’ajoute à ses autres entreprises.
      </Note>

      {premier(sp.modifie) && <AnnonceRetour message="Enregistré" adresse="/parametres?rubrique=membres" />}
      {fenetreOuverte && <FenetreMembre membre={aModifier ? fiche(aModifier) : undefined} erreur={erreur} key={aModifier?.id ?? 'nouveau'} />}
    </div>
  );
}
