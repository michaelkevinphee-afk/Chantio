'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MOIS_COURTS, MOIS_LONGS, type Annee, type Periode } from '@chantio/shared';
import { c, eur, evolution, keur, signe, useLargeur } from './outils';

// Les graphiques de Mon année, dessinés en SVG à la largeur du bloc. Ils s'animent à l'apparition
// (classes pousse, trace, apparait du module CSS) ; une bulle donne le détail au survol.

export type Filtre = 'tout' | 'dep' | 'cha';

function graduations(max: number) {
  const pas = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000];
  const p = pas.find((x) => max / x <= 5) ?? 10000000;
  const t: number[] = [];
  for (let v = 0; v <= max + 1; v += p) t.push(v);
  return t;
}

function AxeY({ ticks, y, x0, x1 }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke="#E9EEFF" />
          <text x={x0 - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5B6480">
            {keur(t)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Conteneur d'un graphique : mesure la largeur, affiche la bulle de la colonne survolée. */
function Graph({
  id,
  dessin,
  bulle,
}: {
  id: string;
  dessin: (W: number, survol: number | null, setSurvol: (i: number | null) => void) => { svg: ReactNode; cols: number[] };
  bulle: (i: number) => ReactNode;
}) {
  const [ref, W] = useLargeur<HTMLDivElement>();
  const [survol, setSurvol] = useState<number | null>(null);
  const { svg, cols } = dessin(W, survol, setSurvol);
  const x = survol != null ? Math.max(0, Math.min(W - 200, cols[survol] - 95)) : 0;
  return (
    <div className={c('graph')} id={id} ref={ref} onMouseLeave={() => setSurvol(null)}>
      {svg}
      {survol != null && (
        <div className={c('bulle')} style={{ left: x, top: 6 }} role="status">
          {bulle(survol)}
        </div>
      )}
    </div>
  );
}

const L = ({ a, b, fort = false }: { a: ReactNode; b: ReactNode; fort?: boolean }) => (
  <div className={c('l')}>
    <span>{a}</span>
    {fort ? <b>{b}</b> : <span>{b}</span>}
  </div>
);

/** Zones cliquables et survolables, une par colonne. */
function Colonnes({
  n,
  x,
  pas,
  haut,
  bas,
  libelle,
  setSurvol,
  choisir,
}: {
  n: number;
  x: (i: number) => number;
  pas: number;
  haut: number;
  bas: number;
  libelle: (i: number) => string;
  setSurvol: (i: number | null) => void;
  choisir?: (i: number) => void;
}) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          tabIndex={0}
          x={x(i)}
          y={haut}
          width={pas}
          height={bas - haut}
          fill="transparent"
          style={choisir ? { cursor: 'pointer' } : undefined}
          aria-label={libelle(i)}
          onMouseEnter={() => setSurvol(i)}
          onFocus={() => setSurvol(i)}
          onBlur={() => setSurvol(null)}
          onClick={choisir ? () => choisir(i) : undefined}
          onKeyDown={
            choisir
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choisir(i);
                  }
                }
              : undefined
          }
        />
      ))}
    </>
  );
}

const DEFS_BARRES = (
  <defs>
    <pattern id="hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#E9EEFF" />
      <line x1="0" y1="0" x2="0" y2="6" stroke="#7C93F5" strokeWidth="2" />
    </pattern>
    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4467FA" />
      <stop offset="1" stopColor="#2F54EB" />
    </linearGradient>
    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#F97066" />
      <stop offset="1" stopColor="#D92D20" />
    </linearGradient>
  </defs>
);

