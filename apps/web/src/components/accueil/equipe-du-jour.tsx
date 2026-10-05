'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FamilleIntervention, StatutIntervention } from '@chantio/shared';
import { CarteDuJour, type ArretCarte, type RepereEntreprise } from '@/components/carte-du-jour';
import { AvatarTechnicien } from './techniciens';

/** Une intervention du jour, telle que l'Accueil l'affiche (carte et journée de chacun). */
export interface InterventionDuJour {
  id: string;
  reference: string;
  /** « 08:30 », ou vide sans heure. */
  heure: string;
  motif: string;
  famille: FamilleIntervention;
  /** État affiché (une fiche renvoyée au technicien compte « à reprendre »). */
  etat: StatutIntervention;
  /** L'adresse (« 12 rue de la Pompe »), sinon le nom du client. */
  lieu: string;
  /** Ids des techniciens, le premier donne la couleur. */
  membres: string[];
  /** Heure d'arrivée sur place (« 09:05 ») quand elle est en cours. */
  depuis: string | null;
}

export interface TechnicienDuJour {
  id: string;
  prenom: string;
  nom: string | null;
  couleur: string;
  photo: string | null;
}

/** Un point de la carte, avec les techniciens de l'intervention (pour n'afficher que l'un d'eux). */
export type ArretEquipe = ArretCarte & { membres: string[] };

export const FAITES: StatutIntervention[] = ['terminee', 'validee', 'facturee'];

const PUCE = {
  cobalt: 'degrade text-white shadow-none',
  bleu: 'bg-bleu-doux text-bleu',
  vert: 'bg-vert-doux text-vert',
  gris: 'bg-gris-doux text-gris ring-1 ring-inset ring-trait',
} as const;

/** Où en est un technicien : « Sur place … depuis 09:05 », « Prochaine : 11:00 · … », « Journée terminée », « Rien de prévu ». */
function etatTechnicien(j: InterventionDuJour[]): [string, keyof typeof PUCE] {
  const ec = j.find((i) => i.etat === 'en_cours');
  const proch = j.find((i) => i.etat === 'planifiee' || i.etat === 'a_reprendre');
  if (ec) return [`Sur place${ec.depuis ? ` depuis ${ec.depuis}` : ''}`, 'cobalt'];
  if (proch) return [`Prochaine : ${proch.heure || 'matin'}`, 'bleu'];
  if (j.length) return ['Journée terminée', 'vert'];
  return ['Rien de prévu aujourd’hui', 'gris'];
}

/**
 * « L'équipe aujourd'hui » : la carte du jour à gauche, chaque technicien à droite avec sa journée
 * heure par heure (fait, en cours, à venir ; un clic ouvre l'intervention) et « Sa journée » (son appli).
 * Les boutons du haut ne montrent qu'un technicien sur la carte.
 */
