import Link from 'next/link';
import { suivreRetour, type StatutRetour } from '@/app/actions-retours';
import { LienEnvoi } from '@/components/retour';
import { Puce, Vide } from '@/components/ui';
import type { contexteBureau } from '@/lib/session';

// Paramètres › Retours sur Chantio : les messages envoyés depuis la bulle, du plus récent au plus ancien,
// avec la page exacte où ils ont été dits.

type Retour = {
  id: string;
  auteur: string | null;
  texte: string;
  page: string;
  titre_page: string | null;
  appareil: string | null;
  statut: StatutRetour;
  cree_le: string;
};

const STATUTS: Record<StatutRetour, { libelle: string; ton: 'bleu' | 'violet' | 'vert' }> = {
  nouveau: { libelle: 'Nouveau', ton: 'bleu' },
  en_cours: { libelle: 'En cours', ton: 'violet' },
  fait: { libelle: 'Fait', ton: 'vert' },
};

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .replace(':', ' h ');

export async function RubriqueRetours({ ctx }: { ctx: Awaited<ReturnType<typeof contexteBureau>> }) {
  const { data, error } = await ctx.supabase
    .from('retours')
    .select('id, auteur, texte, page, titre_page, appareil, statut, cree_le')
    .order('cree_le', { ascending: false })
    .limit(300);
  if (error) {
    return (
      <div className="pt-5">
        <Vide titre="Les retours ne sont pas encore activés">La table des retours doit d’abord être créée dans la base (script SQL fourni avec cette version).</Vide>
      </div>
    );
  }
  const retours = (data ?? []) as Retour[];
  if (!retours.length) {
    return (
      <div className="pt-5">
        <Vide titre="Aucun retour pour l’instant">Les messages envoyés avec la bulle en bas à droite de l’écran s’afficheront ici.</Vide>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-trait">
      {retours.map((r) => {
        const s = STATUTS[r.statut] ?? STATUTS.nouveau;
        const telephone = r.appareil?.startsWith('téléphone') ? 'sur téléphone' : r.appareil?.startsWith('appli') ? 'dans l’appli' : 'sur ordinateur';
        return (
          <li key={r.id} className="py-4">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-gris">
              <Puce ton={s.ton}>{s.libelle}</Puce>
              <span className="font-bold text-encre">{r.auteur || 'Un membre'}</span>
              <span>
                {quand(r.cree_le)} · {telephone}
              </span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{r.texte}</p>
            <p className="mt-2 text-[13px] text-gris">
              Page :{' '}
              {r.page.startsWith('/') && !r.appareil?.startsWith('appli') ? (
                <Link href={r.page} className="font-bold text-cobalt hover:underline">
                  {r.titre_page || r.page}
                </Link>
              ) : (
                <strong className="text-encre">{r.titre_page || r.page}</strong>
              )}{' '}
              <span className="font-mono text-xs break-all">({r.page})</span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(Object.keys(STATUTS) as StatutRetour[])
                .filter((k) => k !== r.statut)
                .map((k) => (
                  <form key={k} action={suivreRetour}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="statut" value={k} />
                    <LienEnvoi className="rounded-full border border-trait bg-white px-3 py-1.5 text-[13px] font-bold text-gris transition hover:border-cobalt hover:text-cobalt">
                      {k === 'fait' ? 'Marquer fait' : k === 'en_cours' ? 'Mettre en cours' : 'Remettre en nouveau'}
                    </LienEnvoi>
                  </form>
                ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
