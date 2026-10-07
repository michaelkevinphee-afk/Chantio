import { notFound, redirect } from 'next/navigation';
import { Logo } from '@/components/ui';
import { equipierConnecte } from '@/lib/console';
import { DoubleVerification } from './double-verification';

export const metadata = { title: 'Double vérification · Console Chantio', robots: { index: false, follow: false } };

// Avant la console : un code à 6 chiffres de l'application d'authentification du téléphone
// (Google Authenticator, Microsoft Authenticator…). La base exige ce niveau (« aal2 »).

export default async function Verification() {
  const { moi, email } = await equipierConnecte();
  if (!moi) notFound();
  if (moi.double_verification) redirect('/console');
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="carte w-full max-w-md p-7 sm:p-9">
        <div className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="rounded-full bg-encre px-2 py-0.5 text-xs font-extrabold text-white">Console</span>
        </div>
        <DoubleVerification prenom={moi.prenom} email={email} />
      </div>
    </main>
  );
}
