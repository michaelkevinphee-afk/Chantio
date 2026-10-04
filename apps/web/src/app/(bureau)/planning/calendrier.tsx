'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  ajouterJours,
  demiJournees,
  deplacer,
  HEURE_DEMI,
  heuresSur,
  indexDemi,
  LIBELLE_STATUT,
  occupe,
  surPlusieursJours,
  texteReserve,
  type Demi,
  type StatutIntervention,
  type TypeIntervention,
} from '@chantio/shared';
import { planifier } from '../interventions/actions';
import { reglerDisponibilite } from './actions';
import { Icone } from '@/components/icones';
import { annoncer, Roue } from '@/components/retour';
import { Avatar, Panneau } from '@/components/ui';
import { Bascule, jourCourt, LISERE } from './outils';

export type CarteRdv = {
  id: string;
  reference: string | null;
  type: TypeIntervention;
  date: string | null;
  heure: string | null;
  /** Dernier jour d'un chantier sur plusieurs jours. */
  date_fin: string | null;
  fin_midi: boolean;
  duree: number | null;
  /** Date souhaitée d'une visite d'entretien pas encore placée. */
  souhaitee: string | null;
  client: string;
  motif: string;
  ville: string | null;
  statut: StatutIntervention;
  urgent: boolean;
  techniciens: string[];
};

type Membre = { id: string; prenom: string; nom: string | null; initiales: string; photo: string | null; heures: number; reserve: number[] };

const GROUPES: { cle: string; libelle: string; types: TypeIntervention[] }[] = [
  { cle: 'depannage', libelle: 'Dépannages', types: ['depannage', 'sav'] },
  { cle: 'entretien', libelle: 'Entretiens', types: ['entretien'] },
  { cle: 'chantier', libelle: 'Chantiers', types: ['chantier', 'installation', 'mise_en_service'] },
  { cle: 'visite', libelle: 'Visites', types: ['visite_technique'] },
];
const groupe = (t: TypeIntervention) => GROUPES.find((g) => g.types.includes(t))?.cle ?? 'depannage';

const DEPLACABLE: StatutIntervention[] = ['a_planifier', 'planifiee'];
const SANS = '—'; // ligne « Sans technicien »

const creneau = (c: CarteRdv) => ({ date_prevue: c.date, heure_prevue: c.heure, date_fin: c.date_fin, fin_midi: c.fin_midi, duree_prevue: c.duree });
const nombre = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

type Tire = { id: string; ligne: string | null; attrape: { jour: string; demi: Demi } | null };

/**
 * Semaine par technicien et par demi-journée : un dépannage occupe le matin ou
 * l'après-midi, un chantier s'étend sur ses jours. On glisse une intervention
 * d'une case à l'autre (ou depuis « À planifier ») : l'écran change tout de
 * suite, l'enregistrement et l'invitation d'agenda suivent.
 */
