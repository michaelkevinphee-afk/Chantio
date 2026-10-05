import { redirect } from 'next/navigation';

// L'ancienne page « Équipe » : tout se fait maintenant dans Paramètres › Membres.
// Les paramètres d'adresse (?invite, ?renvoi, ?sansmail, ?erreur, ?nouveau…) sont gardés.
export default async function Equipe({ searchParams }: PageProps<'/equipe'>) {
  const sp = await searchParams;
  const adresse = new URLSearchParams({ rubrique: 'membres' });
  for (const [cle, valeur] of Object.entries(sp)) {
    if (cle === 'rubrique') continue;
    for (const v of Array.isArray(valeur) ? valeur : [valeur]) if (v != null) adresse.append(cle, v);
  }
  redirect(`/parametres?${adresse.toString()}`);
}
