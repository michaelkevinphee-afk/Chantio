'use client';

// Recherche rapide de produits et services dans l'éditeur, comme blocRecherche() du bac :
// champ toujours visible (touche « / »), puces de catégorie, « Ajouter dans » un lot,
// « Les plus utilisés » ou « N résultats », flèches et Entrée, « Créer une ligne « … » ».

import { useEffect, useId, useRef, useState } from 'react';
import {
  CATEGORIES_PRODUIT,
  FILTRES_PRODUITS,
  chercherProduits,
  euroBac,
  morceauxSurlignes,
  nombreBac,
  prixProduit,
  type CategorieProduit,
  type ContextePrix,
  type Produit,
} from '@chantio/shared';

function Surligne({ texte, q }: { texte: string; q: string }) {
  return (
    <>
      {morceauxSurlignes(texte, q).map((m, i) => (m.m ? <mark key={i}>{m.t}</mark> : <span key={i}>{m.t}</span>))}
    </>
  );
}

function meta(p: Produit): string {
  if (p.forfait) return p.forfait === 'depl' ? 'Prix fixe des réglages' : 'Taux horaire des réglages';
  if (p.prixFixe != null) return 'Prix fixe';
  return [p.achat ? `Fourniture ${euroBac(p.achat)}` : '', p.heures ? `Pose ${nombreBac(p.heures)} h` : ''].filter(Boolean).join(' · ');
}

export function RechercheRapide({
  produits,
  prix,
  lots,
  cible,
  choisirCible,
  ajouter,
  ligneLibre,
}: {
  produits: Produit[];
  prix: ContextePrix;
  /** Lots du document : position de la ligne de titre et nom. */
  lots: { k: number; nom: string }[];
  cible: number;
  choisirCible: (k: number) => void;
  ajouter: (p: Produit) => void;
  ligneLibre: (texte: string) => void;
}) {
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  const fermeture = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState<'tout' | CategorieProduit>('tout');
  const [ouvert, setOuvert] = useState(false);
  const [sel, setSel] = useState(0);
  const res = chercherProduits(produits, q, filtre);
  const choisi = Math.min(sel, Math.max(0, res.length - 1));

  // « / » ouvre la recherche depuis n'importe où dans l'éditeur (hors champ de saisie).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const t = document.activeElement?.tagName ?? '';
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(t) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        champ.current?.focus();
      }
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, []);

  const prendre = (p: Produit) => {
    setQ('');
    setSel(0);
    ajouter(p);
  };

  return (
    <div className={`recherche${ouvert ? ' ouverte' : ''}`} id="recherche">
      <div className="champ-r">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={champ}
          type="search"
          autoComplete="off"
          placeholder="Rechercher un produit ou un service : WC, faïence, fuite, cuivre…"
          aria-label="Rechercher un produit ou un service"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={`${id}-res`}
          value={q}
          onFocus={() => {
            clearTimeout(fermeture.current);
            setOuvert(true);
          }}
          onBlur={() => {
            // Laisse le temps au clic sur un résultat ; annulé si le champ reprend le focus entre-temps.
            fermeture.current = setTimeout(() => setOuvert(false), 120);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            setOuvert(true);
          }}
          onKeyDown={(e) => {
            const n = res.length;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((choisi + 1) % Math.max(1, n));
              setOuvert(true);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((choisi - 1 + n) % Math.max(1, n));
              setOuvert(true);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (res[choisi]) prendre(res[choisi]);
            } else if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
        <kbd>/</kbd>
      </div>
      <div className="r-pied">
        <div className="r-filtres" role="group" aria-label="Catégorie">
          {FILTRES_PRODUITS.map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              className={filtre === cle ? 'actif' : ''}
              aria-pressed={filtre === cle}
              onMouseDown={(e) => {
                e.preventDefault();
                setFiltre(cle);
                setSel(0);
                champ.current?.focus();
                setOuvert(true);
              }}
              onClick={() => setFiltre(cle)}
            >
              {libelle}
            </button>
          ))}
        </div>
        {lots.length > 0 && (
          <label className="r-cible">
            Ajouter dans
            <select value={cible} onChange={(e) => choisirCible(Number(e.target.value))}>
              {lots.map((l) => (
                <option key={l.k} value={l.k}>
                  {l.nom}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="r-res" id={`${id}-res`} role="listbox" aria-label="Produits et services" hidden={!ouvert}>
        {ouvert &&
          (res.length ? (
            <>
              <div className="r-titre">
                {q ? `${res.length} résultat${res.length > 1 ? 's' : ''}` : 'Les plus utilisés'}
                <span>↑ ↓ pour choisir, Entrée pour ajouter</span>
              </div>
              {res.map((p, n) => {
                const cat = CATEGORIES_PRODUIT[p.c];
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={n === choisi}
                    className={`r-item${n === choisi ? ' sel' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      prendre(p);
                    }}
                  >
                    <span className={`r-ic c-${p.c}`}>{cat[1]}</span>
                    <span className="r-txt">
                      <b>
                        <Surligne texte={p.designation} q={q} />
                      </b>
                      <small>
                        {cat[0]} · {meta(p)}
                      </small>
                    </span>
                    <span className="r-prix">
                      <b>{euroBac(prixProduit(p, prix))}</b>
                      <small>HT / {p.unite}</small>
                    </span>
                  </button>
                );
              })}
            </>
          ) : (
            <div className="r-vide">
              Aucun produit ni service pour « {q} ».{' '}
              <button
                type="button"
                className="lien"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const t = q;
                  setQ('');
                  ligneLibre(t);
                }}
              >
                Créer une ligne « {q} »
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
