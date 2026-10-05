'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import {
  ajouterJours,
  aPlacer,
  demiDebut,
  demiJournees,
  deplacer,
  heuresSur,
  indexDemi,
  jjmm,
  jourCourt,
  jourSemaine,
  LIBELLE_FAMILLE,
  LIBELLE_STATUT,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  numeroSemaine,
  occupe,
  texteReserve,
  TON_FAMILLE,
  type Demi,
  type FamilleIntervention,
  type StatutIntervention,
  type TypeIntervention,
  type Urgence,
} from '@chantio/shared';
import { planifier } from '../interventions/actions';
import { reglerDisponibilite } from './actions';
import { annoncer } from '@/components/retour';
import { Puce } from '@/components/ui';
import { adressePlanning, ecrireFamilles, FAMILLES } from './adresse';
import { BarreOutils } from './outils';

export type CarteRdv = {
  id: string;
  /** « DEP-2026-0143 » */
  reference: string;
  type: TypeIntervention;
  famille: FamilleIntervention;
  date: string | null;
  heure: string | null;
  /** Dernier jour d'un chantier sur plusieurs jours. */
  date_fin: string | null;
  fin_midi: boolean;
  duree: number | null;
  /** Date souhaitée d'une visite d'entretien pas encore placée. */
  souhaitee: string | null;
  motif: string;
  /** Le lieu en court (adresse de l'immeuble ou du client), comme lieu(i).titre du bac. */
  lieu: string;
  /** Le lieu complet, pour l'info-bulle. */
  adresse: string;
  /** Statut en base. */
  statut: StatutIntervention;
  /** État affiché (« À reprendre » pour une fiche renvoyée). */
  etat: StatutIntervention;
  urgence: Urgence;
  techniciens: string[];
};

export type MembrePlanning = {
  id: string;
  prenom: string;
  /** « Christophe R. » */
  nom: string;
  initiales: string;
  photo: string | null;
  /** Couleur propre au technicien (avatar). */
  couleur: string;
  heures: number;
  reserve: number[];
};

const SANS = ''; // ligne « Sans technicien »
const PLANIFIABLE: StatutIntervention[] = ['a_planifier', 'planifiee'];

const creneau = (c: CarteRdv) => ({ date_prevue: c.date, heure_prevue: c.heure, date_fin: c.date_fin, fin_midi: c.fin_midi, duree_prevue: c.duree });
const nombre = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

type Tire = { id: string; ligne: string | null; attrape: { jour: string; demi: Demi } | null };

/** Avatar rond de 20 px : la photo, sinon les initiales sur la couleur du technicien. */
function AvatarTech({ m }: { m: MembrePlanning }) {
  return m.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.photo} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" style={{ background: m.couleur }} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-extrabold text-white">
      {m.initiales}
    </span>
  );
}

/**
 * Vue Semaine du bac : une ligne par technicien, deux demi-journées par jour. Un dépannage occupe
 * le matin ou l'après-midi, un chantier s'étend sur ses jours. On glisse un bloc (ou une carte
 * « À placer ») sur une demi-journée : l'écran change tout de suite, l'enregistrement suit.
 * Un clic sur un bloc ouvre son volet par-dessus le planning ; un clic sur une case vide, la
 * fenêtre de création déjà remplie (jour, moment, technicien).
 */
