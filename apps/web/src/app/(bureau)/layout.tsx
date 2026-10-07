import { cookies } from 'next/headers';
import { CadreBureau } from '@/components/cadre-bureau';
import type { Pastilles } from '@/components/navigation';
import { chargerAFaire } from '@/lib/a-faire';
import { COOKIE_MENU, lireEtatMenu } from '@/lib/menu';
import { liensProfils } from '@/lib/profils';
import { contexteBureau, mesEntreprises } from '@/lib/session';
import { quitterCompteClient } from '@/app/actions-acces';

export default async function LayoutBureau({ children }: LayoutProps<'/'>) {
  const { supabase, user, membre, entreprise } = await contexteBureau();
  const compter = (table: string, statut: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('statut', statut);
  const dirigeant = membre.role === 'dirigeant';
  const [entreprises, liens, { data: invitations }, { count: aPlanifier }, { count: aValider }, { count: recues }, magasin, aFaire, { data: equipeChantio }, { data: acces }] = await Promise.all([
    mesEntreprises(),
    liensProfils(supabase, [entreprise.logo_chemin]),
    supabase.rpc('invitations_recues'),
    compter('interventions', 'a_planifier'),
    compter('interventions', 'terminee'),
    compter('achats', 'recu'),
    cookies(),
    // Même calcul (mis en cache pour la requête) que la liste « À faire » de l'Accueil.
    chargerAFaire(),
    // Lien vers la console pour l'équipe Chantio (faux pour tous les autres).
    supabase.rpc('est_equipe_chantio'),
    // Demande ou accès en cours de l'équipe Chantio : bandeau en haut du bureau du dirigeant.
    dirigeant
      ? supabase
          .from('assistances')
          .select('*')
          .eq('entreprise_id', entreprise.id)
          .in('statut', ['demandee', 'acceptee'])
          .order('cree_le', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ]);
  const logo = entreprise.logo_chemin ? (liens.get(entreprise.logo_chemin) ?? null) : null;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  // Ce qui attend le bureau, affiché en pastille dans le menu (et la barre du bas du téléphone).
  const pastilles: Pastilles = {
    // Accueil : « 15 choses à faire, dont 2 urgentes », rouge s'il y a de l'urgent.
    '/': { n: aFaire.resume.n, titre: aFaire.resume.texte, urgent: aFaire.resume.u > 0 },
    '/interventions': {
      n: (aPlanifier ?? 0) + (aValider ?? 0),
      titre: [aPlanifier ? `${aPlanifier} à planifier` : '', aValider ? pluriel(aValider, 'fiche') + ' à valider' : ''].filter(Boolean).join(', '),
    },
    '/achats': { n: recues ?? 0, titre: `${pluriel(recues ?? 0, 'facture')} reçue${(recues ?? 0) > 1 ? 's' : ''} à vérifier` },
  };

  // Chiffres lus à l'heure de la requête : le bandeau disparaît à la page suivante quand l'accès expire.
  const maintenant = new Date().getTime();
  type Acces = { id: string; demandeur: string; motif: string; duree_minutes: number; mode?: string; statut: string; cree_le: string; fin: string | null };
  const lignes = (acces ?? []) as Acces[];
  const ouvert = lignes.find((a) => a.statut === 'acceptee' && a.fin && new Date(a.fin).getTime() > maintenant);
  const demande = lignes.find((a) => a.statut === 'demandee' && maintenant - new Date(a.cree_le).getTime() < 86_400_000);
  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(':', ' h ');
  const voir = (a: Acces) => (a.mode === 'modification' ? 'voir et modifier' : 'voir');
  // Équipier Chantio entré dans ce compte pour le paramétrer : il le sait, et peut en sortir.
  const bandeau = membre.assistance_id
    ? {
        ton: 'violet' as const,
        texte: `Vous êtes dans le compte de ${entreprise.nom} pour l’équipe Chantio${ouvert ? `, jusqu’au ${heure(ouvert.fin!)}` : ''}. Chaque modification est notée dans son journal.`,
        action: 'Quitter le compte',
        quitter: quitterCompteClient,
      }
    : demande
      ? { ton: 'violet' as const, texte: `${demande.demandeur} demande à ${voir(demande)} votre compte pour vous aider : « ${demande.motif} »`, action: 'Répondre' }
      : ouvert
        ? {
            ton: 'vert' as const,
            texte: `L’équipe Chantio peut ${voir(ouvert)} votre compte jusqu’au ${heure(ouvert.fin!)}${ouvert.mode === 'modification' ? '' : ', en lecture seule'}.`,
            action: 'Couper l’accès',
          }
        : null;

  return (
    <CadreBureau
      bandeau={bandeau}
      selecteur={{
        nom: entreprise.nom,
        logo,
        entreprises: entreprises.map(({ id, nom, role, active }) => ({ id, nom, role, active })),
        email: user.email ?? membre.email,
        prenomNom: [membre.prenom, membre.nom].filter(Boolean).join(' '),
        invitations: invitations?.length ?? 0,
        console: equipeChantio === true,
      }}
      pastilles={pastilles}
      menu={lireEtatMenu(magasin.get(COOKIE_MENU)?.value)}
      prenom={membre.prenom}
    >
      {children}
    </CadreBureau>
  );
}
