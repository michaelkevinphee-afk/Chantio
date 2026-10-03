'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  depuisQuand,
  LIBELLE_STATUT,
  POSITION_PERIMEE_MS,
  type Pointage,
  type PositionMembre,
  type StatutIntervention,
} from '@chantio/shared';
import { CarteEquipe, type ArretEquipe, type PersonneCarte } from './carte-equipe';
import type { ArretCarte } from './carte-du-jour';
import { Icone } from './icones';
import { Avatar, Panneau, PuceStatut } from './ui';

export interface MembreDirect {
  id: string;
  prenom: string;
  nom: string | null;
  initiales: string;
  role: string;
  telephone: string | null;
  photo: string | null;
  partage: boolean;
}

export interface InterventionDirect {
  id: string;
  heure: string | null; // « 08:30:00 »
  client: string;
  motif: string;
  ville: string | null;
  statut: StatutIntervention;
  membres: string[];
  site: ArretCarte['site'];
}

// Au-delà de 10 minutes après l'heure prévue sans « Démarrer », l'intervention est en retard.
const TOLERANCE_RETARD = 10;
const FAITES: StatutIntervention[] = ['terminee', 'validee', 'facturee'];

const hhmm = (h: string | null) => (h ? `${Number(h.slice(0, 2))}:${h.slice(3, 5)}` : '');
const enMinutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

