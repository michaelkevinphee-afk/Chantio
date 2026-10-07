import { LIBELLE_ROLE_CHANTIO, peutConsole } from '@chantio/shared';
import { CadreConsole, type EntreeConsole } from '@/components/console/cadre-console';
import { contexteConsole } from '@/lib/console';
import { vueEnsemble } from './donnees';

export const metadata = { title: 'Console · Chantio', robots: { index: false, follow: false } };

export default async function LayoutConsole({ children }: LayoutProps<'/console'>) {
  const { moi } = await contexteConsole();
  const v = await vueEnsemble();
  const entrees: EntreeConsole[] = [
    { groupe: 'Au quotidien', href: '/console', libelle: 'Vue d’ensemble', icone: 'pilotage' },
    { groupe: 'Au quotidien', href: '/console/entreprises', libelle: 'Entreprises', icone: 'entreprise' },
    ...(peutConsole(moi.role, 'identite')
      ? [{ groupe: 'Au quotidien', href: '/console/identites', libelle: 'Identités à vérifier', icone: 'bouclier' as const, pastille: v?.identites_en_attente }]
      : []),
    { groupe: 'Au quotidien', href: '/console/assistance', libelle: 'Assistance', icone: 'aide', pastille: v?.demandes_assistance },
    { groupe: 'Au quotidien', href: '/console/idees', libelle: 'Idées des clients', icone: 'bulle', pastille: v?.idees_nouvelles },
    { groupe: 'Offre', href: '/console/formules', libelle: 'Formules et options', icone: 'etiquette' },
    { groupe: 'Offre', href: '/console/packs', libelle: 'Packs métier', icone: 'cube' },
    { groupe: 'Chantio', href: '/console/equipe', libelle: 'Équipe Chantio', icone: 'equipe' },
  ];
  return (
    <CadreConsole entrees={entrees} qui={[moi.prenom, moi.nom].filter(Boolean).join(' ')} role={LIBELLE_ROLE_CHANTIO[moi.role]}>
      {children}
    </CadreConsole>
  );
}
