import { fichierAgenda } from '@chantio/shared';
import { rendezVousIntervention } from '@/lib/invitations';
import { contexteBureau } from '@/lib/session';

// « Ajouter à mon agenda » : le rendez-vous de l'intervention en fichier .ics, sans réglage.
export async function GET(_: Request, { params }: RouteContext<'/interventions/[id]/agenda'>) {
  const { id } = await params;
  const { supabase } = await contexteBureau();
  const infos = await rendezVousIntervention(supabase, id);
  if (!infos) return new Response('Intervention sans date.', { status: 404 });
  return new Response(fichierAgenda(infos.rdv), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="intervention-${id.slice(0, 8)}.ics"`,
    },
  });
}
