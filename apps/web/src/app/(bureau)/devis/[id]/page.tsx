import { notFound } from 'next/navigation';
import { lireDocument, lireHistoriqueDevis } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { chargerContexteEditeur } from '../charger';
import { Editeur, type InitialEditeur } from '../editeur';
import { Ecran } from '../composants';
import { Papier } from '../papier';
import { SuiviDocument } from '../suivi';

export const metadata = { title: 'Devis et factures · Chantio' };

export default async function PageDocument({ params, searchParams }: PageProps<'/devis/[id]'>) {
  const { id } = await params;
  const { etape } = await searchParams;
  const { supabase, entreprise } = await contexteBureau();
  const reglages = entreprise.facturation ?? {};
  const lu = await lireDocument(supabase, id, reglages);
  if (!lu) notFound();
  const { document: d, lignes } = lu;

  const [ctx, historique, factureCorrigee] = await Promise.all([
    chargerContexteEditeur(supabase, entreprise),
    d.genre === 'devis' ? lireHistoriqueDevis(supabase, d.id) : d.devis_id ? lireHistoriqueDevis(supabase, d.devis_id, d.id) : null,
    d.facture_id ? supabase.from('documents').select('numero').eq('id', d.facture_id).maybeSingle() : null,
  ]);

  const initial: InitialEditeur = {
    genre: d.genre,
    type_facture: d.type_facture,
    numero: d.numero,
    date_document: d.date_document,
    echeance: d.echeance,
    client: d.client,
    objet: d.objet,
    conditions: d.conditions,
    remise: d.remise,
    pourcentage: d.pourcentage,
    avancement: d.avancement,
    avancement_precedent: d.avancement_precedent,
    situation_numero: d.situation_numero,
    lignes,
    refDevis: d.genre === 'facture' ? (historique?.numero ?? null) : null,
    refFacture: (factureCorrigee?.data?.numero as string | undefined) ?? null,
    client_id: d.client_id,
    devis_id: d.devis_id,
    facture_id: d.facture_id,
    import_id: null,
    origine: d.origine,
    lus: [],
    coefficient: d.coefficient,
  };

  const suivi = (
    <SuiviDocument
      document={d}
      historique={d.genre === 'devis' ? historique : null}
      modeles={{
        objet: (d.genre === 'facture' ? reglages.mail_facture_objet : reglages.mail_devis_objet) || '',
        texte: (d.genre === 'facture' ? reglages.mail_facture_texte : reglages.mail_devis_texte) || '',
        entreprise: entreprise.nom,
      }}
    />
  );

  // Une facture validée est figée : on l'affiche, on ne la modifie plus.
  if (d.genre === 'facture' && d.numero) {
    return (
      <Ecran label="Facture">
        {suivi}
        <div className="grille-editeur" style={{ gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 760, margin: '0 auto' }}>
          <div className="apercu-zone" style={{ position: 'static' }}>
            <div className="bureau-papier">
              <Papier d={initial} entreprise={ctx.entreprise} />
            </div>
          </div>
        </div>
      </Ecran>
    );
  }

  return (
    <>
      <div className="df">{suivi}</div>
      <Editeur
        key={d.id + d.numero}
        id={d.id}
        statut={d.statut}
        initial={initial}
        historique={d.genre === 'facture' ? historique : null}
        etapeInitiale={etape === 'ouvrages' || etape === 'conditions' ? etape : 'client'}
        {...ctx}
      />
    </>
  );
}
