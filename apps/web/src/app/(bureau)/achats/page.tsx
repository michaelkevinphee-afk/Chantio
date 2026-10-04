import { aujourdhui, numeroIntervention, type ReceptionAchat, type StatutAchat } from '@chantio/shared';
import { lectureActivee } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { ListeAchats, type LigneAchatListe } from './liste';

// La lecture d'une facture peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Achats · Chantio' };

const SELECT = `id, numero, date_facture, echeance, montant_ttc, statut, reception, avoir, lecture, fichier_nom,
  planifie_le, moyen_prevu, approuvee_le, cree_le,
  fournisseur:fournisseurs(id, nom, categorie),
  responsable:membres!responsable_id(prenom, nom),
  intervention:interventions(numero, reference),
  paiements:paiements_achats(montant, date_paiement)`;

type Lu = Omit<LigneAchatListe, 'responsable' | 'paye' | 'chantier'> & {
  responsable: { prenom: string; nom: string } | null;
  intervention: { numero: number; reference: string | null } | null;
};

export default async function PageAchats({ searchParams }: PageProps<'/achats'>) {
  const { supabase, entreprise } = await contexteBureau();
  const { onglet } = await searchParams;
  const { data } = await supabase
    .from('achats')
    .select(SELECT)
    .order('date_facture', { ascending: false })
    .order('cree_le', { ascending: false })
    .limit(1000);

  const achats: LigneAchatListe[] = ((data ?? []) as unknown as Lu[]).map(({ responsable, intervention, ...a }) => ({
    ...a,
    montant_ttc: Number(a.montant_ttc),
    statut: a.statut as StatutAchat,
    reception: a.reception as ReceptionAchat,
    paiements: (a.paiements ?? []).map((p) => ({ montant: Number(p.montant), date_paiement: p.date_paiement })),
    paye: (a.paiements ?? []).reduce((s, p) => s + Number(p.montant), 0),
    responsable: responsable ? `${responsable.prenom} ${responsable.nom}`.trim() : null,
    chantier: intervention ? numeroIntervention(intervention) : null,
  }));

  return (
    <ListeAchats
      entrepriseId={entreprise.id}
      achats={achats}
      lecture={lectureActivee()}
      jour={aujourdhui()}
      ongletInitial={typeof onglet === 'string' ? onglet : 'tous'}
    />
  );
}
