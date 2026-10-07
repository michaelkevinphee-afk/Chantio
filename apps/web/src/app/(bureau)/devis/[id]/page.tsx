import Link from 'next/link';
import { notFound } from 'next/navigation';
import { aujourdhui, libelleDocument, nomClient, statutDocument } from '@chantio/shared';
import { BarrePleine } from '@/components/barre-pleine';
import { PleinEcran } from '@/components/plein-ecran';
import { Puce } from '@/components/ui';
import { lireDocument } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { chargerContexteEditeur, chargerLiens, lignesAvecForfaits } from '../charger';
import { Editeur } from '../editeur';

export const metadata = { title: 'Devis et factures · Chantio' };

/**
 * Éditeur plein écran d'un devis, d'une facture ou d'un avoir (vEditeur du bac). La croix ramène aux devis
 * ou aux factures ; ?facturer=1 ouvre la fenêtre « Facturer le devis » ; ?retour=client ramène à la fiche du client, ?retour=/chemin à l'écran d'où l'on vient.
 */
export default async function PageDocument({ params, searchParams }: PageProps<'/devis/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, entreprise } = await contexteBureau();
  const reglages = entreprise.facturation ?? {};
  const lu = await lireDocument(supabase, id, reglages);
  if (!lu) notFound();
  const { document: d } = lu;
  const lignes = lignesAvecForfaits(d, lu.lignes);
  const [ctx, liens] = await Promise.all([chargerContexteEditeur(supabase, entreprise), chargerLiens(supabase, d)]);

  const facture = d.genre === 'facture';
  const brut = typeof sp.retour === 'string' ? sp.retour : '';
  const client = ctx.clients.find((k) => k.id === d.client_id) ?? null;
  const ficheClient = brut === 'client' && d.client_id;
  // Seulement un chemin de l'application (jamais une adresse extérieure).
  const chemin = brut.startsWith('/') && !brut.startsWith('//') && !brut.includes('\\') ? brut : null;
  // La croix ramène à la liste telle qu'on l'a laissée (?garder=1 : compteur, recherche, tri et page, comme le bac).
  const retour = ficheClient ? `/clients/${d.client_id}` : (chemin ?? (facture ? '/factures?garder=1' : '/devis?garder=1'));
  const libelleRetour = ficheClient
    ? 'Fermer et revenir à la fiche du client'
    : chemin
      ? 'Fermer et revenir à l’écran précédent'
      : facture
        ? 'Fermer et revenir aux factures'
        : 'Fermer et revenir aux devis';
  const st = statutDocument(d);

  return (
    <PleinEcran>
      <BarrePleine
        retour={retour}
        libelleRetour={libelleRetour}
        statut={<Puce ton={st.ton}>{st.libelle}</Puce>}
        titre={
          <>
            {libelleDocument(d)}
            {d.numero && (
              <>
                {' N° '}
                <span className="font-mono">{d.numero}</span>
              </>
            )}
          </>
        }
        gauche={
          ficheClient ? (
            <Link href={retour} className="font-bold text-cobalt hover:underline">
              ← Fiche de {client?.nom ?? nomClient(d.client)}
            </Link>
          ) : undefined
        }
      />
      <div className="df">
        <Editeur
          key={`${d.id}-${d.numero ?? ''}-${d.statut}`}
          doc={{ ...d, lignes }}
          liens={liens}
          clients={ctx.clients}
          articles={ctx.articles}
          entreprise={ctx.entreprise}
          retour={retour}
          aujourdhui={aujourdhui()}
          ouvrirFacturer={sp.facturer === '1'}
          modeles={{
            objet: (facture ? reglages.mail_facture_objet : reglages.mail_devis_objet) || '',
            texte: (facture ? reglages.mail_facture_texte : reglages.mail_devis_texte) || '',
          }}
        />
      </div>
    </PleinEcran>
  );
}
