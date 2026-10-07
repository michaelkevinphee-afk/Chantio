import type { ReactNode } from 'react';
import { LIBELLE_STATUT_ABONNEMENT, TON_STATUT_ABONNEMENT, type StatutAbonnement } from '@chantio/shared';
import { Puce } from '../ui';

// Briques communes des pages de la console.

/** Bandeau de confirmation ou d'erreur après une action (?ok=… ou ?erreur=… dans l'adresse). */
export function Message({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const lire = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const ok = lire('ok');
  const erreur = lire('erreur');
  if (!ok && !erreur) return null;
  return (
    <p
      role={erreur ? 'alert' : 'status'}
      className={`apparition mb-5 rounded-[14px] px-4 py-3 text-[15px] font-semibold ${erreur ? 'bg-rouge-doux text-rouge' : 'bg-vert-doux text-vert'}`}
    >
      {erreur ? erreur : `✓ ${ok}`}
    </p>
  );
}

/** Chiffre clé (Vue d'ensemble, fiche entreprise). */
export function Tuile({ libelle, valeur, detail, i = 0 }: { libelle: string; valeur: ReactNode; detail?: ReactNode; i?: number }) {
  return (
    <div className="carte apparition flex flex-col gap-1 p-4" style={{ '--i': i } as React.CSSProperties}>
      <span className="text-[13px] font-bold text-gris">{libelle}</span>
      <span className="text-[28px] leading-tight font-extrabold tabular-nums">{valeur}</span>
      {detail && <span className="text-[13px] text-gris">{detail}</span>}
    </div>
  );
}

export function PuceAbonnement({ statut, jours }: { statut: StatutAbonnement; jours?: number | null }) {
  return (
    <Puce ton={TON_STATUT_ABONNEMENT[statut] ?? 'gris'}>
      {LIBELLE_STATUT_ABONNEMENT[statut] ?? statut}
      {statut === 'essai' && jours != null ? (jours >= 0 ? ` · ${jours} j` : ' · terminé') : ''}
    </Puce>
  );
}

/** Tableau dans une carte, qui défile à l'horizontale sur téléphone. */
export function Tableau({ entetes, children, vide }: { entetes: (string | { t: string; droite?: boolean })[]; children: ReactNode; vide?: string }) {
  return (
    <div className="carte overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[14.5px]">
        <thead>
          <tr className="border-b border-trait text-[12.5px] font-bold text-gris">
            {entetes.map((e) => {
              const t = typeof e === 'string' ? e : e.t;
              const droite = typeof e !== 'string' && e.droite;
              return (
                <th key={t} scope="col" className={`px-4 py-3 font-bold whitespace-nowrap ${droite ? 'text-right' : ''}`}>
                  {t}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-trait">{children}</tbody>
      </table>
      {vide && <p className="px-4 py-8 text-center text-sm text-gris">{vide}</p>}
    </div>
  );
}

/** Encadré d'explication en clair (ce que fait l'écran). */
export function EnClair({ children }: { children: ReactNode }) {
  return <p className="mb-5 max-w-[80ch] rounded-[14px] border border-trait bg-white/70 px-4 py-3 text-[14.5px] text-gris">{children}</p>;
}

/** Ligne « libellé : valeur » des fiches. */
export function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-2 text-[14.5px] max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="font-semibold text-gris">{libelle}</dt>
      <dd className="min-w-0 break-words">{children ?? '—'}</dd>
    </div>
  );
}