export function Calendrier({
  lundi,
  aujourdhui,
  equipe: equipeInitiale,
  cartes: initiales,
  invitations,
  dirigeant,
}: {
  lundi: string;
  aujourdhui: string;
  equipe: Membre[];
  cartes: CarteRdv[];
  invitations: boolean;
  dirigeant: boolean;
}) {
  const router = useRouter();
  const [cartes, setCartes] = useState(initiales);
  const [equipe, setEquipe] = useState(equipeInitiale);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [survol, setSurvol] = useState<{ ligne: string; col: number } | 'bac' | null>(null);
  const [tire, setTire] = useState<Tire | null>(null);
  const [masques, setMasques] = useState<Set<string>>(new Set());
  const [reglage, setReglage] = useState<string | null>(null);

  // Nouvelles données du serveur (changement de semaine, enregistrement) : on repart d'elles.
  const [source, setSource] = useState({ initiales, equipeInitiale });
  if (source.initiales !== initiales || source.equipeInitiale !== equipeInitiale) {
    setSource({ initiales, equipeInitiale });
    setCartes(initiales);
    setEquipe(equipeInitiale);
  }

  const semaine = useMemo(() => Array.from({ length: 7 }, (_, n) => ajouterJours(lundi, n)), [lundi]);
  // Le dimanche n'apparaît que s'il y a quelque chose ce jour-là.
  const jours = cartes.some((c) => occupe(creneau(c), semaine[6])) ? semaine : semaine.slice(0, 6);
  const n = jours.length * 2;

  const lignes = [...equipe.map((m) => m.id), ...(cartes.some((c) => !c.techniciens.length && jours.some((j) => occupe(creneau(c), j))) ? [SANS] : [])];
  const aPlanifier = cartes.filter((c) => !c.date);
  const dansLaSemaine = cartes.filter((c) => jours.some((j) => occupe(creneau(c), j)));

  /** Les blocs d'une ligne : une suite de demi-journées occupées, d'un seul tenant. */
  function blocs(ligne: string) {
    const out: { c: CarteRdv; de: number; a: number }[] = [];
    for (const c of dansLaSemaine) {
      if (masques.has(groupe(c.type))) continue;
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

  /** Demi-journées gardées pour les urgences, regroupées quand elles se suivent. */
  function reserves(m: Membre) {
    const cols = jours.flatMap((j, k) => ([0, 1] as Demi[]).filter((d) => m.reserve.includes(indexDemi(j, d))).map((d) => k * 2 + d));
    const out: { de: number; a: number }[] = [];
    for (const c of cols) {
      const der = out[out.length - 1];
      if (der && der.a === c - 1) der.a = c;
      else out.push({ de: c, a: c });
    }
    return out;
  }

  async function deposer(id: string, ligne: string | null, col: number | null) {
    const c = cartes.find((x) => x.id === id);
    if (!c) return;
    const depuis = tire?.id === id ? tire.ligne : null;
    let techniciens = [...c.techniciens];
    if (ligne && ligne !== SANS) {
      if (depuis && depuis !== SANS && depuis !== ligne) techniciens = techniciens.filter((t) => t !== depuis);
      if (!techniciens.includes(ligne)) techniciens.push(ligne);
    } else if (ligne === SANS && depuis && depuis !== SANS) techniciens = techniciens.filter((t) => t !== depuis);

    const place =
      col === null
        ? { date_prevue: null, heure_prevue: c.heure, date_fin: null, fin_midi: false }
        : deplacer(creneau(c), { jour: jours[col >> 1], demi: (col & 1) as Demi }, tire?.id === id ? tire.attrape : null);
    if (place.date_prevue === c.date && place.heure_prevue === c.heure && place.date_fin === (c.date_fin ?? null) && techniciens.join() === c.techniciens.join()) return;

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
              statut: place.date_prevue && techniciens.length ? 'planifiee' : 'a_planifier',
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
    }).catch(() => ({ erreur: 'Pas de réseau : réessaie.', invites: [] as string[] }));
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
    const noms = techniciens.map((t) => equipe.find((m) => m.id === t)?.prenom).filter(Boolean);
    const quand = place.date_prevue
      ? place.date_fin && place.date_fin > place.date_prevue
        ? `du ${jourCourt(place.date_prevue).long} au ${jourCourt(place.date_fin).long}`
        : `${jourCourt(place.date_prevue).long} ${(col ?? 0) & 1 ? 'après-midi' : 'matin'}`
      : null;
    annoncer(quand ? `${c.client} : ${quand}${noms.length ? ` avec ${noms.join(' et ')}` : ', sans technicien'}` : `${c.client} remis à planifier`);
    if (r.invites?.length) annoncer(`Invitation agenda envoyée à ${r.invites.join(', ')}`);
  }

  /** La demi-journée sous la souris, dans la zone d'une ligne (marge intérieure de 6 px). */
  const colonne = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left - 6) / Math.max(1, r.width - 12)) * n)));
  };

  async function enregistrerReglage(m: Membre, heures: number, reserve: number[]) {
    const avant = equipe;
    setEquipe((t) => t.map((x) => (x.id === m.id ? { ...x, heures, reserve } : x)));
    setReglage(null);
    const r = await reglerDisponibilite(m.id, heures, reserve).catch(() => ({ erreur: 'Pas de réseau : réessaie.' }));
    if (r.erreur) {
      setEquipe(avant);
      annoncer(r.erreur, 'erreur');
    } else annoncer(`Disponibilités de ${m.prenom} enregistrées`);
  }

  const semaineAvant = ajouterJours(lundi, -7);
  const semaineApres = ajouterJours(lundi, 7);
  const debut = jourCourt(jours[0]);
  const fin = jourCourt(jours[jours.length - 1]);
  const colonnes = { '--jours': jours.length } as CSSProperties;
  const grille = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 min-[1800px]:grid-cols-[minmax(0,1fr)_300px]">
      <section className="carte overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-trait px-5 py-3">
          <h2 className="text-[17px] font-extrabold">
            Semaine du {debut.mois} au {fin.mois}
          </h2>
          <Bascule vue="semaine" lundi={lundi} mois={ajouterJours(lundi, 3).slice(0, 7)} />
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href={`/planning?semaine=${semaineAvant}`}
              aria-label="Semaine précédente"
              className="grid h-9 w-9 place-items-center rounded-xl border border-trait bg-white transition hover:border-cobalt"
            >
              <Icone nom="gauche" taille={18} />
            </Link>
            <Link
              href="/planning"
              className="h-9 rounded-xl border border-trait bg-white px-3 text-sm leading-9 font-bold transition hover:border-cobalt"
            >
              Cette semaine
            </Link>
            <Link
              href={`/planning?semaine=${semaineApres}`}
              aria-label="Semaine suivante"
              className="grid h-9 w-9 place-items-center rounded-xl border border-trait bg-white transition hover:border-cobalt"
            >
              <Icone nom="chevron" taille={18} />
            </Link>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-trait px-5 py-2.5">
          {GROUPES.map((g) => {
            const actif = !masques.has(g.cle);
            const combien = dansLaSemaine.filter((c) => groupe(c.type) === g.cle).length;
            return (
              <button
                key={g.cle}
                type="button"
                aria-pressed={actif}
                onClick={() =>
                  setMasques((s) => {
                    const suite = new Set(s);
                    if (actif) suite.add(g.cle);
                    else suite.delete(g.cle);
                    return suite;
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-bold transition-transform active:scale-[0.96] ${
                  actif ? 'border-cobalt bg-doux text-bleu' : 'border-trait bg-white text-gris line-through decoration-gris/50'
                }`}
              >
                {g.libelle}
                <span className={`min-w-5 rounded-full px-1.5 text-center text-xs ${actif ? 'bg-white text-cobalt' : 'bg-doux text-gris'}`}>{combien}</span>
              </button>
            );
          })}
        </div>

        {(() => {
          const m = equipe.find((x) => x.id === reglage);
          return m ? <Reglage key={m.id} membre={m} fermer={() => setReglage(null)} enregistrer={(h, r) => enregistrerReglage(m, h, r)} /> : null;
        })()}

        <div className="overflow-x-auto">
          <div className="grille-planning min-w-[1040px]" style={colonnes}>
            {/* En-tête des jours, puis matin et après-midi */}
            <div className="border-b border-trait bg-fond/60" />
            {jours.map((j) => {
              const d = jourCourt(j);
              const auj = j === aujourdhui;
              return (
                <div key={j} className={`border-b border-l border-trait pt-2.5 text-center ${auj ? 'bg-doux' : 'bg-fond/60'}`}>
                  <span className="block text-xs font-bold text-gris uppercase">{d.nom}</span>
                  <span className={`mt-0.5 inline-grid h-8 w-8 place-items-center rounded-full text-[15px] font-extrabold ${auj ? 'bg-cobalt text-white' : ''}`}>
                    {d.num}
                  </span>
                  <span className="mt-1 grid grid-cols-2 border-t border-trait/70 text-[11px] font-semibold text-gris">
                    <span className="py-1">matin</span>
                    <span className="border-l border-dashed border-trait py-1">après-midi</span>
                  </span>
                </div>
              );
            })}

            {lignes.map((ligne) => {
              const m = equipe.find((x) => x.id === ligne);
              const charge = m ? cartes.filter((c) => c.techniciens.includes(m.id)).reduce((t, c) => t + heuresSur(creneau(c), semaine), 0) : 0;
              const taux = m && m.heures ? Math.round((charge / m.heures) * 100) : 0;
              return (
                <div key={ligne} className="contents">
                  <div className={`border-b border-trait px-4 py-3 ${reglage === ligne ? 'bg-doux' : ''}`}>
                    {m ? (
                      <>
                        <span className="flex items-center gap-2.5">
                          <Avatar url={m.photo} initiales={m.initiales} taille={30} />
                          <span className="min-w-0 truncate text-sm font-extrabold">{m.prenom}</span>
                        </span>
                        <button
                          type="button"
                          disabled={!dirigeant}
                          onClick={() => setReglage((r) => (r === m.id ? null : m.id))}
                          title={dirigeant ? 'Heures par semaine et réserve d’urgences' : undefined}
                          className={`mt-1.5 block text-left text-xs whitespace-nowrap text-gris tabular-nums ${dirigeant ? 'hover:text-cobalt hover:underline' : ''}`}
                        >
                          {nombre(charge)} h / {nombre(m.heures)} h · {taux} %
                        </button>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-doux" aria-hidden="true">
                          <span className={`block h-full rounded-full ${taux > 100 ? 'bg-rouge' : taux > 90 ? 'bg-violet' : 'bg-cobalt'}`} style={{ width: `${Math.min(100, taux)}%` }} />
                        </span>
                        {m.reserve.length > 0 && <span className="mt-1 block truncate text-[11px] text-rouge">Urgences : {texteReserve(m.reserve)}</span>}
                      </>
                    ) : (
                      <span className="text-sm font-bold text-gris">
                        Sans technicien
                        <span className="block text-xs font-normal">à attribuer</span>
                      </span>
                    )}
                  </div>
                  <div
                    style={{ ...grille, gridColumn: '2 / -1', gridAutoFlow: 'row dense' }}
                    className="relative grid min-h-[96px] content-start gap-1 border-b border-trait p-1.5"
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
                      const q = new URLSearchParams({ date: jours[col >> 1], heure: HEURE_DEMI[(col & 1) as Demi] });
                      if (m) q.set('technicien', m.id);
                      router.push(`/interventions/nouvelle?${q}`);
                    }}
                    title="Cliquez une demi-journée libre pour créer une intervention"
                  >
                    {/* Fond : séparations des jours et du midi, aujourd'hui, case visée */}
                    {jours.map((j, k) => (
                      <span
                        key={j}
                        data-fond="1"
                        aria-hidden="true"
                        style={{ gridColumn: `${k * 2 + 1} / span 2` }}
                        className={`absolute inset-y-0 w-full ${k ? 'border-l border-trait' : ''} ${j === aujourdhui ? 'bg-doux/40' : ''}`}
                      >
                        <span data-fond="1" className="absolute inset-y-0 left-1/2 border-l border-dashed border-trait/70" />
                      </span>
                    ))}
                    {survol !== 'bac' && survol?.ligne === ligne && (
                      <span
                        aria-hidden="true"
                        style={{ gridColumn: `${survol.col + 1} / span 1` }}
                        className="pointer-events-none absolute inset-y-1 w-full rounded-[10px] bg-bleu-doux ring-2 ring-cobalt ring-inset"
                      />
                    )}
                    {m &&
                      reserves(m).map((r) => (
                        <span
                          key={`r${r.de}`}
                          style={{ gridColumn: `${r.de + 1} / ${r.a + 2}` }}
                          className="relative truncate rounded-[10px] border border-dashed border-rouge/50 bg-rouge-doux/50 px-2 py-1 text-[11px] font-bold text-rouge"
                          title="Demi-journée gardée pour les urgences"
                        >
                          {r.a > r.de ? 'Réserve urgences' : 'Urgences'}
                        </span>
                      ))}
                    {blocs(ligne).map((b) => (
                      <Rdv
                        key={`${b.c.id}-${b.de}`}
                        c={b.c}
                        style={{ gridColumn: `${b.de + 1} / ${b.a + 2}` }}
                        court={b.a === b.de}
                        enCours={enCours.has(b.c.id)}
                        onTire={(id) => setTire(id ? { id, ligne, attrape: { jour: jours[b.de >> 1], demi: (b.de & 1) as Demi } } : null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {!equipe.length && <p className="px-5 py-8 text-center text-gris">Ajoutez un technicien dans Équipe pour planifier.</p>}
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-trait px-5 py-2.5 text-xs text-gris">
          <span>Un chantier s’étend sur ses demi-journées, week-end sauté.</span>
          <span className="text-rouge">Hachuré rouge : demi-journée gardée pour les urgences.</span>
          <span>Une case libre se clique pour créer une intervention.</span>
        </p>
      </section>

      <div className="grid gap-6 min-[1800px]:sticky min-[1800px]:top-6">
        <Panneau titre="À planifier" nombre={aPlanifier.length}>
          <div
            onDragOver={(e) => {
              if (!tire) return;
              e.preventDefault();
              if (survol !== 'bac') setSurvol('bac');
            }}
            onDragLeave={() => setSurvol((s) => (s === 'bac' ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) deposer(id, null, null);
              setTire(null);
            }}
            className={`min-h-[120px] space-y-2 p-3 transition-colors ${survol === 'bac' ? 'bg-bleu-doux ring-2 ring-cobalt ring-inset' : ''}`}
          >
            {aPlanifier.length ? (
              aPlanifier.map((c) => (
                <Rdv key={c.id} c={c} enCours={enCours.has(c.id)} onTire={(id) => setTire(id ? { id, ligne: null, attrape: null } : null)} large />
              ))
            ) : (
              <p className="px-2 py-6 text-center text-sm text-gris">Tout est planifié. Déposez ici une intervention pour retirer sa date.</p>
            )}
          </div>
        </Panneau>
        <p className="flex items-start gap-2 px-1 text-[13px] text-gris">
          <Icone nom="calendrier" taille={16} className="mt-0.5 shrink-0 text-cobalt" />
          {invitations
            ? 'Chaque technicien reçoit une invitation dans l’agenda de son adresse e-mail, mise à jour si vous déplacez le rendez-vous.'
            : 'Les invitations d’agenda par e-mail seront actives dès que la clé d’envoi sera réglée. En attendant, utilisez « Ajouter à mon agenda » sur chaque intervention.'}
        </p>
      </div>
    </div>
  );
}

const JOURS_RESERVE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Heures par semaine et demi-journées gardées pour les urgences d'un technicien (dirigeant). */
function Reglage({ membre, fermer, enregistrer }: { membre: Membre; fermer: () => void; enregistrer: (heures: number, reserve: number[]) => void }) {
  const [heures, setHeures] = useState(String(membre.heures).replace('.', ','));
  const [reserve, setReserve] = useState(new Set(membre.reserve));
  const h = Number(heures.replace(',', '.'));
  const valide = heures.trim() !== '' && Number.isFinite(h) && h >= 0 && h <= 80;
  return (
    <div className="apparition flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-trait bg-fond/60 px-5 py-4 text-sm">
      <div>
        <p className="mb-2 font-extrabold">Disponibilités de {membre.prenom}</p>
        <label className="etiquette" htmlFor={`h-${membre.id}`}>
          Heures par semaine
        </label>
        <input id={`h-${membre.id}`} className="champ w-28 py-2" inputMode="decimal" value={heures} onChange={(e) => setHeures(e.target.value)} />
      </div>
      <div>
        <p className="etiquette">Gardé pour les urgences</p>
        <div className="grid grid-cols-[auto_repeat(6,64px)] items-center gap-1 text-xs">
          <span />
          {JOURS_RESERVE.map((j) => (
            <span key={j} className="text-center font-bold text-gris">
              {j}
            </span>
          ))}
          {([0, 1] as Demi[]).map((d) => (
            <div key={d} className="contents">
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
            </div>
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

function Rdv({
  c,
  enCours,
  onTire,
  large = false,
  court = false,
  style,
}: {
  c: CarteRdv;
  enCours: boolean;
  onTire: (id: string | null) => void;
  large?: boolean;
  court?: boolean;
  style?: CSSProperties;
}) {
  const deplacable = DEPLACABLE.includes(c.statut);
  const plusieurs = surPlusieursJours(creneau(c));
  const quand = plusieurs
    ? `Jusqu’au ${jourCourt(c.date_fin!).nom} ${jourCourt(c.date_fin!).num}`
    : c.heure
      ? c.heure.replace(':', ' h ')
      : !c.date && c.souhaitee
        ? `Vers le ${jourCourt(c.souhaitee).mois}`
        : 'Sans heure';
  return (
    <Link
      href={`/interventions/${c.id}`}
      draggable={deplacable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', c.id);
        e.dataTransfer.effectAllowed = 'move';
        onTire(c.id);
      }}
      onDragEnd={() => onTire(null)}
      style={style}
      title={`${c.reference ? `${c.reference} · ` : ''}${c.client} · ${c.motif}${deplacable ? '' : ` (${LIBELLE_STATUT[c.statut]})`}`}
      className={`relative block min-w-0 rounded-[10px] border border-l-4 border-trait px-2 py-1.5 text-left shadow-[0_4px_10px_-8px_rgb(16_26_61/0.4)] transition hover:border-pervenche ${LISERE[c.statut]} ${
        plusieurs ? 'bg-doux' : 'bg-white'
      } ${deplacable ? 'cursor-grab active:cursor-grabbing' : 'opacity-80'} ${enCours ? 'animate-pulse' : ''} ${large ? 'px-3 py-2' : ''}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-extrabold tabular-nums">
        <span className="truncate">{quand}</span>
        {c.urgent && <span className="shrink-0 rounded-full bg-rouge-doux px-1.5 text-[10px] text-rouge">Urgent</span>}
        {enCours && <Roue taille={12} />}
      </span>
      <span className="block truncate text-[13px] font-bold">{c.client}</span>
      {!court && (
        <span className="block truncate text-xs text-gris">
          {c.motif}
          {c.reference ? ` · ${c.reference}` : ''}
          {large && c.ville ? ` · ${c.ville}` : ''}
        </span>
      )}
    </Link>
  );
}
