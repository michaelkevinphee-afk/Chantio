import Link from 'next/link';
import { CompteursOnglets } from '@/components/compteurs-onglets';

/**
 * Bloc « Interventions » de l'Accueil (interCoupDOeil du bac) : quatre compteurs qui ouvrent
 * la liste des interventions déjà filtrée, et le lien vers toute la liste.
 */
export function InterventionsAccueil({
  aujourdhui,
  aPlanifier,
  aValider,
  renvoyees,
}: {
  aujourdhui: number;
  aPlanifier: number;
  aValider: number;
  renvoyees: number;
}) {
  return (
    <section aria-labelledby="aj-i" className="carte flex min-w-0 flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="aj-i" className="text-[17px] font-extrabold">
          Interventions
        </h2>
        <Link href="/interventions" className="py-1 text-[14.5px] font-extrabold text-cobalt hover:underline">
          Voir toutes les interventions
        </Link>
      </div>
      <CompteursOnglets
        disposition="rangee"
        etiquette="Interventions"
        className="mb-0"
        compteurs={[
          { cle: 'aujourdhui', libelle: 'Aujourd’hui', nombre: aujourdhui, ton: 'cobalt', href: '/interventions?periode=aujourdhui' },
          { cle: 'a_planifier', libelle: 'À planifier', nombre: aPlanifier, ton: 'cobalt', href: '/interventions?statut=a_planifier' },
          { cle: 'a_valider', libelle: 'Fiches à valider', nombre: aValider, ton: 'violet', href: '/interventions?statut=a_valider' },
          { cle: 'a_reprendre', libelle: 'Renvoyées au technicien', nombre: renvoyees, ton: 'rouge', href: '/interventions?statut=a_reprendre' },
        ]}
      />
    </section>
  );
}
