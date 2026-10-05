import { redirect } from 'next/navigation';

/** La création se fait dans la fenêtre par-dessus la liste, comme dans le bac ; les paramètres sont gardés. */
export default async function NouvelleIntervention({ searchParams }: PageProps<'/interventions/nouvelle'>) {
  const sp = await searchParams;
  const p = new URLSearchParams({ nouvelle: '1' });
  for (const cle of ['client', 'site', 'devis', 'date', 'heure', 'moment', 'technicien'] as const) {
    const v = sp[cle];
    if (typeof v === 'string' && v) p.set(cle, v);
  }
  redirect(`/interventions?${p}`);
}
