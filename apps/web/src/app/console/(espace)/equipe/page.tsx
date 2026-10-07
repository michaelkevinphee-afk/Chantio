import { LIBELLE_ROLE_CHANTIO, peutConsole, TABLEAU_DROITS, type RoleChantio } from '@chantio/shared';
import { EnClair, Message, Tableau } from '@/components/console/elements';
import { BoutonEnvoi, LienEnvoi } from '@/components/retour';
import { Panneau, Puce, Titre } from '@/components/ui';
import { contexteConsole, ilYa } from '@/lib/console';
import { inviterEquipier, modifierEquipier } from '../../actions';

export const metadata = { title: 'Équipe Chantio · Console Chantio' };

// Équipe Chantio : qui a accès à la console, avec quel rôle. Seul le propriétaire en décide.

type Equipier = {
  id: string;
  prenom: string;
  nom: string | null;
  email: string;
  role: RoleChantio;
  actif: boolean;
  compte: boolean;
  vu_le: string | null;
  cree_le: string;
  moi: boolean;
};

const ROLES = Object.keys(LIBELLE_ROLE_CHANTIO) as RoleChantio[];

export default async function Equipe({ searchParams }: PageProps<'/console/equipe'>) {
  const [sp, { supabase, moi }] = await Promise.all([searchParams, contexteConsole()]);
  const { data, error } = await supabase.rpc('console_equipe');
  if (error) console.error('console_equipe', error);
  const equipe = (data ?? []) as Equipier[];
  const gere = peutConsole(moi.role, 'equipe');

  return (
    <>
      <Titre texte="Les personnes de Chantio qui ont accès à cette console, et ce que chacune peut faire.">Équipe Chantio</Titre>
      <Message sp={sp} />
      <EnClair>
        Chaque personne se connecte avec son propre compte et un code de son application d’authentification (double vérification). Sans elle, la base refuse
        tout, même avec le bon mot de passe.
      </EnClair>

      <Tableau entetes={['Personne', 'Rôle', 'Accès', 'Dernière visite', ...(gere ? [''] : [])]}>
        {equipe.map((p) => (
          <tr key={p.id} className={p.actif ? '' : 'opacity-60'}>
            <td className="px-4 py-3">
              <b>
                {[p.prenom, p.nom].filter(Boolean).join(' ')}
                {p.moi && <span className="font-semibold text-gris"> (vous)</span>}
              </b>
              <small className="block text-[13px] text-gris">{p.email}</small>
            </td>
            <td className="px-4 py-3">
              {gere && !p.moi && p.actif ? (
                <form action={modifierEquipier} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <select name="role" defaultValue={p.role} aria-label={`Rôle de ${p.prenom}`} className="champ !w-auto !py-1.5 text-sm">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {LIBELLE_ROLE_CHANTIO[r]}
                      </option>
                    ))}
                  </select>
                  <LienEnvoi className="text-sm font-bold text-cobalt hover:underline">Changer</LienEnvoi>
                </form>
              ) : (
                LIBELLE_ROLE_CHANTIO[p.role]
              )}
            </td>
            <td className="px-4 py-3">
              {!p.actif ? <Puce>Retiré</Puce> : p.compte ? <Puce ton="vert">Actif</Puce> : <Puce ton="violet">Pas encore venu</Puce>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-gris">{p.vu_le ? ilYa(p.vu_le) : '—'}</td>
            {gere && (
              <td className="px-4 py-3 text-right">
                {!p.moi && (
                  <form action={modifierEquipier}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="role" value={p.role} />
                    <input type="hidden" name="actif" value={p.actif ? 'non' : 'oui'} />
                    <LienEnvoi className={`text-sm font-bold hover:underline ${p.actif ? 'text-rouge' : 'text-cobalt'}`}>{p.actif ? 'Retirer l’accès' : 'Redonner l’accès'}</LienEnvoi>
                  </form>
                )}
              </td>
            )}
          </tr>
        ))}
      </Tableau>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {gere && (
          <Panneau titre="Ajouter quelqu’un">
            <form action={inviterEquipier} className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="block">
                <span className="etiquette">Prénom</span>
                <input name="prenom" required maxLength={80} className="champ" />
              </label>
              <label className="block">
                <span className="etiquette">Nom</span>
                <input name="nom" maxLength={80} className="champ" />
              </label>
              <label className="block sm:col-span-2">
                <span className="etiquette">E-mail (celui de son compte Chantio)</span>
                <input name="email" type="email" required maxLength={200} className="champ" />
              </label>
              <label className="block sm:col-span-2">
                <span className="etiquette">Rôle</span>
                <select name="role" defaultValue="support" className="champ">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {LIBELLE_ROLE_CHANTIO[r]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[13.5px] text-gris sm:col-span-2">
                Il crée son compte sur la page de connexion avec cette adresse (« Première connexion »), ouvre l’adresse /console, puis active sa double
                vérification.
              </p>
              <div className="sm:col-span-2">
                <BoutonEnvoi enCours="Ajout…">Ajouter à l’équipe</BoutonEnvoi>
              </div>
            </form>
          </Panneau>
        )}
        <Panneau titre="Ce que chaque rôle peut faire">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[14px]">
              <thead>
                <tr className="border-b border-trait text-[12.5px] text-gris">
                  <th scope="col" className="px-5 py-2.5 font-bold">
                    Droit
                  </th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col" className="px-3 py-2.5 text-center font-bold">
                      {LIBELLE_ROLE_CHANTIO[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-trait">
                {TABLEAU_DROITS.map((d) => (
                  <tr key={d.droit}>
                    <th scope="row" className="px-5 py-2.5 font-semibold">
                      {d.libelle}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {peutConsole(r, d.droit) ? (
                          <span className="font-extrabold text-vert" aria-label="oui">
                            ✓
                          </span>
                        ) : (
                          <span className="text-gris" aria-label="non">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panneau>
      </div>
    </>
  );
}
