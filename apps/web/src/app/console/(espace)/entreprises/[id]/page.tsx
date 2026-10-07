import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AIDE_STATUT_ABONNEMENT,
  DUREES_ASSISTANCE,
  dureeLisible,
  joursRestants,
  LIBELLE_FORMULE,
  LIBELLE_IDENTITE,
  LIBELLE_ROLE,
  LIBELLE_STATUT,
  LIBELLE_STATUT_ABONNEMENT,
  LIBELLE_STATUT_ACHAT,
  LIBELLE_STATUT_DOC,
  LIBELLE_TYPE_CLIENT,
  OPTIONS_ABONNEMENT,
  peutConsole,
  PRIX_FORMULE_HT,
  prixMensuel,
  tailleLisible,
  TON_IDENTITE,
  type Formule,
  type OptionAbonnement,
  type StatutAbonnement,
} from '@chantio/shared';
import { EnClair, Ligne, Message, PuceAbonnement, Tableau, Tuile } from '@/components/console/elements';
import { BoutonEnvoi, LienEnvoi } from '@/components/retour';
import { Panneau, Puce, Titre } from '@/components/ui';
import { aujourdhuiParis, contexteConsole, euros, ilYa, jour, quand } from '@/lib/console';
import { demanderAssistance, modifierAbonnement, terminerAssistance } from '../../../actions';
import { ficheEntreprise, type Assistance } from '../../donnees';

// Fiche d'une entreprise cliente : son compte chez Chantio (formule, utilisateurs, volumes),
// l'assistance avec l'accord du dirigeant, et le journal des accès qu'il voit dans son bureau.

const ONGLETS = [
  { cle: 'resume', libelle: 'Résumé' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'abonnement', libelle: 'Abonnement' },
  { cle: 'assistance', libelle: 'Assistance' },
  { cle: 'journal', libelle: 'Journal des accès' },
] as const;
type Onglet = (typeof ONGLETS)[number]['cle'];

const VUES = [
  { cle: 'interventions', libelle: 'Interventions' },
  { cle: 'clients', libelle: 'Clients' },
  { cle: 'documents', libelle: 'Devis et factures' },
  { cle: 'achats', libelle: 'Achats' },
] as const;
type Vue = (typeof VUES)[number]['cle'];

const STATUT_ASSISTANCE: Record<Assistance['statut'], { libelle: string; ton: 'violet' | 'vert' | 'rouge' | 'gris' }> = {
  demandee: { libelle: 'En attente du client', ton: 'violet' },
  acceptee: { libelle: 'Acceptée', ton: 'vert' },
  refusee: { libelle: 'Refusée', ton: 'rouge' },
  terminee: { libelle: 'Terminée', ton: 'gris' },
  annulee: { libelle: 'Annulée', ton: 'gris' },
};

export async function generateMetadata({ params }: PageProps<'/console/entreprises/[id]'>) {
  const f = await ficheEntreprise((await params).id);
  return { title: `${f?.entreprise.nom ?? 'Entreprise'} · Console Chantio` };
}

