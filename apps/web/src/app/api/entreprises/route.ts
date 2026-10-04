import { NextResponse, type NextRequest } from 'next/server';
import { chercherEntreprises, type EntrepriseTrouvee } from '@/lib/registre';
import { supabaseServeur } from '@/lib/supabase/server';

export type { EntrepriseTrouvee };

// Recherche d'entreprises par nom ou SIREN/SIRET dans l'annuaire public.
// Sert au nouveau client, au devis et à l'inscription d'une entreprise : ouvert à
// tout compte connecté, même sans entreprise. `inscrite` signale celles déjà sur Chantio.
export async function GET(requete: NextRequest) {
  const supabase = await supabaseServeur();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ resultats: [] }, { status: 401 });
  const q = requete.nextUrl.searchParams.get('q') ?? '';
  try {
    const resultats = await chercherEntreprises(q);
    const { data: inscrits } = resultats.length
      ? await supabase.rpc('sirens_inscrits', { p_sirens: resultats.map((r) => r.siren) })
      : { data: [] };
    const deja = new Set((inscrits as string[] | null) ?? []);
    return NextResponse.json({ resultats: resultats.map((r) => ({ ...r, inscrite: deja.has(r.siren) })) });
  } catch (e) {
    console.error('Recherche d’entreprise impossible', e);
    return NextResponse.json({ resultats: [], erreur: 'La recherche ne répond pas, remplissez la fiche à la main.' }, { status: 502 });
  }
}
