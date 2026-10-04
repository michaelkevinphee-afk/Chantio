import Link from 'next/link';
import { adresseComplete, ajouterJours, ajouterMois, aujourdhui, derniereVisite, euroRond, type Visite } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton, Puce, Titre, Vide, classeBouton } from '@/components/ui';
import { Volet } from '@/components/volet';
import { chargerContrats, suivreContrat, type ContratLu } from '@/lib/contrats';
import { contexteBureau } from '@/lib/session';
import { OngletsClients } from '../onglets';
import { planifierVisites, preparerRenouvellement, reporterRenouvellement } from './actions';
import { FormulaireContrat, type ClientContrat } from './formulaire-contrat';

export const metadata = { title: 'Contrats d’entretien · Chantio' };

type Suivi = ReturnType<typeof suivreContrat>;
type ClientSites = { id: string; nom: string; sites: { id: string; adresse: string; code_postal: string | null; ville: string | null }[] };

const s = (n: number) => (n > 1 ? 's' : '');
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const jjmmaaaa = (iso: string) => `${jjmm(iso)}/${iso.slice(0, 4)}`;
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Une visite : faite, au planning, à placer au planning, à créer, ou après la fin du contrat. */
function etatVisite(v: Visite): { ton: string; texte: string } {
  if (v.faite) return { ton: 'bg-vert-doux text-vert', texte: 'faite' };
  if (v.intervention?.date_prevue) return { ton: 'bg-bleu-doux text-bleu', texte: `prévue le ${jjmm(v.intervention.date_prevue)}` };
  if (v.intervention) return { ton: 'bg-violet-doux text-violet', texte: 'à placer au planning' };
  if (v.apresFin) return { ton: 'bg-gris-doux text-gris line-through', texte: 'après la fin' };
  return { ton: 'border border-dashed border-pervenche text-encre', texte: 'à créer' };
}

