import { cookies } from 'next/headers';
import { CadreBureau } from '@/components/cadre-bureau';
import type { Pastilles } from '@/components/navigation';
import { chargerAFaire } from '@/lib/a-faire';
import { COOKIE_MENU, lireEtatMenu } from '@/lib/menu';
import { liensProfils } from '@/lib/profils';
import { contexteBureau, mesEntreprises } from '@/lib/session';

export default async function LayoutBureau({ children }: LayoutProps<'/'>) {
  const { supabase, user, membre, entreprise } = await contexteBureau();
  const compter = (table: string, statut: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('statut', statut);
  const [entreprises, liens, { data: invitations }, { count: aPlanifier }, { count: aValider }, { count: recues }, magasin, aFaire] = await Promise.all([
    mesEntreprises(),
    liensProfils(supabase, [entreprise.logo_chemin]),
    supabase.rpc('invitations_recues'),
    compter('interventions', 'a_planifier'),
    compter('interventions', 'terminee'),
    compter('achats', 'recu'),
    cookies(),
    // Même calcul (mis en cache pour la requête) que la liste « À faire » de l'Accueil.
    chargerAFaire(),
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

  return (
    <CadreBureau
      selecteur={{
        nom: entreprise.nom,
        logo,
        entreprises: entreprises.map(({ id, nom, role, active }) => ({ id, nom, role, active })),
        email: user.email ?? membre.email,
        prenomNom: [membre.prenom, membre.nom].filter(Boolean).join(' '),
        invitations: invitations?.length ?? 0,
      }}
      pastilles={pastilles}
      menu={lireEtatMenu(magasin.get(COOKIE_MENU)?.value)}
    >
      {children}
    </CadreBureau>
  );
}
