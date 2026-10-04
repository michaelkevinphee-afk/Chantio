'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { euro } from '@chantio/shared';
import { annoncer } from '@/components/retour';
import type { RangDocument, TableauDeBord, Tuile } from '@/lib/devis';
import { changerEtat, dupliquer, facturerDevis } from './actions';
import { Compte, Ecran, Picto } from './composants';

type Onglet = 'devis' | 'factures' | 'importes';

const COULEURS_AVATAR = ['#2F54EB', '#5925DC', '#0E9F6E', '#7C93F5', '#2442C4', '#C026D3'];
const FILTRES: Record<Onglet, string[]> = {
  devis: ['Tous', 'Envoyé', 'Signé', 'Brouillon', 'Refusé', 'Appels d’offres'],
  factures: ['Tous', 'À encaisser', 'En retard', 'Payée', 'Brouillon'],
  importes: ['Tous'],
};

const initiales = (n: string) =>
  n
    .replace(/^(Mme et M\.|Mme|M\.)\s+/, '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?';

export function Etincelle({ serie }: { serie: number[] }) {
  const w = 100;
  const h = 40;
  const max = Math.max(...serie, 1);
  const pas = w / Math.max(1, serie.length - 1);
  const pts = serie.map((v, i) => [i * pas, h - 6 - (v / max) * (h - 12)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const fin = pts[pts.length - 1];
  return (
    <svg className="etincelle" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ color: 'var(--teinte)' }}>
      <path className="aire" d={`${d} L${w} ${h} L0 ${h} Z`} />
      <path className="trait" d={d} />
      <circle cx={fin[0]} cy={fin[1]} r="3.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Les filtres suivent le statut : un appel d'offres gagné reste un devis signé.
const PAR_STATUT: Record<string, RangDocument['statut']> = {
  Envoyé: 'envoye',
  Signé: 'signe',
  Brouillon: 'brouillon',
  Refusé: 'refuse',
  'À encaisser': 'a_encaisser',
  Payée: 'payee',
};

function correspond(r: RangDocument, filtre: string) {
  if (filtre === 'Tous') return true;
  if (filtre === 'En retard') return r.etat.retard > 0;
  if (filtre === 'Appels d’offres') return r.ao;
  return r.statut === PAR_STATUT[filtre];
}

function Jalons({ r, onglet }: { r: RangDocument; onglet: Onglet }) {
  const n = r.jalon;
  const classes = [0, 1, 2, 3].map((i) => {
    if (onglet === 'importes') return i === 0 ? 'actif' : '';
    if (n === -1) return onglet === 'devis' ? (i === 1 ? 'ko' : i < 1 ? 'fait' : '') : i === 2 ? 'ko' : i < 2 ? 'fait' : '';
    if (n === 3) return 'ok';
    return i < n ? 'fait' : i === n ? 'actif' : '';
  });
  return (
    <span className="jalons" aria-hidden="true">
      {classes.map((c, i) => (
        <i key={i} className={c} />
      ))}
    </span>
  );
}

export function TableauDevis({ donnees, ongletInitial, filtreInitial }: { donnees: TableauDeBord; ongletInitial: Onglet; filtreInitial?: string }) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [filtre, setFiltre] = useState(filtreInitial && FILTRES[ongletInitial].includes(filtreInitial) ? filtreInitial : 'Tous');
  const [recherche, setRecherche] = useState('');
  const [tour, setTour] = useState(0);
  const [, demarrer] = useTransition();
  const liste = useRef<HTMLDivElement>(null);

  const rangs = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return donnees[onglet].filter(
      (r) => correspond(r, filtre) && (!q || [r.numero, r.client, r.lieu, r.objet, r.date].join(' ').toLowerCase().includes(q)),
    );
  }, [donnees, onglet, filtre, recherche]);
  const total = rangs.reduce((s, r) => s + r.montant, 0);

  const choisirOnglet = (o: Onglet, f = 'Tous') => {
    setOnglet(o);
    setFiltre(f);
    setTour((t) => t + 1);
  };

  const cliquerTuile = (t: Tuile) => {
    choisirOnglet(t.onglet, t.filtre ?? 'Tous');
    liste.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const lancer = (fn: () => Promise<{ ok: boolean; erreur?: string; id?: string }>, message: string, ouvrir = false) =>
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) {
        annoncer(r.erreur ?? 'Action impossible', 'erreur');
        return;
      }
      annoncer(message);
      if (ouvrir && r.id) router.push(`/devis/${r.id}`);
      else router.refresh();
    });

  const relancer = (r: RangDocument) => {
    if (r.email) {
      const sujet = r.numero.startsWith('DE') ? `Votre devis ${r.numero}` : `Votre facture ${r.numero}`;
      const corps = r.numero.startsWith('DE')
        ? `Bonjour,\n\nJe me permets de revenir vers vous au sujet du devis ${r.numero} (${r.objet}). Avez-vous pu en prendre connaissance ?\n\nBien cordialement`
        : `Bonjour,\n\nSauf erreur de notre part, la facture ${r.numero} (${euro(r.montant)}) reste à régler. Merci de bien vouloir procéder au paiement.\n\nBien cordialement`;
      window.open(`mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`, '_self');
    }
    lancer(() => changerEtat(r.id, 'relance'), r.email ? 'Relance préparée dans votre messagerie' : 'Relance notée (pas d’e-mail client)');
  };

  const pMois = donnees.objectif ? Math.min(1, donnees.factureMois / donnees.objectif) : 0;
  const reste = Math.max(0, donnees.objectif - donnees.factureMois);
  const maxBarres = Math.max(donnees.objectif, ...donnees.mois.map((m) => Math.max(m.facture, m.encaisse)), 1) * 1.08;
  const premierParcours = Math.max(1, donnees.parcours[0]?.nombre ?? 1);
  const couleursParcours = ['var(--lavande)', 'var(--pervenche)', 'var(--cobalt-vif)', 'var(--menthe)'];
  const compteOnglet = { devis: donnees.devis.length, factures: donnees.factures.length, importes: donnees.importes.length };

  return (
    <Ecran label="Devis et factures">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="deg-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="deg-anneau" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2F54EB" />
            <stop offset="1" stopColor="#7C93F5" />
          </linearGradient>
        </defs>
      </svg>

      <div className="entete">
        <div>
          <div className="sur">{donnees.sousTitre}</div>
          <h1>Devis et factures</h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/devis/import">
            <Picto nom="importer" />
            Importer un dossier
          </Link>
          <Link className="btn" href="/devis/catalogue">
            <Picto nom="catalogue" />
            Catalogue
          </Link>
          <Link className="btn" href="/devis/nouveau?genre=facture">
            <Picto nom="plus" />
            Facture
          </Link>
          <Link className="btn plein" href="/devis/nouveau">
            <Picto nom="plus" epaisseur={2.4} />
            Nouveau devis
          </Link>
        </div>
      </div>

      <div className="tuiles">
        {donnees.tuiles.map((t, i) => (
          <button
            key={t.cle}
            type="button"
            className={`carte tuile apparition ${t.alerte ? 'alerte' : ''}`}
            style={{ ['--teinte' as string]: t.teinte, ['--i' as string]: i }}
            onClick={() => cliquerTuile(t)}
          >
            <span className="lib">
              <i />
              {t.libelle}
            </span>
            <span className="val">
              <span>
                <Compte valeur={t.valeur} />
              </span>
              <small>{t.unite}</small>
            </span>
            <span className="mont">
              <Compte valeur={t.montant} monnaie />
            </span>
            <span className={`delta ${t.sens}`}>
              {t.sens === 'haut' ? '↗' : t.sens === 'bas' ? '!' : '·'} {t.delta}
            </span>
            <Etincelle serie={t.serie} />
          </button>
        ))}
      </div>

      <div className="graphes">
        <div className="carte graphe">
          <div className="graphe-tete">
            <div>
              <h2>Chiffre d’affaires {new Date().getFullYear()}</h2>
              <p>Facturé chaque mois (HT), et ce qui est réellement encaissé</p>
            </div>
            <div className="legende">
              <span>
                <i style={{ background: 'var(--cobalt)' }} />
                Facturé
              </span>
              <span>
                <i style={{ background: 'var(--lavande)' }} />
                Encaissé
              </span>
              <span>
                <i
                  style={{
                    background: 'repeating-linear-gradient(135deg,var(--doux) 0 3px,var(--lavande) 3px 5px)',
                    border: '1px dashed var(--pervenche)',
                  }}
                />
                Objectif
              </span>
            </div>
          </div>
          <div className="gros-chiffre">
            <span>
              <Compte valeur={donnees.totalAnnee} monnaie />
            </span>
            <small>facturés depuis janvier</small>
          </div>
          <div className="barres" style={{ gridTemplateColumns: `repeat(${donnees.mois.length}, minmax(0, 1fr))` }}>
            {donnees.mois.map((m, i) => (
              <div
                key={m.libelle}
                className={`mois ${m.actuel ? 'actuel' : ''}`}
                tabIndex={0}
                aria-label={`${m.libelle} : ${euro(m.facture)} facturés, ${euro(m.encaisse)} encaissés`}
              >
                <div className="info-bulle">
                  <b>{euro(m.facture)}</b>
                  <span>facturés · {euro(m.encaisse)} encaissés</span>
                </div>
                <i className="b facture" style={{ ['--h' as string]: (m.facture / maxBarres) * 100, ['--i' as string]: i }} />
                <i className="b encaisse" style={{ ['--h' as string]: (m.encaisse / maxBarres) * 100, ['--i' as string]: i }} />
                {m.actuel && <i className="b prevu" style={{ ['--h' as string]: (donnees.objectif / maxBarres) * 100, ['--i' as string]: i }} />}
                <span className="lab">{m.libelle}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="carte graphe">
          <div className="graphe-tete">
            <div>
              <h2>Ce mois-ci</h2>
              <p>{donnees.objectifDefini ? 'Objectif de facturation du mois' : 'Comparé à votre moyenne mensuelle'}</p>
            </div>
            <Link className="btn petit fantome" href="/parametres?rubrique=prix">
              {donnees.objectifDefini ? 'Modifier' : 'Fixer un objectif'}
            </Link>
          </div>
          <div className="objectif">
            <div className="anneau" style={{ ['--p' as string]: pMois }}>
              <svg viewBox="0 0 120 120">
                <circle className="fond" cx="60" cy="60" r="52" />
                <circle className="plein" cx="60" cy="60" r="52" />
              </svg>
              <div>
                <b>
                  <Compte valeur={Math.round(pMois * 100)} /> %
                </b>
                <small>de {euro(donnees.objectif).replace(',00', '')}</small>
              </div>
            </div>
            <div className="objectif-txt">
              <b>
                <Compte valeur={donnees.factureMois} monnaie /> facturés
              </b>
              <p>
                {reste > 0 ? (
                  <>
                    Encore <span className="reste">{euro(reste).replace(',00', '')}</span> pour atteindre l’objectif.{' '}
                    {donnees.nbSignesNonFactures > 0 &&
                      `${donnees.nbSignesNonFactures} devis signé${donnees.nbSignesNonFactures > 1 ? 's' : ''} reste${donnees.nbSignesNonFactures > 1 ? 'nt' : ''} à facturer (${euro(donnees.signesNonFactures)} HT).`}
                  </>
                ) : (
                  'Objectif atteint ce mois-ci. Bravo !'
                )}
              </p>
            </div>
          </div>
          <div className="graphe-tete" style={{ marginTop: 18 }}>
            <div>
              <h2 style={{ fontSize: 15 }}>Parcours des devis</h2>
              <p>Sur les 30 derniers jours</p>
            </div>
          </div>
          <div className="parcours">
            {donnees.parcours.map((p, i) => {
              const avant = i ? donnees.parcours[i - 1].nombre : p.nombre;
              const taux = avant ? Math.round((p.nombre / avant) * 100) : 0;
              return (
                <div className="etape-p" key={p.libelle}>
                  <div className="nom">
                    {p.libelle}
                    <small>{i ? 'des ' + donnees.parcours[i - 1].libelle.toLowerCase() : 'devis'}</small>
                  </div>
                  <div className="piste">
                    <i style={{ ['--w' as string]: (p.nombre / premierParcours) * 100, ['--c' as string]: couleursParcours[i], ['--i' as string]: i }}>
                      <span>{p.nombre}</span>
                    </i>
                  </div>
                  <div className="taux">
                    <b>{p.nombre ? `${taux} %` : '·'}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="carte documents" ref={liste} style={{ scrollMarginTop: 16 }}>
        <div className="onglets" role="tablist">
          {(
            [
              ['devis', 'Devis'],
              ['factures', 'Factures'],
              ['importes', 'Importés à vérifier'],
            ] as const
          ).map(([o, lib]) => (
            <button key={o} role="tab" type="button" aria-selected={onglet === o} onClick={() => choisirOnglet(o)}>
              {lib}
              <span>{compteOnglet[o]}</span>
            </button>
          ))}
          <label className="recherche">
            <Picto nom="recherche" />
            <input type="search" placeholder="Client, numéro, objet…" aria-label="Rechercher" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        <div className="filtres">
          {FILTRES[onglet].map((f) => (
            <button
              key={f}
              className="btn petit"
              type="button"
              aria-pressed={f === filtre}
              onClick={() => {
                setFiltre(f);
                setTour((t) => t + 1);
              }}
            >
              {f}
            </button>
          ))}
          <span className="total">
            {rangs.length} document{rangs.length > 1 ? 's' : ''} · <b>{euro(total)}</b>
          </span>
        </div>
        <div className="rangs" key={`${onglet}-${filtre}-${tour}`}>
          {rangs.map((r, i) => {
            const facture = onglet === 'factures';
            return (
              <div
                key={r.id}
                className="rang apparu"
                tabIndex={0}
                role="link"
                style={{ ['--i' as string]: i, ['--a' as string]: COULEURS_AVATAR[(r.client.length + i) % COULEURS_AVATAR.length] }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.actions-rapides')) return;
                  router.push(r.lien);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) router.push(r.lien);
                }}
              >
                <span className={`avatar ${r.pro ? 'pro' : ''}`}>{initiales(r.client)}</span>
                <div className="qui">
                  <b>{r.client}</b>
                  <span>
                    <span className="ref">{r.numero}</span>
                    {r.lieu && ` · ${r.lieu}`}
                    {r.importe && onglet !== 'importes' && <span className="origine">Importé</span>}
                    {r.ao && <span className="origine ao">Appel d’offres</span>}
                  </span>
                </div>
                <div className="quoi">
                  {r.objet}
                  <span>{r.detail}</span>
                  <div className="actions-rapides">
                    {r.relancable && (
                      <button type="button" onClick={() => relancer(r)}>
                        Relancer
                      </button>
                    )}
                    {r.facturable && (
                      <button type="button" onClick={() => lancer(() => facturerDevis(r.id, 'totale'), 'Facture préparée', true)}>
                        Facturer
                      </button>
                    )}
                    {r.encaissable && (
                      <button type="button" onClick={() => lancer(() => changerEtat(r.id, 'payee'), 'Paiement enregistré')}>
                        Encaisser
                      </button>
                    )}
                    {onglet !== 'importes' && (
                      <button type="button" onClick={() => lancer(() => dupliquer(r.id), 'Copie créée', true)}>
                        Dupliquer
                      </button>
                    )}
                  </div>
                </div>
                <div className="combien">
                  <b>{euro(r.montant)}</b>
                  <span className={r.etat.retard ? 'retard' : ''}>{facture ? r.detail : 'TTC'}</span>
                  {facture && r.statut !== 'brouillon' && (
                    <div className="encaisse-barre">
                      <i style={{ ['--w' as string]: r.statut === 'payee' ? 100 : 0 }} />
                    </div>
                  )}
                </div>
                <div className="etat">
                  <span className={`pastille p-${r.etat.ton}`}>{r.etat.libelle}</span>
                  <Jalons r={r} onglet={onglet} />
                </div>
                <span className="fleche">
                  <Picto nom="fleche" taille={16} epaisseur={2.4} />
                </span>
              </div>
            );
          })}
          {!rangs.length && (
            <div className="vide-liste">
              {donnees[onglet].length ? (
                'Aucun document ne correspond.'
              ) : onglet === 'importes' ? (
                <>
                  Aucun document importé. <Link href="/devis/import">Importer vos anciens devis et factures</Link>
                </>
              ) : (
                <>
                  Pas encore de {onglet === 'devis' ? 'devis' : 'facture'}.{' '}
                  <Link href={onglet === 'devis' ? '/devis/nouveau' : '/devis/nouveau?genre=facture'} style={{ color: 'var(--cobalt)', fontWeight: 700 }}>
                    Créer {onglet === 'devis' ? 'le premier devis' : 'la première facture'}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Ecran>
  );
}
