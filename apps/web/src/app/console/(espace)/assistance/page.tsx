import Link from 'next/link';
import { DUREES_ASSISTANCE, dureeLisible, peutConsole } from '@chantio/shared';
import { EnClair, Message, Tableau } from '@/components/console/elements';
import { BoutonEnvoi, LienEnvoi } from '@/components/retour';
import { Panneau, Puce, Titre } from '@/components/ui';
import { contexteConsole, jour, quand } from '@/lib/console';
import { demanderAssistance, terminerAssistance } from '../../actions';
import { listeEntreprises, type Assistance } from '../donnees';

export const metadata = { title: 'Assistance · Console Chantio' };

// Assistance : voir le compte d'un client pour l'aider, seulement avec son accord, pour une durée
// limitée, en lecture seule, et noté dans son journal (exigence RGPD : Chantio est sous-traitant).

type Ligne = Assistance & { entreprise_id: string; entreprise: string };

const ETAPES = [
  ['Vous demandez', 'Vous choisissez la durée et écrivez pourquoi. Le dirigeant reçoit un e-mail et voit la demande en haut de son bureau.'],
  ['Le dirigeant accepte', 'Ou refuse. Il peut aussi ouvrir l’accès lui-même, depuis Paramètres › Accès de Chantio, quand il vous appelle.'],
  ['Vous consultez', 'En lecture seule : interventions, clients, devis, factures, achats. Chaque consultation est notée dans son journal.'],
  ['L’accès se coupe', 'Tout seul à la fin de la durée. Le dirigeant ou vous pouvez le couper avant.'],
] as const;

const STATUT: Record<Assistance['statut'], { libelle: string; ton: 'violet' | 'vert' | 'rouge' | 'gris' }> = {
  demandee: { libelle: 'En attente', ton: 'violet' },
  acceptee: { libelle: 'Acceptée', ton: 'vert' },
  refusee: { libelle: 'Refusée', ton: 'rouge' },
  terminee: { libelle: 'Terminée', ton: 'gris' },
  annulee: { libelle: 'Annulée', ton: 'gris' },
};

export default async function AssistancePage({ searchParams }: PageProps<'/console/assistance'>) {
  const [sp, { supabase, moi }, entreprises] = await Promise.all([searchParams, contexteConsole(), listeEntreprises()]);
  const { data, error } = await supabase.rpc('console_assistances');
  if (error) console.error('console_assistances', error);
  const lignes = (data ?? []) as Ligne[];
  const maintenant = new Date().getTime();
  const ouverte = (a: Ligne) => a.statut === 'acceptee' && a.fin && new Date(a.fin).getTime() > maintenant;
  const enAttente = (a: Ligne) => a.statut === 'demandee' && maintenant - new Date(a.cree_le).getTime() < 86_400_000;
  const enCours = lignes.filter((a) => ouverte(a) || enAttente(a));
  const peut = peutConsole(moi.role, 'assistance');

  return (
    <>
      <Titre texte="Aider un client en voyant son compte, avec son accord et pour un temps limité.">Assistance</Titre>
      <Message sp={sp} />
      <ol className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ETAPES.map(([titre, texte], i) => (
          <li key={titre} className="carte apparition p-4" style={{ '--i': i } as React.CSSProperties}>
            <span className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-doux text-sm font-extrabold text-cobalt">{i + 1}</span>
            <b className="block">{titre}</b>
            <span className="text-[14px] text-gris">{texte}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panneau titre="En cours" nombre={enCours.length}>
          {enCours.length ? (
            <ul className="divide-y divide-trait">
              {enCours.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[14.5px]">
                  <span className="min-w-0 flex-1">
                    <Link href={`/console/entreprises/${a.entreprise_id}?onglet=assistance`} className="font-extrabold hover:text-cobalt hover:underline">
                      {a.entreprise}
                    </Link>
                    <span className="block text-gris">
                      {ouverte(a) ? `Ouverte jusqu’à ${quand(a.fin)}` : `Demandée par ${a.demandeur} ${quand(a.cree_le)}`} · « {a.motif} »
                    </span>
                  </span>
                  {ouverte(a) && (
                    <Link href={`/console/entreprises/${a.entreprise_id}?onglet=assistance`} className="font-bold text-cobalt hover:underline">
                      Consulter
                    </Link>
                  )}
                  {peut && (
                    <form action={terminerAssistance}>
                      <input type="hidden" name="assistance" value={a.id} />
                      <input type="hidden" name="retour" value="/console/assistance" />
                      <LienEnvoi className="font-bold text-rouge hover:underline">{ouverte(a) ? 'Fermer' : 'Annuler'}</LienEnvoi>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-gris">Aucune session ouverte ni demande en attente.</p>
          )}
        </Panneau>

        {peut && (
          <Panneau titre="Demander l’accès">
            <form action={demanderAssistance} className="grid gap-4 p-5">
              <input type="hidden" name="retour" value="/console/assistance" />
              <label className="block">
                <span className="etiquette">Entreprise</span>
                <select name="entreprise" required defaultValue="" className="champ">
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {entreprises
                    .filter((e) => e.statut !== 'resilie')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                        {e.ville ? ` (${e.ville})` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="etiquette">Pendant</span>
                <select name="duree" defaultValue="60" className="champ">
                  {DUREES_ASSISTANCE.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="etiquette">Pourquoi (le dirigeant le lit)</span>
                <input name="motif" required maxLength={300} className="champ" placeholder="Comprendre pourquoi le planning ne s’affiche pas" />
              </label>
              <BoutonEnvoi enCours="Envoi…">Envoyer la demande</BoutonEnvoi>
            </form>
          </Panneau>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-[17px] font-extrabold">Historique</h2>
      <Tableau entetes={['Entreprise', 'Origine', 'Motif', 'Durée', 'Le', 'État']} vide={lignes.length ? undefined : 'Aucune session pour l’instant.'}>
        {lignes.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-3 font-bold">
              <Link href={`/console/entreprises/${a.entreprise_id}?onglet=assistance`} className="hover:text-cobalt hover:underline">
                {a.entreprise}
              </Link>
            </td>
            <td className="px-4 py-3">{a.origine === 'client' ? `Ouverte par ${a.repondu_par ?? 'le client'}` : `Demandée par ${a.demandeur}`}</td>
            <td className="px-4 py-3 text-gris">{a.motif || '—'}</td>
            <td className="px-4 py-3 whitespace-nowrap">{dureeLisible(a.duree_minutes)}</td>
            <td className="px-4 py-3 whitespace-nowrap">{jour(a.cree_le)}</td>
            <td className="px-4 py-3">
              <Puce ton={STATUT[a.statut]?.ton ?? 'gris'}>
                {ouverte(a) ? 'Ouverte' : a.statut === 'acceptee' ? 'Expirée' : a.statut === 'demandee' && !enAttente(a) ? 'Sans réponse' : STATUT[a.statut]?.libelle}
              </Puce>
            </td>
          </tr>
        ))}
      </Tableau>
      <EnClair>
        Rappel : vos conditions générales doivent dire que Chantio traite les données de ses clients en tant que sous-traitant (article 28 du RGPD), et décrire cet
        accès d’assistance. À faire relire par un avocat.
      </EnClair>
    </>
  );
}
