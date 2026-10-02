import { notFound } from 'next/navigation';
import { lireDocument, lireHistoriqueDevis } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { chargerContexteEditeur } from '../../(bureau)/devis/charger';
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
  const [ctx, historique, factureCorrigee] = await Promise.all([
    chargerContexteEditeur(supabase, entreprise),
    d.genre === 'facture' && d.devis_id ? lireHistoriqueDevis(supabase, d.devis_id, d.id) : null,
    d.facture_id ? supabase.from('documents').select('numero').eq('id', d.facture_id).maybeSingle() : null,
  ]);
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
            refDevis: historique?.numero ?? null,
            refFacture: (factureCorrigee?.data?.numero as string | undefined) ?? null,
          }}
          entreprise={ctx.entreprise}
        />
      </div>
    </div>
  );
}
