'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties } from 'react';
import { ajouterJours, LIBELLE_STATUT, type StatutIntervention } from '@chantio/shared';
import { planifier } from '../interventions/actions';
import { Icone } from '@/components/icones';
import { annoncer, Roue } from '@/components/retour';
import { Avatar, Panneau } from '@/components/ui';

export type CarteRdv = {
  id: string;
  date: string | null;
  heure: string | null;
  client: string;
  motif: string;
  ville: string | null;
  statut: StatutIntervention;
  urgent: boolean;
  techniciens: string[];
};

type Membre = { id: string; prenom: string; nom: string | null; initiales: string; photo: string | null; email: boolean };

// Liseré de couleur à gauche de chaque rendez-vous, selon le statut.
const LISERE: Record<StatutIntervention, string> = {
  a_planifier: 'border-l-gris/40',
  planifiee: 'border-l-cobalt',
  en_cours: 'border-l-menthe',
  terminee: 'border-l-violet',
  a_reprendre: 'border-l-rouge',
  validee: 'border-l-vert',
  facturee: 'border-l-gris/40',
};

const DEPLACABLE: StatutIntervention[] = ['a_planifier', 'planifiee'];
const SANS = '—'; // ligne « Sans technicien »

const jourCourt = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return {
    nom: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
    num: d.getDate(),
    long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    mois: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  };
};

/**
 * Semaine par technicien : une ligne par personne, une colonne par jour.
 * On glisse une intervention d'une case à l'autre (ou depuis « À planifier ») :
 * l'écran change tout de suite, l'enregistrement et l'invitation d'agenda suivent.
 */
