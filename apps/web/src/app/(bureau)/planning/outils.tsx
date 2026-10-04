import Link from 'next/link';
import type { StatutIntervention } from '@chantio/shared';

// Morceaux communs aux vues semaine et mois du planning.

// Liseré de couleur à gauche de chaque rendez-vous, selon le statut.
export const LISERE: Record<StatutIntervention, string> = {
  a_planifier: 'border-l-gris/40',
  planifiee: 'border-l-cobalt',
  en_cours: 'border-l-menthe',
  terminee: 'border-l-violet',
  a_reprendre: 'border-l-rouge',
  validee: 'border-l-vert',
  facturee: 'border-l-gris/40',
};

export const jourCourt = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return {
    nom: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
    num: d.getDate(),
    long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    mois: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  };
};

/** Semaine ou mois. */
export function Bascule({ vue, lundi, mois }: { vue: 'semaine' | 'mois'; lundi?: string; mois?: string }) {
  const lien = (actif: boolean) =>
    `rounded-[10px] px-3 py-1 text-sm font-bold transition ${actif ? 'bg-doux text-cobalt' : 'text-gris hover:text-encre'}`;
  return (
    <div className="inline-flex rounded-xl border border-trait bg-white p-0.5" role="group" aria-label="Affichage">
      <Link href={lundi ? `/planning?semaine=${lundi}` : '/planning'} aria-current={vue === 'semaine' ? 'page' : undefined} className={lien(vue === 'semaine')}>
        Semaine
      </Link>
      <Link href={`/planning?mois=${mois ?? (lundi ?? '').slice(0, 7)}`} aria-current={vue === 'mois' ? 'page' : undefined} className={lien(vue === 'mois')}>
        Mois
      </Link>
    </div>
  );
}