export function EquipeDuJour({
  arrets,
  entreprise,
  techniciens,
  interventions,
  aPlacer,
  repere,
}: {
  arrets: ArretEquipe[];
  entreprise: RepereEntreprise | null;
  techniciens: TechnicienDuJour[];
  interventions: InterventionDuJour[];
  /** Interventions à placer (case de l'Accueil) : un technicien libre est signalé. */
  aPlacer: number;
  /** « Paris 16e · 9 interventions aujourd'hui ». */
  repere: string;
}) {
  const [filtre, setFiltre] = useState<string | null>(null);
  const visibles = filtre ? arrets.filter((a) => a.membres.includes(filtre)) : arrets;

  const puce = (id: string | null, texte: string, couleur?: string) => (
    <button
      key={id ?? 'tous'}
      type="button"
      aria-pressed={filtre === id}
      onClick={() => setFiltre(id)}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-fond px-3 py-1.5 text-[13px] font-bold ring-1 ring-trait ring-inset transition aria-pressed:bg-encre aria-pressed:text-white aria-pressed:ring-encre"
    >
      {couleur && <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: couleur }} />}
      {texte}
    </button>
  );

  return (
    <section aria-labelledby="aj-e" className="carte grid min-w-0 overflow-hidden menu:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-trait px-4 py-3 menu:col-span-2">
        <div className="min-w-0">
          <h2 id="aj-e" className="text-[19px] font-extrabold max-[700px]:text-lg">
            L’équipe aujourd’hui
          </h2>
          {repere && <p className="text-[12.5px] text-gris">{repere}</p>}
        </div>
        {techniciens.length > 1 && (
          <div role="group" aria-label="Montrer sur la carte" className="flex flex-wrap gap-1.5">
            {puce(null, 'Toute l’équipe')}
            {techniciens.map((t) => puce(t.id, t.prenom, t.couleur))}
          </div>
        )}
      </div>
      <div className="min-w-0 p-3 menu:border-r menu:border-trait">
        <CarteDuJour arrets={visibles} entreprise={entreprise} className="h-[300px] menu:h-[440px]" />
      </div>
      <div className="flex min-w-0 flex-col max-menu:border-t max-menu:border-trait menu:max-h-[470px] menu:overflow-auto">
        {!techniciens.length && <p className="p-4 text-center text-[13px] text-gris">Ajoutez des techniciens dans « Paramètres », puis « Membres ».</p>}
        {techniciens.map((t) => {
          const j = interventions.filter((i) => i.membres.includes(t.id));
          const [texte, ton] = etatTechnicien(j);
          const libre = !j.some((i) => !FAITES.includes(i.etat));
          return (
            <div key={t.id} className={`flex flex-col gap-2 border-b border-trait px-4 py-3 transition last:border-b-0 ${filtre && filtre !== t.id ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2.5">
                <AvatarTechnicien prenom={t.prenom} nom={t.nom} couleur={t.couleur} photo={t.photo} taille={36} />
                <div className="flex min-w-0 flex-col items-start gap-0.5">
                  <b className="text-[15px] leading-tight font-extrabold [overflow-wrap:anywhere]">{[t.prenom, t.nom].filter(Boolean).join(' ')}</b>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PUCE[ton]}`}>{texte}</span>
                </div>
                <Link
                  href={`/?appli=${t.id}`}
                  scroll={false}
                  title="Voir sa journée dans l’appli technicien"
                  className="ml-auto py-1 text-[13px] font-extrabold whitespace-nowrap text-cobalt hover:underline"
                >
                  Sa journée →
                </Link>
              </div>
              {j.length > 0 && (
                <ol className="flex flex-col gap-0.5">
                  {j.map((i) => {
                    const fait = FAITES.includes(i.etat);
                    const enCours = i.etat === 'en_cours';
                    return (
                      <li key={i.id}>
                        <Link
                          href={`/?fiche=${i.id}`}
                          scroll={false}
                          title={`${i.reference} · ${i.motif}`}
                          className="grid grid-cols-[46px_14px_minmax(0,1fr)] items-baseline gap-1.5 rounded-lg px-1 py-1 text-[13.5px] hover:bg-fond"
                        >
                          <span className="font-mono text-[12.5px] font-bold text-gris">{i.heure || '—'}</span>
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 self-center rounded-full border-2 ${
                              fait ? 'border-menthe bg-menthe' : enCours ? 'border-cobalt bg-cobalt ring-3 ring-doux' : i.etat === 'a_reprendre' ? 'border-rouge bg-white' : 'border-trait bg-white'
                            }`}
                          />
                          <span className={`min-w-0 truncate ${fait ? 'text-gris line-through decoration-trait' : enCours ? 'font-bold' : ''}`}>
                            {i.motif} <span className="font-normal text-gris">· {i.lieu}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
              {libre && aPlacer > 0 && (
                <p className="rounded-[10px] bg-vert-doux px-2.5 py-1.5 text-[13px] font-semibold text-vert">
                  Plus rien de prévu : {t.prenom} peut prendre une des interventions à placer.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