export function Calendrier({
  lundi,
  aujourdhui,
  equipe,
  cartes: initiales,
  invitations,
}: {
  lundi: string;
  aujourdhui: string;
  equipe: Membre[];
  cartes: CarteRdv[];
  invitations: boolean;
}) {
  const [cartes, setCartes] = useState(initiales);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [survol, setSurvol] = useState<string | null>(null);
  const [tire, setTire] = useState<string | null>(null);

  // Nouvelles données du serveur (changement de semaine, enregistrement) : on repart d'elles.
  const [source, setSource] = useState(initiales);
  if (source !== initiales) {
    setSource(initiales);
    setCartes(initiales);
  }

  const jours = useMemo(() => {
    const semaine = Array.from({ length: 7 }, (_, n) => ajouterJours(lundi, n));
    // Le dimanche n'apparaît que s'il y a quelque chose ce jour-là.
    return cartes.some((c) => c.date === semaine[6]) ? semaine : semaine.slice(0, 6);
  }, [lundi, cartes]);

  const lignes = [...equipe.map((m) => m.id), ...(cartes.some((c) => c.date && !c.techniciens.length) ? [SANS] : [])];
  const aPlanifier = cartes.filter((c) => !c.date);

  const dansCase = (ligne: string, jour: string) =>
    cartes
      .filter((c) => c.date === jour && (ligne === SANS ? !c.techniciens.length : c.techniciens.includes(ligne)))
      .sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99'));

  async function deposer(id: string, ligne: string | null, jour: string | null) {
    const c = cartes.find((x) => x.id === id);
    if (!c) return;
    const techniciens = ligne === null ? c.techniciens : ligne === SANS ? [] : [ligne];
    if (c.date === jour && techniciens.join() === c.techniciens.join()) return;
    const avant = cartes;
    setCartes((t) => t.map((x) => (x.id === id ? { ...x, date: jour, techniciens, statut: jour && techniciens.length ? 'planifiee' : 'a_planifier' } : x)));
    setEnCours((s) => new Set(s).add(id));
    const r = await planifier(id, { date_prevue: jour, heure_prevue: c.heure, techniciens }).catch(() => ({
      erreur: 'Pas de réseau : réessaie.',
      invites: [] as string[],
    }));
    setEnCours((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    if (r.erreur) {
      setCartes(avant);
      annoncer(r.erreur, 'erreur');
      return;
    }
    const qui = equipe.find((m) => m.id === techniciens[0]);
    annoncer(jour ? `${c.client} : ${jourCourt(jour).long}${qui ? ` avec ${qui.prenom}` : ''}` : `${c.client} remis à planifier`);
    if (r.invites?.length) annoncer(`Invitation agenda envoyée à ${r.invites.join(', ')}`);
  }

  const zone = (cle: string, ligne: string | null, jour: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!tire) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (survol !== cle) setSurvol(cle);
    },
    onDragLeave: () => setSurvol((s) => (s === cle ? null : s)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setSurvol(null);
      const id = e.dataTransfer.getData('text/plain');
      if (id) deposer(id, ligne, jour);
    },
  });

  const semaineAvant = ajouterJours(lundi, -7);
  const semaineApres = ajouterJours(lundi, 7);
  const debut = jourCourt(jours[0]);
  const fin = jourCourt(jours[jours.length - 1]);
  const colonnes = { '--jours': jours.length } as CSSProperties;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="carte overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-trait px-5 py-3">
          <h2 className="text-[17px] font-extrabold">
            Semaine du {debut.mois} au {fin.mois}
          </h2>
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

        <div className="overflow-x-auto">
          <div className="grille-planning min-w-[860px]" style={colonnes}>
            {/* En-tête des jours */}
            <div className="border-b border-trait bg-fond/60" />
            {jours.map((j) => {
              const d = jourCourt(j);
              const auj = j === aujourdhui;
              return (
                <div key={j} className={`border-b border-l border-trait px-3 py-2.5 text-center ${auj ? 'bg-doux' : 'bg-fond/60'}`}>
                  <span className="block text-xs font-bold text-gris uppercase">{d.nom}</span>
                  <span className={`mt-0.5 inline-grid h-8 w-8 place-items-center rounded-full text-[15px] font-extrabold ${auj ? 'bg-cobalt text-white' : ''}`}>
                    {d.num}
                  </span>
                </div>
              );
            })}

            {lignes.map((ligne) => {
              const m = equipe.find((x) => x.id === ligne);
              return (
                <div key={ligne} className="contents">
                  <div className="flex items-center gap-2.5 border-b border-trait px-4 py-3">
                    {m ? (
                      <>
                        <Avatar url={m.photo} initiales={m.initiales} taille={34} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold">{m.prenom}</span>
                          <span className="block text-xs text-gris">
                            {cartes.filter((c) => c.date && jours.includes(c.date) && c.techniciens.includes(m.id)).length} cette semaine
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-gris">Sans technicien</span>
                    )}
                  </div>
                  {jours.map((j) => {
                    const cle = `${ligne}|${j}`;
                    return (
                      <div
                        key={cle}
                        {...zone(cle, ligne, j)}
                        className={`min-h-[96px] space-y-1.5 border-b border-l border-trait p-1.5 transition-colors ${
                          survol === cle ? 'bg-bleu-doux ring-2 ring-cobalt ring-inset' : j === aujourdhui ? 'bg-doux/40' : ''
                        }`}
                      >
                        {dansCase(ligne, j).map((c) => (
                          <Rdv key={c.id} c={c} enCours={enCours.has(c.id)} onTire={setTire} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {!equipe.length && <p className="px-5 py-8 text-center text-gris">Ajoutez un technicien dans Équipe pour planifier.</p>}
      </section>

      <div className="grid gap-6 2xl:sticky 2xl:top-6">
        <Panneau titre="À planifier" nombre={aPlanifier.length}>
          <div
            {...zone('bac', null, null)}
            className={`min-h-[120px] space-y-2 p-3 transition-colors ${survol === 'bac' ? 'bg-bleu-doux ring-2 ring-cobalt ring-inset' : ''}`}
          >
            {aPlanifier.length ? (
              aPlanifier.map((c) => <Rdv key={c.id} c={c} enCours={enCours.has(c.id)} onTire={setTire} large />)
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

function Rdv({ c, enCours, onTire, large = false }: { c: CarteRdv; enCours: boolean; onTire: (id: string | null) => void; large?: boolean }) {
  const deplacable = DEPLACABLE.includes(c.statut);
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
      title={`${c.client} · ${c.motif}${deplacable ? '' : ` (${LIBELLE_STATUT[c.statut]})`}`}
      className={`block rounded-[10px] border border-l-4 border-trait bg-white px-2 py-1.5 text-left shadow-[0_4px_10px_-8px_rgb(16_26_61/0.4)] transition hover:border-pervenche ${LISERE[c.statut]} ${
        deplacable ? 'cursor-grab active:cursor-grabbing' : 'opacity-80'
      } ${enCours ? 'animate-pulse' : ''} ${large ? 'px-3 py-2' : ''}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-extrabold tabular-nums">
        {c.heure ? c.heure.replace(':', ' h ') : 'Sans heure'}
        {c.urgent && <span className="rounded-full bg-rouge-doux px-1.5 text-[10px] text-rouge">Urgent</span>}
        {enCours && <Roue taille={12} />}
      </span>
      <span className="block truncate text-[13px] font-bold">{c.client}</span>
      <span className="block truncate text-xs text-gris">
        {c.motif}
        {large && c.ville ? ` · ${c.ville}` : ''}
      </span>
    </Link>
  );
}
