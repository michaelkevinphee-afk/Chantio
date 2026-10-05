import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  LIBELLE_STATUT,
  ajouterMois,
  derniereVisite,
  eurBac,
  jjmmaaaaBac,
  type DocumentSuivi,
  type InterventionFiche,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton, Puce, classeBouton } from '@/components/ui';
import { etatBac, suivreContrat, type Batiment, type ContratLu } from '@/lib/contrats';
import { PuceType } from '../[id]/blocs';
import { planifierVisites, preparerRenouvellement, reporterRenouvellement } from '../contrats/actions';
import { AnnonceRenouvellement } from '../fenetres';

// Les blocs de « Immeubles et contrats » dans l'ordre du bac (vParc, ficheBat, echeancier).

const eur0 = (n: number) => eurBac(n, 0);
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const telTexte = (t: string) => t.replace(/ /g, ' ');
const MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const LIB_DOC_STATUT: Record<StatutDocument, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  signe: 'Signé',
  refuse: 'Refusé',
  a_encaisser: 'À encaisser',
  payee: 'Payée',
  annule: 'Annulée',
};
const LIB_TYPE_FACTURE: Record<TypeFacture, string> = {
  totale: 'Facture',
  acompte: 'Facture d’acompte',
  avancement: 'Facture d’avancement',
  situation: 'Situation de travaux',
  solde: 'Facture de solde',
  avoir: 'Avoir',
};
const libDoc = (d: DocumentSuivi) => (d.genre === 'devis' ? 'Devis' : (d.type_facture && LIB_TYPE_FACTURE[d.type_facture]) || 'Facture');

const ETIQ = 'text-[11px] font-bold tracking-[0.07em] text-gris uppercase';
const PETIT = '!px-2.5 !py-1.5 !text-[13px] !rounded-[12px] max-[700px]:min-h-11';

/** Une tuile du haut (« Contrats d’entretien 5 · 14 685 € HT par an »). */
export function Tuile({ libelle, valeur, sous, rouge = false }: { libelle: string; valeur: ReactNode; sous: string; rouge?: boolean }) {
  return (
    <div className="carte flex min-w-0 flex-col gap-1 p-3.5">
      <small className="text-[12.5px] text-gris">{libelle}</small>
      <b className={`text-[26px] leading-tight font-extrabold tabular-nums ${rouge ? 'text-rouge' : ''}`}>{valeur}</b>
      <small className="text-[12.5px] text-gris">{sous}</small>
    </div>
  );
}

/** En-tête de la fiche d'un bâtiment : nom, description, boutons, puis qui commande, qui paie, accès, occupants. */
export function EnTeteBatiment({ b, nouvelleIntervention, nouveauContrat }: { b: Batiment; nouvelleIntervention: string; nouveauContrat: string }) {
  const k = b.client;
  const s = b.site;
  const premier = k.contacts_client?.[0];
  const contact = k.contact || (premier ? [premier.nom, premier.fonction].filter(Boolean).join(', ') : '');
  const tel = k.mobile || k.telephone;
  const fiche = `/clients/${k.id}?depuis=immeubles${s ? `&site=${s.id}` : ''}`;
  const paie = s ? s.copropriete || (k.type === 'bailleur' ? `${k.nom}, ${s.adresse}` : `Syndicat des copropriétaires du ${s.adresse}`) : '';
  const info = (etiq: string, b: ReactNode, small?: ReactNode, apres?: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] bg-fond px-3 py-2.5 [overflow-wrap:anywhere]">
      <span className={ETIQ}>{etiq}</span>
      <b className="font-extrabold">{b}</b>
      {small && <small className="text-xs text-gris">{small}</small>}
      {apres}
    </div>
  );
  return (
    <div className="carte flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-[20px] leading-tight font-extrabold [overflow-wrap:anywhere]">{b.nom}</h2>
          <p className="text-[15px] text-gris">{b.description}</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <LienBouton variante="secondaire" href={nouvelleIntervention} scroll={false} prefetch={false} className={PETIT}>
            Nouvelle intervention
          </LienBouton>
          <LienBouton variante="secondaire" href={nouveauContrat} scroll={false} className={PETIT}>
            Nouveau contrat ici
          </LienBouton>
        </div>
      </div>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {info(
          'Qui commande',
          k.nom,
          contact || undefined,
          <Link href={fiche} className="inline-flex items-center self-start text-[12.5px] font-bold text-cobalt hover:underline max-[700px]:min-h-11">
            Voir la fiche client
          </Link>,
        )}
        {b.immeuble && s ? (
          <>
            {info('Qui paie', paie)}
            {info('Accès', `Code ${s.acces || '—'}`, `Gardien : ${s.gardien || '—'}`)}
            {info('Occupants connus', s.occupants.length, s.occupants.map((o) => o.nom).join(', ') || undefined)}
          </>
        ) : (
          info('Contact', <span className="tabular-nums">{tel ? telTexte(tel) : ''}</span>)
        )}
      </div>
    </div>
  );
}

