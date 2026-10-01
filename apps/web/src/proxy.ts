import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigure } from './lib/supabase/config';

const PAGES_PUBLIQUES = ['/connexion', '/configuration'];

// Rafraîchit la session à chaque visite et renvoie vers la connexion
// quiconque n'est pas connecté.
export async function proxy(request: NextRequest) {
  const chemin = request.nextUrl.pathname;
  if (!supabaseConfigure) {
    if (chemin === '/configuration') return NextResponse.next();
    return NextResponse.redirect(new URL('/configuration', request.url));
  }

  let reponse = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (aPoser) => {
        aPoser.forEach(({ name, value }) => request.cookies.set(name, value));
        reponse = NextResponse.next({ request });
        aPoser.forEach(({ name, value, options }) => reponse.cookies.set(name, value, options));
      },
    },
  });

  // Vérifie le jeton sur place et le rafraîchit s'il expire.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && !PAGES_PUBLIQUES.some((p) => chemin.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return reponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
