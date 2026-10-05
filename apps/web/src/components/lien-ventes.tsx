import Link from 'next/link';

const CLASSE = 'inline-flex items-center self-start text-[15px] font-bold text-cobalt hover:underline max-menu:min-h-12';

/**
 * « ← Ventes » au-dessus du titre des écrans de Ventes (Factures, Devis, Clients, Immeubles et contrats,
 * Produits et services, Chiffres) : visible seulement sur téléphone, il ramène à la page Ventes.
 * Avec `fiche`, il devient « ← Retour à la fiche de X », visible partout (écran ouvert depuis une fiche client).
 * À passer dans `retour` du Titre : <Titre retour={<LienVentes />} …>.
 */
export function LienVentes({ fiche }: { fiche?: { href: string; nom: string } }) {
  if (fiche)
    return (
      <Link href={fiche.href} className={CLASSE}>
        ← Retour à la fiche de {fiche.nom}
      </Link>
    );
  return (
    <Link href="/ventes" className={`${CLASSE} menu:hidden`}>
      ← Ventes
    </Link>
  );
}
