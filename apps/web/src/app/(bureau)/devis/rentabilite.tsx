'use client';

import { aUnCout, coefficientMinimum, euro, margeLigne, pourcent, rentabilite, type LigneDocument, type ReglagesPrix } from '@chantio/shared';

const coefTexte = (n: number) => n.toFixed(2).replace('.', ',');
/** Position d'un coefficient sur les barres « Coefficients par ligne » (de 1 à 2,5). */
const echelle = (k: number) => `${Math.max(0, Math.min(100, ((k - 1) / 1.5) * 100))}%`;

/**
 * Rentabilité du devis, jamais imprimée : fournitures et main-d'œuvre
 * (déboursé sec), frais généraux, prix de revient, marges, puis le
 * coefficient de chaque ligne et sa marge nette.
 */
export function Rentabilite({
  lignes,
  remise,
  coef,
  rp,
  appliquer,
  allerALigne,
}: {
  lignes: (LigneDocument & { cle: number })[];
  remise: number;
  coef: number;
  rp: ReglagesPrix;
  appliquer: (coefficient: number) => void;
  allerALigne: (cle: number) => void;
}) {
  const r = rentabilite({ lignes, remise }, rp);
  const part = (v: number) => `${r.prixVente > 0 ? Math.max(0, Math.min(100, (v / r.prixVente) * 100)) : 0}%`;
  const mini = r.sousMinimum ? coefficientMinimum({ lignes, remise }, rp) : null;
  const parLigne = lignes.filter((l) => !l.titre && aUnCout(l)).map((l) => ({ l, ...margeLigne(l, coef, rp) }));

  return (
    <div className="carte bloc">
      <div className="bloc-titre">
        <h2>Rentabilité</h2>
        <span className="surtitre">Jamais imprimée</span>
      </div>
      <div className="renta-barre" aria-hidden="true">
        <i style={{ width: part(r.fournitures), background: 'var(--pervenche)' }} />
        <i style={{ width: part(r.mainOeuvre), background: 'var(--cobalt)' }} />
        <i style={{ width: part(r.fraisGeneraux), background: 'var(--lavande)' }} />
        <i style={{ width: part(r.margeNette), background: 'var(--menthe)' }} />
      </div>
      <div className="legende">
        <span>
          <i style={{ background: 'var(--pervenche)' }} />
          Fournitures
        </span>
        <span>
          <i style={{ background: 'var(--cobalt)' }} />
          Main-d’œuvre
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
      <dl className="renta-lignes">
        <div>
          <dt>Fournitures</dt>
          <dd>{euro(r.fournitures)}</dd>
        </div>
        <div>
          <dt>
            Main-d’œuvre ({String(+r.heures.toFixed(1)).replace('.', ',')} h × {euro(rp.cout_horaire)})
          </dt>
          <dd>{euro(r.mainOeuvre)}</dd>
        </div>
        <div className="fort">
          <dt>Déboursé sec</dt>
          <dd>{euro(r.debourse)}</dd>
        </div>
        <div>
          <dt>Frais généraux ({pourcent(rp.frais_generaux)} du déboursé)</dt>
          <dd>{euro(r.fraisGeneraux)}</dd>
        </div>
        <div>
          <dt>Prix de revient</dt>
          <dd>{euro(r.prixRevient)}</dd>
        </div>
        <div className="fort">
          <dt>Prix de vente HT{remise ? ', remise déduite' : ''}</dt>
          <dd>{euro(r.prixVente)}</dd>
        </div>
        <div>
          <dt>Marge brute</dt>
          <dd>
            {euro(r.margeBrute)} · {pourcent(r.tauxMargeBrute)}
          </dd>
        </div>
        <div className={`fort ${r.prixVente > 0 ? (r.sousMinimum ? 'ko' : 'ok') : ''}`}>
          <dt>Marge nette</dt>
          <dd>
            {euro(r.margeNette)} · {pourcent(r.tauxMargeNette)}
          </dd>
        </div>
        <div>
          <dt>Coefficient réel (prix de vente ÷ déboursé)</dt>
          <dd>× {coefTexte(r.coefficientReel)}</dd>
        </div>
      </dl>
      {r.prixVente > 0 &&
        (r.sousMinimum ? (
          <div className="renta-alerte ko">
            <span>Marge nette sous votre minimum de {pourcent(rp.marge_min)}.</span>
            {mini ? (
              <button className="btn petit" type="button" onClick={() => appliquer(mini)}>
                Passer le coefficient global à × {coefTexte(mini)}
              </button>
            ) : (
              <span>Remontez les lignes en rouge ci-dessous.</span>
            )}
          </div>
        ) : (
          <div className="renta-alerte ok">Marge nette au-dessus de votre minimum de {pourcent(rp.marge_min)}.</div>
        ))}
      {r.sansCout > 0 && (
        <p className="note-tva">
          {r.sansCout} ligne{r.sansCout > 1 ? 's n’ont' : ' n’a'} pas de coût : la marge réelle est plus basse que celle affichée.
        </p>
      )}
      {parLigne.length > 0 && (
        <>
          <h3 className="renta-titre">Coefficients par ligne</h3>
          <ul className="coefs">
            {parLigne.map(({ l, coefficient, propre, tauxMargeNette, sousMinimum }) => (
              <li key={l.cle}>
                <button type="button" className={[propre && 'perso', sousMinimum && 'bas'].filter(Boolean).join(' ')} onClick={() => allerALigne(l.cle)} title="Aller à la ligne">
                  <span className="coefs-nom">{l.designation}</span>
                  <span className="coefs-barre" aria-hidden="true">
                    <i style={{ width: echelle(coefficient) }} />
                    <em style={{ left: echelle(coef) }} />
                  </span>
                  <span className="coefs-val">× {coefTexte(coefficient)}</span>
                  <span className="coefs-marge">{pourcent(tauxMargeNette)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="legende">
            <span>
              <i style={{ background: 'var(--cobalt)' }} />
              Coefficient propre
            </span>
            <span>
              <i style={{ background: 'var(--lavande)' }} />
              Suit le global (trait noir)
            </span>
            <span>
              <i style={{ background: 'var(--rouge)' }} />
              Marge nette sous {pourcent(rp.marge_min)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
