'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CATEGORIES_FOURNISSEUR, euro, resteAPayer, type Fournisseur } from '@chantio/shared';
import { Ecran, Picto } from '../../devis/composants';
import { VoletFournisseur, type FactureDuFournisseur } from '../fournisseur';

export type FactureFournisseur = FactureDuFournisseur & { fournisseur_id: string; paye: number };

const initiales = (n: string) =>
  n
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?';

export function ListeFournisseurs({ fournisseurs, factures }: { fournisseurs: Fournisseur[]; factures: FactureFournisseur[] }) {
  const [filtre, setFiltre] = useState('Tous');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<Fournisseur | 'nouveau' | null>(null);

  const parFournisseur = useMemo(() => {
    const m = new Map<string, FactureFournisseur[]>();
    for (const a of factures) m.set(a.fournisseur_id, [...(m.get(a.fournisseur_id) ?? []), a]);
    return m;
  }, [factures]);
  const categories = ['Tous', ...CATEGORIES_FOURNISSEUR.filter((c) => fournisseurs.some((f) => f.categorie === c))];
  const q = recherche.trim().toLowerCase();
  const liste = fournisseurs.filter(
    (f) => (filtre === 'Tous' || f.categorie === filtre) && (!q || [f.nom, f.siret, f.email, f.categorie].join(' ').toLowerCase().includes(q)),
  );
  const resteDe = (id: string) =>
    (parFournisseur.get(id) ?? [])
      .filter((a) => a.statut === 'a_payer' || a.statut === 'planifie')
      .reduce((s, a) => s + (a.avoir ? -1 : 1) * resteAPayer(a, a.paye), 0);

  return (
    <Ecran label="Fournisseurs">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/achats" style={{ color: 'inherit' }}>
              Achats
            </Link>{' '}
            · {fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}
          </div>
          <h1>Fournisseurs</h1>
        </div>
        <div className="actions">
          <button className="btn plein" type="button" onClick={() => setOuvert('nouveau')}>
            <Picto nom="plus" epaisseur={2.4} />
            Nouveau fournisseur
          </button>
        </div>
      </div>
      <div className="carte">
        <div className="cat-tete">
          <div className="puces">
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={c === filtre} onClick={() => setFiltre(c)}>
                {c}
                <span>{c === 'Tous' ? fournisseurs.length : fournisseurs.filter((f) => f.categorie === c).length}</span>
              </button>
            ))}
          </div>
          <label className="recherche">
            <Picto nom="recherche" />
            <input type="search" placeholder="Chercher un fournisseur" aria-label="Chercher un fournisseur" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        <div className="tableau-zone">
          <table className="liste">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>SIRET</th>
                <th>Délai</th>
                <th>Factures</th>
                <th className="droite">Reste à payer</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((f) => {
                const n = parFournisseur.get(f.id)?.length ?? 0;
                const reste = resteDe(f.id);
                return (
                  <tr key={f.id} tabIndex={0} onClick={() => setOuvert(f)} onKeyDown={(e) => e.key === 'Enter' && setOuvert(f)}>
                    <td>
                      <div className="art">
                        <span className="vignette" style={{ fontWeight: 800, fontSize: 13, color: 'var(--cobalt)' }}>
                          {initiales(f.nom)}
                        </span>
                        <div>
                          <b>{f.nom}</b>
                          <span>
                            {f.categorie}
                            {f.lu_sur_facture && (
                              <span className="origine" style={{ marginLeft: 6, color: 'var(--violet)', fontSize: 12 }}>
                                À vérifier
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="ref">{f.siret ?? '·'}</td>
                    <td className="num">{f.delai_paiement} j</td>
                    <td className="num" style={{ color: 'var(--gris)' }}>
                      {n}
                    </td>
                    <td className="droite montant">{reste ? euro(reste) : '·'}</td>
                  </tr>
                );
              })}
              {!liste.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--gris)', padding: 30 }}>
                    {fournisseurs.length
                      ? 'Aucun fournisseur ne correspond.'
                      : 'Aucun fournisseur pour l’instant : ils sont créés à la lecture de vos factures, ou ajoutez-les ici.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ouvert && (
        <VoletFournisseur
          key={ouvert === 'nouveau' ? 'nouveau' : ouvert.id}
          fournisseur={ouvert === 'nouveau' ? null : ouvert}
          factures={ouvert === 'nouveau' ? undefined : (parFournisseur.get(ouvert.id) ?? [])}
          onFermer={() => setOuvert(null)}
        />
      )}
    </Ecran>
  );
}
