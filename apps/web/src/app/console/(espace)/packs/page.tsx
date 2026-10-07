import { CONSTATS, FOURNITURES_FREQUENTES, MESURES, MOTIFS } from '@chantio/shared';
import { EnClair } from '@/components/console/elements';
import { Panneau, Puce, Titre } from '@/components/ui';
import { listeEntreprises } from '../donnees';

export const metadata = { title: 'Packs métier · Console Chantio' };

// Packs métier : les listes toutes prêtes de la fiche d'intervention (motifs, constats,
// fournitures, mesures). Un seul pack pour l'instant : plomberie, chauffage, génie climatique.

const A_VENIR = ['Électricité', 'Couverture', 'Menuiserie', 'Serrurerie', 'Peinture'];

export default async function Packs() {
  const entreprises = await listeEntreprises();
  const metiers = new Map<string, number>();
  for (const e of entreprises) for (const m of e.metiers ?? []) metiers.set(m, (metiers.get(m) ?? 0) + 1);

  const bloc = (titre: string, items: readonly string[]) => (
    <div>
      <p className="etiquette">{titre}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <Puce key={x}>{x}</Puce>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Titre texte="Les listes toutes prêtes que le technicien retrouve dans sa fiche d’intervention, selon le métier.">Packs métier</Titre>
      <EnClair>
        Un seul pack aujourd’hui, utilisé par toutes les entreprises. Pour en ajouter un (électricité…) ou changer une liste, demandez-le à Claude : les listes sont
        dans le code et arrivent chez tous les clients à la mise en ligne suivante.
      </EnClair>
      <Panneau titre="Plomberie, chauffage, génie climatique" action={<span className="font-semibold text-gris">{entreprises.length} entreprise{entreprises.length > 1 ? 's' : ''}</span>}>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {bloc('Motifs d’intervention', MOTIFS)}
          {bloc('Constats', CONSTATS)}
          {bloc('Fournitures fréquentes', FOURNITURES_FREQUENTES)}
          {bloc(
            'Mesures (avec plage normale)',
            MESURES.map((m) => {
              const plage = m.min != null && m.max != null ? `${m.min} à ${m.max} ` : m.max != null ? `jusqu’à ${m.max} ` : m.min != null ? `dès ${m.min} ` : '';
              return `${m.libelle} (${plage}${m.unite})`;
            }),
          )}
        </div>
      </Panneau>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panneau titre="Métiers déclarés par les entreprises">
          <ul className="divide-y divide-trait">
            {[...metiers.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([m, n]) => (
                <li key={m} className="flex justify-between px-5 py-2.5 text-[14.5px]">
                  <span className="capitalize">{m}</span>
                  <b className="tabular-nums">{n}</b>
                </li>
              ))}
            {!metiers.size && <li className="px-5 py-6 text-center text-sm text-gris">Aucun métier déclaré.</li>}
          </ul>
        </Panneau>
        <Panneau titre="Prochains packs envisagés">
          <div className="flex flex-wrap gap-1.5 p-5">
            {A_VENIR.map((m) => (
              <Puce key={m} ton="violet">
                {m}
              </Puce>
            ))}
          </div>
          <p className="border-t border-trait px-5 py-3 text-[13px] text-gris">Rien n’est codé : à décider selon les clients qui arrivent.</p>
        </Panneau>
      </div>
    </>
  );
}
