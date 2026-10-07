import Link from 'next/link';
import { joursRestants, revenuMensuel, LIBELLE_FORMULE } from '@chantio/shared';
import { EnClair, PuceAbonnement, Tuile } from '@/components/console/elements';
import { Panneau, Titre } from '@/components/ui';
import { aujourdhuiParis, euros, ilYa } from '@/lib/console';
import { listeEntreprises, vueEnsemble } from './donnees';

// Vue d'ensemble : la page d'accueil de la console (combien de clients, combien de revenu,
// l'activité des 30 derniers jours, ce qui attend l'équipe).

const jourCourt = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

export default async function VueEnsemble() {
  const [v, entreprises] = await Promise.all([vueEnsemble(), listeEntreprises()]);
  const auj = aujourdhuiParis();
  const compte = (s: string) => entreprises.filter((e) => e.statut === s).length;
  const revenu = entreprises.reduce((s, e) => s + revenuMensuel({ ...e, utilisateurs: e.utilisateurs }), 0);
  const nouvelles = entreprises.filter((e) => joursRestants(auj, e.cree_le.slice(0, 10)) <= 30).length;
  const jours = v?.jours ?? [];
  const fiches30 = jours.reduce((s, j) => s + j.fiches, 0);
  const interventions30 = jours.reduce((s, j) => s + j.interventions, 0);
  const max = Math.max(1, ...jours.map((j) => j.fiches));
  const essaisProches = entreprises
    .filter((e) => e.statut === 'essai' && e.essai_fin && joursRestants(e.essai_fin, auj) <= 7)
    .sort((a, b) => (a.essai_fin ?? '').localeCompare(b.essai_fin ?? ''));
  const assistances = entreprises.filter((e) => e.assistance_ouverte);
  const aSurveiller = [
    ...(v?.identites_en_attente
      ? [{ href: '/console/identites', texte: `${v.identites_en_attente} identité${v.identites_en_attente > 1 ? 's' : ''} de dirigeant à vérifier` }]
      : []),
    ...(v?.demandes_assistance
      ? [{ href: '/console/assistance', texte: `${v.demandes_assistance} demande${v.demandes_assistance > 1 ? 's' : ''} d’assistance en attente du client` }]
      : []),
    ...assistances.map((e) => ({ href: `/console/entreprises/${e.id}?onglet=assistance`, texte: `Session d’assistance ouverte chez ${e.nom}` })),
    ...(v?.idees_nouvelles ? [{ href: '/console/idees', texte: `${v.idees_nouvelles} nouvelle${v.idees_nouvelles > 1 ? 's' : ''} idée${v.idees_nouvelles > 1 ? 's' : ''} de clients` }] : []),
  ];

  return (
    <>
      <Titre texte="Le tableau de bord de Chantio en tant qu’entreprise : vos clients, votre revenu et l’activité sur la plateforme.">
        Vue d’ensemble
      </Titre>
      {!v && (
        <EnClair>
          Les chiffres ne se chargent pas : le script SQL de la console a-t-il bien été passé dans Supabase ?
        </EnClair>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile
          i={0}
          libelle="Entreprises clientes"
          valeur={entreprises.length - compte('resilie')}
          detail={`${compte('actif')} payante${compte('actif') > 1 ? 's' : ''} · ${compte('essai')} en essai · ${compte('offert')} offerte${compte('offert') > 1 ? 's' : ''}`}
        />
        <Tuile i={1} libelle="Revenu mensuel" valeur={euros(revenu)} detail="HT, clients payants seulement" />
        <Tuile i={2} libelle="Utilisateurs" valeur={v?.utilisateurs ?? '—'} detail={`${v?.connectes_7j ?? 0} connecté${(v?.connectes_7j ?? 0) > 1 ? 's' : ''} ces 7 derniers jours`} />
        <Tuile i={3} libelle="Nouvelles entreprises" valeur={nouvelles} detail="ces 30 derniers jours" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panneau titre="Fiches d’intervention envoyées par jour" action={<span className="font-semibold text-gris">30 derniers jours</span>}>
          <div className="px-5 pt-4 pb-5">
            <p className="mb-3 text-[14.5px] text-gris">
              <b className="text-encre tabular-nums">{fiches30}</b> fiche{fiches30 > 1 ? 's' : ''} envoyée{fiches30 > 1 ? 's' : ''} et{' '}
              <b className="text-encre tabular-nums">{interventions30}</b> intervention{interventions30 > 1 ? 's' : ''} créée{interventions30 > 1 ? 's' : ''}, toutes entreprises confondues.
            </p>
            <div className="flex h-40 items-end gap-[2px] border-b border-trait" aria-hidden="true">
              {jours.map((j) => (
                <div key={j.jour} className="group relative flex h-full flex-1 items-end">
                  <div
                    title={`${jourCourt(j.jour)} : ${j.fiches} fiche${j.fiches > 1 ? 's' : ''}, ${j.interventions} intervention${j.interventions > 1 ? 's' : ''} créée${j.interventions > 1 ? 's' : ''}`}
                    className={`w-full rounded-t-[4px] transition group-hover:bg-cobalt ${j.jour === auj ? 'bg-cobalt' : 'bg-pervenche'}`}
                    style={{ height: j.fiches ? `${Math.max(3, (j.fiches / max) * 100)}%` : '2px', opacity: j.fiches ? 1 : 0.35 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-xs font-semibold text-gris">
              <span>{jours[0] ? jourCourt(jours[0].jour) : ''}</span>
              <span>{jours[14] ? jourCourt(jours[14].jour) : ''}</span>
              <span>Aujourd’hui</span>
            </div>
            <table className="sr-only">
              <caption>Fiches envoyées et interventions créées par jour</caption>
              <tbody>
                {jours.map((j) => (
                  <tr key={j.jour}>
                    <th scope="row">{jourCourt(j.jour)}</th>
                    <td>{j.fiches} fiches</td>
                    <td>{j.interventions} interventions</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[13px] text-gris">Les creux sont souvent les week-ends. Survolez une barre pour voir le détail du jour.</p>
          </div>
        </Panneau>

        <Panneau titre="Ce qui vous attend" nombre={aSurveiller.length + essaisProches.length}>
          <ul className="divide-y divide-trait">
            {aSurveiller.map((a) => (
              <li key={a.texte}>
                <Link href={a.href} className="flex items-center gap-3 px-5 py-3 font-semibold transition hover:bg-fond">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{a.texte}</span>
                  <span className="text-gris" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
            {essaisProches.map((e) => (
              <li key={e.id}>
                <Link href={`/console/entreprises/${e.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-fond">
                  <span className="min-w-0 flex-1">
                    <b>{e.nom}</b>
                    <small className="block text-[13px] text-gris">
                      Essai {joursRestants(e.essai_fin!, auj) >= 0 ? `: plus que ${joursRestants(e.essai_fin!, auj)} j` : 'terminé'} · {LIBELLE_FORMULE[e.formule]} · dernière connexion{' '}
                      {ilYa(e.derniere_connexion)}
                    </small>
                  </span>
                  <PuceAbonnement statut={e.statut} jours={joursRestants(e.essai_fin!, auj)} />
                </Link>
              </li>
            ))}
            {!aSurveiller.length && !essaisProches.length && <li className="px-5 py-8 text-center text-sm text-gris">Rien ne vous attend pour l’instant.</li>}
          </ul>
        </Panneau>
      </div>
    </>
  );
}
