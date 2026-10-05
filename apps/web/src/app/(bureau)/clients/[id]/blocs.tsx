import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  LIBELLE_TYPE,
  LIBELLE_TYPE_CLIENT,
  LIBELLE_URGENCE,
  TON_FAMILLE,
  aDesImmeubles,
  argentProchaine,
  etatDocumentSeul,
  etatHistorique,
  etatProchaine,
  estDevisRenouvellement,
  eurBac,
  familleIntervention,
  initialesClient,
  jjmmaaaaBac,
  montantHistorique,
  quandIntervention,
  titreHistorique,
  type ChiffresFiche,
  type ChoseAFaire,
  type Client,
  type ContratSuivi,
  type DocumentSuivi,
  type InterventionFiche,
  type LigneHistorique,
  type Occupant,
  type Site,
  type Ton,
} from '@chantio/shared';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton, Puce, classeBouton } from '@/components/ui';
import { etatBac, suivreContrat, type ContratLu } from '@/lib/contrats';
import { devisDepuisIntervention, facturerIntervention } from '../../interventions/actions';
import { planifierVisites, preparerRenouvellement } from '../contrats/actions';
import { retirerOccupant } from '../actions';
import { AnnonceRenouvellement, BoutonConfirme, VoirPlus } from '../fenetres';

// Les blocs de la fiche client, dans l'ordre du bac (vFicheClient) : en-tête, où on en est,
// les chiffres de l'année, prochaines interventions, historique, ses immeubles.

export type SiteFiche = Site & { occupants: Occupant[] };
export type ClientFiche = Client & { sites: SiteFiche[] };

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const eur0 = (n: number) => eurBac(n, 0);
const telTexte = (t: string) => t.replace(/ /g, ' ');
const telLien = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;

/**
 * Adresse de la fiche (avec son ?depuis) plus des paramètres : comme dans le bac, le volet d'une intervention
 * (?fiche=) et la fenêtre « Nouvelle intervention » (?nouvelle=1) s'ouvrent par-dessus la fiche.
 */
export function surFiche(ici: string, params: Record<string, string>): string {
  const [chemin, qs = ''] = ici.split('?');
  const p = new URLSearchParams(qs);
  for (const [cle, v] of Object.entries(params)) p.set(cle, v);
  return `${chemin}?${p}`;
}

/**
 * Un lien « /interventions?fiche=<id>&… » des choses à faire devient le volet ouvert sur la fiche ;
 * un lien vers la fiche elle-même (« Ajouter un immeuble ») garde son ?depuis.
 */
function lienSurFiche(lien: string, ici: string): string {
  const m = /^\/interventions\?(fiche=[^#]+)$/.exec(lien);
  if (m) return surFiche(ici, Object.fromEntries(new URLSearchParams(m[1])));
  const base = ici.split('?')[0];
  if (lien.startsWith(`${base}?`)) return surFiche(ici, Object.fromEntries(new URLSearchParams(lien.slice(base.length + 1))));
  return lien;
}

/** Carte d'une section de la fiche (« Où on en est », « Historique »…). */
export function Section({ id, titre, children }: { id: string; titre: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="carte flex min-w-0 flex-col gap-3 p-4" id={id === 'fc-t-im' ? 'immeubles' : undefined}>
      <h2 id={id} className="text-[19px] font-extrabold max-[700px]:text-lg">
        {titre}
      </h2>
      {children}
    </section>
  );
}

/** « Contrat d’entretien : Entretien chaufferie collective — 3 480 € HT par an, 4 visites — jusqu’au 30/11/2026 » (ligneContrat du bac). */
export function LigneContrat({ ct, jour, lien }: { ct: ContratLu; jour: string; lien?: string }) {
  const { periode } = suivreContrat(ct, jour);
  const etat = etatBac(ct, jour);
  const fini = etat.etiquette === 'Terminé';
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14.5px] [overflow-wrap:anywhere] max-[700px]:text-[15px]">
      <span>
        <b>Contrat d’entretien :</b>{' '}
        {fini
          ? `terminé le ${jjmmaaaaBac(periode.fin)} (${ct.objet})`
          : `${ct.objet} — ${eur0(ct.montant_ht)} HT par an, ${pluriel(ct.visites_par_an || 1, 'visite', 'visites')} — jusqu’au ${jjmmaaaaBac(periode.fin)}`}
      </span>
      {!fini && <Puce ton={etat.ton}>{etat.etiquette}</Puce>}
      {lien && (
        <Link href={lien} className="inline-flex items-center font-bold text-cobalt hover:underline max-[700px]:min-h-12">
          Voir le contrat
        </Link>
      )}
    </div>
  );
}

