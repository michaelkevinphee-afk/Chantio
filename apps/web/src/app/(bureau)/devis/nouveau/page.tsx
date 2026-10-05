import { BarrePleine } from '@/components/barre-pleine';
import { PleinEcran } from '@/components/plein-ecran';
import type { Preremplissage } from '../actions';
import { CreationBrouillon } from './creation';

export const metadata = { title: 'Nouveau document · Chantio' };

/**
 * /devis/nouveau (contrat n° 4) : ?client=<id> (&site=<id>), ?genre=facture|devis, ?type=<type de facture>,
 * ?parcours=depannage|chantier|contrat, ?intervention=<id> ou ?import=<id>. Le brouillon prérempli est
 * créé puis ouvert dans l'éditeur.
 */
export default async function NouveauDocument({ searchParams }: PageProps<'/devis/nouveau'>) {
  const sp = await searchParams;
  const lire = (k: keyof Preremplissage) => (typeof sp[k] === 'string' && sp[k] ? (sp[k] as string) : undefined);
  const demande: Preremplissage = {
    client: lire('client'),
    site: lire('site'),
    genre: lire('genre'),
    type: lire('type'),
    parcours: lire('parcours'),
    intervention: lire('intervention'),
    import: lire('import'),
  };
  const facture = demande.genre === 'facture';
  const retour = facture ? '/factures' : '/devis';

  return (
    <PleinEcran>
      <BarrePleine
        titre={facture ? 'Nouvelle facture' : 'Nouveau devis'}
        retour={retour}
        libelleRetour={facture ? 'Fermer et revenir aux factures' : 'Fermer et revenir aux devis'}
      />
      <CreationBrouillon demande={demande} retour={retour} />
    </PleinEcran>
  );
}
