import { redirect } from 'next/navigation';

// Les mentions de facturation et les prix sont maintenant dans les Paramètres.
export default function PageReglages() {
  redirect('/parametres?rubrique=prix');
}