export default async function Contrats({ searchParams }: PageProps<'/clients/contrats'>) {
  const { supabase } = await contexteBureau();
  const { vue, nouveau, contrat, client, enregistre, visites, ref, erreur } = await searchParams;
  const jour = aujourdhui();
  const echeancier = vue === 'echeancier';
  const filtre = typeof client === 'string' ? client : null;

  const [tous, { data: clientsBruts }, { data: equipements }] = await Promise.all([
    chargerContrats(supabase),
    supabase.from('clients').select('id, nom, sites(id, adresse, code_postal, ville)').order('nom'),
    supabase.from('equipements').select('id, site_id, prochain_passage').limit(5000),
  ]);
  const clients = (clientsBruts ?? []) as ClientSites[];
  const suivis = tous.map((c) => ({ c, s: suivreContrat(c, jour) }));
  const affiches = suivis
    .filter((x) => !filtre || x.c.client_id === filtre)
    // Ce qui demande d'agir d'abord, puis par date limite de préavis.
    .sort((a, b) => Number(b.s.etat.aRenouveler) - Number(a.s.etat.aRenouveler) || a.s.limite.localeCompare(b.s.limite));

  const ca = tous.reduce((t, c) => t + c.montant_ht, 0);
  const aRenouveler = suivis.filter((x) => x.s.etat.aRenouveler).length;
  const prochaines = suivis.flatMap((x) => x.s.visites.filter((v) => !v.faite && !v.apresFin && v.date <= ajouterJours(jour, 30)));
  const nonPlanifiees = prochaines.filter((v) => !v.intervention?.date_prevue).length;
  const eq = equipements ?? [];
  const eqProches = eq.filter((e) => e.prochain_passage && e.prochain_passage <= ajouterJours(jour, 30)).length;

  const base = `/clients/contrats${filtre ? `?client=${filtre}` : ''}`;
  const lien = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...(filtre ? { client: filtre } : {}), ...(echeancier ? { vue: 'echeancier' } : {}), ...params });
    return `/clients/contrats?${q}`;
  };
  const fermer = lien({});
  const ouvert = typeof contrat === 'string' ? tous.find((c) => c.id === contrat) ?? null : null;
  const nomFiltre = filtre ? clients.find((c) => c.id === filtre)?.nom : null;
  const debutPropose = `${ajouterMois(jour, 1).slice(0, 7)}-01`;

  const tuiles = [
    { libelle: 'Contrats d’entretien', valeur: tous.length, aide: `${euroRond(ca)} HT par an`, couleur: 'text-encre' },
    { libelle: 'À renouveler', valeur: aRenouveler, aide: 'préavis dans moins de 90 jours', couleur: aRenouveler ? 'text-violet' : 'text-encre' },
    {
      libelle: 'Visites dans les 30 jours',
      valeur: prochaines.length,
      aide: nonPlanifiees ? `dont ${nonPlanifiees} pas encore au planning` : 'toutes au planning',
      couleur: nonPlanifiees ? 'text-cobalt' : 'text-encre',
    },
    { libelle: 'Équipements suivis', valeur: eq.length, aide: eqProches ? `${eqProches} à passer d’ici 30 jours` : 'aux adresses des clients', couleur: 'text-encre' },
  ];

  return (
    <>
      <Titre
        sous="Préavis, reconduction, visites et renouvellements"
        actions={
          <LienBouton href={lien({ nouveau: '1' })} scroll={false}>
            <Icone nom="plus" taille={18} /> Nouveau contrat
          </LienBouton>
        }
      >
        Contrats d’entretien
      </Titre>
      <OngletsClients actif="contrats" />

      {typeof visites === 'string' && (
        <p className="apparition mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          {Number(visites) > 0
            ? `✓ ${visites} visite${s(Number(visites))} créée${s(Number(visites))}${typeof ref === 'string' && ref ? ` pour ${ref}` : ''} : ${Number(visites) > 1 ? 'elles attendent' : 'elle attend'} dans « À planifier » du planning.`
            : 'Les visites n’ont pas pu être créées. Réessayez.'}
          {Number(visites) > 0 && (
            <Link href="/planning" className="font-bold text-cobalt hover:underline">
              Ouvrir le planning
            </Link>
          )}
        </p>
      )}
      {typeof enregistre === 'string' && !ouvert && (
        <p className="apparition mb-5 rounded-xl bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">✓ Contrat enregistré.</p>
      )}
      {typeof erreur === 'string' && <p className="mb-5 rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}

      <section className="carte mb-6 grid grid-cols-2 divide-trait max-md:divide-y md:grid-cols-4 md:divide-x">
        {tuiles.map((t) => (
          <div key={t.libelle} className="px-5 py-4">
            <p className="text-[13px] font-bold text-gris">{t.libelle}</p>
            <p className={`mt-1.5 text-4xl font-extrabold leading-none tracking-[-0.03em] tabular-nums ${t.couleur}`}>{t.valeur}</p>
            <p className="mt-1 text-xs text-gris">{t.aide}</p>
          </div>
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['contrats', 'Contrats'],
            ['echeancier', 'Échéancier sur 12 mois'],
          ] as const
        ).map(([v, libelle]) => {
          const actif = (v === 'echeancier') === echeancier;
          return (
            <Link
              key={v}
              href={`/clients/contrats?${new URLSearchParams({ ...(filtre ? { client: filtre } : {}), ...(v === 'echeancier' ? { vue: v } : {}) })}`}
              aria-current={actif ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${actif ? 'degrade border border-transparent text-white' : 'border border-trait bg-white hover:border-cobalt'}`}
            >
              {libelle}
            </Link>
          );
        })}
        {nomFiltre && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-doux px-3 py-1.5 text-sm font-bold text-cobalt">
            {nomFiltre}
            <Link href={echeancier ? '/clients/contrats?vue=echeancier' : '/clients/contrats'} aria-label="Voir tous les contrats" className="hover:text-encre">
              <Icone nom="fermer" taille={14} />
            </Link>
          </span>
        )}
      </div>

      {!affiches.length ? (
        <Vide titre={filtre ? 'Aucun contrat pour ce client' : 'Aucun contrat d’entretien'}>
          Créez un contrat pour suivre ses visites, sa date limite de préavis et préparer son renouvellement en un clic.
        </Vide>
      ) : echeancier ? (
        <Echeancier suivis={affiches} jour={jour} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {affiches.map(({ c, s: suivi }) => (
            <CarteContrat key={c.id} c={c} suivi={suivi} jour={jour} modifier={lien({ contrat: c.id })} marque={enregistre === c.id} />
          ))}
        </div>
      )}

      {(nouveau || ouvert) && (
        <Volet
          fermer={fermer}
          titre={ouvert ? `Contrat ${ouvert.reference ?? ''}` : 'Nouveau contrat d’entretien'}
          sous={ouvert ? ouvert.client?.nom : 'Visites régulières, préavis et reconduction'}
        >
          <FormulaireContrat
            contrat={ouvert}
            clients={clients.map((k): ClientContrat => ({ id: k.id, nom: k.nom, sites: k.sites.map((x) => ({ id: x.id, adresse: adresseComplete(x) })) }))}
            clientInitial={filtre}
            debutPropose={debutPropose}
            retour={base}
          />
        </Volet>
      )}
    </>
  );
}

function CarteContrat({ c, suivi, jour, modifier, marque }: { c: ContratLu; suivi: Suivi; jour: string; modifier: string; marque: boolean }) {
  const { etat, periode, limite, visites, aPlanifier } = suivi;
  const total = Math.max(1, ecart(periode.debut, periode.fin));
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (ecart(periode.debut, iso) / total) * 100))}%`;
  const r = c.renouvellement;
  const proposition = r && !['refuse', 'annule'].includes(r.statut);

  return (
    <article id={`ct-${c.id}`} className={`carte flex flex-col p-5 ${marque ? 'ring-2 ring-cobalt' : ''}`}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gris">
            <span className="font-mono">{c.reference}</span> ·{' '}
            <Link href={`/clients?fiche=${c.client_id}`} className="font-bold hover:text-cobalt">
              {c.client?.nom}
            </Link>
          </p>
          <h2 className="mt-0.5 text-lg font-extrabold leading-snug">{c.objet}</h2>
          {c.site && (
            <p className="flex items-center gap-1.5 truncate text-sm text-gris">
              <Icone nom="lieu" taille={14} className="shrink-0" /> {adresseComplete(c.site)}
            </p>
          )}
        </div>
        <Puce ton={etat.ton}>{etat.etiquette}</Puce>
      </header>
      <p className={`mt-3 text-sm ${etat.aRenouveler ? 'font-semibold text-encre' : 'text-gris'}`}>{etat.detail}</p>

      {/* Période en cours : ce qui est écoulé, la date limite de préavis, aujourd'hui. */}
      <div className="mt-4" aria-hidden="true">
        <div className="relative h-2 rounded-full bg-doux">
          <i className="degrade absolute inset-y-0 left-0 rounded-full shadow-none" style={{ width: pos(jour) }} />
          <em className="absolute -top-1 h-4 w-0.5 rounded bg-violet" style={{ left: pos(limite) }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-gris tabular-nums">
          <span>{jjmmaaaa(periode.debut)}</span>
          <span className="font-bold text-violet">Préavis {jjmmaaaa(limite)}</span>
          <span>Fin {jjmmaaaa(periode.fin)}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ['Montant', `${euroRond(c.montant_ht)} HT/an`],
          ['Visites', `${c.visites_par_an} par an`],
          ['Dernière visite', jjmmaaaa(derniereVisite(c, c.interventions))],
          ['Reconduction', c.tacite ? 'Tacite' : 'À signer'],
        ].map(([libelle, valeur]) => (
          <div key={libelle} className="rounded-xl bg-fond px-3 py-2">
            <dt className="text-[11px] font-bold tracking-[0.06em] text-gris uppercase">{libelle}</dt>
            <dd className="font-extrabold tabular-nums">{valeur}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-bold text-gris">Visites des 12 prochains mois</p>
        {visites.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {visites.map((v) => {
              const e = etatVisite(v);
              const puce = (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${e.ton}`}>
                  <span className="tabular-nums">{jjmm(v.date)}</span> · {e.texte}
                </span>
              );
              return <li key={v.date}>{v.intervention ? <Link href={`/interventions/${v.intervention.id}`}>{puce}</Link> : puce}</li>;
            })}
          </ul>
        ) : (
          <p className="text-sm text-gris">Aucune visite dans les 12 prochains mois.</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {aPlanifier.length > 0 && (
          <form action={planifierVisites.bind(null, c.id)}>
            <BoutonEnvoi className="!px-4 !py-2 text-sm" enCours="Création…">
              Créer {aPlanifier.length} visite{s(aPlanifier.length)}
            </BoutonEnvoi>
          </form>
        )}
        {r?.statut === 'signe' ? (
          <form action={reporterRenouvellement.bind(null, c.id)}>
            <BoutonEnvoi variante={aPlanifier.length ? 'secondaire' : 'principal'} className="!px-4 !py-2 text-sm" enCours="Report…">
              Reporter les nouvelles dates
            </BoutonEnvoi>
          </form>
        ) : proposition ? (
          <Link href={`/devis/${r.id}`} className={classeBouton('secondaire', '!px-4 !py-2 text-sm')}>
            Voir la proposition {r.numero ?? ''}
          </Link>
        ) : (
          <form action={preparerRenouvellement.bind(null, c.id)}>
            <BoutonEnvoi variante={etat.aRenouveler && !aPlanifier.length ? 'principal' : 'secondaire'} className="!px-4 !py-2 text-sm" enCours="Préparation…">
              Préparer le renouvellement
            </BoutonEnvoi>
          </form>
        )}
        <Link href={modifier} scroll={false} className={classeBouton('secondaire', '!px-4 !py-2 text-sm')}>
          Modifier
        </Link>
      </div>
    </article>
  );
}

/** Les douze prochains mois : visites, dates limites de préavis et fins de contrat, avec les totaux. */
function Echeancier({ suivis, jour }: { suivis: { c: ContratLu; s: Suivi }[]; jour: string }) {
  const mois = Array.from({ length: 12 }, (_, k) => ajouterMois(`${jour.slice(0, 7)}-01`, k).slice(0, 7));
  const nbVisites = mois.map(() => 0);
  const caVisites = mois.map(() => 0);
  const lignes = suivis.map(({ c, s: suivi }) =>
    mois.map((m, k) => {
      const v = suivi.visites.filter((x) => x.date.startsWith(m) && !x.apresFin);
      nbVisites[k] += v.length;
      caVisites[k] += v.length * (c.montant_ht / Math.max(1, c.visites_par_an));
      return { v, preavis: suivi.limite.startsWith(m), fin: suivi.periode.fin.startsWith(m) };
    }),
  );

  return (
    <section className="carte overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="bg-fond/60 text-xs text-gris">
              <th className="border-b border-trait px-4 py-2.5 text-left font-bold tracking-wide uppercase">Contrat</th>
              {mois.map((m) => (
                <th key={m} className={`border-b border-l border-trait px-1 py-2 text-center font-bold ${m === jour.slice(0, 7) ? 'bg-doux text-cobalt' : ''}`}>
                  {MOIS[Number(m.slice(5, 7)) - 1]}
                  <span className="block text-[10px] font-semibold">{m.slice(0, 4)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suivis.map(({ c, s: suivi }, n) => (
              <tr key={c.id}>
                <th className="max-w-[240px] border-b border-trait px-4 py-2.5 text-left font-normal">
                  <span className="block truncate text-[11px] text-gris">
                    <span className="font-mono">{c.reference}</span> · {c.client?.nom}
                  </span>
                  <span className="block truncate font-bold" title={c.objet}>
                    {c.objet}
                  </span>
                  <span className="mt-1 inline-block">
                    <Puce ton={suivi.etat.ton}>{suivi.etat.etiquette}</Puce>
                  </span>
                </th>
                {lignes[n].map((cel, k) => (
                  <td key={mois[k]} className="border-b border-l border-trait px-1 py-2 text-center align-middle">
                    <span className="flex flex-col items-center gap-1">
                      {cel.v.length > 0 && (
                        <span className="flex gap-0.5">
                          {cel.v.map((x) => (
                            <b
                              key={x.date}
                              title={`Visite vers le ${jjmmaaaa(x.date)} · ${etatVisite(x).texte}`}
                              className={`text-base leading-none ${x.faite ? 'text-vert' : x.intervention ? 'text-cobalt' : 'text-pervenche'}`}
                            >
                              ●
                            </b>
                          ))}
                        </span>
                      )}
                      {cel.preavis && <span className="rounded-full bg-violet-doux px-1.5 text-[10px] font-extrabold text-violet">Préavis</span>}
                      {cel.fin && (
                        <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${c.tacite ? 'bg-vert-doux text-vert' : 'bg-gris-doux text-gris'}`}>
                          {c.tacite ? 'Reconduit' : 'Fin'}
                        </span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-fond/60 font-bold">
              <th className="border-b border-trait px-4 py-2 text-left">Visites du mois</th>
              {nbVisites.map((v, k) => (
                <td key={mois[k]} className="border-b border-l border-trait px-1 py-2 text-center tabular-nums">
                  {v || ''}
                </td>
              ))}
            </tr>
            <tr className="bg-fond/60 font-bold">
              <th className="px-4 py-2 text-left">Chiffre d’affaires des visites</th>
              {caVisites.map((v, k) => (
                <td key={mois[k]} className="border-l border-trait px-1 py-2 text-center text-xs tabular-nums">
                  {v ? euroRond(v) : ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-trait px-5 py-2.5 text-xs text-gris">
        <span>
          <b className="text-vert">●</b> Visite faite
        </span>
        <span>
          <b className="text-cobalt">●</b> Visite créée
        </span>
        <span>
          <b className="text-pervenche">●</b> Visite à créer
        </span>
        <span>
          <span className="rounded-full bg-violet-doux px-1.5 font-extrabold text-violet">Préavis</span> Date limite pour proposer le renouvellement
        </span>
      </p>
    </section>
  );
}