export function Calendrier({
  lundi,
  aujourdhui,
  equipe: equipeInitiale,
  cartes: initiales,
  familles,
  dirigeant,
}: {
  lundi: string;
  aujourdhui: string;
  equipe: MembrePlanning[];
  cartes: CarteRdv[];
  /** Familles cochées au chargement (?familles=). */
  familles: FamilleIntervention[];
  dirigeant: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [cartes, setCartes] = useState(initiales);
  const [equipe, setEquipe] = useState(equipeInitiale);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [survol, setSurvol] = useState<{ ligne: string; col: number } | 'bac' | null>(null);
  const [tire, setTire] = useState<Tire | null>(null);
  const [montrees, setMontrees] = useState<Set<FamilleIntervention>>(() => new Set(familles));
  const [reglage, setReglage] = useState<string | null>(null);

  // Nouvelles données du serveur (changement de semaine, enregistrement, volet) : on repart d'elles.
  const [source, setSource] = useState({ initiales, equipeInitiale });
  if (source.initiales !== initiales || source.equipeInitiale !== equipeInitiale) {
    setSource({ initiales, equipeInitiale });
    setCartes(initiales);
    setEquipe(equipeInitiale);
  }

  const semaine = useMemo(() => Array.from({ length: 7 }, (_, n) => ajouterJours(lundi, n)), [lundi]);
  // Le dimanche n'apparaît que s'il y a quelque chose ce jour-là, ou si c'est aujourd'hui.
  const dimanche = semaine[6];
  const jours = dimanche === aujourdhui || cartes.some((c) => c.date === dimanche || c.date_fin === dimanche) ? semaine : semaine.slice(0, 6);
  const n = jours.length * 2;

  const sansTechnicien = cartes.some((c) => c.date && !c.techniciens.length && jours.some((j) => occupe(creneau(c), j)));
  const lignes = [...equipe.map((m) => m.id), ...(sansTechnicien ? [SANS] : [])];
  const attente = cartes.filter((c) => aPlacer({ statut: c.etat, date_prevue: c.date }));
  const dansLaSemaine = cartes.filter((c) => jours.some((j) => occupe(creneau(c), j)));
  const avecReserve = equipe.some((m) => m.reserve.length > 0);

  /** Les blocs d'une ligne : une suite de demi-journées occupées, d'un seul tenant. */
  function blocs(ligne: string) {
    const out: { c: CarteRdv; de: number; a: number }[] = [];
    for (const c of dansLaSemaine) {
      if (!montrees.has(c.famille)) continue;
      if (ligne === SANS ? c.techniciens.length : !c.techniciens.includes(ligne)) continue;
      const cols = jours.flatMap((j, k) => {
        const [m, a] = demiJournees(creneau(c), j);
        return [...(m ? [k * 2] : []), ...(a ? [k * 2 + 1] : [])];
      });
      let de = cols[0];
      for (let x = 1; x <= cols.length; x++) {
        if (x === cols.length || cols[x] !== cols[x - 1] + 1) {
          if (de !== undefined) out.push({ c, de, a: cols[x - 1] });
          de = cols[x];
        }
      }
    }
    return out.sort((p, q) => p.de - q.de || (p.c.heure ?? '99').localeCompare(q.c.heure ?? '99'));
  }

  /** Demi-journées gardées pour les urgences (réglage du dirigeant), regroupées quand elles se suivent. */
  function reserves(m: MembrePlanning) {
    const cols = jours.flatMap((j, k) => ([0, 1] as Demi[]).filter((d) => m.reserve.includes(indexDemi(j, d))).map((d) => k * 2 + d));
    const out: { de: number; a: number }[] = [];
    for (const c of cols) {
      const der = out[out.length - 1];
      if (der && der.a === c - 1) der.a = c;
      else out.push({ de: c, a: c });
    }
    return out;
  }

  function basculer(f: FamilleIntervention) {
    const suite = new Set(montrees);
    if (suite.has(f)) suite.delete(f);
    else suite.add(f);
    setMontrees(suite);
    // L'adresse garde les cases cochées (volet, changement de semaine) sans recharger la page.
    window.history.replaceState(null, '', adressePlanning(params, { familles: ecrireFamilles(suite) }));
  }

  async function deposer(id: string, ligne: string | null, col: number | null) {
    const c = cartes.find((x) => x.id === id);
    if (!c) return;
    const depuis = tire?.id === id ? tire.ligne : null;
    let techniciens = [...c.techniciens];
    if (ligne && ligne !== SANS) {
      if (depuis && depuis !== SANS && depuis !== ligne) techniciens = techniciens.filter((t) => t !== depuis);
      if (!techniciens.includes(ligne)) techniciens.push(ligne);
    } else if (ligne === SANS && depuis) techniciens = techniciens.filter((t) => t !== depuis);

    const place =
      col === null
        ? { date_prevue: null, heure_prevue: c.heure, date_fin: null, fin_midi: false }
        : deplacer(creneau(c), { jour: jours[col >> 1], demi: (col & 1) as Demi }, tire?.id === id ? tire.attrape : null);
    if (place.date_prevue === c.date && place.heure_prevue === c.heure && place.date_fin === (c.date_fin ?? null) && techniciens.join() === c.techniciens.join()) return;

    // À planifier ↔ planifiée selon la date et le technicien ; les autres états ne bougent pas.
    const recalcule = (s: StatutIntervention): StatutIntervention =>
      PLANIFIABLE.includes(s) ? (place.date_prevue && techniciens.length ? 'planifiee' : 'a_planifier') : s;
    const avant = cartes;
    setCartes((t) =>
      t.map((x) =>
        x.id === id
          ? {
              ...x,
              date: place.date_prevue,
              heure: place.heure_prevue ?? null,
              date_fin: place.date_fin ?? null,
              fin_midi: place.fin_midi,
              techniciens,
              statut: recalcule(x.statut),
              etat: recalcule(x.etat),
            }
          : x,
      ),
    );
    setEnCours((s) => new Set(s).add(id));
    const r = await planifier(id, {
      date_prevue: place.date_prevue,
      heure_prevue: place.heure_prevue ?? null,
      date_fin: place.date_fin ?? null,
      fin_midi: place.fin_midi,
      techniciens,
    }).catch(() => ({ erreur: 'Pas de réseau : réessayez.', invites: [] as string[] }));
    setEnCours((s) => {
      const suite = new Set(s);
      suite.delete(id);
      return suite;
    });
    if (r.erreur) {
      setCartes(avant);
      annoncer(r.erreur, 'erreur');
      return;
    }
    const noms = techniciens.map((t) => equipe.find((m) => m.id === t)?.nom).filter(Boolean);
    annoncer(
      place.date_prevue
        ? `${c.reference} : ${jourCourt(place.date_prevue)} ${demiDebut(place) ? 'après-midi' : 'matin'}, ${noms.length ? noms.join(', ') : 'sans technicien'}`
        : `${c.reference} : sans date, à placer au planning`,
    );
    if (r.invites?.length) annoncer(`Invitation agenda envoyée à ${r.invites.join(', ')}`);
  }

  /** La demi-journée sous la souris, dans la piste d'une ligne. */
  const colonne = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * n)));
  };

  async function enregistrerReglage(m: MembrePlanning, heures: number, reserve: number[]) {
    const avant = equipe;
    setEquipe((t) => t.map((x) => (x.id === m.id ? { ...x, heures, reserve } : x)));
    setReglage(null);
    const r = await reglerDisponibilite(m.id, heures, reserve).catch(() => ({ erreur: 'Pas de réseau : réessayez.' }));
    if (r.erreur) {
      setEquipe(avant);
      annoncer(r.erreur, 'erreur');
    } else annoncer(`Disponibilités de ${m.nom} enregistrées`);
  }

  const tirer = (id: string | null, ligne: string | null, de: number | null) =>
    setTire(id ? { id, ligne, attrape: de === null ? null : { jour: jours[de >> 1], demi: (de & 1) as Demi } } : null);
  const ouvrir = (id: string) => adressePlanning(params, { fiche: id });
  const reglageOuvert = equipe.find((x) => x.id === reglage);

  const barre = (
    <BarreOutils vue="semaine" lundi={lundi} mois={ajouterJours(lundi, 3).slice(0, 7)} aujourdhui={aujourdhui}>
      {FAMILLES.map((f) => (
        <label
          key={f}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-trait bg-white px-[11px] py-[5px] text-[13px] font-semibold transition hover:border-pervenche max-menu:min-h-11"
        >
          <input type="checkbox" checked={montrees.has(f)} onChange={() => basculer(f)} className="m-0 h-[15px] w-[15px] accent-cobalt" />
          {LIBELLE_FAMILLE[f]}
        </label>
      ))}
    </BarreOutils>
  );

  // Sans technicien du tout : une carte à la place de la grille, comme le bac.
  if (!lignes.length) {
    return (
      <div className="grid gap-2.5">
        {barre}
        <div className="carte px-4 py-6 text-center text-[13px] text-gris">Ajoutez des techniciens dans « Paramètres », puis « Membres », pour voir le planning.</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      {barre}

      {reglageOuvert && <Reglage key={reglageOuvert.id} membre={reglageOuvert} fermer={() => setReglage(null)} enregistrer={(h, r) => enregistrerReglage(reglageOuvert, h, r)} />}

      <div className="overflow-x-auto">
        <div className="pl-plan" style={{ gridTemplateColumns: `170px repeat(${n}, minmax(62px, 1fr))`, minWidth: 170 + n * 70 }}>
          <div className="pl-coin">
            <span className="pl-etiq">Semaine {numeroSemaine(lundi)}</span>
          </div>
          {jours.map((j) => {
            const [nom, ...date] = jourCourt(j).split(' ');
            return (
              <div key={j} className={`pl-jour ${j === aujourdhui ? 'auj' : ''} ${jourSemaine(j) >= 5 ? 'we' : ''}`}>
                {nom}
                <small>{date.join(' ')}</small>
              </div>
            );
          })}
          <div className="pl-coin" />
          {jours.map((j) => (
            <Fragment key={j}>
              <div className="pl-ampm">matin</div>
              <div className="pl-ampm pm">après-midi</div>
            </Fragment>
          ))}

          {lignes.map((ligne) => {
            const m = equipe.find((x) => x.id === ligne);
            const charge = m ? cartes.filter((c) => c.techniciens.includes(m.id)).reduce((t, c) => t + heuresSur(creneau(c), semaine), 0) : 0;
            const taux = m && m.heures ? Math.round((charge / m.heures) * 100) : 0;
            const aujK = jours.indexOf(aujourdhui);
            return (
              <Fragment key={ligne || 'sans'}>
                <div className={`pl-tech ${reglage && reglage === ligne ? 'bg-doux!' : ''}`}>
                  {m ? (
                    <>
                      <b className="flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold">
                        <AvatarTech m={m} />
                        <span className="truncate">{m.nom}</span>
                      </b>
                      {dirigeant ? (
                        <button
                          type="button"
                          onClick={() => setReglage((r) => (r === m.id ? null : m.id))}
                          title="Heures par semaine et réserve d’urgences"
                          aria-expanded={reglage === m.id}
                          className="w-fit text-left text-[12.5px] whitespace-nowrap text-gris tabular-nums hover:text-cobalt hover:underline"
                        >
                          {nombre(charge)} h / {nombre(m.heures)} h · {taux} %
                        </button>
                      ) : (
                        <span className="text-[12.5px] whitespace-nowrap text-gris tabular-nums">
                          {nombre(charge)} h / {nombre(m.heures)} h · {taux} %
                        </span>
                      )}
                      <div className={`pl-charge ${taux > 95 ? 'plein' : ''}`} aria-hidden="true">
                        <i style={{ width: `${Math.min(100, taux)}%` }} />
                      </div>
                      {m.reserve.length > 0 && <span className="truncate text-[11px] text-rouge">Urgences : {texteReserve(m.reserve)}</span>}
                    </>
                  ) : (
                    <>
                      <b className="text-[13px] font-bold text-rouge">Sans technicien</b>
                      <span className="text-[12.5px] text-gris">à attribuer</span>
                    </>
                  )}
                </div>
                <div
                  data-zone={ligne}
                  className="pl-zone"
                  style={{ gridTemplateColumns: `repeat(${n}, minmax(62px, 1fr))`, backgroundSize: `calc(100% / ${jours.length}) 100%` } as CSSProperties}
                  onDragOver={(e) => {
                    if (!tire) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const col = colonne(e);
                    if (survol === 'bac' || survol?.ligne !== ligne || survol.col !== col) setSurvol({ ligne, col });
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol((s) => (s !== 'bac' && s?.ligne === ligne ? null : s));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSurvol(null);
                    const id = e.dataTransfer.getData('text/plain');
                    if (id) deposer(id, ligne, colonne(e));
                    setTire(null);
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.fond) return;
                    const col = colonne(e);
                    router.push(
                      adressePlanning(params, {
                        nouvelle: '1',
                        date: jours[col >> 1],
                        moment: col & 1 ? 'apres-midi' : 'matin',
                        technicien: m ? m.id : null,
                      }),
                      { scroll: false },
                    );
                  }}
                >
                  {aujK >= 0 && <span aria-hidden="true" className="pl-auj" style={{ gridColumn: `${aujK * 2 + 1} / span 2` }} />}
                  {survol !== 'bac' && survol?.ligne === ligne && <span aria-hidden="true" className="pl-ombre" style={{ gridColumn: `${survol.col + 1} / span 1` }} />}
                  {m &&
                    reserves(m).map((r) => (
                      <span key={`r${r.de}`} data-fond="1" style={{ gridColumn: `${r.de + 1} / ${r.a + 2}` }} className="pl-reserve" title="Demi-journée gardée pour les urgences">
                        {r.a > r.de ? 'Réserve urgences' : 'Urgences'}
                      </span>
                    ))}
                  {blocs(ligne).map((b) => (
                    <Bloc
                      key={`${b.c.id}-${b.de}`}
                      c={b.c}
                      de={b.de}
                      a={b.a}
                      href={ouvrir(b.c.id)}
                      enCours={enCours.has(b.c.id)}
                      tire={tire?.id === b.c.id}
                      onTire={(id) => tirer(id, ligne, b.de)}
                    />
                  ))}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      <p className="pl-legende">
        <span>
          <i style={{ backgroundImage: 'var(--degrade)' }} />
          Chantier (plusieurs demi-journées)
        </span>
        <span>
          <i className="border-l-[3px] border-l-rouge bg-rouge-doux" />
          Dépannage
        </span>
        <span>
          <i className="border-l-[3px] border-l-menthe bg-vert-doux" />
          Entretien
        </span>
        <span>
          <i className="bg-violet" />
          Point violet : fiche à valider
        </span>
        {avecReserve && <span className="text-rouge">Hachuré rouge : demi-journée gardée pour les urgences.</span>}
        <span>Cliquez une case vide pour créer une intervention</span>
      </p>

      <section
        className={`carte flex flex-col gap-3 p-4 transition-colors ${survol === 'bac' ? 'bg-bleu-doux! ring-2 ring-cobalt' : ''}`}
        aria-labelledby="titre-a-placer"
        onDragOver={(e) => {
          if (!tire) return;
          e.preventDefault();
          if (survol !== 'bac') setSurvol('bac');
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol((s) => (s === 'bac' ? null : s));
        }}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(null);
          const id = e.dataTransfer.getData('text/plain');
          // En plus du bac : déposer ici une intervention datée lui retire sa date.
          if (id && tire?.ligne !== null) deposer(id, null, null);
          setTire(null);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <h2 id="titre-a-placer" className="text-[17px] font-extrabold">
            À placer au planning{' '}
            <span className="ml-1 inline-block min-w-5 rounded-full bg-doux px-[7px] py-px text-center align-middle text-[11px] font-extrabold text-gris tabular-nums">
              {attente.length}
            </span>
          </h2>
          <span className="text-[12.5px] text-gris">Glissez une carte sur une demi-journée, ou ouvrez-la pour choisir date et technicien</span>
        </div>
        {attente.length ? (
          <div className="pl-cartes">
            {attente.map((c) => (
              <Link
                key={c.id}
                href={ouvrir(c.id)}
                scroll={false}
                prefetch={false}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  tirer(c.id, null, null);
                }}
                onDragEnd={() => tirer(null, null, null)}
                className={`pl-carte ${c.famille} ${tire?.id === c.id ? 'glisse' : ''} ${enCours.has(c.id) ? 'animate-pulse' : ''}`}
              >
                <span className="mb-1 flex flex-wrap gap-1">
                  <Puce ton={TON_FAMILLE[c.famille]}>{LIBELLE_TYPE[c.type]}</Puce>
                  {c.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[c.urgence]}</Puce>}
                </span>
                <b className="block font-semibold">{c.motif}</b>
                <small className="block text-xs text-gris">
                  <span className="font-mono">{c.reference}</span>
                  {c.lieu ? ` · ${c.lieu}` : ''}
                  {c.souhaitee ? ` · souhaitée le ${jjmm(c.souhaitee)}` : ''}
                  {c.date ? ` · ${jjmm(c.date)}, sans technicien` : ''}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="p-2.5 text-center text-[13px] text-gris">Rien à placer. Les visites d’entretien arrivent ici quand vous les planifiez depuis un contrat.</p>
        )}
      </section>
    </div>
  );
}

/** Un bloc de la grille, comme le bac : motif, puis « 09:00 · DEP-2026-0143 » (et le lieu s'il couvre deux demi-journées). */
function Bloc({
  c,
  de,
  a,
  href,
  enCours,
  tire,
  onTire,
}: {
  c: CarteRdv;
  de: number;
  a: number;
  href: string;
  enCours: boolean;
  tire: boolean;
  onTire: (id: string | null) => void;
}) {
  const court = a - de < 1;
  const urgent = c.urgence !== 'normale';
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', c.id);
        e.dataTransfer.effectAllowed = 'move';
        onTire(c.id);
      }}
      onDragEnd={() => onTire(null)}
      style={{ gridColumn: `${de + 1} / ${a + 2}` }}
      title={`${c.reference} · ${c.motif}${c.adresse ? ` · ${c.adresse}` : ''} · ${LIBELLE_STATUT[c.etat]}`}
      className={`pl-bloc ${c.famille} st-${c.etat} ${tire ? 'glisse' : ''} ${enCours ? 'animate-pulse' : ''}`}
    >
      <span className="pl-motif">
        {urgent && (
          <em className="pl-urg">
            !<span className="sr-only"> {LIBELLE_URGENCE[c.urgence]} :</span>
          </em>
        )}
        {c.motif}
      </span>
      <small>
        {c.famille !== 'chantier' && c.heure ? `${c.heure} · ` : ''}
        {c.reference}
        {court || !c.lieu ? '' : ` · ${c.lieu}`}
      </small>
      <span className="pl-pt" aria-hidden="true" />
    </Link>
  );
}

