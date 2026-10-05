import { aujourdhui, segmentInitial, type ReceptionAchat, type StatutAchat } from '@chantio/shared';
import { lectureActivee } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { ListeAchats, type LigneAchatListe } from './liste';

// La lecture d'une facture peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Dépenses fournisseurs · Chantio' };

const SELECT = `id, numero, date_facture, echeance, montant_ttc, statut, reception, avoir, responsable_id, cree_le,
  fournisseur:fournisseurs(id, nom, siret),
  responsable:membres!responsable_id(prenom, nom),
  paiements:paiements_achats(montant)`;

type Lu = Omit<LigneAchatListe, 'responsable' | 'paye'> & {
  responsable: { prenom: string; nom: string } | null;
  paiements: { montant: number }[] | null;
};

/** « Dépenses fournisseurs » : ?filtre=recu|attente|a_payer|termine|tous (l'ancien ?onglet= est encore lu). */
export default async function PageAchats({ searchParams }: PageProps<'/achats'>) {
  const { supabase, entreprise } = await contexteBureau();
  const sp = await searchParams;
  const demande = [sp.filtre, sp.onglet].flat().find((v): v is string => typeof v === 'string');
  const [{ data }, { data: membres }] = await Promise.all([
    supabase.from('achats').select(SELECT).order('date_facture', { ascending: false }).order('cree_le', { ascending: false }).limit(1000),
    supabase.from('membres').select('id, prenom, nom').eq('actif', true).order('prenom'),
  ]);

  const achats: LigneAchatListe[] = ((data ?? []) as unknown as Lu[]).map(({ responsable, paiements, ...a }) => ({
    ...a,
    montant_ttc: Number(a.montant_ttc),
    statut: a.statut as StatutAchat,
    reception: a.reception as ReceptionAchat,
    paye: (paiements ?? []).reduce((s, p) => s + Number(p.montant), 0),
    responsable: responsable ? `${responsable.prenom} ${responsable.nom ?? ''}`.trim() : null,
  }));

  return (
    <ListeAchats
      entrepriseId={entreprise.id}
      achats={achats}
      membres={(membres ?? []).map((m) => ({ id: m.id as string, nom: `${m.prenom} ${m.nom ?? ''}`.trim() }))}
      lecture={lectureActivee()}
      jour={aujourdhui()}
      segInitial={segmentInitial(demande, achats.map((a) => a.statut))}
    />
  );
}
