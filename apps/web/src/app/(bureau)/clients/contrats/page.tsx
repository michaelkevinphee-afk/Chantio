import { redirect } from 'next/navigation';
import { contexteBureau } from '@/lib/session';

// Les contrats d'entretien sont maintenant dans « Mes clients › Immeubles et contrats » (comme le bac) :
// les anciennes adresses y mènent, sur le bâtiment du contrat demandé.

const un = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function Contrats({ searchParams }: PageProps<'/clients/contrats'>) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  const contrat = un(sp.contrat) || un(sp.enregistre);
  if (contrat) {
    const { supabase } = await contexteBureau();
    const { data: c } = await supabase.from('contrats').select('id, client_id, site_id').eq('id', contrat).maybeSingle();
    if (c) {
      if (c.site_id) q.set('site', c.site_id as string);
      else q.set('client', c.client_id as string);
      q.set('contrat', c.id as string);
    }
  } else if (un(sp.client)) q.set('client', un(sp.client));
  for (const k of ['vue', 'nouveau', 'visites', 'de', 'a', 'erreur']) if (un(sp[k])) q.set(k, un(sp[k]));
  const s = q.toString();
  redirect(s ? `/clients/immeubles?${s}` : '/clients/immeubles');
}
