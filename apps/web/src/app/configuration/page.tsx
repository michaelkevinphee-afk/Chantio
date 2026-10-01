import { redirect } from 'next/navigation';
import { Logo } from '@/components/ui';
import { supabaseConfigure } from '@/lib/supabase/config';

export default function Configuration() {
  if (supabaseConfigure) redirect('/');
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Logo />
      <h1 className="mt-8 text-4xl font-extrabold text-encre">Configuration manquante</h1>
      <p className="mt-4">
        Le site n’est pas encore relié à sa base de données. Renseignez ces deux variables (dans un fichier{' '}
        <code>apps/web/.env.local</code>, ou dans les réglages du projet Vercel) :
      </p>
      <pre className="carte mt-4 overflow-x-auto p-4 text-sm">
        NEXT_PUBLIC_SUPABASE_URL=…{'\n'}NEXT_PUBLIC_SUPABASE_ANON_KEY=…
      </pre>
      <p className="mt-4 text-sm text-gris">Elles se trouvent dans Supabase, rubrique Project Settings → API.</p>
    </main>
  );
}
