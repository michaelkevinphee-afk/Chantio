'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { CATEGORIES_ARTICLE, euro, nombre, UNITES } from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import type { ArticleLu } from '@/lib/devis';
import { enregistrerArticle, importerTarif, retirerArticle, type ArticleAEnregistrer } from '../actions';
import { Ecran, Picto, type NomPicto } from '../composants';

const prix = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');

function vignette(a: ArticleLu): NomPicto {
  if (a.categorie === 'Main-d’œuvre') return 'cle';
  if (a.categorie === 'Déplacements') return 'camion';
  if (/chaudi|radiateur|chauff|thermostat/i.test(a.designation)) return 'flamme';
  if (/tube|cuivre|pvc|per\b|multicouche/i.test(a.designation)) return 'tube';
  if (/recherche|fuite|diagnostic/i.test(a.designation)) return 'recherche';
  return 'goutte';
}

/** Lecture d'un tarif CSV : désignation ; unité ; prix d'achat ; prix de vente ; TVA ; référence ; catégorie. */
function lireCsv(texte: string): ArticleAEnregistrer[] {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const sep = (lignes[0].match(/;/g)?.length ?? 0) >= (lignes[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cellules = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  let entete = cellules(lignes[0]).map((c) => c.toLowerCase());
  const aEntete = entete.some((c) => /d[ée]signation|libell|article|prix/.test(c));
  if (!aEntete) entete = ['designation', 'unite', 'achat', 'vente', 'tva', 'reference', 'categorie'];
  const col = (re: RegExp, defaut: number) => {
    const i = entete.findIndex((c) => re.test(c));
    return i >= 0 ? i : aEntete ? -1 : defaut;
  };
  const iD = col(/d[ée]signation|libell|article/, 0);
  const iU = col(/unit/, 1);
  const iA = col(/achat|co[uû]t|net/, 2);
  const iV = col(/vente|public|ttc|ht/, 3);
  const iT = col(/tva/, 4);
  const iR = col(/r[ée]f/, 5);
  const iC = col(/cat[ée]gorie|famille/, 6);
  return (aEntete ? lignes.slice(1) : lignes).map((l) => {
    const c = cellules(l);
    const achat = iA >= 0 ? nombre(c[iA]) : 0;
    const vente = iV >= 0 ? nombre(c[iV]) : 0;
    return {
      designation: c[iD] ?? '',
      unite: (iU >= 0 && c[iU]) || 'u',
      prix_achat: achat,
      prix_vente: vente || Math.round(achat * 1.6 * 100) / 100,
      tva: iT >= 0 ? nombre(c[iT]) || 10 : 10,
      reference: iR >= 0 ? (c[iR] ?? '') : '',
      categorie: (iC >= 0 && c[iC]) || 'Fournitures',
    };
  });
}

export function Catalogue({ articles }: { articles: ArticleLu[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [filtre, setFiltre] = useState('Tout');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<ArticleLu | null>(null);
  const [f, setF] = useState({ designation: '', categorie: 'Fournitures', unite: 'u', achat: '', coef: '1,6', vente: '', tva: 10, reference: '' });
  const [prixFixe, setPrixFixe] = useState(false);
  const champDes = useRef<HTMLInputElement>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const autres = [...new Set(articles.map((a) => a.categorie))].filter((c) => !(CATEGORIES_ARTICLE as readonly string[]).includes(c));
    return ['Tout', ...CATEGORIES_ARTICLE, ...autres];
  }, [articles]);
  const liste = articles.filter(
    (a) => (filtre === 'Tout' || a.categorie === filtre) && (!recherche.trim() || (a.designation + (a.reference ?? '')).toLowerCase().includes(recherche.trim().toLowerCase())),
  );

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, []);

  const ouvrir = (a: ArticleLu | null) => {
    setEdite(a);
    setPrixFixe(false);
    setF(
      a
        ? {
            designation: a.designation,
            categorie: a.categorie,
            unite: a.unite,
            achat: prix(a.prix_achat),
            coef: a.prix_achat ? (a.prix_vente / a.prix_achat).toFixed(2).replace('.', ',') : '',
            vente: prix(a.prix_vente),
            tva: a.tva,
            reference: a.reference ?? '',
          }
        : { designation: '', categorie: 'Fournitures', unite: 'u', achat: '', coef: '1,6', vente: '', tva: 10, reference: '' },
    );
    setOuvert(true);
    setTimeout(() => champDes.current?.focus(), 200);
  };

  const achat = nombre(f.achat);
  const vente = prixFixe || !achat ? nombre(f.vente) : Math.round(achat * nombre(f.coef) * 100) / 100;
  const marge = vente - achat;
  const taux = vente ? (marge / vente) * 100 : 0;

  const enregistrer = () =>
    demarrer(async () => {
      const r = await enregistrerArticle({
        id: edite?.id,
        designation: f.designation,
        categorie: f.categorie,
        unite: f.unite,
        reference: f.reference,
        prix_achat: achat,
        prix_vente: vente,
        tva: f.tva,
      });
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setOuvert(false);
      annoncer('Article enregistré : disponible dans vos devis et factures');
      router.refresh();
    });

  const retirer = () =>
    edite &&
    demarrer(async () => {
      const r = await retirerArticle(edite.id);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setOuvert(false);
      annoncer('Article retiré du catalogue');
      router.refresh();
    });

  const importer = async (fichiers: FileList | null) => {
    const fi = fichiers?.[0];
    if (!fi) return;
    if (!/\.(csv|txt)$/i.test(fi.name)) {
      annoncer('Enregistrez votre tarif en CSV depuis Excel, puis importez-le', 'erreur');
      return;
    }
    const lignes = lireCsv(await fi.text());
    demarrer(async () => {
      const r = await importerTarif(lignes);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(`Tarif importé : ${r.nombre} articles`);
      router.refresh();
    });
    if (fichier.current) fichier.current.value = '';
  };

  return (
    <Ecran label="Catalogue">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/devis" style={{ color: 'inherit' }}>
              Devis et factures
            </Link>{' '}
            · Produits et services
          </div>
          <h1>Catalogue</h1>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => fichier.current?.click()} disabled={enCours} title="Fichier CSV : désignation ; unité ; prix d’achat ; prix de vente ; TVA ; référence ; catégorie">
            {enCours ? <Roue /> : <Picto nom="importer" />}
            Importer un tarif fournisseur
          </button>
          <input ref={fichier} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => importer(e.target.files)} />
          <button className="btn plein" type="button" onClick={() => ouvrir(null)}>
            <Picto nom="plus" epaisseur={2.4} />
            Nouvel article
          </button>
        </div>
      </div>
      <div className="carte">
        <div className="cat-tete">
          <div className="puces">
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={c === filtre} onClick={() => setFiltre(c)}>
                {c}
                <span>{c === 'Tout' ? articles.length : articles.filter((a) => a.categorie === c).length}</span>
              </button>
            ))}
          </div>
          <label className="recherche">
            <Picto nom="recherche" />
            <input type="search" placeholder="Chercher un article" aria-label="Chercher un article" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        <div className="tableau-zone">
          <table className="liste">
            <thead>
              <tr>
                <th>Article</th>
                <th>Unité</th>
                <th className="droite">Achat HT</th>
                <th className="droite">Vente HT</th>
                <th>Marge</th>
                <th>TVA</th>
                <th>Utilisé</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((a) => {
                const t = a.prix_vente ? ((a.prix_vente - a.prix_achat) / a.prix_vente) * 100 : 0;
                return (
                  <tr key={a.id} tabIndex={0} onClick={() => ouvrir(a)} onKeyDown={(e) => e.key === 'Enter' && ouvrir(a)}>
                    <td>
                      <div className="art">
                        <span className="vignette">
                          <Picto nom={vignette(a)} taille={19} epaisseur={2} />
                        </span>
                        <div>
                          <b>{a.designation}</b>
                          <span>
                            {a.categorie}
                            {a.reference ? ` · ${a.reference}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{a.unite}</td>
                    <td className="droite montant" style={{ color: 'var(--gris)' }}>
                      {euro(a.prix_achat)}
                    </td>
                    <td className="droite montant">{euro(a.prix_vente)}</td>
                    <td>
                      <span className="marge">
                        <span className="jauge-l">
                          <i style={{ width: `${Math.max(0, Math.min(100, t))}%` }} />
                        </span>
                        {t.toFixed(0)} %
                      </span>
                    </td>
                    <td>
                      <span className={`pastille ${a.tva === 5.5 ? 'p-vert' : 'p-gris'}`}>{String(a.tva).replace('.', ',')} %</span>
                    </td>
                    <td className="num" style={{ color: 'var(--gris)' }}>
                      {a.utilisations} fois
                    </td>
                  </tr>
                );
              })}
              {!liste.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gris)', padding: 30 }}>
                    {articles.length ? 'Aucun article ne correspond.' : 'Catalogue vide : ajoutez vos articles un par un, ou importez le tarif de votre fournisseur.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ouvert && <div className="voile ouvert" onClick={() => setOuvert(false)} />}
      {ouvert && (
      <aside className="volet ouvert" aria-label="Article du catalogue">
        <div className="volet-haut">
          <div>
            <div className="surtitre" style={{ color: 'var(--cobalt)' }}>
              Catalogue
            </div>
            <h2>{edite ? edite.designation : 'Nouvel article'}</h2>
          </div>
          <button className="fermer" type="button" aria-label="Fermer" onClick={() => setOuvert(false)}>
            <Picto nom="croix" taille={18} epaisseur={2.4} />
          </button>
        </div>
        <div className="volet-corps">
          <div className="champs">
            <div className="large">
              <div className="etiq">Désignation</div>
              <input ref={champDes} className="saisie" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="ex. Mitigeur thermostatique douche" />
            </div>
            <div>
              <div className="etiq">Catégorie</div>
              <select className="saisie" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
                {categories.slice(1).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="etiq">Unité</div>
              <select className="saisie" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>
                {[...new Set([...UNITES, f.unite])].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="etiq">Prix d’achat HT</div>
              <input className="saisie" inputMode="decimal" value={f.achat} onChange={(e) => setF({ ...f, achat: e.target.value })} />
            </div>
            {prixFixe || !achat ? (
              <div>
                <div className="etiq">Prix de vente HT</div>
                <input className="saisie" inputMode="decimal" value={f.vente} onChange={(e) => setF({ ...f, vente: e.target.value })} />
              </div>
            ) : (
              <div>
                <div className="etiq">Coefficient</div>
                <input className="saisie" inputMode="decimal" value={f.coef} onChange={(e) => setF({ ...f, coef: e.target.value })} />
              </div>
            )}
            <div>
              <div className="etiq">TVA par défaut</div>
              <select className="saisie" value={f.tva} onChange={(e) => setF({ ...f, tva: +e.target.value })}>
                <option value={10}>10 %</option>
                <option value={5.5}>5,5 %</option>
                <option value={20}>20 %</option>
              </select>
            </div>
            <div>
              <div className="etiq">Référence fournisseur</div>
              <input className="saisie" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </div>
          </div>
          <div className="calcul-marge">
            <div>
              <small>Prix de vente HT</small>
              <b>{euro(vente)}</b>
            </div>
            <div>
              <small>Marge brute</small>
              <b>{euro(marge)}</b>
            </div>
            <div>
              <small>Taux de marque</small>
              <b>{taux.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</b>
            </div>
          </div>
          <div className="note-tva">
            {achat ? (
              <>
                Le prix de vente se calcule avec le coefficient.{' '}
                <button
                  type="button"
                  style={{ border: 0, background: 'none', padding: 0, color: 'var(--cobalt)', fontWeight: 700 }}
                  onClick={() => {
                    setF({ ...f, vente: prix(vente) });
                    setPrixFixe((v) => !v);
                  }}
                >
                  {prixFixe ? 'Revenir au coefficient' : 'Saisir un prix fixe'}
                </button>
              </>
            ) : (
              'Sans prix d’achat (main-d’œuvre, forfait), saisissez directement le prix de vente.'
            )}
          </div>
        </div>
        <div className="volet-pied">
          {edite && (
            <button className="btn fantome" type="button" style={{ color: 'var(--rouge)', marginRight: 'auto' }} onClick={retirer} disabled={enCours}>
              Retirer
            </button>
          )}
          <button className="btn" type="button" onClick={() => setOuvert(false)}>
            Annuler
          </button>
          <button className="btn plein" type="button" onClick={enregistrer} disabled={enCours}>
            {enCours && <Roue />}
            Enregistrer l’article
          </button>
        </div>
      </aside>
      )}
    </Ecran>
  );
}
