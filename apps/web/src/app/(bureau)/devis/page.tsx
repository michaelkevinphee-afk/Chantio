import type { ReglagesFacturation } from '@chantio/shared';
import { lireTableauDeBord } from '@/lib/devis';
import { contexteBureau } from '@/lib/session';
import { TableauDevis } from './tableau';

export const metadata = { title: 'Devis et factures · Chantio' };

export default async function PageDevis({ searchParams }: PageProps<'/devis'>) {
  const { supabase, entreprise } = await contexteBureau();
  const { onglet } = await searchParams;
  const reglages: ReglagesFacturation = entreprise.facturation ?? {};
  const donnees = await lireTableauDeBord(supabase, entreprise.nom, reglages);
  const ongletInitial = onglet === 'factures' || onglet === 'importes' ? onglet : 'devis';
  return <TableauDevis donnees={donnees} ongletInitial={ongletInitial} />;
}
