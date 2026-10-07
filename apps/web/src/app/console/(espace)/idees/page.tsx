import Link from 'next/link';
import { EnClair, Message } from '@/components/console/elements';
import { LienEnvoi } from '@/components/retour';
import { Puce, Titre, Vide } from '@/components/ui';
import { contexteConsole, quand } from '@/lib/console';
import { suivreIdee } from '../../actions';

export const metadata = { title: 'Idées des clients · Console Chantio' };

// Idées des clients : tout ce qui arrive par la bulle « Vos idées pour Chantio », toutes entreprises confondues.

type Statut = 'nouveau' | 'en_cours' | 'fait';
type Idee = {
  id: string;
  entreprise_id: string;
  entreprise: string;
  auteur: string | null;
  texte: string;
  page: string;
  titre_page: string | null;
  appareil: string | null;
  statut: Statut;
  cree_le: string;
};

const STATUTS: Record<Statut, { libelle: string; ton: 'bleu' | 'violet' | 'vert' }> = {
  nouveau: { libelle: 'Nouvelle', ton: 'bleu' },
  en_cours: { libelle: 'En cours', ton: 'violet' },
  fait: { libelle: 'Faite', ton: 'vert' },
};
const FILTRES: ('toutes' | Statut)[] = ['toutes', 'nouveau', 'en_cours', 'fait'];

export default async function Idees({ searchParams }: PageProps<'/console/idees'>) {
  const [sp, { supabase }] = await Promise.all([searchParams, contexteConsole()]);
  const { data, error } = await supabase.rpc('console_idees');
  if (error) console.error('console_idees', error);
  const toutes = (data ?? []) as Idee[];
  const filtre = (FILTRES as string[]).includes(String(sp.etat)) ? (sp.etat as (typeof FILTRES)[number]) : 'toutes';
  const liste = filtre === 'toutes' ? toutes : toutes.filter((i) => i.statut === filtre);
  const retour = `/console/idees${filtre === 'toutes' ? '' : `?etat=${filtre}`}`;

  return (
    <>
      <Titre texte="Ce que les clients écrivent ou dictent dans la bulle, avec la page exacte où ils l’ont dit.">Idées des clients</Titre>
      <Message sp={sp} />
      <EnClair>
        Le client voit aussi l’avancement dans Paramètres › Retours sur Chantio. Pour en faire une liste de travaux, copiez les idées « Nouvelles » dans une
        conversation avec Claude.
      </EnClair>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par état">
        {FILTRES.map((f) => {
          const n = f === 'toutes' ? toutes.length : toutes.filter((i) => i.statut === f).length;
          return (
            <Link
              key={f}
              href={f === 'toutes' ? '/console/idees' : `/console/idees?etat=${f}`}
              aria-current={filtre === f ? 'true' : undefined}
              className={`rounded-full px-3 py-1.5 text-[13.5px] font-bold transition ${filtre === f ? 'bg-encre text-white' : 'bg-white text-gris shadow-[inset_0_0_0_1px_var(--color-trait)] hover:text-encre'}`}
            >
              {f === 'toutes' ? 'Toutes' : STATUTS[f].libelle} <span className="tabular-nums opacity-70">{n}</span>
            </Link>
          );
        })}
      </div>
      {liste.length ? (
        <ul className="carte divide-y divide-trait">
          {liste.map((i) => (
            <li key={i.id} className="grid gap-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gris">
                <Link href={`/console/entreprises/${i.entreprise_id}`} className="font-extrabold text-encre hover:text-cobalt hover:underline">
                  {i.entreprise}
                </Link>
                {i.auteur && <span>· {i.auteur}</span>}
                <span>· {quand(i.cree_le)}</span>
                {i.appareil && <span>· {i.appareil}</span>}
                <span className="ml-auto">
                  <Puce ton={STATUTS[i.statut]?.ton ?? 'bleu'}>{STATUTS[i.statut]?.libelle ?? i.statut}</Puce>
                </span>
              </div>
              <p className="text-[15px] whitespace-pre-line">{i.texte}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <span className="text-gris">
                  Page : {i.titre_page ?? i.page} <code className="text-xs">{i.page}</code>
                </span>
                <span className="ml-auto flex gap-3">
                  {(Object.keys(STATUTS) as Statut[])
                    .filter((s) => s !== i.statut)
                    .map((s) => (
                      <form key={s} action={suivreIdee}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="statut" value={s} />
                        <input type="hidden" name="retour" value={retour} />
                        <LienEnvoi className="font-bold text-cobalt hover:underline">Marquer « {STATUTS[s].libelle} »</LienEnvoi>
                      </form>
                    ))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Vide titre={toutes.length ? 'Aucune idée dans cet état' : 'Aucune idée pour l’instant'}>Elles arrivent depuis la bulle en bas à droite du bureau.</Vide>
      )}
    </>
  );
}