/** La carte d'un contrat : état, frise de la période, faits, prochaines visites et boutons. */
export function CarteContrat({
  c,
  jour,
  modifier,
  enAvant,
  retour,
}: {
  c: ContratLu;
  jour: string;
  modifier: string;
  enAvant: boolean;
  /** Page où ramène la croix de l'éditeur après « Préparer le renouvellement ». */
  retour?: string;
}) {
  const { periode, limite, visites, aPlanifier } = suivreContrat(c, jour);
  const e = etatBac(c, jour);
  const total = Math.max(1, ecart(periode.debut, periode.fin));
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (ecart(periode.debut, iso) / total) * 100))}%`;
  const r = c.renouvellement;
  const proposition = r && r.statut !== 'refuse' && r.statut !== 'annule';
  return (
    <article
      id={`ct-${c.id}`}
      className={`carte flex min-w-0 scroll-mt-24 flex-col gap-3 border-l-4 !border-l-cobalt p-4 ${enAvant ? 'ring-2 ring-cobalt' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <span className={ETIQ}>
            Contrat d’entretien <span className="font-mono">{c.reference}</span>
          </span>
          <h2 className="text-[17px] leading-tight font-extrabold [overflow-wrap:anywhere]">{c.objet}</h2>
        </div>
        <Puce ton={e.ton}>{e.etiquette}</Puce>
      </div>
      <p className={`text-[12.5px] ${e.alerte ? 'font-bold text-rouge' : 'text-gris'}`}>{e.detail}</p>
      <div aria-hidden="true">
        <div className="relative mt-1 h-2.5 rounded-[5px] bg-doux">
          <i className="absolute inset-y-0 left-0 rounded-[5px] bg-pervenche" style={{ width: pos(jour) }} />
          <em className="absolute -top-1 -bottom-1 w-[3px] rounded-sm bg-violet" style={{ left: pos(limite) }} />
          <em
            className="absolute top-[-1px] -ml-1.5 h-3 w-3 rounded-full border-2 border-white bg-cobalt shadow-[0_0_0_1px_var(--color-cobalt)]"
            style={{ left: pos(jour) }}
          />
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-[11.5px] text-gris tabular-nums">
          <span>{jjmmaaaaBac(periode.debut)}</span>
          <span>Préavis {jjmmaaaaBac(limite)}</span>
          <span>Fin {jjmmaaaaBac(periode.fin)}</span>
        </div>
      </div>
      <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        {[
          ['Montant', `${eur0(c.montant_ht)} HT / an`],
          ['Visites', `${c.visites_par_an} par an`],
          ['Dernière visite', jjmmaaaaBac(derniereVisite(c, c.interventions))],
          ['Reconduction', `${c.tacite ? 'Tacite' : 'À signer'} · préavis ${c.preavis_mois} mois`],
        ].map(([dt, dd]) => (
          <div key={dt} className="flex min-w-0 flex-col">
            <dt className="text-xs text-gris">{dt}</dt>
            <dd className="m-0 font-extrabold tabular-nums">{dd}</dd>
          </div>
        ))}
      </dl>
      <div>
        <span className={ETIQ}>Prochaines visites</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {visites.length ? (
            visites.map((v) => (
              <span
                key={v.date}
                title={v.intervention ? `${v.intervention.reference ?? ''} · ${LIBELLE_STATUT[v.intervention.statut]}` : v.apresFin ? 'Après la fin du contrat' : 'À planifier'}
                className={`rounded-lg border px-[9px] py-[3px] text-[12.5px] font-semibold tabular-nums ${
                  v.intervention ? 'border-cobalt bg-doux text-cobalt' : 'border-dashed border-lavande text-gris'
                } ${v.apresFin ? 'opacity-50' : ''}`}
              >
                {jjmmaaaaBac(v.date)}
                {v.faite ? ' · faite' : v.intervention ? ' ✓' : ''}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] text-gris">Aucune dans les 12 mois</span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {aPlanifier.length > 0 ? (
          <form action={planifierVisites.bind(null, c.id)}>
            <BoutonEnvoi className={PETIT} enCours="Création…">
              Planifier les visites de l’année
            </BoutonEnvoi>
          </form>
        ) : (
          <button type="button" disabled className={classeBouton('principal', PETIT)}>
            Visites planifiées
          </button>
        )}
        {proposition ? (
          <LienBouton variante="secondaire" href={`/devis/${r.id}`} className={PETIT}>
            Voir la proposition
          </LienBouton>
        ) : (
          <form action={preparerRenouvellement.bind(null, c.id)}>
            {retour && <input type="hidden" name="retour" value={retour} />}
            <AnnonceRenouvellement />
            <BoutonEnvoi variante="secondaire" className={PETIT} enCours="Préparation…">
              Préparer le renouvellement
            </BoutonEnvoi>
          </form>
        )}
        {r?.statut === 'signe' && (
          <form action={reporterRenouvellement.bind(null, c.id)}>
            <BoutonEnvoi variante="secondaire" className={PETIT} enCours="Report…">
              Reporter les nouvelles dates
            </BoutonEnvoi>
          </form>
        )}
        <LienBouton variante="secondaire" href={modifier} scroll={false} className={PETIT}>
          Modifier
        </LienBouton>
      </div>
    </article>
  );
}