const JOURS_RESERVE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Heures par semaine et demi-journées gardées pour les urgences d'un technicien (dirigeant, en plus du bac). */
function Reglage({ membre, fermer, enregistrer }: { membre: MembrePlanning; fermer: () => void; enregistrer: (heures: number, reserve: number[]) => void }) {
  const [heures, setHeures] = useState(String(membre.heures).replace('.', ','));
  const [reserve, setReserve] = useState(new Set(membre.reserve));
  const h = Number(heures.replace(',', '.'));
  const valide = heures.trim() !== '' && Number.isFinite(h) && h >= 0 && h <= 80;
  return (
    <div className="carte apparition flex flex-wrap items-end gap-x-8 gap-y-4 px-5 py-4 text-sm">
      <div>
        <p className="mb-2 font-extrabold">Disponibilités de {membre.nom}</p>
        <label className="etiquette" htmlFor={`h-${membre.id}`}>
          Heures par semaine
        </label>
        <input id={`h-${membre.id}`} className="champ w-28 py-2" inputMode="decimal" value={heures} onChange={(e) => setHeures(e.target.value)} />
      </div>
      <div className="max-w-full overflow-x-auto">
        <p className="etiquette">Gardé pour les urgences</p>
        <div className="grid grid-cols-[auto_repeat(6,56px)] items-center gap-1 text-xs">
          <span />
          {JOURS_RESERVE.map((j) => (
            <span key={j} className="text-center font-bold text-gris">
              {j}
            </span>
          ))}
          {([0, 1] as Demi[]).map((d) => (
            <Fragment key={d}>
              <span className="pr-2 text-gris">{d ? 'après-midi' : 'matin'}</span>
              {JOURS_RESERVE.map((j, k) => {
                const i = k * 2 + d;
                const pris = reserve.has(i);
                return (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={pris}
                    aria-label={`${j} ${d ? 'après-midi' : 'matin'}`}
                    onClick={() =>
                      setReserve((s) => {
                        const suite = new Set(s);
                        if (pris) suite.delete(i);
                        else suite.add(i);
                        return suite;
                      })
                    }
                    className={`h-8 rounded-lg border text-[11px] font-bold transition ${
                      pris ? 'border-dashed border-rouge bg-rouge-doux text-rouge' : 'border-trait bg-white hover:border-pervenche'
                    }`}
                  >
                    {pris ? 'Urgences' : ''}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={!valide}
          onClick={() => enregistrer(h, [...reserve].sort((a, b) => a - b))}
          className="degrade rounded-xl px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        <button type="button" onClick={fermer} className="rounded-xl border border-trait bg-white px-4 py-2 font-bold">
          Annuler
        </button>
      </div>
      <p className="w-full text-xs text-gris">Les demi-journées gardées restent visibles au planning, pour caser les dépannages urgents. La charge se compte sur les heures par semaine.</p>
    </div>
  );
}
