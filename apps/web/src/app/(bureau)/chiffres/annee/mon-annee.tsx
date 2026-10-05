'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  calculerAnnee,
  MOIS_LONGS,
  periodes,
  SCENARIO_DE_BASE,
  type Annee,
  type Granularite,
  type ModeRythme,
  type MoisAnnee,
  type Periode,
  type Scenario,
} from '@chantio/shared';
import type { DonneesMonAnnee } from './donnees';
import { Anneau, GraphCumul, GraphMensuel, GraphN1, GraphResultat, JaugeResultat, type Filtre } from './graphiques';
import { CaseImport } from './import';
import { c, Compte, eur, evolution, fr, Info, keur, part, pc, signe, Source } from './outils';

// Chiffres › Mon année : le fichier de pilotage du dirigeant, refait en trois vues (Où j'en suis,
// Prévision, l'année face à la précédente), filtrables par mois ou trimestre.

type Vue = 'point' | 'prev' | 'n1';
type Tri = { col: 'periode' | 'prod' | 'ecart' | 'n1'; sens: 1 | -1 };

const FLECHE = (haut: boolean) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={haut ? 'M7 17L17 7M9 7h8v8' : 'M7 7l10 10M17 9v8H9'} />
  </svg>
);
const DRAPEAU = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
const d = (s: string) => ({ ['--d' as string]: s });