/** 1. En-tête : qui c'est et comment le joindre. */
export function EnTete({
  c,
  contact,
  adresse,
  contrats,
  jour,
  lienContrat,
  ici,
}: {
  c: ClientFiche;
  contact: string | null;
  adresse: string;
  contrats: ContratLu[];
  jour: string;
  lienContrat: (ct: ContratLu) => string;
  /** Adresse de la fiche (avec ?depuis). */
  ici: string;
}) {
  const imms = aDesImmeubles(c.type);
  const n = c.sites.length;
  const tel = c.mobile || c.telephone;
  // « Service technique, M. Garnier » : on appelle la personne, pas le service.
  const morceaux = (contact ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const appel = morceaux.find((x) => /^(M\.|Mme|Mlle)\s/.test(x)) ?? morceaux[0] ?? '';
  const infos: [string, ReactNode][] = [];
  if (contact) infos.push(['Contact :', contact]);
  infos.push([
    'Téléphone :',
    tel ? (
      <a href={telLien(tel)} className="font-bold text-cobalt tabular-nums hover:underline">
        {telTexte(tel)}
      </a>
    ) : (
      <Link href={surFiche(ici, { modifier: 'tel' })} scroll={false} className="inline-flex items-center font-bold text-cobalt hover:underline max-[700px]:min-h-12">
        Ajouter un téléphone
      </Link>
    ),
  ]);
  if (c.email)
    infos.push([
      'E-mail :',
      <a key="e" href={`mailto:${c.email}`} className="font-bold text-cobalt hover:underline">
        {c.email}
      </a>,
    ]);
  if (adresse) infos.push(['Adresse :', adresse]);
  if (imms) infos.push(['Facturation :', c.facturation === 'mensuel' ? 'un relevé par mois pour chaque immeuble' : 'une facture par intervention']);

  return (
    <div className="carte flex min-w-0 flex-col gap-3.5 p-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          aria-hidden="true"
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-doux text-lg font-extrabold text-cobalt max-[700px]:h-11 max-[700px]:w-11 max-[700px]:text-base"
        >
          {initialesClient(c.nom)}
        </span>
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-[26px] leading-tight font-extrabold [overflow-wrap:anywhere] outline-none max-[700px]:text-[22px]">
            {c.nom}
          </h1>
          <p className="mt-0.5 text-[15px] text-gris">
            {LIBELLE_TYPE_CLIENT[c.type]}
            {imms && ` · ${n ? pluriel(n, 'immeuble', 'immeubles') : 'aucun immeuble pour l’instant'}`}
          </p>
        </div>
      </div>
      {/* Sur téléphone seulement : le bouton pour appeler (une enveloppe, car le bouton est déjà en inline-flex). */}
      {tel && (
        <div className="hidden max-[700px]:block">
          <a href={telLien(tel)} className={classeBouton('principal', 'min-h-[52px] w-full text-base')}>
            {appel ? `Appeler ${appel}` : 'Appeler'}
          </a>
        </div>
      )}
      <dl className="m-0 flex flex-col gap-1.5 text-[15px]">
        {infos.map(([dt, dd]) => (
          <div key={dt} className="flex min-w-0 flex-wrap gap-x-1.5">
            <dt className="font-bold">{dt}</dt>
            <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{dd}</dd>
          </div>
        ))}
      </dl>
      {contrats.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {contrats.map((ct) => (
            <LigneContrat key={ct.id} ct={ct} jour={jour} lien={lienContrat(ct)} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 max-[700px]:grid max-[700px]:grid-cols-2">
        <LienBouton href={surFiche(ici, { nouvelle: '1', client: c.id })} scroll={false} prefetch={false} className="!px-[18px] !py-[11px] !text-[14.5px] max-[700px]:min-h-12 max-[700px]:!px-2.5">
          Nouvelle intervention
        </LienBouton>
        <LienBouton variante="secondaire" href={`/devis/nouveau?client=${c.id}`} className="!px-[18px] !py-[11px] !text-[14.5px] max-[700px]:min-h-12 max-[700px]:!px-2.5">
          Nouveau devis
        </LienBouton>
        <Link
          href={surFiche(ici, { modifier: '1' })}
          scroll={false}
          className="inline-flex items-center px-1 py-2 text-[14.5px] font-bold text-cobalt hover:underline max-[700px]:col-span-2 max-[700px]:min-h-12 max-[700px]:justify-self-start"
        >
          Modifier la fiche
        </Link>
      </div>
    </div>
  );
}

const NIVEAU: Record<ChoseAFaire['niveau'], { libelle: string; classe: string }> = {
  urgent: { libelle: 'Urgent', classe: 'bg-rouge text-white' },
  afaire: { libelle: 'À faire', classe: 'bg-cobalt text-white' },
  attente: { libelle: 'On attend', classe: 'bg-white text-gris ring-1 ring-trait ring-inset' },
};
const BANDEAU: Record<'rouge' | 'cobalt' | 'vert' | 'gris', string> = {
  rouge: 'bg-rouge-doux [&>b]:text-rouge',
  cobalt: 'bg-doux [&>b]:text-cobalt',
  vert: 'bg-vert-doux [&>b]:text-vert',
  gris: 'bg-fond text-gris',
};
const BOUTON_LIGNE = '!px-3 !py-2 !text-[13px] min-h-10 max-[900px]:w-full max-[900px]:min-h-12 max-[700px]:!text-[15px]';

/** 2. Où on en est : le bandeau de synthèse puis chaque chose à faire, avec son bouton. */
export function OuOnEnEst({
  ton,
  bandeau,
  liste,
  retour,
}: {
  ton: 'rouge' | 'cobalt' | 'vert' | 'gris';
  bandeau: { titre: string; phrases: string[] };
  liste: ChoseAFaire[];
  /** Adresse de la fiche, pour y revenir après « Planifier les visites ». */
  retour: string;
}) {
  return (
    <Section id="fc-t-ou" titre="Où on en est">
      <div className={`flex flex-col gap-1 rounded-[12px] px-3.5 py-3 text-[15px] ${BANDEAU[ton]}`}>
        <b className="text-[17.5px] leading-snug font-extrabold max-[700px]:text-[17px]">{bandeau.titre}</b>
        {bandeau.phrases.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
      {liste.length > 0 && (
        <div className="flex flex-col gap-2">
          <VoirPlus limite={8} un="la dernière" plusieurs="autres">
            {liste.map((x) => (
              <div
                key={x.cle}
                className={`grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-3.5 py-3 text-[14.5px] max-[900px]:grid-cols-1 max-[900px]:gap-2 max-[700px]:text-[15px] ${
                  x.niveau === 'urgent' ? 'bg-rouge-doux' : 'bg-fond'
                }`}
              >
                <span className={`justify-self-start rounded-full px-2.5 py-[3px] text-xs font-extrabold whitespace-nowrap ${NIVEAU[x.niveau].classe}`}>{NIVEAU[x.niveau].libelle}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{x.texte}</span>
                {x.geste?.action === 'renouveler' ? (
                  <form action={preparerRenouvellement.bind(null, x.geste.id)} className="max-[900px]:w-full">
                    <input type="hidden" name="retour" value={retour} />
                    <AnnonceRenouvellement />
                    <BoutonEnvoi variante="secondaire" className={BOUTON_LIGNE} enCours="Préparation…">
                      {x.bouton}
                    </BoutonEnvoi>
                  </form>
                ) : x.geste?.action === 'planifier-visites' ? (
                  <form action={planifierVisites.bind(null, x.geste.id)} className="max-[900px]:w-full">
                    <input type="hidden" name="retour" value={retour} />
                    <BoutonEnvoi variante="secondaire" className={BOUTON_LIGNE} enCours="Création…">
                      {x.bouton}
                    </BoutonEnvoi>
                  </form>
                ) : x.geste?.action === 'facturer-intervention' || x.geste?.action === 'devis-intervention' ? (
                  // Comme le bac : « Créer la facture » et « Préparer le devis » créent le brouillon et ouvrent l'éditeur.
                  <form
                    action={(x.geste.action === 'facturer-intervention' ? facturerIntervention : devisDepuisIntervention).bind(null, x.geste.id)}
                    className="max-[900px]:w-full"
                  >
                    <BoutonEnvoi variante="secondaire" className={BOUTON_LIGNE} enCours="Préparation…">
                      {x.bouton}
                    </BoutonEnvoi>
                  </form>
                ) : (
                  <LienBouton variante="secondaire" href={lienSurFiche(x.lien, retour)} scroll={!lienSurFiche(x.lien, retour).startsWith(`${retour.split('?')[0]}?`)} className={BOUTON_LIGNE}>
                    {x.bouton}
                  </LienBouton>
                )}
              </div>
            ))}
          </VoirPlus>
        </div>
      )}
    </Section>
  );
}

function Tuile({ libelle, valeur, sous, rougeValeur, vertSous, avant }: { libelle: string; valeur: string; sous: string; rougeValeur?: boolean; vertSous?: boolean; avant?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-fond p-3.5 max-[700px]:grid max-[700px]:grid-cols-[minmax(0,1fr)_auto] max-[700px]:items-center max-[700px]:gap-x-3 max-[700px]:gap-y-0.5 max-[700px]:[grid-template-areas:'lib_val''sous_val''prec_val']">
      <small className="text-[13.5px] font-bold text-encre max-[700px]:[grid-area:lib]">{libelle}</small>
      <b className={`text-[30px] leading-[1.15] font-extrabold tabular-nums max-[700px]:text-right max-[700px]:text-[26px] max-[700px]:[grid-area:val] ${rougeValeur ? 'text-rouge' : ''}`}>{valeur}</b>
      <small className={`text-[13px] max-[700px]:[grid-area:sous] ${vertSous ? 'font-bold text-vert' : 'text-gris'}`}>{sous}</small>
      {avant && <small className="text-[13px] text-gris max-[700px]:[grid-area:prec]">{avant}</small>}
    </div>
  );
}

/** 3. Les chiffres de l'année : facturé, reste à payer, devis en attente, travaux signés pas encore facturés. */
export function Chiffres({ ch, aDesDocuments, lienDocuments }: { ch: ChiffresFiche; aDesDocuments: boolean; lienDocuments: string }) {
  return (
    <Section id="fc-t-ch" titre={`Les chiffres de ${ch.annee}`}>
      {ch.actif ? (
        <>
          <div className="grid grid-cols-3 gap-3 max-[700px]:grid-cols-1">
            <Tuile
              libelle={`Facturé en ${ch.annee}`}
              valeur={eur0(ch.facture)}
              sous={`hors taxes · ${ch.factures ? pluriel(ch.factures, 'facture', 'factures') : 'aucune facture'}${ch.avoirs ? ` et ${pluriel(ch.avoirs, 'avoir', 'avoirs')}` : ''}`}
              avant={ch.montrerAvant ? `En ${ch.annee - 1} : ${eur0(ch.factureAvant)} HT` : undefined}
            />
            <Tuile
              libelle="Reste à nous payer"
              valeur={eur0(ch.reste)}
              rougeValeur={ch.enRetard > 0.005}
              vertSous={ch.reste <= 0.005}
              sous={
                ch.reste <= 0.005
                  ? ch.dejaEmis
                    ? 'Tout est payé'
                    : 'Rien à payer'
                  : ch.enRetard > 0.005
                    ? `TTC · dont ${eur0(ch.enRetard)} en retard`
                    : `TTC${ch.prochaineEcheance ? ` · à payer avant le ${jjmmaaaaBac(ch.prochaineEcheance)}` : ''}`
              }
            />
            <Tuile
              libelle="Devis en attente de réponse"
              valeur={eur0(ch.devisEnvoyes)}
              sous={ch.nbDevisEnvoyes ? `hors taxes · ${pluriel(ch.nbDevisEnvoyes, 'devis envoyé', 'devis envoyés')}` : 'Aucun devis en attente'}
            />
          </div>
          {ch.travauxAFacturer >= 0.5 && (
            <p className="text-[15px]">
              Travaux signés pas encore facturés : <b>{eur0(ch.travauxAFacturer)}&nbsp;HT</b>
            </p>
          )}
        </>
      ) : (
        <p className="text-[15px] text-gris">Pas encore de devis envoyé ni de facture avec ce client.</p>
      )}
      {aDesDocuments && (
        <LienBouton variante="secondaire" href={lienDocuments} className="min-h-11 self-start !px-4 !py-2.5 !text-[14.5px] max-[700px]:min-h-12 max-[700px]:self-stretch">
          Voir tous ses devis et factures
        </LienBouton>
      )}
    </Section>
  );
}

/** Étiquette de type d'intervention (Dépannage en rouge, Chantier en bleu, Entretien en vert). */
export function PuceType({ type }: { type: InterventionFiche['type'] }) {
  return <Puce ton={TON_FAMILLE[familleIntervention(type)]}>{LIBELLE_TYPE[type]}</Puce>;
}

const CARTE_IV =
  'flex min-h-12 w-full flex-col gap-[3px] rounded-[12px] border border-trait bg-white px-3.5 py-3 text-left transition hover:border-lavande hover:bg-[#F9FAFF]';

/** Ligne grise sous le motif : étiquette, puis les morceaux séparés par « · ». */
function SousLigne({ puce, morceaux, grand = false }: { puce?: ReactNode; morceaux: (ReactNode | null | false | undefined)[]; grand?: boolean }) {
  const presents = morceaux.filter(Boolean);
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] text-gris ${grand ? 'max-[700px]:text-[15px]' : ''}`}>
      {puce}
      {presents.map((m, k) => (
        <span key={k}>
          {k > 0 && '· '}
          {m}
        </span>
      ))}
    </span>
  );
}

const lieuCourt = (imms: boolean, i: InterventionFiche) => (imms && i.adresse ? `${i.adresse}${i.occupant ? `, ${i.occupant}` : ''}` : '');

/** 4. Prochaines interventions : une carte par intervention, 5 au plus avant « Afficher les N suivantes ». */
export function Prochaines({
  liste,
  D,
  imms,
  jour,
  ici,
  nouvelle,
}: {
  liste: InterventionFiche[];
  D: DocumentSuivi[];
  imms: boolean;
  jour: string;
  /** Adresse de la fiche (avec ?depuis) : une intervention s'ouvre dans son volet par-dessus. */
  ici: string;
  /** « Nouvelle intervention » : la fenêtre par-dessus la fiche. */
  nouvelle: string;
}) {
  return (
    <Section id="fc-t-pr" titre="Prochaines interventions">
      {liste.length ? (
        <div className="flex flex-col gap-2">
          <VoirPlus limite={5} un="la suivante" plusieurs="suivantes">
            {liste.map((i) => {
              const e = etatProchaine(i, jour);
              const argent = argentProchaine(i, D);
              return (
                <Link key={i.id} href={surFiche(ici, { fiche: i.id })} scroll={false} className={CARTE_IV}>
                  <span className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
                    <b className="text-[15px] font-extrabold">{quandIntervention(i, jour)}</b>
                    <span className="flex flex-wrap gap-1">
                      <Puce ton={e.ton}>{e.texte}</Puce>
                      {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{i.motif}</span>
                  <SousLigne
                    grand
                    puce={<PuceType type={i.type} />}
                    morceaux={[lieuCourt(imms, i), i.techniciens.length ? i.techniciens.join(', ') : 'Technicien pas encore choisi']}
                  />
                  {argent && <span className="text-[13.5px] text-encre [overflow-wrap:anywhere] max-[700px]:text-[15px]">{argent}</span>}
                </Link>
              );
            })}
          </VoirPlus>
        </div>
      ) : (
        <>
          <p className="text-gris">Aucune intervention prévue.</p>
          <LienBouton variante="secondaire" href={nouvelle} scroll={false} prefetch={false} className="min-h-11 self-start !px-4 !py-2.5 !text-[14.5px] max-[700px]:min-h-12 max-[700px]:self-stretch">
            Nouvelle intervention
          </LienBouton>
        </>
      )}
    </Section>
  );
}

/** 5. Historique : une ligne par affaire (interventions passées, devis et factures sans intervention). */
export function Historique({
  lignes,
  D,
  imms,
  jour,
  facturation,
  contrats,
  ici,
}: {
  lignes: LigneHistorique[];
  D: DocumentSuivi[];
  imms: boolean;
  jour: string;
  facturation: Client['facturation'];
  contrats: ContratSuivi[];
  /** Adresse de la fiche (avec ?depuis) : une intervention s'ouvre dans son volet par-dessus. */
  ici: string;
}) {
  const ligne = (date: string, etat: { ton: Ton; texte: string }, titre: string, sous: ReactNode, num: string) => (
    <>
      <span className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
        <b className="text-[15px] font-extrabold tabular-nums">{date ? jjmmaaaaBac(date) : 'Sans date'}</b>
        <Puce ton={etat.ton}>{etat.texte}</Puce>
      </span>
      <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{titre}</span>
      {sous}
      {num && <span className="font-mono text-xs text-gris max-[700px]:text-[12.5px]">{num}</span>}
    </>
  );
  return (
    <Section id="fc-t-hi" titre="Historique">
      {lignes.length ? (
        <div className="flex flex-col gap-2">
          <VoirPlus limite={10} un="la plus ancienne" plusieurs="plus anciennes">
            {lignes.map((l) => {
              if (l.intervention) {
                const i = l.intervention;
                const mt = montantHistorique(i, D);
                return (
                  <Link key={l.cle} href={surFiche(ici, { fiche: i.id })} scroll={false} className={CARTE_IV}>
                    {ligne(
                      i.date_fin || i.date_prevue || '',
                      etatHistorique(i, D, facturation, jour),
                      i.motif,
                      <SousLigne
                        puce={<PuceType type={i.type} />}
                        morceaux={[lieuCourt(imms, i), i.techniciens.join(', '), mt && <b className="font-bold text-encre tabular-nums">{mt}</b>]}
                      />,
                      [i.reference, i.ordre_service && `ordre de service ${i.ordre_service}`].filter(Boolean).join(' · '),
                    )}
                  </Link>
                );
              }
              const d = l.document;
              const avoir = d.type_facture === 'avoir';
              const puce = d.conditions?.ao ? (
                <Puce ton="violet">Appel d’offres</Puce>
              ) : estDevisRenouvellement(d, contrats) ? (
                <Puce ton="vert">Contrat d’entretien</Puce>
              ) : undefined;
              return (
                <Link key={l.cle} href={`/devis/${d.id}`} className={CARTE_IV}>
                  {ligne(
                    d.date_document,
                    etatDocumentSeul(d, D, jour),
                    titreHistorique(d),
                    <SousLigne puce={puce} morceaux={[<b key="m" className="font-bold text-encre tabular-nums">{`${avoir ? '− ' : ''}${eur0(Math.abs(d.total_ht))} HT`}</b>]} />,
                    d.numero ?? '',
                  )}
                </Link>
              );
            })}
          </VoirPlus>
        </div>
      ) : (
        <p className="text-gris">Rien pour l’instant.</p>
      )}
    </Section>
  );
}

/** 6. Ses immeubles (syndic ou bailleur) : accès, qui paie, contrat, occupants à appeler, et les boutons de chaque immeuble. */
export function SesImmeubles({
  c,
  contrats,
  interventionsParSite,
  resteParSite,
  jour,
  ici,
}: {
  c: ClientFiche;
  contrats: ContratLu[];
  interventionsParSite: Map<string, number>;
  resteParSite: Map<string, number>;
  jour: string;
  /** Adresse de la fiche (avec ?depuis) : fenêtres par-dessus. */
  ici: string;
}) {
  const BOUTON = '!px-2.5 !py-1.5 !text-[13px] max-[700px]:w-full max-[700px]:min-h-12 max-[700px]:!text-[14.5px]';
  return (
    <Section id="fc-t-im" titre="Ses immeubles">
      {c.sites.length ? (
        <div className="flex flex-col gap-3">
          {c.sites.map((s) => {
            const nbI = interventionsParSite.get(s.id) ?? 0;
            const reste = resteParSite.get(s.id) ?? 0;
            const acces = [s.gardien && `Gardien : ${s.gardien}`, s.acces && `Code d’entrée : ${s.acces}`].filter(Boolean).join(' · ');
            const ville = [s.code_postal, s.ville].filter(Boolean).join(' ');
            return (
              <div key={s.id} className="flex min-w-0 flex-col gap-1.5 rounded-[12px] border border-trait p-3.5 text-[14.5px] [overflow-wrap:anywhere] max-[700px]:text-[15px]">
                <b className="text-base font-extrabold">
                  {s.adresse}
                  {ville && `, ${ville}`}
                </b>
                {acces && <p>{acces}</p>}
                {s.copropriete && <p>Facturé à : {s.copropriete}</p>}
                {contrats
                  .filter((ct) => ct.site_id === s.id)
                  .map((ct) => (
                    <LigneContrat key={ct.id} ct={ct} jour={jour} />
                  ))}
                <p>{nbI ? pluriel(nbI, 'intervention ici', 'interventions ici') : 'Pas encore d’intervention ici'}</p>
                {reste > 0.005 && (
                  <p>
                    Reste à nous payer pour cet immeuble : <b>{eur0(reste)}&nbsp;TTC</b>
                  </p>
                )}
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.07em] text-gris uppercase">Occupants à appeler</span>
                  {s.occupants.length ? (
                    s.occupants.map((o) => {
                      const commun = /parties communes/i.test(o.nom);
                      return (
                        <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-fond px-2.5 py-1.5 max-[700px]:py-1">
                          <span>
                            <b>{o.nom}</b>
                            {o.lot && `${commun ? ' : ' : ', '}${o.lot}`}
                          </span>
                          {o.telephone && (
                            <a href={telLien(o.telephone)} className="inline-flex items-center font-bold text-cobalt tabular-nums hover:underline max-[700px]:min-h-11">
                              {telTexte(o.telephone)}
                            </a>
                          )}
                          {!commun && (
                            <BoutonConfirme
                              etiquette={`Retirer ${o.nom}`}
                              className="ml-auto inline-flex items-center text-[13px] font-semibold text-gris hover:text-rouge max-[700px]:min-h-11"
                              titre={`Retirer ${o.nom} de la liste ?`}
                              texte="Ses anciennes interventions restent visibles."
                              bouton="Retirer"
                              action={retirerOccupant.bind(null, o.id)}
                            >
                              Retirer
                            </BoutonConfirme>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gris">Personne pour l’instant.</p>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2 max-[700px]:flex-col">
                  <LienBouton variante="secondaire" href={surFiche(ici, { nouvelle: '1', client: c.id, site: s.id })} scroll={false} prefetch={false} className={BOUTON}>
                    Nouvelle intervention ici
                  </LienBouton>
                  <LienBouton variante="secondaire" href={surFiche(ici, { occupant: s.id })} scroll={false} className={BOUTON}>
                    Ajouter un occupant
                  </LienBouton>
                  <LienBouton variante="secondaire" href={surFiche(ici, { immeuble: s.id })} scroll={false} className={BOUTON}>
                    Modifier l’immeuble
                  </LienBouton>
                  <LienBouton variante="secondaire" href={`/clients/immeubles?site=${s.id}`} className={BOUTON}>
                    Voir la fiche de l’immeuble
                  </LienBouton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gris">Pas encore d’immeuble. Ajoutez le premier pour pouvoir créer des interventions.</p>
      )}
      <LienBouton
        variante="secondaire"
        href={surFiche(ici, { immeuble: 'nouveau' })}
        scroll={false}
        className="min-h-11 self-start !px-4 !py-2.5 !text-[14.5px] max-[700px]:min-h-12 max-[700px]:self-stretch"
      >
        + Ajouter un immeuble
      </LienBouton>
    </Section>
  );
}

/** « ← Retour à mes clients », en haut et en bas de la fiche (le libellé suit la page d'où l'on vient). */
export function LienRetour({ href, libelle }: { href: string; libelle: string }) {
  return (
    <Link href={href} className="inline-flex items-center self-start py-1 text-[15px] font-bold text-cobalt hover:underline max-[700px]:min-h-12">
      ← {libelle}
    </Link>
  );
}