/** Production par mois (ou trimestre) : barres dépannages + chantiers, prévision hachurée, objectif et année précédente. */
export function GraphMensuel({ P, filtre, sel, choisir, an1 }: { P: Periode[]; filtre: Filtre; sel: number | null; choisir: (i: number) => void; an1: number }) {
  const val = (m: Periode) => (filtre === 'dep' ? m.dep : filtre === 'cha' ? m.cha : m.tot);
  const obj = (m: Periode) => (filtre === 'dep' ? m.objDep : filtre === 'cha' ? m.objCha : m.obj);
  return (
    <Graph
      id="g-mensuel"
      dessin={(W, survol, setSurvol) => {
        const N = P.length, H = 320, g = 54, d = 12, haut = 14, bas = H - 28;
        const max = Math.max(1, ...P.map((m) => Math.max(val(m), filtre === 'tout' ? m.n1 : 0, obj(m)))) * 1.08;
        const y = (v: number) => bas - (v / max) * (bas - haut - 30);
        const pas = (W - g - d) / N, bw = Math.min(N === 4 ? 96 : 38, pas * 0.62);
        const reels = P.filter((m) => m.reel);
        const rec = reels.length ? reels.reduce((a, m) => (val(m) > val(a) ? m : a), reels[0]) : null;
        const cols = P.map((_, i) => g + pas * i + pas / 2);
        const svg = (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Production par période, réalisée et prévue, avec l’objectif">
            {DEFS_BARRES}
            <AxeY ticks={graduations(max)} y={y} x0={g} x1={W - d} />
            {P.map((m, i) => {
              const cx = cols[i], x = cx - bw / 2, dl = `${(i * 0.07).toFixed(2)}s`;
              const base = filtre === 'tout' ? m.dep : 0;
              return (
                <g key={i}>
                  <rect opacity={survol === i ? 1 : 0} x={g + pas * i} y={haut} width={pas} height={bas - haut} fill="#F4F6FF" />
                  <g className={c('pousse')} style={{ ['--d' as string]: dl }} opacity={sel != null && sel !== i ? 0.3 : 1}>
                    {m.reel ? (
                      <>
                        {filtre !== 'cha' && <rect className={c('barre', survol === i && 'on')} x={x} y={y(m.dep)} width={bw} height={Math.max(0, bas - y(m.dep))} fill="url(#gd)" rx="5" />}
                        {filtre !== 'dep' && (
                          <rect
                            className={c('barre', survol === i && 'on')}
                            x={x}
                            y={y(base + m.cha)}
                            width={bw}
                            height={Math.max(0, y(base) - y(base + m.cha) - (filtre === 'tout' && m.dep ? 2 : 0))}
                            fill="url(#gc)"
                            rx="5"
                          />
                        )}
                      </>
                    ) : (
                      <rect className={c('barre', survol === i && 'on')} x={x} y={y(val(m))} width={bw} height={Math.max(0, bas - y(val(m)))} fill="url(#hach)" stroke="#7C93F5" strokeDasharray="3 2" rx="5" />
                    )}
                  </g>
                  {pas > 44 && (
                    <text className={c('apparait')} style={{ ['--d' as string]: `${(0.6 + i * 0.07).toFixed(2)}s` }} x={cx} y={y(val(m)) - 6} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={m.reel ? '#101A3D' : '#7C93F5'}>
                      {keur(val(m))}
                    </text>
                  )}
                  {m === rec && reels.length > 1 && (
                    <g className={c('apparait')} style={{ ['--d' as string]: '1.3s' }}>
                      <rect x={cx - 26} y={y(val(m)) - 40} width="52" height="18" rx="9" fill="#E3F8EE" />
                      <text x={cx} y={y(val(m)) - 27} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#067647">
                        ★ record
                      </text>
                    </g>
                  )}
                  {filtre === 'tout' && m.n1 > 0 && <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(m.n1)} y2={y(m.n1)} stroke="#8A93AE" strokeWidth="3" strokeLinecap="round" />}
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill={m.reel ? '#101A3D' : '#5B6480'} fontWeight={sel === i ? 800 : m.reel ? 600 : 500}>
                    {m.lib}
                  </text>
                </g>
              );
            })}
            <line className={c('apparait')} style={{ ['--d' as string]: '1s' }} x1={g} x2={W - d} y1={y(obj(P[0]))} y2={y(obj(P[0]))} stroke="#101A3D" strokeDasharray="6 4" strokeWidth="1.5" />
            <Colonnes n={N} x={(i) => g + pas * i} pas={pas} haut={haut} bas={bas} libelle={(i) => `Voir ${P[i].libL}`} setSurvol={setSurvol} choisir={choisir} />
            <line x1={g} x2={W - d} y1={bas} y2={bas} stroke="#D9E0F7" />
          </svg>
        );
        return { svg, cols };
      }}
      bulle={(i) => {
        const m = P[i];
        return (
          <>
            <b>
              {m.libL}
              {m.reel ? '' : m.partiel ? ' · en partie prévu' : ' · prévision'}
            </b>
            <L a="Dépannages" b={eur(m.dep)} />
            <L a="Chantiers" b={eur(m.cha)} />
            <L a="Total" b={eur(m.tot)} fort />
            <L a="Objectif" b={eur(m.obj)} />
            <L a={`Même période ${an1}`} b={eur(m.n1)} />
            <div className={c('l')} style={{ color: '#B9C6FB' }}>
              <span>Cliquer pour filtrer</span>
            </div>
          </>
        );
      }}
    />
  );
}

