import { notFound } from 'next/navigation';
import { lireDocument } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { chargerLiens, entreprisePapier } from '../../(bureau)/devis/charger';
import { Papier } from '../../(bureau)/devis/papier';
import { BoutonImprimer } from './imprimer';
import '../../(bureau)/devis/devis.css';
import './impression.css';

// Page A4 d'un devis ou d'une facture, à imprimer ou enregistrer en PDF.
export default async function Impression({ params }: PageProps<'/impression/[id]'>) {
  const { id } = await params;
  const { supabase, entreprise } = await contexteBureau();
  const lu = await lireDocument(supabase, id, entreprise.facturation ?? {});
  if (!lu) notFound();
  const { document: d, lignes } = lu;
  const [papier, liens] = await Promise.all([entreprisePapier(supabase, entreprise), chargerLiens(supabase, d)]);
  const nom = `${d.numero ?? 'Brouillon'} ${d.objet}`.trim();

  return (
    <div className="df impression">
      <title>{nom}</title>
      <div className="barre-impression">
        <span>
          <b>{d.numero ?? 'Brouillon sans numéro'}</b> · choisissez « Enregistrer en PDF » dans la fenêtre d’impression
        </span>
        <BoutonImprimer />
      </div>
      <div className="bureau-papier feuilles">
        <Papier
          d={{
            ...d,
            lignes,
            refDevis: liens.refDevis,
            refFacture: liens.refFacture,
            refIntervention: liens.intervention?.reference ?? null,
            refContrat: liens.contrat?.reference ?? null,
            lieu: liens.lieu,
          }}
          entreprise={papier}
        />
      </div>
    </div>
  );
}
