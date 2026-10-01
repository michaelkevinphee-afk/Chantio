import { useSession } from '@/lib/session';
import { Bandeau, PastilleHorsLigne } from './Bandeau';

/** « 1 fiche en attente d'envoi » tant que la boîte d'envoi n'est pas vide. */
export function BandeauEnvoi() {
  const { enAttente, horsLigne } = useSession();
  const fiches = enAttente.filter((o) => o.type === 'fiche').length;
  if (!fiches) return horsLigne ? <PastilleHorsLigne /> : null;
  const texte = `${fiches} fiche${fiches > 1 ? 's' : ''} en attente d'envoi`;
  // Réseau présent mais envoi refusé (ex. fiche déjà validée) : on le dit.
  const refus = !horsLigne ? enAttente.find((o) => o.type === 'fiche' && o.erreur)?.erreur : undefined;
  if (refus) return <Bandeau bleu icone="nuage" texte={`${texte} : ${refus}. Préviens le bureau.`} />;
  return (
    <Bandeau
      bleu
      icone={horsLigne ? 'horsLigne' : 'nuage'}
      texte={horsLigne ? `${texte}. ${fiches > 1 ? 'Elles partiront' : 'Elle partira'} dès que le réseau revient.` : `${texte}…`}
    />
  );
}
