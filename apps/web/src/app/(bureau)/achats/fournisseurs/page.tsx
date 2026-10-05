import { aujourdhui, type Fournisseur, type StatutAchat } from '@chantio/shared';
import { contexteBureau } from '@/lib/session';
import { ListeFournisseurs, type FactureFournisseur } from './liste-fournisseurs';

export const metadata = { title: 'Fournisseurs · Chantio' };

export default async function PageFournisseurs() {
  const { supabase } = await contexteBureau();
  const [{ data: fournisseurs }, { data: achats }] = await Promise.all([
    supabase.from('fournisseurs').select('*').order('nom'),
    supabase
      .from('achats')
      .select('id, fournisseur_id, numero, date_facture, montant_ttc, statut, avoir, paiements:paiements_achats(montant)')
      .not('fournisseur_id', 'is', null)
      .order('date_facture', { ascending: false })
      .limit(2000),
  ]);
  type Lu = Omit<FactureFournisseur, 'paye'> & { paiements: { montant: number }[] | null };
  return (
    <ListeFournisseurs
      fournisseurs={(fournisseurs ?? []) as Fournisseur[]}
      factures={((achats ?? []) as unknown as Lu[]).map(({ paiements, ...a }) => ({
        ...a,
        statut: a.statut as StatutAchat,
        montant_ttc: Number(a.montant_ttc),
        paye: (paiements ?? []).reduce((s, p) => s + Number(p.montant), 0),
      }))}
      jour={aujourdhui()}
    />
  );
}
