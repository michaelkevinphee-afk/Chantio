import { DUREES_ASSISTANCE, dureeLisible } from '@chantio/shared';
import { autoriserAcces, repondreAcces, retirerAcces } from '@/app/actions-acces';
import { BoutonEnvoi } from '@/components/retour';
import type { contexteBureau } from '@/lib/session';
import { Note, Section } from './elements';

// Paramètres › Accès de Chantio (dirigeant) : qui chez Chantio peut voir le compte, jusqu'à quand,
// et le journal de chaque accès. Sans accord du dirigeant, l'équipe Chantio ne voit que des nombres.

type Assistance = {
  id: string;
  origine: 'chantio' | 'client';
  demandeur: string;
  motif: string;
  duree_minutes: number;
  statut: 'demandee' | 'acceptee' | 'refusee' | 'terminee' | 'annulee';
  cree_le: string;
  fin: string | null;
};

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso))
    .replace(':', ' h ');

export async function RubriqueAcces({ ctx, sp }: { ctx: Awaited<ReturnType<typeof contexteBureau>>; sp: Record<string, string | string[] | undefined> }) {
  const { supabase, entreprise } = ctx;
  const [{ data: lues, error }, { data: journalLu }] = await Promise.all([
    supabase
      .from('assistances')
      .select('id, origine, demandeur, motif, duree_minutes, statut, cree_le, fin')
      .eq('entreprise_id', entreprise.id)
      .order('cree_le', { ascending: false })
      .limit(20),
    supabase.from('acces_chantio').select('qui, action, le').eq('entreprise_id', entreprise.id).order('le', { ascending: false }).limit(200),
  ]);
  if (error) return <Note className="pt-5">Cette rubrique arrive avec la prochaine mise à jour de Chantio.</Note>;

  const assistances = (lues ?? []) as Assistance[];
  const journal = (journalLu ?? []) as { qui: string; action: string; le: string }[];
  const maintenant = new Date().getTime();
  const ouverte = assistances.find((a) => a.statut === 'acceptee' && a.fin && new Date(a.fin).getTime() > maintenant);
  const demande = assistances.find((a) => a.statut === 'demandee' && maintenant - new Date(a.cree_le).getTime() < 86_400_000);
  const ok = typeof sp.ok === 'string' ? sp.ok : null;
  const erreur = typeof sp.erreur === 'string' ? sp.erreur : null;

  return (
    <>
      {(ok || erreur) && (
        <p role={erreur ? 'alert' : 'status'} className={`mt-5 rounded-[14px] px-4 py-3 font-semibold ${erreur ? 'bg-rouge-doux text-rouge' : 'bg-vert-doux text-vert'}`}>
          {erreur ?? `✓ ${ok}`}
        </p>
      )}
      <Section titre="En ce moment" grille={false}>
        {demande && (
          <div className="rounded-[14px] border-2 border-violet bg-violet-doux/60 p-4">
            <p>
              <b>{demande.demandeur}</b> demande à voir votre compte pendant <b>{dureeLisible(demande.duree_minutes)}</b> pour vous aider :
            </p>
            <p className="mt-1 font-semibold">« {demande.motif} »</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={repondreAcces}>
                <input type="hidden" name="id" value={demande.id} />
                <input type="hidden" name="reponse" value="oui" />
                <BoutonEnvoi className="!px-4 !py-2.5 text-sm" enCours="…">
                  Accepter
                </BoutonEnvoi>
              </form>
              <form action={repondreAcces}>
                <input type="hidden" name="id" value={demande.id} />
                <input type="hidden" name="reponse" value="non" />
                <BoutonEnvoi variante="secondaire" className="!px-4 !py-2.5 text-sm" enCours="…">
                  Refuser
                </BoutonEnvoi>
              </form>
            </div>
          </div>
        )}
        {ouverte ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-vert-doux px-4 py-3">
            <p className="min-w-0 flex-1">
              <b>L’équipe Chantio peut voir votre compte jusqu’au {quand(ouverte.fin!)}</b>, en lecture seule.
              {ouverte.motif && <span className="block text-gris">« {ouverte.motif} »</span>}
            </p>
            <form action={retirerAcces}>
              <input type="hidden" name="id" value={ouverte.id} />
              <BoutonEnvoi variante="danger" className="!px-4 !py-2.5 text-sm" enCours="…">
                Couper l’accès maintenant
              </BoutonEnvoi>
            </form>
          </div>
        ) : (
          <>
            <p>
              <b>Personne chez Chantio ne voit vos clients, vos interventions, vos devis ni vos factures.</b> Si vous appelez l’assistance, vous pouvez lui ouvrir
              l’accès pour un temps limité :
            </p>
            <form action={autoriserAcces} className="flex flex-wrap items-end gap-2.5">
              <label className="block">
                <span className="etiquette">Pendant</span>
                <select name="duree" defaultValue="60" className="champ !w-auto">
                  {DUREES_ASSISTANCE.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-[200px] flex-1">
                <span className="etiquette">Pourquoi (facultatif)</span>
                <input name="motif" maxLength={300} className="champ" placeholder="Problème avec une facture" />
              </label>
              <BoutonEnvoi variante="secondaire" className="!px-4 !py-3 text-sm" enCours="…">
                Ouvrir l’accès
              </BoutonEnvoi>
            </form>
          </>
        )}
      </Section>
      <Section titre="Ce que cela veut dire" grille={false}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Sans votre accord, l’équipe Chantio ne voit que des nombres : combien d’utilisateurs, d’interventions, de fiches.</li>
          <li>Avec votre accord, elle consulte vos données pour vous aider, sans pouvoir rien modifier ni envoyer.</li>
          <li>L’accès se coupe tout seul à la fin de la durée. Vous pouvez le couper avant.</li>
          <li>Chaque accès et chaque changement de votre abonnement est noté ci-dessous. Personne ne peut effacer ce journal.</li>
        </ul>
        <Note>Chantio traite vos données pour votre compte, comme sous-traitant au sens du RGPD (article 28).</Note>
      </Section>
      <Section titre="Journal des accès" grille={false}>
        {journal.length ? (
          <ul className="divide-y divide-trait rounded-[14px] border border-trait">
            {journal.map((j, i) => (
              <li key={`${j.le}-${i}`} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[170px_150px_minmax(0,1fr)]">
                <span className="text-gris tabular-nums">{quand(j.le)}</span>
                <b>{j.qui}</b>
                <span>{j.action}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gris">Aucun accès de l’équipe Chantio à votre compte.</p>
        )}
      </Section>
    </>
  );
}