export function MonAnnee({ donnees, entreprise }: { donnees: DonneesMonAnnee; entreprise: string }) {
  const { annee: an, budget } = donnees;
  const an1 = an - 1;
  const [vue, setVue] = useState<Vue>('point');
  const [gran, setGran] = useState<Granularite>('mois');
  const [sel, setSel] = useState<number | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [tri, setTri] = useState<Tri>({ col: 'periode', sens: 1 });
  const [ouvert, setOuvert] = useState<Record<string, boolean>>({});
  const [scen, setScen] = useState<Scenario>(SCENARIO_DE_BASE);
  const [importer, setImporter] = useState(false);

  const A = useMemo(
    () => calculerAnnee({ budget, production: donnees.production, reste: donnees.reste, moisCourant: donnees.moisCourant }, scen),
    [budget, donnees.production, donnees.reste, donnees.moisCourant, scen],
  );
  const P = useMemo(() => periodes(A, budget, gran), [A, budget, gran]);
  const ps = sel == null ? null : P[sel];
  const B = A.B;
  const f: MoisAnnee = A.fait ?? { ...A.mois[0], dep: 0, cha: 0, tot: 0, cum: 0, cumObj: 0, cumN1: 0, cumRes: 0 };
  const finDe = A.n ? `fin ${MOIS_LONGS[A.n - 1]}` : 'en début d’année';
  const trim = gran === 'trim';

  const vide = !donnees.budgetSaisi && !donnees.importee.length && !donnees.facturesChantio;
  if (vide)
    return (
      <div className={c('annee anime')}>
        <div className={c('vide')}>
          <CaseImport annee={an} />
          <section className={c('carte')} aria-labelledby="t-quoi">
            <h2 id="t-quoi">Ce que cette vue vous montre</h2>
            <ul className={c('lu')}>
              <li>Où vous en êtes face à l’objectif de l’année, mois par mois ou trimestre par trimestre</li>
              <li>La prévision de fin d’année, avec sa fourchette et des curseurs « Et si… »</li>
              <li>Le résultat théorique, calculé avec vos coefficients et vos frais généraux</li>
              <li>L’année face à {an1}, à la même date</li>
            </ul>
            <p className={c('note')}>
              Pas de fichier ? Saisissez le budget et les mois dans{' '}
              <Link href="/parametres?rubrique=budget" className="font-bold text-cobalt">
                Paramètres › Pilotage
              </Link>
              . Dès que vous facturez dans Chantio, les mois se remplissent seuls.
            </p>
          </section>
        </div>
      </div>
    );

  const choisir = (i: number | null) => setSel((s) => (i == null || s === i ? null : i));
  const changerGran = (g: Granularite) => {
    setGran(g);
    setSel(null);
  };

  const ecart = f.cum - f.cumObj, ecartFin = A.fin.cum - B.ca;
  const pcFait = part(f.cum, B.ca), pcFin = part(A.fin.cum, B.ca);
  const ecN1 = f.cum - f.cumN1;

  const VUES: [Vue, string, string, string, ReactNode][] = [
    [
      'point',
      'Où j’en suis',
      `${Math.round(pcFait)} %`,
      `de l’objectif · ${keur(f.cum)} depuis janvier`,
      <g key="point">
        <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </g>,
    ],
    [
      'prev',
      'Prévision',
      keur(A.fin.cum),
      `fin décembre · objectif ${keur(B.ca)}`,
      <g key="prev">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </g>,
    ],
    [
      'n1',
      `${an} face à ${an1}`,
      f.cumN1 ? pc(evolution(f.cum, f.cumN1)) : '—',
      f.cumN1 ? `${ecN1 >= 0 ? 'd’avance' : 'de retard'} sur ${an1} à la même date` : `${an1} pas encore importé`,
      <path key="n1" d="M8 3v18M16 3v18M3 8h5M16 16h5" />,
    ],
  ];

  return (
    <div className={c('annee anime')}>
      <nav className={c('vues')} aria-label="Que voulez-vous voir ?">
        {VUES.map(([cle, titre, chiffre, sous, ic], k) => (
          <button key={cle} type="button" className={c('vue', vue === cle && 'actif')} style={d(`${k * 0.08}s`)} aria-pressed={vue === cle} onClick={() => setVue(cle)}>
            <span className={c('ic')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ic}
              </svg>
            </span>
            <span className={c('tx')}>
              <small>{titre}</small>
              <b>{chiffre}</b>
              <span>{sous}</span>
            </span>
          </button>
        ))}
      </nav>

      <section className={c('periode')} aria-label="Période affichée">
        <div className={c('onglets')} role="tablist">
          {(
            [
              ['mois', 'Mois'],
              ['trim', 'Trimestres'],
            ] as const
          ).map(([g, lib]) => (
            <button key={g} type="button" role="tab" aria-selected={gran === g} className={c(gran === g && 'actif')} onClick={() => changerGran(g)}>
              {lib}
            </button>
          ))}
        </div>
        <div className={c('choix-p')}>
          <button type="button" className={c('puce', sel == null && 'actif')} onClick={() => setSel(null)}>
            Toute l’année
          </button>
          {P.map((q, i) => (
            <button key={i} type="button" className={c('puce', sel === i && 'actif', !q.reel && 'prevue')} title={`${q.libL}${q.reel ? '' : ' (prévision)'}`} onClick={() => choisir(i)}>
              {q.lib}
            </button>
          ))}
        </div>
        <button type="button" className={c('btn')} style={{ marginLeft: 'auto' }} onClick={() => setImporter((v) => !v)} aria-expanded={importer}>
          Importer un fichier
        </button>
      </section>

      {importer && <CaseImport annee={an} titre="Importer un fichier de pilotage" />}

      {vue === 'point' && (
        <>
          {ps ? (
            <VuePeriode p={ps} trim={trim} an1={an1} entreprise={entreprise} revenir={() => setSel(null)} />
          ) : (
            <>
              <section className={c('hero')} aria-label="En résumé">
                <Anneau
                  fait={pcFait}
                  prevu={pcFin}
                  libelle={`${Math.round(pcFait)} % de l’objectif atteint, ${Math.round(pcFin)} % prévu fin décembre`}
                  centre={
                    <>
                      <b>
                        <Compte valeur={pcFait} format={(v) => `${Math.round(v)} %`} />
                      </b>
                      <small>
                        de l’objectif
                        <br />
                        de l’année
                      </small>
                    </>
                  }
                />
                <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
                  <div className={c('grand')}>
                    <Compte valeur={f.cum} />
                  </div>
                  <p className={c('sous-t')}>produits depuis janvier, {finDe}</p>
                  <div className={c('pastilles')}>
                    <span className={c('pastille', ecart >= 0 ? 'verte' : 'rouge')}>
                      {FLECHE(ecart >= 0)}
                      {signe(ecart)} {ecart >= 0 ? 'd’avance' : 'de retard'}
                    </span>
                    <span className={c('pastille')}>
                      {DRAPEAU}Fin d’année prévue : {eur(A.fin.cum)}
                    </span>
                    <span className={c('pastille', ecartFin >= 0 ? 'verte' : 'rouge')}>
                      {ecartFin >= 0 ? `${eur(ecartFin)} au-dessus de l’objectif` : `Il manquerait ${eur(-ecartFin)}`}
                    </span>
                    <span className={c('pastille neutre')}>Objectif {eur(B.ca)}</span>
                  </div>
                </div>
              </section>
              <TuilesAnnee A={A} f={f} />
              <Course A={A} f={f} entreprise={entreprise} an={an} an1={an1} finDe={finDe} />
            </>
          )}
          <section className={c('carte')} aria-labelledby="t-mensuel">
            <div className={c('tete')}>
              <div>
                <h2 id="t-mensuel">Production par {trim ? 'trimestre' : 'mois'}</h2>
                <p>Factures hors taxes. Les barres hachurées sont la prévision. Cliquez sur une barre pour la regarder de près.</p>
              </div>
              <div className={c('onglets')} role="tablist">
                {(
                  [
                    ['tout', 'Tout'],
                    ['dep', 'Dépannages'],
                    ['cha', 'Chantiers'],
                  ] as const
                ).map(([k, lib]) => (
                  <button key={k} type="button" role="tab" aria-selected={filtre === k} className={c(filtre === k && 'actif')} onClick={() => setFiltre(k)}>
                    {lib}
                  </button>
                ))}
              </div>
            </div>
            <GraphMensuel P={P} filtre={filtre} sel={sel} choisir={choisir} an1={an1} />
            <div className={c('legende')}>
              {filtre !== 'cha' && (
                <span>
                  <i style={{ background: '#D92D20' }} />
                  Dépannages
                </span>
              )}
              {filtre !== 'dep' && (
                <span>
                  <i style={{ background: '#2F54EB' }} />
                  Chantiers
                </span>
              )}
              <span>
                <i style={{ background: 'repeating-linear-gradient(45deg,#7C93F5 0 2px,#E9EEFF 2px 5px)' }} />
                Prévision
              </span>
              {filtre === 'tout' && (
                <span>
                  <i style={{ background: '#8A93AE', height: 3 }} />
                  Même période en {an1}
                </span>
              )}
              <span>
                <i className={c('pointille')} style={{ borderColor: '#101A3D' }} />
                Objectif {keur((filtre === 'dep' ? B.objDep : filtre === 'cha' ? B.objCha : B.ca) / (trim ? 4 : 12))} / {trim ? 'trimestre' : 'mois'}
              </span>
            </div>
          </section>
          <TableauPro A={A} P={P} trim={trim} an={an} an1={an1} sel={sel} choisir={choisir} tri={tri} setTri={setTri} ouvert={ouvert} setOuvert={setOuvert} gran={gran} budgetSalaires={budget.salaires} />
          <Sources donnees={donnees} an={an} an1={an1} />
        </>
      )}

      {vue === 'prev' && (
        <>
          <section className={c('hero simple')}>
            <div style={{ minWidth: 0 }}>
              <p className={c('sous-t')} style={{ margin: '0 0 4px' }}>
                Fin décembre, {entreprise} devrait atteindre
              </p>
              <div className={c('grand')}>
                <Compte valeur={A.fin.cum} />
              </div>
              <div className={c('pastilles')}>
                <span className={c('pastille', ecartFin >= 0 ? 'verte' : 'rouge')}>
                  {ecartFin >= 0 ? `${eur(ecartFin)} au-dessus de l’objectif` : `Il manquerait ${eur(-ecartFin)}`}
                </span>
                <span className={c('pastille')}>
                  Fourchette {keur(A.fin.cumBas)} à {keur(A.fin.cumHaut)}
                </span>
                {A.fin.cumN1 > 0 && (
                  <span className={c('pastille neutre')}>
                    {an1} : {eur(A.fin.cumN1)}
                  </span>
                )}
              </div>
            </div>
            <p className={c('aide-prev')}>Calculé avec ce qui est déjà facturé, les chantiers signés qui restent à faire et le rythme des dépannages. Bougez les curseurs « Et si… » pour tester.</p>
          </section>
          <div className={c('grille-scen')}>
            <section className={c('carte')} aria-labelledby="t-cumul">
              <div className={c('tete')}>
                <div>
                  <h2 id="t-cumul">
                    Cumul de l’année{' '}
                    <Info>{`Chaque point additionne la production depuis janvier. Si la ligne bleue est au-dessus de la ligne pointillée, ${entreprise} est en avance sur l’objectif.`}</Info>
                  </h2>
                  <p>Où vous en êtes par rapport à l’objectif et à {an1}. La zone bleue est la fourchette de la prévision.</p>
                </div>
              </div>
              <GraphCumul A={A} an1={an1} />
              <div className={c('legende')}>
                <span>
                  <i className={c('trait')} style={{ borderColor: '#2F54EB' }} />
                  Réalisé
                </span>
                <span>
                  <i className={c('pointille')} style={{ borderColor: '#2F54EB' }} />
                  Prévu
                </span>
                <span>
                  <i style={{ background: '#B9C6FB' }} />
                  Fourchette
                </span>
                <span>
                  <i className={c('pointille')} style={{ borderColor: '#101A3D' }} />
                  Objectif
                </span>
                <span>
                  <i className={c('trait')} style={{ borderColor: '#8A93AE' }} />
                  {an1}
                </span>
              </div>
            </section>
            <EtSi A={A} scen={scen} setScen={setScen} devisEnAttente={donnees.devisEnAttente} />
          </div>
          <div className={c('grille2')}>
            <section className={c('carte')} aria-labelledby="t-res">
              <div className={c('tete')}>
                <div>
                  <h2 id="t-res">Résultat de l’année</h2>
                  <p>
                    Marge des travaux (vos coefficients {fr(budget.coef_depannage)} et {fr(budget.coef_chantier)}) moins les frais généraux du budget, mois après mois.
                  </p>
                </div>
              </div>
              <JaugeResultat prevu={A.fin.cumRes} objectif={B.res} compte={<Compte valeur={A.fin.cumRes} />} />
              <GraphResultat A={A} salairesMois={(budget.salaires + B.charges) / 12} />
              <div className={c('legende')}>
                <span>
                  <i className={c('trait')} style={{ borderColor: '#067647' }} />
                  Résultat réalisé
                </span>
                <span>
                  <i className={c('pointille')} style={{ borderColor: '#12B76A' }} />
                  Prévu
                </span>
                <span>
                  <i className={c('trait')} style={{ borderColor: '#101A3D' }} />
                  Objectif du budget
                </span>
              </div>
            </section>
            <Cascade A={A} f={f} scen={scen} />
          </div>
        </>
      )}

      {vue === 'n1' && <VueN1 A={A} P={P} ps={ps} sel={sel} choisir={choisir} trim={trim} an={an} an1={an1} entreprise={entreprise} finDe={finDe} />}
    </div>
  );
}

