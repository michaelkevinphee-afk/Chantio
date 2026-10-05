import { redirect } from 'next/navigation';

/** L'intervention s'ouvre dans le volet de la liste, comme dans le bac (anciens liens, e-mails, agenda). */
export default async function PageIntervention({ params, searchParams }: PageProps<'/interventions/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = new URLSearchParams({ fiche: id });
  for (const cle of ['facturer', 'chiffrer', 'erreur', 'cree'] as const) {
    const v = sp[cle];
    if (typeof v === 'string') p.set(cle, v);
  }
  redirect(`/interventions?${p}`);
}
