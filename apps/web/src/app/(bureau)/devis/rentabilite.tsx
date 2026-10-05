'use client';

// Partie « Prix et marge » de l'éditeur, comme blocRenta() et vueCoefs() du bac : coefficient global
// (saisie + curseur), coefficients par ligne, rentabilité (visible par le bureau seulement), totaux.
// Rien de tout cela n'est imprimé : le client ne voit que les prix.

import { useState } from 'react';
import {
  appliquerPrix,
  debourseUnitaire,
  euroBac,
  nombreBac,
  pourcentBac,
  rentabilite,
  type LigneDocument,
  type Parcours,
  type ReglagesPrix,
  type TotauxDocument,
} from '@chantio/shared';

/** coefMini() du bac : coefficient global qui remet la marge nette au minimum (entre 1 et 3). */
function coefMini(lignes: LigneDocument[], remise: number, rp: ReglagesPrix): number {
  let lo = 1;
  let hi = 3;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    const r = rentabilite({ lignes: appliquerPrix(lignes, m, rp), remise }, rp);
    if (r.prixVente && r.tauxMargeNette >= rp.marge_min) hi = m;
    else lo = m;
  }
  return hi;
}

const proprePrix = (l: LigneDocument) => !l.titre && !l.forfait && !!l.prix_calcule;