/** Équipements suivis du bâtiment. */
export function Equipements({ b, jour, lien }: { b: Batiment; jour: string; lien: (equipement: string) => string }) {
  const equips = b.site?.equipements ?? [];
  return (
    <section className="carte flex min-w-0 flex-col gap-3 p-4" aria-labelledby="eq-t">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="eq-t" className="text-[17px] font-extrabold">
          Équipements
        </h2>
        {/* Un équipement se range à une adresse : pas d'ajout sur un contrat sans adresse. */}
        {b.site && (
          <LienBouton variante="secondaire" href={lien('nouveau')} scroll={false} className={PETIT}>
            + Équipement
          </LienBouton>
        )}
      </div>
      <div className="flex flex-col">
        {equips.length ? (
          [...equips]
            .sort((x, y) => (x.prochain_passage ?? '9999').localeCompare(y.prochain_passage ?? '9999') || x.categorie.localeCompare(y.categorie))
            .map((q) => {
              const j = q.prochain_passage ? ecart(jour, q.prochain_passage) : null;
              const detail = [q.marque, q.modele].filter(Boolean).join(' · ');
              return (
                <div key={q.id} className="flex justify-between gap-3 border-b border-trait py-2.5 last:border-b-0">
                  <div className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
                    <b className="font-extrabold">{q.categorie}</b>
                    {detail && <small className="text-xs text-gris">{detail}</small>}
                    {q.obligation && <span className="mt-0.5 self-start rounded-md bg-violet-doux px-[7px] py-px text-[11px] font-bold text-violet">{q.obligation}</span>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end text-right whitespace-nowrap tabular-nums">
                    <small className="text-xs text-gris">Prochain passage</small>
                    <b className={j != null && j <= 15 ? 'font-bold text-rouge' : 'font-extrabold'}>{q.prochain_passage ? jjmmaaaaBac(q.prochain_passage) : '—'}</b>
                    {q.dernier_passage && <small className="text-xs text-gris">Dernier {jjmmaaaaBac(q.dernier_passage)}</small>}
                    <Link href={lien(q.id)} scroll={false} className="inline-flex items-center text-[12.5px] font-bold text-cobalt hover:underline max-[700px]:min-h-11">
                      Modifier
                    </Link>
                  </div>
                </div>
              );
            })
        ) : (
          <p className="p-2.5 text-center text-[13px] text-gris">Aucun équipement suivi.</p>
        )}
      </div>
    </section>
  );
}

const LIGNE_H = 'grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 border-b border-trait py-2 text-[13px] last:border-b-0 hover:bg-[#F9FAFF]';

/** Historique du bâtiment : ses interventions, puis ses devis et factures, du plus récent au plus ancien. */
export function HistoriqueBatiment({
  interventions,
  documents,
  lien,
}: {
  interventions: InterventionFiche[];
  documents: DocumentSuivi[];
  /** Une intervention s'ouvre dans son volet, par-dessus la page (?fiche=<id>), comme dans le bac. */
  lien: (id: string) => string;
}) {
  const I = [...interventions].sort((x, y) => (y.date_prevue || y.souhaitee_le || '').localeCompare(x.date_prevue || x.souhaitee_le || ''));
  const D = [...documents].sort((x, y) => (y.date_document || '').localeCompare(x.date_document || ''));
  return (
    <section className="carte flex min-w-0 flex-col gap-3 p-4" aria-labelledby="hb-t">
      <h2 id="hb-t" className="text-[17px] font-extrabold">
        Historique du bâtiment
      </h2>
      <div className="flex flex-col">
        {I.map((i) => (
          <Link key={i.id} href={lien(i.id)} scroll={false} className={LIGNE_H}>
            <span className="font-mono text-xs text-gris">{i.reference ?? i.numero}</span>
            <PuceType type={i.type} />
            <span className="truncate">{i.motif}</span>
            <small className="col-start-3 text-xs text-gris">
              {i.date_prevue ? `${jjmmaaaaBac(i.date_prevue)} · ` : ''}
              {LIBELLE_STATUT[i.statut]}
              {i.occupant ? ` · ${i.occupant}` : ''}
            </small>
          </Link>
        ))}
        {D.map((d) => (
          <Link key={d.id} href={`/devis/${d.id}`} className={LIGNE_H}>
            <span className="font-mono text-xs text-gris">{d.numero || 'Brouillon'}</span>
            <Puce ton={d.genre === 'devis' ? 'bleu' : 'vert'}>{libDoc(d)}</Puce>
            <span className="truncate">{d.objet}</span>
            <small className="col-start-3 text-xs text-gris">
              {eurBac(d.type_facture === 'avoir' ? -Math.abs(d.total_ht) : d.total_ht)}&nbsp;HT · {LIB_DOC_STATUT[d.statut]}
            </small>
          </Link>
        ))}
        {!I.length && !D.length && <p className="p-2.5 text-center text-[13px] text-gris">Rien pour l’instant.</p>}
      </div>
    </section>
  );
}

const TON_PREAVIS = { rouge: 'bg-rouge-doux text-rouge', violet: 'bg-violet-doux text-violet', vert: 'bg-vert-doux text-vert' } as const;

/** Les douze prochains mois : visites, dates limites de préavis et fins de contrat, avec les totaux (echeancier du bac). */
export function Echeancier({ contrats, jour }: { contrats: ContratLu[]; jour: string }) {
  const mois = Array.from({ length: 12 }, (_, k) => ajouterMois(`${jour.slice(0, 7)}-01`, k).slice(0, 7));
  const nomMois = (m: string, long = true) => (long ? MOIS_L : MOIS_C)[Number(m.slice(5, 7)) - 1];
  const totV = mois.map(() => 0);
  const totCA = mois.map(() => 0);
  // Dans l'ordre où les contrats ont été créés, comme la liste du bac (puis par numéro).
  const ordonnes = [...contrats].sort((a, b) => String(a.cree_le ?? '').localeCompare(String(b.cree_le ?? '')) || (a.reference ?? '').localeCompare(b.reference ?? ''));
  const lignes = ordonnes.map((c) => {
    const { visites, limite, periode } = suivreContrat(c, jour);
    const e = etatBac(c, jour);
    const cellules = mois.map((m, k) => {
      const v = visites.filter((x) => x.date.startsWith(m));
      totV[k] += v.length;
      totCA[k] += v.length * (c.montant_ht / Math.max(1, c.visites_par_an));
      return { v, preavis: limite.startsWith(m), fin: periode.fin.startsWith(m) };
    });
    return { c, e, limite, fin: periode.fin, cellules };
  });
  const titre = `${nomMois(mois[0]).replace(/^./, (x) => x.toUpperCase())} ${mois[0].slice(0, 4)} à ${nomMois(mois[11])} ${mois[11].slice(0, 4)}`;
  const TH = 'border-r border-b border-trait px-1.5 py-2 text-center text-[12.5px] last:border-r-0';
  // En-têtes du bac (thead th) : capitales grises sur fond pâle.
  const TETE = `${TH} bg-fond font-bold tracking-[0.05em] text-gris uppercase`;
  return (
    <section className="carte flex min-w-0 flex-col gap-3 p-4" aria-labelledby="ec-t">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="ec-t" className="text-[17px] font-extrabold">
          {titre}
        </h2>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-gris">
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-cobalt" /> Visite planifiée
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-lavande" /> Visite à planifier
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-[5px] bg-violet-doux px-[5px] py-px text-[10.5px] font-bold text-violet">Préavis</span> Date limite pour renouveler
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-[5px] bg-encre px-[5px] py-px text-[10.5px] font-bold text-white">Fin</span> Fin du contrat
          </span>
        </div>
      </div>
      {contrats.length ? (
        <div className="relative min-w-0 overflow-x-auto">
          <table className="w-full min-w-[1060px] border-collapse">
            <thead>
              <tr>
                <th className={TETE}>Contrat</th>
                {mois.map((m) => (
                  <th key={m} className={TETE}>
                    {nomMois(m, false)}
                    <br />
                    <span>{m.slice(0, 4)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map(({ c, e, limite, fin, cellules }) => (
                <tr key={c.id}>
                  <th className={`${TH} min-w-[190px] bg-white !text-left font-semibold`}>
                    <span className="font-mono text-[12.5px] text-gris">{c.reference}</span>
                    <br />
                    {c.site?.adresse ?? c.client?.nom}
                    <br />
                    <Puce ton={e.ton}>{e.etiquette}</Puce>
                  </th>
                  {cellules.map((cel, k) => (
                    <td key={mois[k]} className={`${TH} min-w-[70px]`}>
                      {cel.v.map((x) => (
                        <span
                          key={x.date}
                          title={`Visite vers le ${jjmmaaaaBac(x.date)}${x.intervention ? ` · ${x.intervention.reference ?? ''}` : ' · à planifier'}`}
                          className={`mx-px inline-block h-2.5 w-2.5 rounded-full align-middle ${x.intervention ? 'bg-cobalt' : 'bg-lavande'} ${x.apresFin ? 'opacity-35' : ''}`}
                        >
                          <span className="sr-only">Visite</span>
                        </span>
                      ))}
                      {cel.preavis && (
                        <span title={`Limite de préavis le ${jjmmaaaaBac(limite)}`} className={`inline-block rounded-[5px] px-[5px] py-px text-[10.5px] font-bold whitespace-nowrap ${TON_PREAVIS[e.ton]}`}>
                          Préavis {Number(limite.slice(8, 10))}
                        </span>
                      )}
                      {cel.fin && (
                        <span title={`Fin le ${jjmmaaaaBac(fin)}`} className="inline-block rounded-[5px] bg-encre px-[5px] py-px text-[10.5px] font-bold text-white">
                          Fin
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-fond font-bold tabular-nums">
                <th className={`${TH} !text-left`}>Visites du mois</th>
                {totV.map((n, k) => (
                  <td key={mois[k]} className={TH}>
                    {n || ''}
                  </td>
                ))}
              </tr>
              <tr className="bg-fond font-bold tabular-nums">
                <th className={`${TH} !text-left`}>Chiffre d’affaires des visites</th>
                {totCA.map((n, k) => (
                  <td key={mois[k]} className={`${TH} !text-[12.5px]`}>
                    {n ? eur0(n) : ''}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-2.5 text-center text-[13px] text-gris">Aucun contrat.</p>
      )}
      <p className="text-[12.5px] text-gris">Les visites planifiées arrivent dans « À placer » du planning. Le renouvellement prépare un devis « Contrat d’entretien ».</p>
    </section>
  );
}