/** Cumul de l'année : réalisé, prévu avec sa fourchette, objectif, année précédente. */
export function GraphCumul({ A, an1 }: { A: Annee; an1: number }) {
  const n = Math.max(1, A.n);
  return (
    <Graph
      id="g-cumul"
      dessin={(W, survol, setSurvol) => {
        const H = 280, g = 58, d = 70, haut = 14, bas = H - 28;
        const max = Math.max(1, A.fin.cumHaut, A.fin.cumObj, A.fin.cumN1) * 1.05;
        const y = (v: number) => bas - (v / max) * (bas - haut);
        const pas = (W - g - d) / 11, X = (i: number) => g + pas * i;
        const lig = (k: 'cum' | 'cumObj' | 'cumN1', de: number, a: number) => {
          let p = '';
          for (let i = de; i <= a; i++) p += `${i === de ? 'M' : 'L'}${X(i).toFixed(1)} ${y(A.mois[i][k]).toFixed(1)}`;
          return p;
        };
        const dn = n - 1;
        let bande = `M${X(dn)} ${y(A.mois[dn].cum)}`;
        for (let i = n; i < 12; i++) bande += `L${X(i)} ${y(A.mois[i].cumHaut)}`;
        for (let i = 11; i >= n; i--) bande += `L${X(i)} ${y(A.mois[i].cumBas)}`;
        bande += 'Z';
        const fins = (
          [
            ['cum', '#2F54EB', 'prévu'],
            ['cumObj', '#101A3D', 'objectif'],
            ['cumN1', '#8A93AE', String(an1)],
          ] as const
        )
          .map((t) => ({ y: y(A.fin[t[0]]), t, v: A.fin[t[0]] }))
          .sort((a, b) => a.y - b.y);
        for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 26) fins[i].y = fins[i - 1].y + 26;
        const cols = A.mois.map((_, i) => X(i));
        const svg = (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Production cumulée depuis janvier, objectif, année précédente et prévision">
            <defs>
              <linearGradient id="g-aire" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2F54EB" stopOpacity=".22" />
                <stop offset="1" stopColor="#2F54EB" stopOpacity="0" />
              </linearGradient>
            </defs>
            <AxeY ticks={graduations(max)} y={y} x0={g} x1={W - d} />
            {A.n > 0 && (
              <path className={c('apparait')} style={{ ['--d' as string]: '.9s' }} d={`${lig('cum', 0, dn)}L${X(dn)} ${bas}L${X(0)} ${bas}Z`} fill="url(#g-aire)" />
            )}
            {n < 12 && <path className={c('apparait')} style={{ ['--d' as string]: '1.5s' }} d={bande} fill="#B9C6FB" opacity=".45" />}
            {A.fin.cumN1 > 0 && <path className={c('trace')} pathLength={1} style={{ ['--d' as string]: '.3s' }} d={lig('cumN1', 0, 11)} fill="none" stroke="#8A93AE" strokeWidth="2" />}
            <path className={c('apparait')} style={{ ['--d' as string]: '.2s' }} d={lig('cumObj', 0, 11)} fill="none" stroke="#101A3D" strokeWidth="1.5" strokeDasharray="6 4" />
            <path className={c('apparait')} style={{ ['--d' as string]: '1.5s' }} d={lig('cum', dn, 11)} fill="none" stroke="#2F54EB" strokeWidth="2.5" strokeDasharray="5 4" />
            {A.n > 1 && <path className={c('trace')} pathLength={1} d={lig('cum', 0, dn)} fill="none" stroke="#2F54EB" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
            {A.n > 0 && (
              <g className={c('apparait')} style={{ ['--d' as string]: '1.4s' }}>
                <circle cx={X(dn)} cy={y(A.mois[dn].cum)} r="11" fill="#2F54EB" opacity=".18">
                  <animate attributeName="r" values="7;13;7" dur="2.2s" repeatCount="indefinite" />
                </circle>
                <circle cx={X(dn)} cy={y(A.mois[dn].cum)} r="6" fill="#2F54EB" stroke="#fff" strokeWidth="2" />
              </g>
            )}
            {fins.map((f) => (
              <g key={f.t[0]} className={c('apparait')} style={{ ['--d' as string]: '1.6s' }}>
                <text x={W - d + 8} y={f.y - 2} fontSize="11.5" fontWeight="800" fill={f.t[1]}>
                  {keur(f.v)}
                </text>
                <text x={W - d + 8} y={f.y + 11} fontSize="10.5" fill="#5B6480">
                  {f.t[2]}
                </text>
              </g>
            ))}
            {A.mois.map((m, i) => (
              <g key={i}>
                <line opacity={survol === i ? 1 : 0} x1={X(i)} x2={X(i)} y1={haut} y2={bas} stroke="#7C93F5" />
                <text x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5B6480">
                  {MOIS_COURTS[i]}
                </text>
              </g>
            ))}
            <Colonnes n={12} x={(i) => X(i) - pas / 2} pas={pas} haut={haut} bas={bas} libelle={(i) => MOIS_LONGS[i]} setSurvol={setSurvol} />
          </svg>
        );
        return { svg, cols };
      }}
      bulle={(i) => {
        const m = A.mois[i];
        return (
          <>
            <b>
              Fin {MOIS_LONGS[i]}
              {m.reel ? '' : ' · prévision'}
            </b>
            <L a={m.reel ? 'Réalisé' : 'Prévu'} b={eur(m.cum)} fort />
            {!m.reel && <L a="Fourchette" b={`${keur(m.cumBas)} à ${keur(m.cumHaut)}`} />}
            <L a="Objectif" b={eur(m.cumObj)} />
            <L a="Écart" b={signe(m.cum - m.cumObj)} />
            <L a={String(an1)} b={eur(m.cumN1)} />
          </>
        );
      }}
    />
  );
}