/** Minutes écoulées depuis minuit, heure de Paris. */
function minutesParis(d: number | string): number {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  return Number(p.find((x) => x.type === 'hour')?.value) * 60 + Number(p.find((x) => x.type === 'minute')?.value);
}
const heureParis = (iso: string) => {
  const m = minutesParis(iso);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

type Etat = ArretEquipe['etat'];

/**
 * Bloc « Équipe en direct » du Pilotage : la liste des techniciens, la carte et, au clic,
 * la journée du technicien ; puis la frise de la journée de toute l'équipe.
 */
export function EquipeEnDirect({
  membres,
  interventions,
  positions,
  pointages,
  aTraiter,
}: {
  membres: MembreDirect[];
  interventions: InterventionDirect[];
  positions: PositionMembre[];
  pointages: Pointage[];
  aTraiter: ReactNode;
}) {
  const router = useRouter();
  const [choisi, setChoisi] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // Rafraîchit les données (positions, statuts) chaque minute tant que la page est affichée.
  useEffect(() => {
    const t = setInterval(() => {
      setMaintenant(Date.now());
      if (document.visibilityState === 'visible') router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const minutes = minutesParis(maintenant);

  const vue = useMemo(() => {
    const arrivee = new Map<string, Pointage>();
    const depart = new Map<string, Pointage>();
    for (const p of pointages) {
      const m = p.genre === 'arrivee' ? arrivee : depart;
      const deja = m.get(p.intervention_id);
      // Première arrivée, dernier départ.
      if (!deja || (p.genre === 'arrivee' ? p.le < deja.le : p.le > deja.le)) m.set(p.intervention_id, p);
    }
    const etat = (i: InterventionDirect): Etat => {
      if (FAITES.includes(i.statut)) return 'fait';
      if (i.statut === 'en_cours') return 'cours';
      if (!i.membres.length) return 'attribuer';
      if (i.heure && enMinutes(i.heure) + TOLERANCE_RETARD < minutes && !arrivee.has(i.id)) return 'retard';
      return 'prevu';
    };
    const etats = new Map(interventions.map((i) => [i.id, etat(i)]));
    const fraiches = new Map(
      positions.filter((p) => maintenant - new Date(p.enregistree_le).getTime() < POSITION_PERIMEE_MS).map((p) => [p.membre_id, p]),
    );
    const siennes = (id: string) => interventions.filter((i) => i.membres.includes(id));

    const situation = (m: MembreDirect) => {
      const liste = siennes(m.id);
      const enCours = liste.find((i) => i.statut === 'en_cours');
      const retard = liste.find((i) => etats.get(i.id) === 'retard');
      const suivante = liste.find((i) => etats.get(i.id) === 'prevu');
      const pos = fraiches.get(m.id);
      if (enCours) {
        const a = arrivee.get(enCours.id);
        return { ton: 'site' as const, puce: 'Sur site', texte: `Chez ${enCours.client}${a ? ` depuis ${heureParis(a.le)}` : ''}` };
      }
      if (retard) {
        const n = minutes - enMinutes(retard.heure!);
        return { ton: 'retard' as const, puce: `${n} min de retard`, texte: `Attendu à ${hhmm(retard.heure)} chez ${retard.client}` };
      }
      if (suivante) {
        return {
          ton: pos ? ('route' as const) : ('prevu' as const),
          puce: pos ? 'En route' : null,
          texte: `Prochaine ${hhmm(suivante.heure) || 'aujourd’hui'} · ${suivante.client}`,
        };
      }
      if (liste.length) return { ton: 'fini' as const, puce: 'Journée terminée', texte: `${liste.length} intervention${liste.length > 1 ? 's' : ''} faite${liste.length > 1 ? 's' : ''}` };
      return { ton: 'libre' as const, puce: null, texte: 'Rien de prévu aujourd’hui' };
    };

    return { arrivee, depart, etats, fraiches, siennes, situation };
  }, [interventions, positions, pointages, maintenant, minutes]);

  // Les techniciens qui ont une journée d'abord, dans l'ordre alphabétique.
  const equipe = useMemo(
    () => [...membres].sort((a, b) => Number(!vue.siennes(a.id).length) - Number(!vue.siennes(b.id).length) || a.prenom.localeCompare(b.prenom)),
    [membres, vue],
  );

  const arrets: ArretEquipe[] = useMemo(
    () =>
      interventions.map((i) => ({
        id: i.id,
        heure: hhmm(i.heure) || 'Sans heure',
        titre: i.client,
        detail: [i.motif, i.membres.map((id) => membres.find((m) => m.id === id)?.prenom).filter(Boolean).join(', ') || 'Sans technicien']
          .filter(Boolean)
          .join(' · '),
        etat: vue.etats.get(i.id)!,
        membres: i.membres,
        site: i.site,
      })),
    [interventions, membres, vue],
  );

  const personnes: PersonneCarte[] = useMemo(
    () =>
      membres.flatMap((m) => {
        const p = vue.fraiches.get(m.id);
        if (!p) return [];
        const s = vue.situation(m);
        return [{ id: m.id, initiales: m.initiales, photo: m.photo, nom: m.prenom, texte: s.texte, retard: s.ton === 'retard', point: { lat: p.latitude, lon: p.longitude } }];
      }),
    [membres, vue],
  );

  const retards = interventions.filter((i) => vue.etats.get(i.id) === 'retard');
  const sansTechnicien = interventions.filter((i) => !i.membres.length && !FAITES.includes(i.statut));
  const m = choisi ? membres.find((x) => x.id === choisi) ?? null : null;
  const choisir = (id: string | null) => setChoisi((x) => (x === id ? null : id));
  const voir = (id: string) => {
    setChoisi(id);
    document.getElementById('equipe-en-direct')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Panneau
        style={cascade(2)}
        className="apparition mb-6 scroll-mt-6"
        titre={
          <span id="equipe-en-direct" className="flex items-center gap-2">
            <span className="en-direct inline-block h-2 w-2 rounded-full bg-menthe" />
            Équipe en direct
          </span>
        }
        nombre={equipe.length}
        action={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gris max-sm:hidden">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cobalt" />Sur site</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-pervenche" />En route</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F79009]" />En retard</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lavande" />Position masquée</span>
          </span>
        }
      >
        <div
          className={`grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] ${
            m ? '2xl:grid-cols-[290px_minmax(0,1fr)_340px]' : ''
          } lg:grid-rows-[600px_auto]`}
        >
          {/* Liste des techniciens */}
          <div className="flex gap-1 overflow-x-auto border-trait p-2 max-lg:border-b lg:flex-col lg:overflow-y-auto lg:border-r">
            <button
              type="button"
              onClick={() => setChoisi(null)}
              className={`flex shrink-0 items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left text-sm font-extrabold transition ${
                m ? 'border-trait bg-fond text-encre hover:border-cobalt' : 'border-cobalt bg-doux text-cobalt'
              }`}
            >
              <Icone nom="pilotage" taille={18} /> Toute l’équipe sur la carte
            </button>
            {equipe.map((x) => {
              const s = vue.situation(x);
              const liste = vue.siennes(x.id);
              const faites = liste.filter((i) => FAITES.includes(i.statut)).length;
              const pos = vue.fraiches.get(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => choisir(x.id)}
                  aria-pressed={choisi === x.id}
                  className={`grid w-[260px] shrink-0 grid-cols-[40px_minmax(0,1fr)] items-start gap-3 rounded-2xl border p-3 text-left transition lg:w-auto ${
                    choisi === x.id ? 'border-lavande bg-doux' : 'border-transparent hover:bg-fond'
                  }`}
                >
                  <span className="relative">
                    <Avatar url={x.photo} initiales={x.initiales} taille={40} />
                    <span className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-white ${POINT[s.ton]}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-extrabold">
                        {x.prenom} {x.nom ? `${x.nom.slice(0, 1)}.` : ''}
                      </span>
                      {liste.length > 0 && <span className="shrink-0 text-xs font-bold text-gris tabular-nums">{faites}/{liste.length} faites</span>}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-gris">{s.texte}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {s.puce && <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${PUCE[s.ton]}`}>{s.puce}</span>}
                      {!x.partage ? (
                        <span className="rounded-full bg-gris-doux px-2 py-0.5 text-xs font-extrabold text-gris">Position masquée</span>
                      ) : pos ? (
                        <span className="rounded-full bg-gris-doux px-2 py-0.5 text-xs font-bold text-gris">{depuisQuand(pos.enregistree_le, maintenant)}</span>
                      ) : null}
                    </span>
                    {liste.length > 0 && (
                      <span className="mt-2.5 flex gap-1">
                        {liste.map((i) => (
                          <span key={i.id} className={`h-1.5 flex-1 rounded-full ${JALON[i.statut] ?? 'bg-doux'}`} />
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Carte */}
          <div className="relative min-h-[380px] min-w-0">
            <CarteEquipe arrets={arrets} personnes={personnes} choisi={choisi} onChoisir={choisir} hauteur={380} />
            <p className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-80px)] rounded-xl border border-trait bg-white/95 px-3 py-2 text-[13px] font-bold text-gris">
              {m ? (
                <>
                  <span className="text-encre">{m.prenom}</span>
                  {vue.fraiches.get(m.id) ? ` · position ${depuisQuand(vue.fraiches.get(m.id)!.enregistree_le, maintenant)}` : m.partage ? ' · pas de position récente' : ' · position masquée'}
                  {` · ${vue.siennes(m.id).length} intervention${vue.siennes(m.id).length > 1 ? 's' : ''} aujourd’hui`}
                </>
              ) : (
                <>
                  <span className="text-encre">
                    {personnes.length} position{personnes.length > 1 ? 's' : ''} partagée{personnes.length > 1 ? 's' : ''}
                  </span>{' '}
                  · cliquez sur quelqu’un pour voir sa journée
                </>
              )}
            </p>
          </div>

          {/* Journée du technicien choisi */}
          {m && (
            <JourneeTechnicien
              membre={m}
              liste={vue.siennes(m.id)}
              situation={vue.situation(m)}
              position={vue.fraiches.get(m.id) ?? null}
              arrivee={vue.arrivee}
              depart={vue.depart}
              membres={membres}
              maintenant={maintenant}
              fermer={() => setChoisi(null)}
            />
          )}
        </div>
      </Panneau>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panneau
          style={cascade(3)}
          className="apparition"
          titre="Journée de l’équipe"
          nombre={interventions.length}
          action={
            <Link href="/planning" className="inline-flex items-center gap-1 hover:underline">
              Planning <Icone nom="chevron" taille={16} />
            </Link>
          }
        >
          {(retards.length > 0 || sansTechnicien.length > 0) && (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {retards.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => voir(i.membres[0])}
                  className="rounded-xl bg-[#FEF0C7] px-3 py-2 text-left text-[13px] font-bold text-[#B54708] transition hover:brightness-95"
                >
                  {i.membres.map((id) => membres.find((x) => x.id === id)?.prenom).join(' et ')} : {minutes - enMinutes(i.heure!)} min de retard chez {i.client} ({hhmm(i.heure)})
                </button>
              ))}
              {sansTechnicien.length > 0 && (
                <Link href="/planning" className="rounded-xl bg-rouge-doux px-3 py-2 text-[13px] font-bold text-rouge transition hover:brightness-95">
                  {sansTechnicien.length} intervention{sansTechnicien.length > 1 ? 's' : ''} sans technicien aujourd’hui
                </Link>
              )}
            </div>
          )}
          <Frise
            equipe={equipe}
            interventions={interventions}
            arrivee={vue.arrivee}
            depart={vue.depart}
            minutes={minutes}
            choisi={choisi}
            voir={voir}
          />
        </Panneau>
        <div className="grid gap-6">{aTraiter}</div>
      </div>
    </>
  );
}

const POINT = { site: 'bg-cobalt', retard: 'bg-[#F79009]', route: 'bg-pervenche', prevu: 'bg-pervenche', fini: 'bg-menthe', libre: 'bg-trait' };
const PUCE = {
  site: 'bg-doux text-cobalt',
  retard: 'bg-[#FEF0C7] text-[#B54708]',
  route: 'bg-gris-doux text-encre',
  prevu: 'bg-gris-doux text-encre',
  fini: 'bg-vert-doux text-vert',
  libre: 'bg-gris-doux text-gris',
};
const JALON: Partial<Record<StatutIntervention, string>> = {
  en_cours: 'bg-cobalt',
  terminee: 'bg-violet',
  validee: 'bg-menthe',
  facturee: 'bg-menthe',
  a_reprendre: 'bg-rouge',
};

function JourneeTechnicien({
  membre,
  liste,
  situation,
  position,
  arrivee,
  depart,
  membres,
  maintenant,
  fermer,
}: {
  membre: MembreDirect;
  liste: InterventionDirect[];
  situation: { texte: string; puce: string | null; ton: keyof typeof PUCE };
  position: PositionMembre | null;
  arrivee: Map<string, Pointage>;
  depart: Map<string, Pointage>;
  membres: MembreDirect[];
  maintenant: number;
  fermer: () => void;
}) {
  const faites = liste.filter((i) => FAITES.includes(i.statut)).length;
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-trait max-2xl:col-span-full max-2xl:border-t 2xl:border-l" aria-live="polite">
      <div className="flex flex-col gap-3 border-b border-trait px-5 pt-5 pb-4">
        <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3">
          <Avatar url={membre.photo} initiales={membre.initiales} taille={48} />
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-extrabold">
              {membre.prenom} {membre.nom}
            </span>
            <span className="text-[13px] font-semibold text-gris">{membre.role}</span>
          </span>
          <button
            type="button"
            onClick={fermer}
            aria-label="Revenir à toute l’équipe"
            className="grid h-8 w-8 place-items-center rounded-[10px] bg-gris-doux text-gris transition hover:text-encre"
          >
            <Icone nom="fermer" taille={16} />
          </button>
        </div>
        <div className="rounded-[14px] bg-fond px-3.5 py-3 text-[13.5px] leading-relaxed">
          {situation.puce && <b className="font-extrabold">{situation.puce}. </b>}
          {situation.texte}.
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-gris">
            <Icone nom="lieu" taille={14} />
            {!membre.partage
              ? `${membre.prenom} a coupé le partage de sa position.`
              : position
                ? `Position ${depuisQuand(position.enregistree_le, maintenant)}${position.precision_m ? ` · précision ${Math.round(position.precision_m)} m` : ''}`
                : 'Pas de position reçue depuis 15 minutes.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {membre.telephone && (
            <a
              href={`tel:${membre.telephone.replace(/\s/g, '')}`}
              className="inline-flex items-center gap-2 rounded-xl border border-trait px-3 py-2 text-[13.5px] font-extrabold text-encre transition hover:border-cobalt"
            >
              <Icone nom="telephone" taille={15} /> {membre.telephone}
            </a>
          )}
          <Link
            href="/planning"
            className="inline-flex items-center gap-2 rounded-xl border border-trait px-3 py-2 text-[13.5px] font-extrabold text-encre transition hover:border-cobalt"
          >
            <Icone nom="calendrier" taille={15} /> Planning
          </Link>
        </div>
      </div>
      <div className="flex justify-between px-5 pt-4 pb-1.5 text-[13px] font-bold text-gris">
        <span>Sa journée</span>
        <span className="tabular-nums">
          {faites} sur {liste.length} terminée{faites > 1 ? 's' : ''}
        </span>
      </div>
      {liste.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gris">Rien de prévu aujourd’hui.</p>
      ) : (
        <ol className="flex flex-col overflow-y-auto px-5 pb-4 max-2xl:flex-row max-2xl:flex-wrap max-2xl:gap-3">
          {liste.map((i, n) => {
            const a = arrivee.get(i.id);
            const d = depart.get(i.id);
            const avec = i.membres.filter((x) => x !== membre.id).map((x) => membres.find((y) => y.id === x)?.prenom).filter(Boolean);
            return (
              <li key={i.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3.5 max-2xl:min-w-[240px] max-2xl:flex-1">
                {n < liste.length - 1 && <span className="absolute top-[30px] bottom-0 left-[13px] w-0.5 bg-trait max-2xl:hidden" />}
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold ${
                    FAITES.includes(i.statut) ? 'bg-menthe text-white' : i.statut === 'en_cours' ? 'bg-cobalt text-white' : 'bg-doux text-cobalt'
                  }`}
                >
                  {n + 1}
                </span>
                <Link href={`/interventions/${i.id}`} className="-mx-2 -mt-0.5 rounded-[14px] px-2 pt-0.5 pb-2 transition hover:bg-fond">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-extrabold tabular-nums">{hhmm(i.heure) || 'Sans heure'}</span>
                    <PuceStatut statut={i.statut} />
                  </span>
                  <span className="block font-extrabold">{i.client}</span>
                  <span className="block text-[13.5px] text-gris">
                    {i.motif}
                    {i.ville ? ` · ${i.ville}` : ''}
                    {avec.length ? ` · avec ${avec.join(', ')}` : ''}
                  </span>
                  {(a || d) && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {a && <span className="rounded-lg bg-gris-doux px-2 py-0.5 text-xs font-bold text-gris">Arrivé {heureParis(a.le)}</span>}
                      {d && <span className="rounded-lg bg-gris-doux px-2 py-0.5 text-xs font-bold text-gris">Parti {heureParis(d.le)}</span>}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

const BLOC: Partial<Record<StatutIntervention, string>> = {
  a_planifier: 'bg-white text-rouge border-dashed border-[#F5B0AA]',
  planifiee: 'bg-bleu-doux text-bleu border-[#CBD6FF]',
  en_cours: 'degrade text-white border-transparent shadow-none',
  terminee: 'bg-violet-doux text-violet border-transparent',
  validee: 'bg-vert-doux text-vert border-transparent',
  facturee: 'bg-vert-doux text-vert border-transparent',
  a_reprendre: 'bg-rouge-doux text-rouge border-transparent',
};

/** Frise de la journée : une ligne par technicien, de 7 h à 19 h, avec l'heure actuelle. */
function Frise({
  equipe,
  interventions,
  arrivee,
  depart,
  minutes,
  choisi,
  voir,
}: {
  equipe: MembreDirect[];
  interventions: InterventionDirect[];
  arrivee: Map<string, Pointage>;
  depart: Map<string, Pointage>;
  minutes: number;
  choisi: string | null;
  voir: (id: string) => void;
}) {
  const heures = interventions.flatMap((i) => (i.heure ? [enMinutes(i.heure)] : []));
  const debut = Math.min(7 * 60, ...heures.map((h) => Math.floor(h / 60) * 60));
  const fin = Math.max(19 * 60, ...heures.map((h) => Math.ceil((h + 60) / 60) * 60));
  const pct = (m: number) => `${((Math.min(Math.max(m, debut), fin) - debut) / (fin - debut)) * 100}%`;
  const graduations = Array.from({ length: (fin - debut) / 60 + 1 }, (_, k) => debut + k * 60);

  const bloc = (i: InterventionDirect) => {
    const a = arrivee.get(i.id);
    const d = depart.get(i.id);
    const de = a ? minutesParis(a.le) : i.heure ? enMinutes(i.heure) : null;
    if (de == null) return null;
    let a_ = d ? minutesParis(d.le) : de + 60;
    if (i.statut === 'en_cours') a_ = Math.max(minutes, de + 30);
    return { de, a: Math.max(a_, de + 30) };
  };

  const lignes = [
    ...equipe.map((m) => ({ id: m.id as string | null, nom: m.prenom, membre: m, liste: interventions.filter((i) => i.membres.includes(m.id)) })),
    { id: null, nom: 'À attribuer', membre: null, liste: interventions.filter((i) => !i.membres.length) },
  ].filter((l) => l.id || l.liste.length);

  return (
    <div className="overflow-x-auto px-5 pt-3 pb-5">
      <div className="relative min-w-[900px]">
        <div className="grid grid-cols-[130px_minmax(0,1fr)] text-xs font-bold text-gris">
          <span />
          <div className="relative h-5">
            {graduations.map((g) => (
              <span key={g} className="absolute -translate-x-1/2" style={{ left: pct(g) }}>
                {g / 60}h
              </span>
            ))}
          </div>
        </div>
        {lignes.map((l) => (
          <div
            key={l.id ?? 'sans'}
            className={`grid min-h-12 grid-cols-[130px_minmax(0,1fr)] items-center rounded-[10px] border-t border-trait ${
              l.id ? 'cursor-pointer hover:bg-fond' : ''
            } ${l.id && choisi === l.id ? 'bg-fond' : ''}`}
            onClick={l.id ? () => voir(l.id!) : undefined}
          >
            <span className="flex min-w-0 items-center gap-2 pl-1.5 text-sm font-extrabold">
              {l.membre ? (
                <Avatar url={l.membre.photo} initiales={l.membre.initiales} taille={28} />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-rouge-doux text-xs text-rouge">?</span>
              )}
              {l.id ? (
                <button type="button" className="truncate text-left" onClick={(e) => (e.stopPropagation(), voir(l.id!))}>
                  {l.nom}
                </button>
              ) : (
                <span className="truncate">{l.nom}</span>
              )}
            </span>
            <div className="relative h-12">
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  backgroundImage: 'linear-gradient(to right, var(--color-trait) 1px, transparent 1px)',
                  backgroundSize: `calc(100% / ${(fin - debut) / 60}) 100%`,
                }}
              />
              {l.liste.map((i) => {
                const b = bloc(i);
                if (!b) return null;
                const cls = !i.membres.length ? BLOC.a_planifier : BLOC[i.statut];
                return (
                  <Link
                    key={i.id}
                    href={`/interventions/${i.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`${hhmm(i.heure)} · ${i.client} · ${i.motif} · ${LIBELLE_STATUT[i.statut]}`}
                    className={`absolute top-2 flex h-8 items-center overflow-hidden rounded-[9px] border-[1.5px] px-1.5 text-[11.5px] font-extrabold whitespace-nowrap ${cls}`}
                    style={{ left: pct(b.de), width: `calc(${pct(b.a)} - ${pct(b.de)} - 3px)` }}
                  >
                    <span className="truncate">{i.client}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {minutes >= debut && minutes <= fin && (
          <div
            className="pointer-events-none absolute top-5 bottom-0 z-[2] w-0.5 bg-menthe"
            style={{ left: `calc(130px + (100% - 130px) * ${(minutes - debut) / (fin - debut)})` }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-md bg-menthe px-1.5 text-[11px] font-extrabold text-white tabular-nums">
              {Math.floor(minutes / 60)}:{String(minutes % 60).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
