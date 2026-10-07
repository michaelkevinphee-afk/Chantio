import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LIBELLE_FORMULE, peutConsole, PRIX_FORMULE_HT, type Formule } from '@chantio/shared';
import { EnClair, Message } from '@/components/console/elements';
import { BoutonEnvoi } from '@/components/retour';
import { Titre } from '@/components/ui';
import { contexteConsole } from '@/lib/console';
import { creerEntreprise } from '../../../actions';

export const metadata = { title: 'Créer une entreprise · Console Chantio' };

export default async function NouvelleEntreprise({ searchParams }: PageProps<'/console/entreprises/nouvelle'>) {
  const { moi } = await contexteConsole();
  if (!peutConsole(moi.role, 'abonnement')) notFound();
  const sp = await searchParams;
  const v = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const champ = (nom: string, libelle: string, props: React.ComponentProps<'input'> = {}) => (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      <input name={nom} defaultValue={v(nom)} className="champ" {...props} />
    </label>
  );

  return (
    <>
      <Titre retour={<Link href="/console/entreprises">← Entreprises clientes</Link>}>Créer une entreprise</Titre>
      <Message sp={sp} />
      <EnClair>
        Pour un client signé au téléphone ou sur un salon. Le dirigeant reçoit un code par e-mail : avec lui, il choisit son mot de passe et retrouve son entreprise
        prête. S’il préfère s’inscrire seul, il passe par le site et rien n’est à faire ici.
      </EnClair>
      <form action={creerEntreprise} className="carte grid max-w-3xl gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">{champ('nom', 'Nom de l’entreprise', { required: true, maxLength: 200, placeholder: 'Plomberie Martin' })}</div>
        {champ('siren', 'SIREN (facultatif)', { inputMode: 'numeric', placeholder: '9 chiffres', maxLength: 11 })}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          {champ('code_postal', 'Code postal', { inputMode: 'numeric', maxLength: 5 })}
          {champ('ville', 'Ville', { maxLength: 100 })}
        </div>
        {champ('prenom', 'Prénom du dirigeant', { required: true, maxLength: 80 })}
        {champ('nom_famille', 'Nom du dirigeant', { maxLength: 80 })}
        <div className="sm:col-span-2">{champ('email', 'E-mail du dirigeant', { required: true, type: 'email', maxLength: 200 })}</div>
        <label className="block">
          <span className="etiquette">Formule</span>
          <select name="formule" defaultValue={v('formule') || 'equipe'} className="champ">
            {(Object.keys(LIBELLE_FORMULE) as Formule[]).map((f) => (
              <option key={f} value={f}>
                {LIBELLE_FORMULE[f]} · {PRIX_FORMULE_HT[f]} € HT / mois
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">État du compte</span>
          <select name="statut" defaultValue={v('statut') || 'essai'} className="champ">
            <option value="essai">En essai (30 jours)</option>
            <option value="offert">Offert (pilote, partenaire)</option>
            <option value="actif">Payant</option>
          </select>
        </label>
        <label className="flex items-start gap-2.5 sm:col-span-2">
          <input type="checkbox" name="envoyer" value="oui" defaultChecked className="mt-1 h-4 w-4 accent-[#2F54EB]" />
          <span>Envoyer tout de suite le code de connexion au dirigeant</span>
        </label>
        <div className="sm:col-span-2">
          <BoutonEnvoi enCours="Création…">Créer l’entreprise</BoutonEnvoi>
        </div>
      </form>
    </>
  );
}