function Tuile({ libelle, valeur, aide, bon, spark, delai }: { libelle: ReactNode; valeur: number; aide: string; bon?: boolean | null; spark?: ReactNode; delai: string }) {
  return (
    <div className={c('tuile')} style={d(delai)}>
      <small>{libelle}</small>
      <b>
        <Compte valeur={valeur} />
      </b>
      {spark}
      <span className={c('ecart', bon === true && 'pos', bon === false && 'neg')} style={bon == null ? { color: 'var(--gris)', fontWeight: 600 } : undefined}>
        {aide}
      </span>
    </div>
  );
}

function Spark({ vals, couleur }: { vals: number[]; couleur: string }) {
  if (vals.length < 2) return null;
  const mx = Math.max(...vals), mn = Math.min(0, ...vals), hh = 28;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(1)},${(hh - 2 - ((v - mn) / (mx - mn || 1)) * (hh - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className={c('spark')} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,28 ${pts} 100,28`} fill={couleur} opacity=".12" />
      <polyline className={c('trace')} pathLength={1} points={pts} fill="none" stroke={couleur} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TuilesAnnee({ A, f }: { A: Annee; f: MoisAnnee }) {
  const reels = A.mois.slice(0, A.n);
  const record = reels.length ? reels.reduce((m, x) => (x.tot > m.tot ? x : m), reels[0]) : null;
  return (
    <section className={c('tuiles')} aria-label="Chiffres clés">
      <Tuile
        libelle={A.n ? `Production de ${MOIS_LONGS[A.n - 1]}` : 'Production du mois'}
        valeur={f.tot}
        aide={record ? `record de l’année : ${MOIS_LONGS[record.i]}` : 'pas encore de mois terminé'}
        spark={<Spark vals={reels.map((m) => m.tot)} couleur="#2F54EB" />}
        delai=".1s"
      />
      <Tuile
        libelle={
          <>
            Prévision fin d’année{' '}
            <Info>Déjà facturé + chantiers signés qui restent à faire + dépannages au rythme de l’année. La fourchette dit entre quoi et quoi l’année devrait finir.</Info>
          </>
        }
        valeur={A.fin.cum}
        aide={`entre ${keur(A.fin.cumBas)} et ${keur(A.fin.cumHaut)}`}
        spark={<Spark vals={A.mois.map((m) => m.cum)} couleur="#7C93F5" />}
        delai=".2s"
      />
      <Tuile
        libelle={
          <>
            Résultat théorique à date{' '}
            <Info>Marge des travaux (calculée avec vos coefficients) moins les frais généraux du budget. Ce n’est pas le résultat comptable, c’est une estimation pour se repérer.</Info>
          </>
        }
        valeur={f.cumRes}
        aide={`objectif de l’année ${eur(A.B.res)}`}
        bon={f.cumRes >= 0}
        spark={<Spark vals={reels.map((m) => m.cumRes)} couleur="#12B76A" />}
        delai=".3s"
      />
      <Tuile
        libelle={
          <>
            Reste à exécuter (chantiers) <Info>Devis de chantier signés moins ce qui a déjà été facturé dessus : le travail vendu qui reste à faire.</Info>
          </>
        }
        valeur={A.reste}
        aide="devis signés pas encore facturés"
        spark={<Spark vals={reels.map((m) => m.cha)} couleur="#2F54EB" />}
        delai=".4s"
      />
    </section>
  );
}

function Couloir({
  nom,
  sous,
  v,
  couleur,
  pion,
  val,
  valSous,
  fantome,
  delai,
  echelle,
  objectif,
  libelleObjectif,
}: {
  nom: string;
  sous: string;
  v: number;
  couleur: string;
  pion: [string, string];
  val: string;
  valSous: ReactNode;
  fantome?: number;
  delai: number;
  echelle: (v: number) => number;
  objectif: number;
  libelleObjectif?: string;
}) {
  return (
    <div className={c('couloir')}>
      <span className={c('nom')}>
        {nom}
        <small>{sous}</small>
      </span>
      <div className={c('piste-c')}>
        {!!fantome && <i className={c('fantome glisse')} style={{ ...d(`${delai + 0.6}s`), width: `${echelle(fantome)}%` }} />}
        <i className={c('barre-c glisse')} style={{ ...d(`${delai}s`), width: `${echelle(v)}%`, background: couleur }} />
        <span className={c('pion')} style={{ ...d(`${delai}s`), left: `${echelle(v)}%`, borderColor: pion[1], color: pion[1] }}>
          {pion[0]}
        </span>
        <span className={c('arrivee')} style={{ left: `${echelle(objectif)}%` }}>
          <span>{libelleObjectif ?? ''}</span>
        </span>
      </div>
      <span className={c('val')}>
        {val}
        <small>{valSous}</small>
      </span>
    </div>
  );
}

const initiale = (nom: string) => (nom.trim()[0] ?? 'E').toUpperCase();
const court = (an: number) => String(an).slice(2);

function Course({ A, f, entreprise, an, an1, finDe }: { A: Annee; f: MoisAnnee; entreprise: string; an: number; an1: number; finDe: string }) {
  const B = A.B, ecart = f.cum - f.cumObj;
  const max = Math.max(A.fin.cum, B.ca, A.fin.cumN1, 1) * 1.04;
  const e = (v: number) => Math.max(0, (v / max) * 100);
  return (
    <section className={c('carte')} aria-labelledby="t-course">
      <div className={c('tete')}>
        <div>
          <h2 id="t-course">La course à l’objectif</h2>
          <p>{finDe.charAt(0).toUpperCase() + finDe.slice(1)}, qui est le plus loin ? La ligne pointillée est l’objectif de l’année.</p>
        </div>
      </div>
      <div className={c('course')}>
        <Couloir
          nom={`${entreprise} ${an}`}
          sous="réalisé"
          v={f.cum}
          couleur="var(--degrade)"
          pion={[initiale(entreprise), '#2F54EB']}
          val={eur(f.cum)}
          valSous={<span style={{ color: 'var(--pervenche)' }}>prévu {keur(A.fin.cum)}</span>}
          fantome={A.fin.cum}
          delai={0}
          echelle={e}
          objectif={B.ca}
          libelleObjectif={`Objectif ${keur(B.ca)}`}
        />
        <Couloir
          nom="Objectif"
          sous="à la même date"
          v={f.cumObj}
          couleur="#5B6480"
          pion={['O', '#101A3D']}
          val={eur(f.cumObj)}
          valSous={<span className={c(ecart >= 0 ? 'pos' : 'neg')}>{signe(ecart)}</span>}
          delai={0.25}
          echelle={e}
          objectif={B.ca}
        />
        {f.cumN1 > 0 && (
          <Couloir
            nom={String(an1)}
            sous="à la même date"
            v={f.cumN1}
            couleur="#B9C6FB"
            pion={[court(an1), '#8A93AE']}
            val={eur(f.cumN1)}
            valSous={<span className={c(f.cum >= f.cumN1 ? 'pos' : 'neg')}>{signe(f.cum - f.cumN1)}</span>}
            delai={0.5}
            echelle={e}
            objectif={B.ca}
          />
        )}
      </div>
    </section>
  );
}

function VuePeriode({ p, trim, an1, entreprise, revenir }: { p: Periode; trim: boolean; an1: number; entreprise: string; revenir: () => void }) {
  const pcObj = part(p.tot, p.obj), ecart = p.tot - p.obj, evo = p.tot - p.n1, prevu = !p.reel;
  const max = Math.max(p.tot, p.obj, p.n1, 1) * 1.12;
  const e = (v: number) => Math.max(0, (v / max) * 100);
  const du = trim ? 'du trimestre' : 'du mois';
  return (
    <>
      <section className={c('hero')} aria-label="Résumé de la période">
        <Anneau
          fait={pcObj}
          libelle={`${Math.round(pcObj)} % de l’objectif de la période`}
          centre={
            <>
              <b>
                <Compte valeur={pcObj} format={(v) => `${Math.round(v)} %`} />
              </b>
              <small>
                de l’objectif
                <br />
                {du}
              </small>
            </>
          }
        />
        <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
          <div className={c('grand')}>
            <Compte valeur={p.tot} />
          </div>
          <p className={c('sous-t')}>
            {prevu ? 'prévus' : 'produits'} {p.dans}
            {prevu ? ' · prévision' : ''}
          </p>
          <div className={c('pastilles')}>
            <span className={c('pastille', ecart >= 0 ? 'verte' : 'rouge')}>
              {FLECHE(ecart >= 0)}
              {signe(ecart)} sur l’objectif
            </span>
            {p.n1 > 0 && (
              <span className={c('pastille', evo >= 0 ? 'verte' : 'rouge')}>
                {FLECHE(evo >= 0)}
                {signe(evo)} par rapport à {an1} ({pc(evolution(p.tot, p.n1))})
              </span>
            )}
            <span className={c('pastille neutre')}>Objectif {eur(p.obj)}</span>
          </div>
        </div>
      </section>
      <section className={c('tuiles')} aria-label="Chiffres de la période">
        <Tuile libelle="Dépannages" valeur={p.dep} aide={`${Math.round(part(p.dep, p.tot))} % de la période · objectif ${keur(p.objDep)}`} bon={p.dep >= p.objDep} delai=".1s" />
        <Tuile libelle="Chantiers" valeur={p.cha} aide={`${Math.round(part(p.cha, p.tot))} % de la période · objectif ${keur(p.objCha)}`} bon={p.cha >= p.objCha} delai=".2s" />
        <Tuile libelle="Résultat théorique" valeur={p.res} aide={`marge des travaux moins les frais ${du}`} bon={p.res >= 0} delai=".3s" />
        <Tuile libelle={`Cumul fin ${MOIS_LONGS[p.idx[p.idx.length - 1]]}`} valeur={p.fin.cum} aide={`${signe(p.fin.cum - p.fin.cumObj)} sur l’objectif cumulé`} bon={p.fin.cum >= p.fin.cumObj} delai=".4s" />
      </section>
      <section className={c('carte')} aria-labelledby="t-course">
        <div className={c('tete')}>
          <div>
            <h2 id="t-course">La course {p.dans.replace(/^en /, 'de ').replace(/^au /, 'du ')}</h2>
            <p>
              {entreprise} contre l’objectif et contre la même période de {an1}.
            </p>
          </div>
          <button type="button" className={c('btn')} onClick={revenir}>
            Revenir à l’année
          </button>
        </div>
        <div className={c('course')}>
          <Couloir
            nom={entreprise}
            sous={prevu ? 'prévu' : 'réalisé'}
            v={p.tot}
            couleur={prevu ? '#B9C6FB' : 'var(--degrade)'}
            pion={[initiale(entreprise), '#2F54EB']}
            val={eur(p.tot)}
            valSous={<span className={c(ecart >= 0 ? 'pos' : 'neg')}>{signe(ecart)}</span>}
            delai={0}
            echelle={e}
            objectif={p.obj}
            libelleObjectif={`Objectif ${keur(p.obj)}`}
          />
          <Couloir nom="Objectif" sous={du} v={p.obj} couleur="#5B6480" pion={['O', '#101A3D']} val={eur(p.obj)} valSous="" delai={0.25} echelle={e} objectif={p.obj} />
          {p.n1 > 0 && (
            <Couloir
              nom={String(an1)}
              sous="même période"
              v={p.n1}
              couleur="#B9C6FB"
              pion={[court(an1), '#8A93AE']}
              val={eur(p.n1)}
              valSous={<span className={c(evo >= 0 ? 'pos' : 'neg')}>{signe(evo)}</span>}
              delai={0.5}
              echelle={e}
              objectif={p.obj}
            />
          )}
        </div>
      </section>
    </>
  );
}

/** Export du tableau en CSV (Excel l'ouvre directement). */
function exporter(P: Periode[], an: number, an1: number, trim: boolean) {
  const n = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',');
  const lignes = [
    [trim ? 'Trimestre' : 'Mois', 'Dépannages', 'Chantiers', 'Production', 'Objectif', 'Écart', `${an1}`, 'Cumul', 'Réalisé ou prévu'],
    ...P.map((q) => [q.libL, n(q.dep), n(q.cha), n(q.tot), n(q.obj), n(q.tot - q.obj), n(q.n1), n(q.fin.cum), q.reel ? 'réalisé' : 'prévu']),
  ];
  const csv = '﻿' + lignes.map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `production-${an}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function TableauPro({
  A,
  P,
  trim,
  an,
  an1,
  sel,
  choisir,
  tri,
  setTri,
  ouvert,
  setOuvert,
  gran,
  budgetSalaires,
}: {
  A: Annee;
  P: Periode[];
  trim: boolean;
  an: number;
  an1: number;
  sel: number | null;
  choisir: (i: number) => void;
  tri: Tri;
  setTri: (t: Tri) => void;
  ouvert: Record<string, boolean>;
  setOuvert: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  gran: Granularite;
  budgetSalaires: number;
}) {
  const B = A.B;
  const cle = { periode: (l: L) => l.i, prod: (l: L) => l.q.tot, ecart: (l: L) => l.e, n1: (l: L) => l.v }[tri.col];
  type L = { q: Periode; i: number; e: number; v: number };
  const lignes: L[] = P.map((q, i) => ({ q, i, e: q.tot - q.obj, v: evolution(q.tot, q.n1) })).sort((x, y) => (cle(x) - cle(y)) * tri.sens);
  const max = Math.max(1, ...P.map((q) => Math.max(q.tot, q.obj, q.n1))) * 1.04;
  const W = (v: number) => `${((v / max) * 100).toFixed(2)}%`;
  const tete = (col: Tri['col'], lib: string) => {
    const actif = tri.col === col;
    return (
      <button
        type="button"
        className={c('tri', actif && 'actif')}
        aria-label={`Trier par ${lib}`}
        onClick={() => setTri(actif ? { col, sens: tri.sens === 1 ? -1 : 1 } : { col, sens: col === 'periode' ? 1 : -1 })}
      >
        {lib}
        <span aria-hidden="true">{actif ? (tri.sens > 0 ? ' ↑' : ' ↓') : ' ↕'}</span>
      </button>
    );
  };
  const e = A.fin.cum - B.ca, v = evolution(A.fin.cum, A.fin.cumN1);
  return (
    <section className={c('carte')} aria-labelledby="t-tab">
      <div className={c('tete')}>
        <div>
          <h2 id="t-tab">{trim ? 'Trimestre par trimestre' : 'Mois par mois'}</h2>
          <p>Cliquez sur une ligne pour voir le détail. Les titres de colonnes trient le tableau.</p>
        </div>
        <button type="button" className={c('btn')} onClick={() => exporter(P, an, an1, trim)}>
          Exporter en Excel
        </button>
      </div>
      <div className={c('tp')}>
        <div className={c('tp-l tp-tete')}>
          {tete('periode', trim ? 'Trimestre' : 'Mois')}
          {tete('prod', 'Production')}
          <span className={c('tp-obj')}>
            Objectif <Info>L’objectif de l’année divisé par 12 (ou par 4 pour un trimestre). Le pourcentage dit quelle part de cet objectif est atteinte.</Info>
          </span>
          {tete('ecart', 'Écart')}
          {tete('n1', `Face à ${an1}`)}
          <span className={c('tp-cum')}>Cumul depuis janvier</span>
          <span />
        </div>
        {lignes.map((l, k) => {
          const { q, i } = l;
          const pcObj = part(q.tot, q.obj);
          const ton = pcObj >= 100 ? 'vert' : pcObj >= 90 ? 'bleu' : 'rouge';
          const ouv = !!ouvert[gran + i];
          const fraisPeriode = (B.fg / 12 - (budgetSalaires + B.charges) / 12) * q.idx.length;
          return (
            <div key={gran + i} className={c('tp-bloc', sel === i && 'choisie', !q.reel && 'prevue', ouv && 'ouvert')} style={d(`${(k * 0.04).toFixed(2)}s`)}>
              <button type="button" className={c('tp-l')} aria-expanded={ouv} onClick={() => setOuvert((o) => ({ ...o, [gran + i]: !o[gran + i] }))}>
                <span className={c('tp-per')}>
                  <b>{q.libL}</b>
                  {trim && <small>{`${MOIS_LONGS[q.idx[0]].slice(0, 4)}. à ${MOIS_LONGS[q.idx[2]].slice(0, 4)}.`}</small>}
                  <span className={c('etat', q.reel ? 'fait' : 'prev')}>{q.reel ? 'Réalisé' : q.partiel ? 'En partie prévu' : q.fin.enCours || q.idx.some((x) => A.mois[x].enCours) ? 'En cours' : 'Prévu'}</span>
                </span>
                <span className={c('tp-prod')}>
                  <span className={c('tp-barre')}>
                    <i className={c('d glisse')} style={{ width: W(q.dep) }} />
                    <i className={c('c glisse')} style={{ left: W(q.dep), width: W(q.cha) }} />
                    <em className={c('rep-o')} style={{ left: W(q.obj) }} title="Objectif" />
                    {q.n1 > 0 && <em className={c('rep-n')} style={{ left: W(q.n1) }} title={String(an1)} />}
                  </span>
                  <b>{eur(q.tot)}</b>
                </span>
                <span className={c('tp-obj')}>
                  <span className={c('pct', ton)}>{Math.round(pcObj)} %</span>
                  <small>{keur(q.obj)}</small>
                </span>
                <span className={c('tp-ec')}>
                  <span className={c('chip', l.e >= 0 ? 'pos' : 'neg')}>{signe(l.e)}</span>
                </span>
                <span className={c('tp-n1')}>
                  {q.n1 > 0 ? (
                    <>
                      <span className={c(l.v >= 0 ? 'pos' : 'neg')}>
                        {l.v >= 0 ? '▲ +' : '▼ −'}
                        {Math.abs(Math.round(l.v))} %
                      </span>
                      <small>
                        {keur(q.n1)} en {an1}
                      </small>
                    </>
                  ) : (
                    <small>—</small>
                  )}
                </span>
                <span className={c('tp-cum')}>
                  <b>{eur(q.fin.cum)}</b>
                  <span className={c('jauge-mini')}>
                    <i style={{ width: `${Math.min(100, part(q.fin.cum, B.ca)).toFixed(1)}%` }} />
                  </span>
                </span>
                <span className={c('chev')} aria-hidden="true">
                  ›
                </span>
              </button>
              {ouv && (
                <div className={c('tp-detail')}>
                  <div className={c('det-g')}>
                    <div>
                      <small>
                        <i className={c('pt d')} />
                        Dépannages
                      </small>
                      <b>{eur(q.dep)}</b>
                      <span>
                        objectif {eur(q.objDep)} · {signe(q.dep - q.objDep)}
                      </span>
                    </div>
                    <div>
                      <small>
                        <i className={c('pt c')} />
                        Chantiers
                      </small>
                      <b>{eur(q.cha)}</b>
                      <span>
                        objectif {eur(q.objCha)} · {signe(q.cha - q.objCha)}
                      </span>
                    </div>
                    <div>
                      <small>
                        Marge des travaux <Info>Production moins son coût estimé avec vos coefficients (Paramètres › Pilotage).</Info>
                      </small>
                      <b>{eur(q.marge)}</b>
                      <span>{Math.round(part(q.marge, q.tot))} % de la production</span>
                    </div>
                    <div>
                      <small>
                        Résultat théorique <Info>Marge des travaux, moins les frais généraux du budget sur la période (hors salaires, déjà couverts par la marge).</Info>
                      </small>
                      <b className={c(q.res >= 0 ? 'pos' : 'neg')}>{eur(q.res)}</b>
                      <span>frais de la période : {eur(fraisPeriode)}</span>
                    </div>
                  </div>
                  <div className={c('det-a')}>
                    <button type="button" className={c('btn principal')} onClick={() => choisir(i)}>
                      {sel === i ? 'Revenir à l’année' : `Filtrer la page sur ${trim ? 'ce trimestre' : 'ce mois'}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className={c('tp-total')}>
          <span>
            <b>Année {an}</b>
            <small>réalisé + prévu</small>
          </span>
          <span>
            <b>{eur(A.fin.cum)}</b>
            <small>objectif {eur(B.ca)}</small>
          </span>
          <span>
            <span className={c('chip', e >= 0 ? 'pos' : 'neg')}>{signe(e)}</span>
          </span>
          {A.fin.cumN1 > 0 ? (
            <span className={c(v >= 0 ? 'pos' : 'neg')}>
              <b>
                {v >= 0 ? '▲ +' : '▼ −'}
                {Math.abs(Math.round(v))} %
              </b>
              <small style={{ color: 'var(--gris)' }}>face à {an1}</small>
            </span>
          ) : (
            <span />
          )}
        </div>
        <div className={c('legende')}>
          <span>
            <i style={{ background: '#D92D20' }} />
            Dépannages
          </span>
          <span>
            <i style={{ background: '#2F54EB' }} />
            Chantiers
          </span>
          <span>
            <i style={{ background: '#101A3D', width: 3, height: 14 }} />
            Objectif
          </span>
          <span>
            <i style={{ background: '#8A93AE', width: 3, height: 14 }} />
            {an1}
          </span>
        </div>
      </div>
    </section>
  );
}

function EtSi({ A, scen, setScen, devisEnAttente }: { A: Annee; scen: Scenario; setScen: (s: Scenario) => void; devisEnAttente: number }) {
  const restants = 12 - A.n;
  const debut = MOIS_LONGS[Math.min(11, A.n)];
  const rythme = scen.mode === 'trois' ? A.trois : A.moy;
  const MODES: [ModeRythme, string][] = [
    ['moyenne', 'Moyenne de l’année'],
    ['trois', '3 derniers mois'],
    ['n1', 'Saisons de l’an dernier'],
  ];
  return (
    <section className={c('carte scen')} aria-labelledby="t-scen">
      <div>
        <h2 id="t-scen">Et si…</h2>
        <p className={c('aide')}>Bougez les curseurs : les graphiques et la prévision suivent.</p>
      </div>
      <div>
        <label>
          Dépannages {restants === 12 ? 'de l’année' : restants === 1 ? 'de décembre' : `de ${debut} à décembre`}
          <output>{scen.mode === 'n1' ? 'comme l’an dernier' : `${eur(rythme)} / mois`}</output>
        </label>
        <div className={c('puces')} style={{ margin: '6px 0' }}>
          {MODES.map(([m, lib]) => (
            <button key={m} type="button" className={c('puce', scen.mode === m && 'actif')} aria-pressed={scen.mode === m} onClick={() => setScen({ ...scen, mode: m })}>
              {lib}
            </button>
          ))}
        </div>
        <p className={c('aide')}>
          Moyenne depuis janvier : {eur(A.moy)} par mois, 3 derniers mois : {eur(A.trois)}.
        </p>
      </div>
      <div>
        <label htmlFor="c-part">
          Reste à exécuter facturé avant le 31 décembre <output>{scen.part} %</output>
        </label>
        <input type="range" id="c-part" min={0} max={100} step={5} value={scen.part} onChange={(e) => setScen({ ...scen, part: Number(e.target.value) })} />
        <p className={c('aide')}>Sur {eur(A.reste)} de devis signés pas encore facturés.</p>
      </div>
      <div>
        <label htmlFor="c-devis">
          Devis en attente signés et faits cette année <output>{eur(scen.devis)}</output>
        </label>
        <input
          type="range"
          id="c-devis"
          min={0}
          max={Math.max(10000, Math.ceil(devisEnAttente / 1000) * 1000)}
          step={1000}
          value={scen.devis}
          onChange={(e) => setScen({ ...scen, devis: Number(e.target.value) })}
        />
        <p className={c('aide')}>{devisEnAttente ? `${eur(devisEnAttente)} de devis de chantier attendent une réponse dans Chantio.` : 'Aucun devis de chantier en attente dans Chantio.'}</p>
      </div>
      <button type="button" className={c('btn')} onClick={() => setScen(SCENARIO_DE_BASE)}>
        Revenir au calcul de base
      </button>
    </section>
  );
}

function Cascade({ A, f, scen }: { A: Annee; f: MoisAnnee; scen: Scenario }) {
  const B = A.B;
  // Le mois en cours est compté dans « à venir » : la prévision du mois, ou le déjà facturé s'il la dépasse.
  const aVenirCha = A.mois.slice(A.n).reduce((s, m) => s + m.cha, 0);
  const resteRetenu = Math.min(aVenirCha, (A.reste * scen.part) / 100);
  const parts: [string, number, string, 'auto' | 'prev'][] = [
    ['Déjà facturé', f.cum, '#2F54EB', 'auto'],
    ['Reste à exécuter', resteRetenu, '#7C93F5', 'auto'],
    ['Dépannages à venir', A.depAttendu, '#D92D20', 'prev'],
    ['Devis en attente', Math.max(0, aVenirCha - resteRetenu), '#B9C6FB', 'prev'],
  ];
  const tot = A.fin.cum, maxC = Math.max(tot, B.ca, 1) * 1.02;
  let cumul = 0;
  return (
    <section className={c('carte')} aria-labelledby="t-casc">
      <div className={c('tete')}>
        <div>
          <h2 id="t-casc">D’où vient la prévision</h2>
          <p>Le calcul de votre fichier, posé ligne par ligne.</p>
        </div>
      </div>
      <div className={c('cascade')}>
        {parts.map(([lib, v, coul, src], k) => {
          const l = (cumul / maxC) * 100, w = (v / maxC) * 100;
          cumul += v;
          return (
            <div key={lib} className={c('r')}>
              <span>
                {lib} <Source type={src}>{src === 'auto' ? 'auto' : 'prévu'}</Source>
              </span>
              <div className={c('piste')}>
                <i className={c('glisse')} style={{ ...d(`${k * 0.35}s`), left: `${l}%`, width: `${Math.max(w, 0.3)}%`, background: coul }} />
              </div>
              <span className={c('v')}>{eur(v)}</span>
            </div>
          );
        })}
        <div className={c('r total')}>
          <span>Prévision</span>
          <div className={c('piste')}>
            <i className={c('glisse')} style={{ ...d('1.5s'), left: 0, width: `${(tot / maxC) * 100}%`, background: 'var(--degrade)' }} />
            <i style={{ left: `${(B.ca / maxC) * 100}%`, width: 2, background: '#101A3D', top: -4, bottom: -4 }} />
          </div>
          <span className={c('v')}>{eur(tot)}</span>
        </div>
        <div className={c('r')}>
          <span>Objectif</span>
          <span />
          <span className={c('v')}>{eur(B.ca)}</span>
        </div>
        <div className={c('r')}>
          <span>
            <b>{tot >= B.ca ? 'En plus de l’objectif' : 'Montant manquant'}</b>
          </span>
          <span />
          <span className={c('v', tot >= B.ca ? 'pos' : 'neg')}>{eur(Math.abs(tot - B.ca))}</span>
        </div>
      </div>
    </section>
  );
}

function Sources({ donnees, an, an1 }: { donnees: DonneesMonAnnee; an: number; an1: number }) {
  const moisImportes = donnees.production.importes.filter(Boolean).length;
  return (
    <section className={c('carte')} aria-labelledby="t-src">
      <div className={c('tete')}>
        <div>
          <h2 id="t-src">D’où viennent les chiffres</h2>
          <p>Ce que Chantio remplit tout seul, et ce qu’il faut lui donner une fois.</p>
        </div>
        <Link href="/parametres?rubrique=budget" className={c('btn')}>
          Budget et mois importés
        </Link>
      </div>
      <div className={c('sources-l')}>
        <div>
          <Source type="auto">Automatique</Source>
          <b>Dès que vous facturez dans Chantio</b>
          <ul>
            <li>Production du mois, par dépannage et chantier (l’entretien compte avec les dépannages)</li>
            <li>Devis signés, déjà facturé, reste à exécuter</li>
            <li>Devis en attente</li>
          </ul>
        </div>
        <div>
          <Source type="saisi">Saisi une fois par an</Source>
          <b>Le budget {an}</b>
          <ul>
            <li>Objectifs dépannage et chantier</li>
            <li>Frais généraux poste par poste, salaires</li>
            <li>Coefficients pour la marge</li>
          </ul>
        </div>
        <div>
          <Source type="import">Importé</Source>
          <b>Ce qui est fait ailleurs</b>
          <ul>
            <li>{an1} mois par mois</li>
            <li>{moisImportes ? `${moisImportes} mois de ${an} importés ou saisis` : `Les mois de ${an} facturés hors Chantio`}</li>
            <li>Un mois importé remplace les factures Chantio de ce mois-là</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function VueN1({
  A,
  P,
  ps,
  sel,
  choisir,
  trim,
  an,
  an1,
  entreprise,
  finDe,
}: {
  A: Annee;
  P: Periode[];
  ps: Periode | null;
  sel: number | null;
  choisir: (i: number) => void;
  trim: boolean;
  an: number;
  an1: number;
  entreprise: string;
  finDe: string;
}) {
  const f = A.fait;
  const a26 = ps ? ps.tot : (f?.cum ?? 0);
  const a25 = ps ? ps.n1 : (f?.cumN1 ?? 0);
  const lib = ps ? ps.dans : A.n ? `de janvier à fin ${MOIS_LONGS[A.n - 1]}` : finDe;
  const prevu = ps ? !ps.reel : false;
  const ec = a26 - a25, mieux = ec >= 0, finEc = A.fin.cum - A.fin.cumN1;
  const maxPc = Math.max(1, ...P.map((q) => Math.abs(evolution(q.tot, q.n1))));
  const cumuls = P.map((_, i) => P.slice(0, i + 1).reduce((t, q) => [t[0] + q.n1, t[1] + q.tot], [0, 0]));
  return (
    <>
      <section className={c('hero duel')} aria-label={`${an} face à ${an1}`}>
        <div className={c('match')}>
          <div className={c('camp c25')}>
            <small>{an1}</small>
            <b>
              <Compte valeur={a25} />
            </b>
            <span>{lib}</span>
          </div>
          <div className={c('verdict', mieux ? 'pos-f' : 'neg-f')}>
            <b>{a25 ? pc(evolution(a26, a25)) : '—'}</b>
            <span>{signe(ec)}</span>
          </div>
          <div className={c('camp c26')}>
            <small>
              {an}
              {prevu ? ' · prévu' : ''}
            </small>
            <b>
              <Compte valeur={a26} />
            </b>
            <span>{lib}</span>
          </div>
        </div>
        <p className={c('phrase-n1')}>
          {a25 ? `${entreprise} ${mieux ? `fait mieux qu’en ${an1}` : `est en dessous de ${an1}`} ${lib}. ` : `${an1} n’est pas encore importé : déposez le fichier de l’an dernier ou saisissez ses mois. `}
          {!ps && A.fin.cumN1 > 0 && (
            <>
              Sur l’année entière, la prévision est de <b>{eur(A.fin.cum)}</b> contre <b>{eur(A.fin.cumN1)}</b> en {an1} ({pc(evolution(A.fin.cum, A.fin.cumN1))}).
            </>
          )}
        </p>
      </section>
      <section className={c('carte')} aria-labelledby="t-g-n1">
        <div className={c('tete')}>
          <div>
            <h2 id="t-g-n1">
              {an1} et {an} côte à côte
            </h2>
            <p>
              Gris : {an1}. Bleu : {an} (hachuré quand c’est prévu). Cliquez sur une paire pour la regarder de près.
            </p>
          </div>
        </div>
        <GraphN1 P={P} sel={sel} choisir={choisir} an={an} an1={an1} />
        <div className={c('legende')}>
          <span>
            <i style={{ background: '#C5CBDB' }} />
            {an1}
          </span>
          <span>
            <i style={{ background: '#2F54EB' }} />
            {an} réalisé
          </span>
          <span>
            <i style={{ background: 'repeating-linear-gradient(45deg,#7C93F5 0 2px,#E9EEFF 2px 5px)' }} />
            {an} prévu
          </span>
        </div>
      </section>
      <section className={c('carte')} aria-labelledby="t-tab-n1">
        <div className={c('tete')}>
          <div>
            <h2 id="t-tab-n1">
              {trim ? 'Trimestre par trimestre' : 'Mois par mois'}, face à {an1}
            </h2>
            <p>
              Chaque ligne se lit de gauche à droite : {an1}, {an}, puis la différence.
            </p>
          </div>
          <Link href="/parametres?rubrique=production" className={c('btn')}>
            Voir ou corriger {an1}
          </Link>
        </div>
        <div className={c('tableau')}>
          <table className={c('t-n1')}>
            <thead>
              <tr>
                <th>{trim ? 'Trimestre' : 'Mois'}</th>
                <th>{an1}</th>
                <th>{an}</th>
                <th>Différence</th>
                <th className={c('evo')}>Évolution</th>
                <th>Cumul {an1}</th>
                <th>Cumul {an}</th>
                <th>Écart cumulé</th>
              </tr>
            </thead>
            <tbody>
              {P.map((q, i) => {
                const [c25, c26] = cumuls[i];
                const e = q.tot - q.n1, v = evolution(q.tot, q.n1), w = Math.min(50, (Math.abs(v) / maxPc) * 50), ce = c26 - c25;
                return (
                  <tr
                    key={i}
                    className={c('ligne-p', !q.reel && 'prevu', sel === i && 'choisie')}
                    tabIndex={0}
                    onClick={() => choisir(i)}
                    onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), choisir(i))}
                  >
                    <td>
                      {q.libL} {!q.reel && <Source type="prev">prévu</Source>}
                    </td>
                    <td>{eur(q.n1)}</td>
                    <td>
                      <b>{eur(q.tot)}</b>
                    </td>
                    <td className={c(e >= 0 ? 'pos' : 'neg')}>{signe(e)}</td>
                    <td className={c('evo')}>
                      {q.n1 > 0 ? (
                        <div className={c('diverge')}>
                          <i className={c(v >= 0 ? 'up' : 'down')} style={{ width: `${w}%` }} />
                          <span className={c(v >= 0 ? 'pos' : 'neg')}>{pc(v)}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{eur(c25)}</td>
                    <td>{eur(c26)}</td>
                    <td className={c(ce >= 0 ? 'pos' : 'neg')}>{signe(ce)}</td>
                  </tr>
                );
              })}
              <tr className={c('tot')}>
                <td>Année</td>
                <td>{eur(A.fin.cumN1)}</td>
                <td>{eur(A.fin.cum)}</td>
                <td className={c(finEc >= 0 ? 'pos' : 'neg')}>{signe(finEc)}</td>
                <td className={c('evo', finEc >= 0 ? 'pos' : 'neg')}>{A.fin.cumN1 ? pc(evolution(A.fin.cum, A.fin.cumN1)) : '—'}</td>
                <td />
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className={c('note')}>
          {an1} vient de la ligne « N-1 » importée, ou des factures de Chantio. Sans détail par type, la comparaison se fait sur le total. Dès l’an prochain, Chantio aura les deux années complètes, par type.
        </p>
      </section>
    </>
  );
}