/** Résultat théorique cumulé, mois après mois, et l'objectif du budget. */
export function GraphResultat({ A, salairesMois }: { A: Annee; salairesMois: number }) {
  const n = Math.max(1, A.n);
  return (
    <Graph
      id="g-res"
      dessin={(W, survol, setSurvol) => {
        const H = 250, g = 58, d = 70, haut = 14, bas = H - 28;
        const vals = A.mois.map((m) => m.cumRes), obj = A.B.res;
        const max = Math.max(1, ...vals, obj) * 1.1, min = Math.min(0, ...vals) * 1.2;
        const y = (v: number) => bas - ((v - min) / (max - min)) * (bas - haut);
        const pas = (W - g - d) / 11, X = (i: number) => g + pas * i;
        const tk = graduations(max);
        if (min < 0) tk.unshift(-tk[1]);
        let aire = `M${X(0)} ${y(0)}`;
        for (let i = 0; i < n; i++) aire += `L${X(i)} ${y(vals[i])}`;
        aire += `L${X(n - 1)} ${y(0)}Z`;
        let p1 = '', p2 = '';
        for (let i = 0; i < n; i++) p1 += `${i ? 'L' : 'M'}${X(i)} ${y(vals[i])}`;
        for (let i = n - 1; i < 12; i++) p2 += `${i === n - 1 ? 'M' : 'L'}${X(i)} ${y(vals[i])}`;
        let ye = y(vals[11]), yo = y(obj);
        if (Math.abs(ye - yo) < 26) {
          if (ye < yo) yo = ye + 26;
          else ye = yo + 26;
        }
        const cols = A.mois.map((_, i) => X(i));
        const svg = (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Résultat théorique cumulé">
            <AxeY ticks={tk.filter((t) => t >= min)} y={y} x0={g} x1={W - d} />
            <line x1={g} x2={W - d} y1={y(0)} y2={y(0)} stroke="#5B6480" />
            {A.n > 0 && <path className={c('apparait')} style={{ ['--d' as string]: '.9s' }} d={aire} fill="#E3F8EE" />}
            <path className={c('apparait')} style={{ ['--d' as string]: '1.5s' }} d={p2} fill="none" stroke="#12B76A" strokeWidth="2.5" strokeDasharray="5 4" />
            {A.n > 1 && <path className={c('trace')} pathLength={1} d={p1} fill="none" stroke="#067647" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
            <line x1={X(11) - 18} x2={X(11)} y1={y(obj)} y2={y(obj)} stroke="#101A3D" strokeWidth="2" />
            <text x={W - d + 8} y={ye - 2} fontSize="11.5" fontWeight="800" fill="#067647">
              {keur(vals[11])}
            </text>
            <text x={W - d + 8} y={ye + 11} fontSize="10.5" fill="#5B6480">
              prévu
            </text>
            <text x={W - d + 8} y={yo - 2} fontSize="11.5" fontWeight="800" fill="#101A3D">
              {keur(obj)}
            </text>
            <text x={W - d + 8} y={yo + 11} fontSize="10.5" fill="#5B6480">
              objectif
            </text>
            {A.mois.map((_, i) => (
              <g key={i}>
                <line opacity={survol === i ? 1 : 0} x1={X(i)} x2={X(i)} y1={haut} y2={bas} stroke="#7C93F5" />
                <text x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5B6480">
                  {MOIS_COURTS[i]}
                </text>
              </g>
            ))}
            {A.n > 0 && <circle cx={X(n - 1)} cy={y(vals[n - 1])} r="5" fill="#067647" stroke="#fff" strokeWidth="2" />}
            <Colonnes n={12} x={(i) => X(i) - pas / 2} pas={pas} haut={haut} bas={bas} libelle={(i) => MOIS_LONGS[i]} setSurvol={setSurvol} />
          </svg>
        );
        return { svg, cols };
      }}
      bulle={(i) => {
        const m = A.mois[i];
        const marge = A.mois.slice(0, i + 1).reduce((s, x) => s + x.marge, 0);
        return (
          <>
            <b>
              Fin {MOIS_LONGS[i]}
              {m.reel ? '' : ' · prévision'}
            </b>
            <L a="Marge des travaux" b={eur(marge)} />
            <L a="Frais généraux hors salaires" b={`−${eur((A.B.fg / 12 - salairesMois) * (i + 1))}`} />
            <L a="Résultat" b={eur(m.cumRes)} fort />
          </>
        );
      }}
    />
  );
}

/** L'année et la précédente côte à côte, avec l'évolution au-dessus de chaque paire. */
export function GraphN1({ P, sel, choisir, an, an1 }: { P: Periode[]; sel: number | null; choisir: (i: number) => void; an: number; an1: number }) {
  return (
    <Graph
      id="g-n1"
      dessin={(W, survol, setSurvol) => {
        const N = P.length, H = 300, g = 54, d = 12, haut = 44, bas = H - 28;
        const max = Math.max(1, ...P.map((q) => Math.max(q.tot, q.n1))) * 1.05;
        const y = (v: number) => bas - (v / max) * (bas - haut);
        const pas = (W - g - d) / N, bw = Math.min(N === 4 ? 60 : 20, pas * 0.32);
        const cols = P.map((_, i) => g + pas * i + pas / 2);
        const svg = (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Production ${an1} et ${an} par période`}>
            {DEFS_BARRES}
            <AxeY ticks={graduations(max)} y={y} x0={g} x1={W - d} />
            {P.map((q, i) => {
              const cx = cols[i], v = evolution(q.tot, q.n1), dim = sel != null && sel !== i ? 0.3 : 1;
              const ty = Math.min(y(q.tot), y(q.n1)) - 10;
              return (
                <g key={i}>
                  <rect opacity={survol === i ? 1 : 0} x={g + pas * i} y={haut} width={pas} height={bas - haut} fill="#F4F6FF" />
                  <g className={c('pousse')} style={{ ['--d' as string]: `${(i * 0.07).toFixed(2)}s` }} opacity={dim}>
                    <rect className={c('barre', survol === i && 'on')} x={cx - bw - 1.5} y={y(q.n1)} width={bw} height={Math.max(0, bas - y(q.n1))} fill="#C5CBDB" rx="4" />
                    <rect
                      className={c('barre', survol === i && 'on')}
                      x={cx + 1.5}
                      y={y(q.tot)}
                      width={bw}
                      height={Math.max(0, bas - y(q.tot))}
                      fill={q.reel ? 'url(#gc)' : 'url(#hach)'}
                      stroke={q.reel ? undefined : '#7C93F5'}
                      strokeDasharray={q.reel ? undefined : '3 2'}
                      rx="4"
                    />
                  </g>
                  {q.n1 > 0 && (
                    <g className={c('apparait')} style={{ ['--d' as string]: `${(0.7 + i * 0.07).toFixed(2)}s` }} opacity={dim}>
                      <rect x={cx - 22} y={ty - 13} width="44" height="18" rx="9" fill={v >= 0 ? '#E3F8EE' : '#FEE4E2'} />
                      <text x={cx} y={ty} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={v >= 0 ? '#067647' : '#D92D20'}>
                        {v >= 0 ? '+' : '−'}
                        {Math.abs(Math.round(v))}%
                      </text>
                    </g>
                  )}
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill={q.reel ? '#101A3D' : '#5B6480'} fontWeight={sel === i ? 800 : 600}>
                    {q.lib}
                  </text>
                </g>
              );
            })}
            <Colonnes n={N} x={(i) => g + pas * i} pas={pas} haut={haut} bas={bas} libelle={(i) => `Voir ${P[i].libL}`} setSurvol={setSurvol} choisir={choisir} />
            <line x1={g} x2={W - d} y1={bas} y2={bas} stroke="#D9E0F7" />
          </svg>
        );
        return { svg, cols };
      }}
      bulle={(i) => {
        const q = P[i];
        return (
          <>
            <b>
              {q.libL}
              {q.reel ? '' : ' · prévision'}
            </b>
            <L a={String(an1)} b={eur(q.n1)} />
            <L a={String(an)} b={eur(q.tot)} fort />
            <L a="Différence" b={signe(q.tot - q.n1)} />
          </>
        );
      }}
    />
  );
}

/** Anneau de l'objectif : atteint (dégradé), prévu (lavande), dépassement (menthe). */
export function Anneau({ fait, prevu, libelle, centre }: { fait: number; prevu?: number; libelle: string; centre: ReactNode }) {
  const arc = (r: number, v: number, couleur: string, epaisseur: number, d?: string) => (
    <circle
      className={c('arc')}
      style={d ? { ['--d' as string]: d } : undefined}
      cx="100"
      cy="100"
      r={r}
      fill="none"
      stroke={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray={`${Math.max(0, Math.min(100, v))} 100`}
    />
  );
  const dessus = Math.max(fait, prevu ?? 0);
  return (
    <div className={c('anneau')} role="img" aria-label={libelle}>
      <svg viewBox="0 0 200 200">
        <defs>
          <linearGradient id="g-anneau" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2F54EB" />
            <stop offset="1" stopColor="#7C93F5" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="80" fill="none" stroke="#E9EEFF" strokeWidth="20" />
        {prevu != null && arc(80, prevu, '#B9C6FB', 20, '.5s')}
        {arc(80, fait, 'url(#g-anneau)', 20)}
        {dessus > 100 && arc(96, dessus - 100, '#12B76A', 6, '1.2s')}
      </svg>
      <div className={c('centre')}>{centre}</div>
    </div>
  );
}

/** Jauge du résultat prévu fin décembre, avec le repère de l'objectif. */
export function JaugeResultat({ prevu, objectif, compte }: { prevu: number; objectif: number; compte: ReactNode }) {
  const max = Math.max(prevu, objectif, 1) * 1.3;
  const k = Math.max(0, Math.min(1, prevu / max));
  const ang = (v: number) => Math.max(0, Math.min(1, v / max)) * 180 - 90;
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [(105 + r * Math.cos(a)).toFixed(1), (105 + r * Math.sin(a)).toFixed(1)];
  };
  const o1 = pt(ang(objectif), 70), o2 = pt(ang(objectif), 100), ol = pt(ang(objectif), 112);
  const angle = ang(prevu).toFixed(1);
  // L'aiguille part de zéro à l'apparition seulement ; ensuite elle suit les curseurs sans rejouer.
  const [lancer, setLancer] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLancer(false), 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={c('jauge-r')}>
      <svg viewBox="0 -14 210 130" role="img" aria-label={`Résultat prévu ${eur(prevu)}, objectif ${eur(objectif)}`}>
        <defs>
          <linearGradient id="g-jr" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#B9C6FB" />
            <stop offset="1" stopColor="#12B76A" />
          </linearGradient>
        </defs>
        <path d="M20 105 A85 85 0 0 1 190 105" fill="none" stroke="#E9EEFF" strokeWidth="18" strokeLinecap="round" />
        <path className={c('arc')} d="M20 105 A85 85 0 0 1 190 105" fill="none" stroke="url(#g-jr)" strokeWidth="18" strokeLinecap="round" pathLength={100} strokeDasharray={`${(k * 100).toFixed(1)} 100`} />
        <line x1={o1[0]} y1={o1[1]} x2={o2[0]} y2={o2[1]} stroke="#101A3D" strokeWidth="2.5" />
        <text x={ol[0]} y={ol[1]} textAnchor="middle" fontSize="10" fontWeight="800" fill="#101A3D">
          objectif
        </text>
        <g transform={`rotate(${angle} 105 105)`}>
          {lancer && (
            <animateTransform attributeName="transform" type="rotate" from="-90 105 105" to={`${angle} 105 105`} dur="1.4s" begin="0.3s" fill="freeze" calcMode="spline" keySplines=".3 1 .4 1" keyTimes="0;1" />
          )}
          <path d="M101 105 L105 32 L109 105 Z" fill="#101A3D" />
        </g>
        <circle cx="105" cy="105" r="9" fill="#101A3D" />
        <circle cx="105" cy="105" r="3.5" fill="#fff" />
      </svg>
      <div className={c('t')}>
        <b>{compte}</b>
        <span>
          résultat prévu fin décembre
          <br />
          pour un objectif de {eur(objectif)}
        </span>
      </div>
    </div>
  );
}
