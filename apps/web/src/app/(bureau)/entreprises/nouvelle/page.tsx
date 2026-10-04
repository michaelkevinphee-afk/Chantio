import { AjoutEntreprise } from '@/components/ajout-entreprise';
import { Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';

export const metadata = { title: 'Ajouter une entreprise · Chantio' };

export default async function NouvelleEntreprise() {
  const { membre } = await contexteBureau();
  return (
    <div className="max-w-2xl">
      <Titre sous="Chaque entreprise a ses clients, son équipe, ses devis et sa formule">Ajouter une entreprise</Titre>
      <AjoutEntreprise retour="entreprises" prenom={membre.prenom} nom={membre.nom ?? ''} identiteConnue />
    </div>
  );
}