export default async function FicheEntreprisePage({ params, searchParams }: PageProps<'/console/entreprises/[id]'>) {
  const [{ id }, sp, { supabase, moi }] = await Promise.all([params, searchParams, contexteConsole()]);
  const f = await ficheEntreprise(id);
  if (!f) notFound();
  const e = f.entreprise;
  const onglet: Onglet = ONGLETS.some((o) => o.cle === sp.onglet) ? (sp.onglet as Onglet) : 'resume';
  const auj = aujourdhuiParis();
  const ab = f.abonnement ?? { statut: 'essai' as StatutAbonnement, essai_fin: null, prix_special: null, options: [], modifie_le: e.cree_le };
  const actifs = f.membres.filter((m) => m.actif && m.compte).length;
  const prix = prixMensuel({ formule: e.formule, statut: ab.statut, prix_special: ab.prix_special, options: ab.options ?? [], utilisateurs: actifs });
  const lien = (o: Onglet, extra = '') => `/console/entreprises/${e.id}?onglet=${o}${extra}`;
  const retour = lien(onglet);
  const ouverte = f.assistances.find((a) => a.id === f.assistance_ouverte);
  const enAttente = f.assistances.find((a) => a.id === f.demande_en_attente);

  // Données du client : seulement pendant une session qu'il a acceptée (la base le vérifie et le note).
  const vue: Vue = VUES.some((v) => v.cle === sp.vue) ? (sp.vue as Vue) : 'interventions';
  let donnees: Record<string, unknown>[] | null = null;
  let erreurDonnees: string | null = null;
  if (onglet === 'assistance' && ouverte && peutConsole(moi.role, 'assistance')) {
    const { data, error } = await supabase.rpc('console_assistance_donnees', { p_entreprise: e.id, p_vue: vue });
    if (error) erreurDonnees = error.message;
    else donnees = (data ?? []) as Record<string, unknown>[];
  }

  return (
    <>
      <Titre
        retour={<Link href="/console/entreprises">← Entreprises clientes</Link>}
        texte={[e.ville, e.siren && `SIREN ${e.siren}`, `inscrite le ${jour(e.cree_le)}`].filter(Boolean).join(' · ')}
        actions={<PuceAbonnement statut={ab.statut} jours={ab.essai_fin ? joursRestants(ab.essai_fin, auj) : null} />}
      >
        {e.nom}
      </Titre>
      <Message sp={sp} />

      <nav className="mb-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Rubriques de la fiche">
        {ONGLETS.map((o) => (
          <Link
            key={o.cle}
            href={lien(o.cle)}
            aria-current={onglet === o.cle ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[14px] font-bold transition ${onglet === o.cle ? 'bg-encre text-white' : 'bg-white text-gris shadow-[inset_0_0_0_1px_var(--color-trait)] hover:text-encre'}`}
          >
            {o.libelle}
            {o.cle === 'assistance' && (ouverte || enAttente) && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-violet align-middle" aria-label="en cours" />}
          </Link>
        ))}
      </nav>

      {onglet === 'resume' && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tuile i={0} libelle="Formule" valeur={LIBELLE_FORMULE[e.formule]} detail={`${euros(prix)} HT / mois${ab.statut === 'actif' ? '' : ' s’il était payant'}`} />
            <Tuile i={1} libelle="Utilisateurs" valeur={actifs} detail={`${f.membres.length - actifs} invité${f.membres.length - actifs > 1 ? 's' : ''} ou retiré${f.membres.length - actifs > 1 ? 's' : ''}`} />
            <Tuile i={2} libelle="Interventions" valeur={f.volumes.interventions} detail={`${f.volumes.fiches} fiche${f.volumes.fiches > 1 ? 's' : ''} envoyée${f.volumes.fiches > 1 ? 's' : ''}`} />
            <Tuile i={3} libelle="Stockage" valeur={tailleLisible(f.volumes.stockage_octets)} detail={`${f.volumes.photos} photo${f.volumes.photos > 1 ? 's' : ''}`} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panneau titre="L’entreprise">
              <dl className="divide-y divide-trait px-5 py-2">
                <Ligne libelle="Raison sociale">{e.nom}</Ligne>
                <Ligne libelle="Forme juridique">{e.forme_juridique}</Ligne>
                <Ligne libelle="SIRET">{e.siret ?? e.siren}</Ligne>
                <Ligne libelle="Adresse">{[e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null}</Ligne>
                <Ligne libelle="Téléphone">{e.telephone}</Ligne>
                <Ligne libelle="E-mail">{e.email}</Ligne>
                <Ligne libelle="Métiers">{e.metiers?.length ? e.metiers.join(', ') : e.activite}</Ligne>
                <Ligne libelle="Identité">
                  <Puce ton={TON_IDENTITE[e.identite_statut]}>{LIBELLE_IDENTITE[e.identite_statut]}</Puce>
                  {e.representant && <span className="ml-2 text-gris">{e.representant}</span>}
                </Ligne>
              </dl>
            </Panneau>
            <Panneau titre="Volumes" action={<span className="font-semibold text-gris">depuis l’inscription</span>}>
              <dl className="divide-y divide-trait px-5 py-2">
                <Ligne libelle="Clients">{f.volumes.clients}</Ligne>
                <Ligne libelle="Interventions">{f.volumes.interventions}</Ligne>
                <Ligne libelle="Fiches envoyées">{f.volumes.fiches}</Ligne>
                <Ligne libelle="Photos">{f.volumes.photos}</Ligne>
                <Ligne libelle="Devis">{f.volumes.devis}</Ligne>
                <Ligne libelle="Factures">{f.volumes.factures}</Ligne>
                <Ligne libelle="Achats">{f.volumes.achats}</Ligne>
                <Ligne libelle="Contrats d’entretien">{f.volumes.contrats}</Ligne>
                <Ligne libelle="Idées envoyées">{f.volumes.retours}</Ligne>
              </dl>
              <p className="border-t border-trait px-5 py-3 text-[13px] text-gris">Des nombres seulement : le contenu reste privé sans session d’assistance.</p>
            </Panneau>
          </div>
        </>
      )}

      {onglet === 'utilisateurs' && (
        <Tableau
          entetes={['Personne', 'Rôle', 'Compte', 'Dernière connexion', 'Ajouté le']}
          vide={f.membres.length ? undefined : 'Personne pour l’instant.'}
        >
          {f.membres.map((m) => (
            <tr key={m.email}>
              <td className="px-4 py-3">
                <b>{[m.prenom, m.nom].filter(Boolean).join(' ')}</b>
                <small className="block text-[13px] text-gris">{m.email}</small>
              </td>
              <td className="px-4 py-3">{LIBELLE_ROLE[m.role] ?? m.role}</td>
              <td className="px-4 py-3">
                {!m.actif ? <Puce>Retiré</Puce> : m.compte ? <Puce ton="vert">Actif</Puce> : <Puce ton="violet">Invité</Puce>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-gris">{m.compte ? ilYa(m.derniere_connexion) : '—'}</td>
              <td className="px-4 py-3 whitespace-nowrap">{jour(m.cree_le)}</td>
            </tr>
          ))}
        </Tableau>
      )}

      {onglet === 'abonnement' && (
        <AbonnementForm
          entreprise={e.id}
          formule={e.formule}
          ab={ab}
          prix={prix}
          actifs={actifs}
          modifiable={peutConsole(moi.role, 'abonnement')}
          retour={retour}
        />
      )}

      {onglet === 'assistance' && (
        <div className="grid gap-5">
          <EnClair>
            Le dirigeant décide : sans son accord, vous ne voyez que des nombres. Avec son accord, vous lisez ses interventions, clients, devis, factures et achats
            pendant la durée choisie, sans rien pouvoir modifier. Chaque consultation est notée dans son journal (Paramètres › Accès de Chantio).
          </EnClair>

          {ouverte ? (
            <Panneau
              titre="Session ouverte"
              action={
                peutConsole(moi.role, 'assistance') && (
                  <form action={terminerAssistance}>
                    <input type="hidden" name="assistance" value={ouverte.id} />
                    <input type="hidden" name="retour" value={retour} />
                    <LienEnvoi className="text-rouge hover:underline">Fermer la session</LienEnvoi>
                  </form>
                )
              }
            >
              <p className="px-5 pt-4 text-[14.5px]">
                {ouverte.origine === 'client' ? `Ouverte par ${ouverte.repondu_par ?? 'le dirigeant'}` : `Demandée par ${ouverte.demandeur}, acceptée par ${ouverte.repondu_par ?? 'le dirigeant'}`}{' '}
                · jusqu’à <b>{quand(ouverte.fin)}</b>
                {ouverte.motif && <span className="block text-gris">« {ouverte.motif} »</span>}
              </p>
              {peutConsole(moi.role, 'assistance') ? (
                <>
                  <div className="flex gap-1.5 overflow-x-auto px-5 pt-4" role="group" aria-label="Que consulter">
                    {VUES.map((v) => (
                      <Link
                        key={v.cle}
                        href={lien('assistance', `&vue=${v.cle}`)}
                        aria-current={vue === v.cle ? 'true' : undefined}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[13.5px] font-bold transition ${vue === v.cle ? 'bg-cobalt text-white' : 'bg-doux text-cobalt hover:bg-lavande'}`}
                      >
                        {v.libelle}
                      </Link>
                    ))}
                  </div>
                  <div className="p-5">
                    {erreurDonnees ? (
                      <p className="text-rouge">{erreurDonnees}</p>
                    ) : (
                      <DonneesClient vue={vue} lignes={donnees ?? []} />
                    )}
                  </div>
                </>
              ) : (
                <p className="px-5 py-4 text-gris">Votre rôle ne donne pas accès aux données du client.</p>
              )}
            </Panneau>
          ) : enAttente ? (
            <Panneau
              titre="Demande en attente du client"
              action={
                <form action={terminerAssistance}>
                  <input type="hidden" name="assistance" value={enAttente.id} />
                  <input type="hidden" name="retour" value={retour} />
                  <LienEnvoi className="text-rouge hover:underline">Annuler la demande</LienEnvoi>
                </form>
              }
            >
              <p className="px-5 py-4 text-[14.5px]">
                {enAttente.demandeur} a demandé {dureeLisible(enAttente.duree_minutes)} d’accès {ilYa(enAttente.cree_le)} : « {enAttente.motif} ».
                <span className="block text-gris">Le dirigeant l’accepte ou la refuse depuis son bureau. Sans réponse, elle expire au bout de 24 heures.</span>
              </p>
            </Panneau>
          ) : peutConsole(moi.role, 'assistance') ? (
            <Panneau titre="Demander l’accès au dirigeant">
              <form action={demanderAssistance} className="grid gap-4 p-5 sm:grid-cols-[200px_minmax(0,1fr)]">
                <input type="hidden" name="entreprise" value={e.id} />
                <input type="hidden" name="retour" value={retour} />
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
                  <input name="motif" required maxLength={300} className="champ" placeholder="Vérifier pourquoi la facture FA-2026-0042 ne part pas" />
                </label>
                <div className="sm:col-span-2">
                  <BoutonEnvoi enCours="Envoi…">Envoyer la demande</BoutonEnvoi>
                </div>
              </form>
            </Panneau>
          ) : (
            <p className="text-gris">Votre rôle ne permet pas de demander une assistance.</p>
          )}

          <Panneau titre="Historique" nombre={f.assistances.length}>
            {f.assistances.length ? (
              <ul className="divide-y divide-trait">
                {f.assistances.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 text-[14.5px]">
                    <span className="min-w-0 flex-1">
                      <b>{a.origine === 'client' ? `Ouverte par ${a.repondu_par ?? 'le dirigeant'}` : `Demandée par ${a.demandeur}`}</b> · {dureeLisible(a.duree_minutes)}
                      {a.motif && <span className="block text-gris">« {a.motif} »</span>}
                      {a.debut && (
                        <small className="block text-[13px] text-gris">
                          Du {quand(a.debut)} au {quand(a.fin)}
                          {a.termine_par && ` · fermée par ${a.termine_par}`}
                        </small>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-[13px] text-gris">
                      {jour(a.cree_le)} <Puce ton={STATUT_ASSISTANCE[a.statut].ton}>{STATUT_ASSISTANCE[a.statut].libelle}</Puce>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-gris">Aucune session pour l’instant.</p>
            )}
          </Panneau>
        </div>
      )}

      {onglet === 'journal' && (
        <>
          <EnClair>
            Exactement ce que le dirigeant lit dans Paramètres › Accès de Chantio : chaque accès de l’équipe et chaque changement de son abonnement. Personne ne peut
            effacer ni modifier une ligne.
          </EnClair>
          <Panneau titre="Journal des accès" nombre={f.journal.length}>
            {f.journal.length ? (
              <ul className="divide-y divide-trait">
                {f.journal.map((j, i) => (
                  <li key={`${j.le}-${i}`} className="grid gap-x-4 gap-y-0.5 px-5 py-3 text-[14.5px] sm:grid-cols-[170px_150px_minmax(0,1fr)]">
                    <span className="text-gris tabular-nums">{quand(j.le)}</span>
                    <b>{j.qui}</b>
                    <span>{j.action}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-gris">Rien pour l’instant : personne de Chantio n’a accédé à ce compte.</p>
            )}
          </Panneau>
        </>
      )}
    </>
  );
}

function AbonnementForm({
  entreprise,
  formule,
  ab,
  prix,
  actifs,
  modifiable,
  retour,
}: {
  entreprise: string;
  formule: Formule;
  ab: { statut: StatutAbonnement; essai_fin: string | null; prix_special: number | string | null; options: string[]; modifie_le: string };
  prix: number;
  actifs: number;
  modifiable: boolean;
  retour: string;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <form action={modifierAbonnement} className="carte p-5 sm:p-6">
        <input type="hidden" name="entreprise" value={entreprise} />
        <input type="hidden" name="retour" value={retour} />
        <fieldset disabled={!modifiable} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="etiquette">Formule</span>
            <select name="formule" defaultValue={formule} className="champ">
              {(Object.keys(LIBELLE_FORMULE) as Formule[]).map((x) => (
                <option key={x} value={x}>
                  {LIBELLE_FORMULE[x]} · {PRIX_FORMULE_HT[x]} € HT / mois
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiquette">État du compte</span>
            <select name="statut" defaultValue={ab.statut} className="champ">
              {(Object.keys(LIBELLE_STATUT_ABONNEMENT) as StatutAbonnement[]).map((s) => (
                <option key={s} value={s}>
                  {LIBELLE_STATUT_ABONNEMENT[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiquette">Fin de l’essai (si en essai)</span>
            <input type="date" name="essai_fin" defaultValue={ab.essai_fin ?? ''} className="champ" />
          </label>
          <label className="block">
            <span className="etiquette">Prix particulier HT / mois (facultatif)</span>
            <input name="prix_special" inputMode="decimal" defaultValue={ab.prix_special == null ? '' : String(ab.prix_special).replace('.', ',')} placeholder="Prix de la formule" className="champ" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="etiquette">Options</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(OPTIONS_ABONNEMENT) as OptionAbonnement[]).map((o) => (
                <label key={o} className="flex items-start gap-2.5 rounded-[14px] border border-trait bg-white px-3.5 py-3">
                  <input type="checkbox" name="options" value={o} defaultChecked={ab.options?.includes(o)} className="mt-1 h-4 w-4 accent-[#2F54EB]" />
                  <span>
                    <b>{OPTIONS_ABONNEMENT[o].libelle}</b> · {OPTIONS_ABONNEMENT[o].prix} € HT / mois
                    <small className="block text-[13px] text-gris">{OPTIONS_ABONNEMENT[o].description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {modifiable && (
            <div className="sm:col-span-2">
              <BoutonEnvoi enCours="Enregistrement…">Enregistrer</BoutonEnvoi>
            </div>
          )}
        </fieldset>
        {!modifiable && <p className="mt-4 text-sm text-gris">Votre rôle permet de voir l’abonnement, pas de le changer.</p>}
      </form>
      <div className="grid content-start gap-3">
        <Tuile libelle="Prix mensuel" valeur={euros(prix)} detail={ab.statut === 'actif' ? 'HT, compté dans le revenu' : 'HT, pas compté (le compte n’est pas payant)'} />
        <EnClair>
          {AIDE_STATUT_ABONNEMENT[ab.statut]} {actifs} utilisateur{actifs > 1 ? 's' : ''} actif{actifs > 1 ? 's' : ''}. Chaque changement est noté dans le journal que voit le
          dirigeant. Pas encore de paiement en ligne : la facturation reste à faire à la main.
        </EnClair>
        <p className="text-[13px] text-gris">Dernier changement : {quand(ab.modifie_le)}</p>
      </div>
    </div>
  );
}

/** Tableaux en lecture seule des données du client pendant une session d'assistance. */
function DonneesClient({ vue, lignes }: { vue: Vue; lignes: Record<string, unknown>[] }) {
  const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  const montant = (v: unknown) => (v == null ? '—' : euros(Number(v)));
  const vide = lignes.length ? undefined : 'Rien dans cette rubrique.';
  if (vue === 'interventions')
    return (
      <Tableau entetes={['N°', 'Client', 'Motif', 'Prévue le', 'Techniciens', 'Statut']} vide={vide}>
        {lignes.map((l, i) => (
          <tr key={i}>
            <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{s(l.reference ?? l.numero)}</td>
            <td className="px-4 py-2.5">{s(l.client)}</td>
            <td className="px-4 py-2.5">{s(l.motif)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">{l.date_prevue ? jour(String(l.date_prevue)) : '—'}</td>
            <td className="px-4 py-2.5">{s(l.techniciens)}</td>
            <td className="px-4 py-2.5">{LIBELLE_STATUT[l.statut as keyof typeof LIBELLE_STATUT] ?? s(l.statut)}</td>
          </tr>
        ))}
      </Tableau>
    );
  if (vue === 'clients')
    return (
      <Tableau entetes={['Client', 'Type', 'Téléphone', 'E-mail', { t: 'Interventions', droite: true }]} vide={vide}>
        {lignes.map((l, i) => (
          <tr key={i}>
            <td className="px-4 py-2.5 font-bold">{s(l.nom)}</td>
            <td className="px-4 py-2.5">{LIBELLE_TYPE_CLIENT[l.type as keyof typeof LIBELLE_TYPE_CLIENT] ?? s(l.type)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">{s(l.telephone)}</td>
            <td className="px-4 py-2.5">{s(l.email)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{s(l.interventions)}</td>
          </tr>
        ))}
      </Tableau>
    );
  if (vue === 'documents')
    return (
      <Tableau entetes={['Document', 'Client', 'Objet', 'Date', { t: 'Total HT', droite: true }, 'Statut']} vide={vide}>
        {lignes.map((l, i) => (
          <tr key={i}>
            <td className="px-4 py-2.5 whitespace-nowrap">
              {l.genre === 'facture' ? 'Facture' : 'Devis'} {s(l.numero)}
            </td>
            <td className="px-4 py-2.5">{s(l.client)}</td>
            <td className="px-4 py-2.5">{s(l.objet)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">{l.date_document ? jour(String(l.date_document)) : '—'}</td>
            <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{montant(l.total_ht)}</td>
            <td className="px-4 py-2.5">{LIBELLE_STATUT_DOC[l.statut as keyof typeof LIBELLE_STATUT_DOC] ?? s(l.statut)}</td>
          </tr>
        ))}
      </Tableau>
    );
  return (
    <Tableau entetes={['Fournisseur', 'N°', 'Date', 'Échéance', { t: 'Montant TTC', droite: true }, 'Statut']} vide={vide}>
      {lignes.map((l, i) => (
        <tr key={i}>
          <td className="px-4 py-2.5 font-bold">{s(l.fournisseur)}</td>
          <td className="px-4 py-2.5">
            {s(l.numero)}
            {l.avoir === true && <small className="ml-1 text-gris">(avoir)</small>}
          </td>
          <td className="px-4 py-2.5 whitespace-nowrap">{l.date_facture ? jour(String(l.date_facture)) : '—'}</td>
          <td className="px-4 py-2.5 whitespace-nowrap">{l.echeance ? jour(String(l.echeance)) : '—'}</td>
          <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{montant(l.montant_ttc)}</td>
          <td className="px-4 py-2.5">{LIBELLE_STATUT_ACHAT[l.statut as keyof typeof LIBELLE_STATUT_ACHAT] ?? s(l.statut)}</td>
        </tr>
      ))}
    </Tableau>
  );
}