export function Rentabilite({
  lignes,
  remise,
  coef,
  rp,
  parcours,
  lecture,
  T,
  onCoef,
  toutAuGlobal,
  allerLigne,
}: {
  lignes: LigneDocument[];
  remise: number;
  coef: number;
  rp: ReglagesPrix;
  parcours: Parcours;
  lecture: boolean;
  T: TotauxDocument;
  onCoef: (k: number) => void;
  toutAuGlobal: () => void;
  allerLigne: (k: number) => void;
}) {
  const t = rentabilite({ lignes, remise }, rp);
  const pv = t.prixVente;
  const tn = t.tauxMargeNette;
  const ok = tn >= rp.marge_min;
  const w = (v: number) => (pv ? Math.max(0, (v / pv) * 100) : 0);
  const perso = lignes.filter((l) => proprePrix(l) && l.coefficient).length;
  const textePerso = `${perso} ligne${perso > 1 ? 's ont leur' : ' a son'} propre coefficient`;
  const mini = !lecture && pv && !ok ? coefMini(lignes, remise, rp) : 0;

  return (
    <div className="col-d">
      {lecture ? (
        <div className="coef">
          <b>Coefficient global</b>
          <div className="val">
            <span className="val-lecture">{nombreBac(coef)}</span>
            <small>× déboursé sec</small>
          </div>
          {perso > 0 && <small>{textePerso}</small>}
        </div>
      ) : (
        <CarteCoef coef={coef} rp={rp} parcours={parcours} perso={perso} textePerso={textePerso} onCoef={onCoef} toutAuGlobal={toutAuGlobal} />
      )}
      <VueCoefs lignes={lignes} coef={coef} rp={rp} lecture={lecture} allerLigne={allerLigne} />
      <div className="carte">
        <div className="titre-carte">
          <h2>Rentabilité</h2>
          <span className="prive">🔒 Visible par le bureau</span>
        </div>
        <div className="barre-renta" aria-hidden="true">
          <i style={{ width: `${w(t.fournitures)}%`, background: 'var(--pervenche)' }} />
          <i style={{ width: `${w(t.mainOeuvre)}%`, background: 'var(--cobalt)' }} />
          <i style={{ width: `${w(t.fraisGeneraux)}%`, background: 'var(--lavande)' }} />
          <i style={{ width: `${w(t.margeNette)}%`, background: 'var(--menthe)' }} />
        </div>
        <div className="renta">
          <div className="l">
            <span>Fournitures</span>
            <b>{euroBac(t.fournitures)}</b>
          </div>
          <div className="l">
            <span>
              Main d’œuvre ({nombreBac(Math.round(t.heures * 10) / 10)} h × {nombreBac(rp.cout_horaire)}&nbsp;€)
            </span>
            <b>{euroBac(t.mainOeuvre)}</b>
          </div>
          <div className="l sep fort">
            <span>Déboursé sec</span>
            <b>{euroBac(t.debourse)}</b>
          </div>
          <div className="l">
            <span>Frais généraux ({nombreBac(rp.frais_generaux)} %)</span>
            <b>{euroBac(t.fraisGeneraux)}</b>
          </div>
          <div className="l">
            <span>Prix de revient</span>
            <b>{euroBac(t.prixRevient)}</b>
          </div>
          <div className="l sep fort">
            <span>Prix de vente HT</span>
            <b>{euroBac(pv)}</b>
          </div>
          <div className="l">
            <span>Marge brute</span>
            <b>
              {euroBac(t.margeBrute)} · {pourcentBac(pv ? (t.margeBrute / pv) * 100 : 0)}
            </b>
          </div>
          <div className="l fort">
            <span>Marge nette</span>
            <b style={{ color: ok ? 'var(--vert)' : 'var(--rouge)' }}>
              {euroBac(t.margeNette)} · {pourcentBac(tn)}
            </b>
          </div>
          <div className="l">
            <span>Coefficient moyen réel</span>
            <b>{nombreBac(Math.round(t.coefficientReel * 100) / 100)}</b>
          </div>
        </div>
        {pv !== 0 && (
          <div className={`alerte ${ok ? 'ok' : 'ko'}`}>
            {ok
              ? `Marge nette au-dessus du minimum de ${nombreBac(rp.marge_min)} %.`
              : `Attention : marge nette sous le minimum de ${nombreBac(rp.marge_min)} %. ${
                  lecture
                    ? ''
                    : mini < 2.99
                      ? `Montez le coefficient global à ${nombreBac(Math.ceil(mini * 100) / 100)} au moins.`
                      : 'Remontez les lignes en rouge dans « Coefficients par ligne ».'
                }`}
          </div>
        )}
        <div className="legende">
          <span>
            <i style={{ background: 'var(--pervenche)' }} />
            Fournitures
          </span>
          <span>
            <i style={{ background: 'var(--cobalt)' }} />
            Main d’œuvre
          </span>
          <span>
            <i style={{ background: 'var(--lavande)' }} />
            Frais généraux
          </span>
          <span>
            <i style={{ background: 'var(--menthe)' }} />
            Marge nette
          </span>
        </div>
      </div>
      <div className="carte" style={{ gap: 4 }}>
        <div className="renta">
          <div className="l">
            <span>Total HT</span>
            <b>{euroBac(T.ht)}</b>
          </div>
          {T.autoliq ? (
            <div className="l">
              <span>TVA autoliquidée</span>
              <b>{euroBac(0)}</b>
            </div>
          ) : (
            T.tva.map((x) => (
              <div className="l" key={x.taux}>
                <span>TVA {nombreBac(x.taux)} %</span>
                <b>{euroBac(x.montant)}</b>
              </div>
            ))
          )}
          <div className="l sep fort">
            <span>Total TTC</span>
            <b>{euroBac(T.ttc)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Carte bleue « Coefficient global » : saisie (1 à 3) et curseur (1 à 2,2). */
function CarteCoef({
  coef,
  rp,
  parcours,
  perso,
  textePerso,
  onCoef,
  toutAuGlobal,
}: {
  coef: number;
  rp: ReglagesPrix;
  parcours: Parcours;
  perso: number;
  textePerso: string;
  onCoef: (k: number) => void;
  toutAuGlobal: () => void;
}) {
  // Pendant la saisie, le texte tapé ; sinon le coefficient du document.
  const [texte, setTexte] = useState('');
  const [saisie, setSaisie] = useState(false);
  const valider = (v: string) => {
    const n = Number(v.replace(',', '.'));
    if (n >= 1 && n <= 3) onCoef(Math.round(n * 1000) / 1000);
  };
  return (
    <div className="coef">
      <div className="titre-carte">
        <b>Coefficient global</b>
        <span className="petit-txt" style={{ color: '#DCE3FF', textAlign: 'right' }}>
          {perso ? 'pour les lignes sans coefficient propre' : 's’applique à toutes les lignes'}
        </span>
      </div>
      <div className="val">
        <input
          type="number"
          step="0.01"
          min="1"
          max="3"
          value={saisie ? texte : coef.toFixed(2)}
          aria-label="Coefficient global"
          onFocus={() => {
            setTexte(coef.toFixed(2));
            setSaisie(true);
          }}
          onBlur={() => setSaisie(false)}
          onChange={(e) => {
            setTexte(e.target.value);
            valider(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <small>× déboursé sec</small>
      </div>
      <input type="range" min="1" max="2.2" step="0.01" value={coef} aria-label="Réglage du coefficient" onChange={(e) => onCoef(Number(e.target.value))} />
      <small>
        Par défaut {nombreBac(rp.coefficient)} (réglages). {parcours === 'depannage' ? 'Les forfaits déplacement et heure gardent leur prix fixe.' : ''}
      </small>
      {perso > 0 && (
        <button type="button" className="coef-raz" onClick={toutAuGlobal}>
          {textePerso} · Tout remettre au global
        </button>
      )}
    </div>
  );
}

/** « Coefficients par ligne » : coefficient de chaque ligne au prix calculé et sa marge nette. */
function VueCoefs({
  lignes,
  coef,
  rp,
  lecture,
  allerLigne,
}: {
  lignes: LigneDocument[];
  coef: number;
  rp: ReglagesPrix;
  lecture: boolean;
  allerLigne: (k: number) => void;
}) {
  const liste = lignes.flatMap((l, k) => {
    if (!proprePrix(l)) return [];
    const q = Number(l.quantite) || 0;
    const pv = q * l.prix_unitaire;
    const ds = debourseUnitaire(l, rp) * q;
    const mn = pv - ds * (1 + rp.frais_generaux / 100);
    return [{ k, l, co: l.coefficient || coef, tm: pv ? (mn / pv) * 100 : 0 }];
  });
  if (!liste.length) return null;
  const cos = liste.map((x) => x.co);
  const echelle = (v: number) => Math.max(0, Math.min(100, ((v - 1) / 1.2) * 100));
  return (
    <div className="carte vue-coefs">
      <h2>Coefficients par ligne</h2>
      <div className="vc-resume">
        <span>
          De <b>{nombreBac(Math.min(...cos))}</b> à <b>{nombreBac(Math.max(...cos))}</b>
        </span>
        <span>
          Global <b>{nombreBac(coef)}</b>
        </span>
      </div>
      <div className="vc-liste">
        {liste.map((x) => {
          const bas = x.tm < rp.marge_min;
          return (
            <button
              key={x.k}
              type="button"
              className={`vc-l${x.l.coefficient ? ' perso' : ''}${bas ? ' bas' : ''}`}
              disabled={lecture}
              title={lecture ? undefined : 'Aller à la ligne'}
              onClick={() => allerLigne(x.k)}
            >
              <span className="vc-nom">{x.l.designation}</span>
              <span className="vc-barre">
                <i style={{ width: `${echelle(x.co)}%` }} />
                <em style={{ left: `${echelle(coef)}%` }} />
              </span>
              <span className="vc-val">× {nombreBac(x.co)}</span>
              <span className="vc-m">{pourcentBac(x.tm)}</span>
            </button>
          );
        })}
      </div>
      <div className="legende">
        <span>
          <i style={{ background: 'var(--cobalt)' }} />
          Coefficient propre
        </span>
        <span>
          <i style={{ background: 'var(--lavande)' }} />
          Suit le global
        </span>
        <span>
          <i style={{ background: 'var(--rouge)' }} />
          Marge nette sous {nombreBac(rp.marge_min)} %
        </span>
      </div>
    </div>
  );
}
