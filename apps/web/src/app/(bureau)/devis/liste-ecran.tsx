import { cookies } from 'next/headers';
import { aujourdhui } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';
import { ListeDocuments } from './liste';
import { lireClientsFenetre, lireListeDocuments } from './liste-donnees';
import { COOKIE_LISTE, lireMemoire, lirePeriode, lireSegment, lireType, type GenreListe } from './liste-regles';

type Params = Record<string, string | string[] | undefined>;
export const chaine = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** Écran commun à « Mes devis » et « Mes factures » (la page /factures l'appelle avec genre = facture). */
export async function EcranDocuments({ genre, sp }: { genre: GenreListe; sp: Params }) {
  const { supabase } = await contexteBureau();
  const jour = aujourdhui();
  const clientId = chaine(sp.client);
  const [lignes, clients, magasin] = await Promise.all([lireListeDocuments(supabase, genre, jour), lireClientsFenetre(supabase), cookies()]);
  const fiche = clientId ? clients.find((k) => k.id === clientId) : undefined;
  const client = fiche ? { id: fiche.id, nom: fiche.nom } : null;
  const q = chaine(sp.q)?.trim() ?? '';
  // Comme le bac : la croix de l'éditeur (?garder=1) retrouve la liste telle qu'on l'a laissée ;
  // le menu (ou un lien) la rouvre sans filtre, en gardant le tri et le nombre de résultats par page.
  const brut = magasin.get(COOKIE_LISTE)?.value;
  const memoire = lireMemoire(brut);
  return (
    <ListeDocuments
      // Chaque ouverture (menu, croix, lien) repart des critères lus ici, même si la liste était déjà affichée.
      key={`${brut ?? ''}|${JSON.stringify(sp)}`}
      genre={genre}
      lignes={lignes}
      aujourdhui={jour}
      client={client}
      clients={clients}
      memoire={memoire}
      garder={!!sp.garder && !client}
      initial={{
        segment: lireSegment(genre, chaine(sp.filtre)),
        type: lireType(genre, chaine(sp.type), chaine(sp.filtre)),
        periode: lirePeriode(chaine(sp.periode)),
        // Venue d'une fiche client : la recherche montre son nom et la liste ne garde que ses documents.
        q: q || client?.nom || '',
        nouveau: !!sp.nouveau,
        page: 1,
      }}
    />
  );
}
