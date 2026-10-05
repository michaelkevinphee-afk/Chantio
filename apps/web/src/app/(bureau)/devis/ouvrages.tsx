'use client';

// Lignes du document dans l'éditeur, comme blocLignes() du bac : lots (nom, nombre de lignes, sous-total,
// « + Ajouter ici »), ouvrages (désignation, coût, quantité avec − et +, métré, prix unitaire et coefficient
// de la ligne, total), recherche rapide, « + Lot », « + Ligne libre », cadre de réponse d'un appel d'offres.

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  arrondi,
  debourseUnitaire,
  euroBac,
  lireDpgf,
  nombre,
  nombreBac,
  quantiteMetre,
  type ContextePrix,
  type LigneDocument,
  type Metre,
  type Produit,
  type ReglagesPrix,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { annoncer } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { lireTableur } from '@/lib/tableur';
import { RechercheRapide } from './recherche-rapide';

/** Ligne de l'éditeur : une clé stable en plus (jamais enregistrée). */
export type LigneEd = LigneDocument & { cle: string };

const UNITES_BAC = ['u', 'm²', 'ml', 'm³', 'h', 'forfait', 'ens', 'visite'];
const metrable = (u: string) => u === 'm²' || u === 'ml' || u === 'm³';

/** detailMetre() du bac : « 9,6 × 2,5 × 2 − 3,6 + 10 % ». */
function detailMetre(m: Metre, u: string) {
  return (
    nombreBac(m.longueur) +
    (u !== 'ml' ? ` × ${nombreBac(m.largeur)}` : '') +
    (u === 'm³' ? ` × ${nombreBac(Number(m.hauteur) || 0)}` : '') +
    (m.nombre > 1 ? ` × ${nombreBac(m.nombre)}` : '') +
    (m.deduction ? ` − ${nombreBac(m.deduction)}` : '') +
    (m.chute ? ` + ${nombreBac(m.chute)} %` : '')
  );
}

/** Champ numérique : saisie libre (« 12,5 »), validée en quittant le champ ou avec Entrée, comme le bac. */
export function ChampNombre({
  valeur,
  onValider,
  ...props
}: { valeur: number; onValider: (n: number) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [texte, setTexte] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      {...props}
      value={texte ?? nombreBac(valeur)}
      onFocus={(e) => {
        setTexte(nombreBac(valeur));
        props.onFocus?.(e);
      }}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        if (texte !== null && texte !== nombreBac(valeur)) onValider(nombre(texte));
        setTexte(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export function Ouvrages({
  lignes,
  modifier,
  coef,
  rp,
  tva,
  ao,
  produits,
  prix,
  articlesConnus,
  ajouterProduit,
  nouvelleCle,
}: {
  lignes: LigneEd[];
  /** Change les lignes (les prix calculés et les forfaits sont refaits par l'éditeur). */
  modifier: (f: (l: LigneEd[]) => LigneEd[]) => void;
  coef: number;
  rp: ReglagesPrix;
  tva: number;
  /** Appel d'offres aux quantités imposées par le client (DPGF ou DQE). */
  ao: boolean;
  produits: Produit[];
  prix: ContextePrix;
  articlesConnus: { id: string; designation: string; unite: string; prix_achat: number; heures: number }[];
  ajouterProduit: (p: Produit) => LigneEd;
  nouvelleCle: () => string;
}) {
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  const [cibleChoisie, setCible] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Champ à rendre actif après le prochain affichage (nouvelle ligne).
  const aFocaliser = useRef<{ cle: string; champ: 'q' | 'titre' | 'lot' } | null>(null);
  const setFocus = (f: { cle: string; champ: 'q' | 'titre' | 'lot' }) => (aFocaliser.current = f);
  const [metre, setMetre] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);
  const racine = useRef<HTMLDivElement>(null);

  const lots = lignes.flatMap((l, k) => (l.titre ? [{ k, nom: l.designation }] : []));
  const cible = cibleChoisie !== null && lignes[cibleChoisie]?.titre ? cibleChoisie : lots.length ? lots[lots.length - 1].k : -1;

  // Après un ajout : la quantité (ou le nom) de la nouvelle ligne prend le focus, comme le bac.
  useEffect(() => {
    const focus = aFocaliser.current;
    if (!focus) return;
    const sel = focus.champ === 'q' ? `[data-q="${focus.cle}"]` : focus.champ === 'lot' ? `[data-lot="${focus.cle}"]` : `[data-titre="${focus.cle}"]`;
    const el = racine.current?.querySelector<HTMLInputElement>(sel);
    if (el) {
      aFocaliser.current = null;
      el.focus();
      el.select();
    }
  });
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1700);
    return () => clearTimeout(t);
  }, [flash]);

  const maj = (cle: string, patch: Partial<LigneDocument>) => modifier((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));
  const supprimer = (cle: string) => modifier((ls) => ls.filter((l) => l.cle !== cle));
  const sousTotal = (k: number) => {
    let t = 0;
    for (let i = k + 1; i < lignes.length && !lignes[i].titre; i++) t += lignes[i].quantite * lignes[i].prix_unitaire;
    return t;
  };
  const nbLignes = (k: number) => {
    let n = 0;
    for (let i = k + 1; i < lignes.length && !lignes[i].titre; i++) n++;
    return n;
  };

  const ajouterCatalogue = (p: Produit) => {
    const l = ajouterProduit(p);
    let pos = lignes.length;
    if (cible >= 0) {
      pos = cible + 1;
      while (pos < lignes.length && !lignes[pos].titre) pos++;
    }
    modifier((ls) => [...ls.slice(0, pos), l, ...ls.slice(pos)]);
    setFlash(l.cle);
    setFocus({ cle: l.cle, champ: 'q' });
    annoncer(`${p.designation} ajouté${cible >= 0 && lignes[cible] ? ` dans « ${lignes[cible].designation} »` : ''}`);
  };
  const ligneLibre = (designation: string, ouvrir = true) => {
    const l: LigneEd = { cle: nouvelleCle(), designation, quantite: 1, unite: 'u', prix_unitaire: 0, tva, achat: 0, heures: 0, coefficient: null, prix_calcule: true };
    modifier((ls) => [...ls, l]);
    if (ouvrir) setOuverts((o) => new Set(o).add(l.cle));
    setFocus({ cle: l.cle, champ: 'titre' });
  };
  const ajouterLot = () => {
    const l: LigneEd = { cle: nouvelleCle(), titre: true, designation: `Lot ${lots.length + 1} · Nouveau lot`, quantite: 0, unite: 'u', prix_unitaire: 0, tva };
    modifier((ls) => [...ls, l]);
    setCible(lignes.length);
    setFocus({ cle: l.cle, champ: 'lot' });
  };
  const viser = (k: number) => {
    setCible(k);
    const q = racine.current?.querySelector<HTMLInputElement>('#recherche input');
    q?.focus();
    q?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const importerDpgf = async (fichiers: FileList | null) => {
    const fi = fichiers?.[0];
    if (fichier.current) fichier.current.value = '';
    if (!fi) return;
    setLecture(true);
    try {
      const r = lireDpgf(await lireTableur(fi), articlesConnus.filter((a) => a.prix_achat > 0 || a.heures > 0), tva);
      if (!r) {
        annoncer('Aucun tableau reconnu : il faut une colonne « Désignation » et une colonne « Quantité ».', 'erreur');
        return;
      }
      modifier(() => r.lignes.map((l) => ({ ...l, cle: nouvelleCle() })));
      const reste = r.postes - r.retrouves;
      annoncer(
        `DPGF lue : ${r.postes} poste${r.postes > 1 ? 's' : ''}, quantités du client conservées${r.retrouves ? `, ${r.retrouves} retrouvé${r.retrouves > 1 ? 's' : ''} dans vos produits` : ''}${reste ? `, ${reste} à chiffrer` : ''}`,
      );
    } catch (e) {
      annoncer(e instanceof Error ? e.message : 'Ce fichier est illisible.', 'erreur');
    } finally {
      setLecture(false);
    }
  };

  if (ao && !lignes.length)
    return (
      <div className="carte" style={{ alignItems: 'flex-start' }}>
        <h2>Cadre de réponse du client</h2>
        <p className="gris">
          Dans un appel d’offres, le client fournit un tableau à remplir (DPGF ou DQE) avec ses quantités. Chantio le lit, vous retrouvez vos ouvrages, et le
          coefficient global calcule les prix.
        </p>
        <input ref={fichier} type="file" hidden accept=".xlsx,.xls,.csv,.ods" onChange={(e) => importerDpgf(e.target.files)} />
        <button className="bouton" type="button" disabled={lecture} onClick={() => fichier.current?.click()}>
          {lecture ? 'Lecture en cours…' : 'Importer la DPGF Excel du client'}
        </button>
      </div>
    );

  const ligneMetre = lignes.find((l) => l.cle === metre);

  return (
    <div className="carte" ref={racine}>
      <div className="titre-carte">
        <h2>{ao ? 'DPGF · réponse du lot' : 'Ouvrages'}</h2>
        {ao ? (
          <span className="gris petit-txt">Quantités imposées par le client</span>
        ) : (
          <div className="barre-outils">
            <button className="bouton second petit" type="button" onClick={ajouterLot}>
              + Lot
            </button>
            <button className="bouton second petit" type="button" onClick={() => ligneLibre('Nouvelle ligne')}>
              + Ligne libre
            </button>
          </div>
        )}
      </div>
      {!ao && (
        <RechercheRapide
          produits={produits}
          prix={prix}
          lots={lots}
          cible={cible}
          choisirCible={setCible}
          ajouter={ajouterCatalogue}
          ligneLibre={(t) => ligneLibre(t)}
        />
      )}
      <div className="ouvrages">
        {!lignes.length && <div className="vide">Aucune ligne. Cherchez un produit ou un service ci-dessus.</div>}
        {lignes.map((l, k) => {
          if (l.titre) {
            const n = nbLignes(k);
            return (
              <div key={l.cle} className={`lot-tete${k === cible ? ' cible' : ''}`}>
                <input
                  type="text"
                  className="lot-nom"
                  value={l.designation}
                  data-lot={l.cle}
                  aria-label="Nom du lot"
                  onChange={(e) => maj(l.cle, { designation: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <span className="lot-info">
                  {n} ligne{n > 1 ? 's' : ''}
                </span>
                <span className="lot-total">{euroBac(sousTotal(k))}</span>
                {!ao && (
                  <button type="button" className="bouton second petit" onClick={() => viser(k)}>
                    + Ajouter ici
                  </button>
                )}
                <button
                  className="icone"
                  type="button"
                  aria-label="Supprimer le lot"
                  title="Supprimer le lot"
                  onClick={() => {
                    if (k === cible) setCible(null);
                    supprimer(l.cle);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          }
          return (
            <LigneOuvrage
              key={l.cle}
              l={l}
              coef={coef}
              rp={rp}
              ao={ao}
              flash={flash === l.cle}
              ouvert={ouverts.has(l.cle)}
              basculer={() =>
                setOuverts((o) => {
                  const n = new Set(o);
                  if (n.has(l.cle)) n.delete(l.cle);
                  else n.add(l.cle);
                  return n;
                })
              }
              maj={(p) => maj(l.cle, p)}
              supprimer={() => supprimer(l.cle)}
              ouvrirMetre={() => setMetre(l.cle)}
            />
          );
        })}
      </div>
      <p className="gris petit-txt">
        Prix unitaire = (fourniture + temps de pose × {euroBac(rp.cout_horaire)}) × coefficient. Chaque ligne suit le coefficient global, sauf si vous lui
        donnez le sien (en bleu). Les coûts ne sont jamais imprimés.
      </p>
      {ligneMetre && (
        <FenetreMetre
          l={ligneMetre}
          rp={rp}
          fermer={() => setMetre(null)}
          reporter={(m, q) => {
            maj(ligneMetre.cle, { metre: m, quantite: q });
            setMetre(null);
            annoncer(`Quantité reportée : ${nombreBac(q)} ${ligneMetre.unite}`);
          }}
        />
      )}
    </div>
  );
}

function LigneOuvrage({
  l,
  coef,
  rp,
  ao,
  flash,
  ouvert,
  basculer,
  maj,
  supprimer,
  ouvrirMetre,
}: {
  l: LigneEd;
  coef: number;
  rp: ReglagesPrix;
  ao: boolean;
  flash: boolean;
  ouvert: boolean;
  basculer: () => void;
  maj: (p: Partial<LigneDocument>) => void;
  supprimer: () => void;
  ouvrirMetre: () => void;
}) {
  const fixe = !!l.forfait || !l.prix_calcule;
  const coutU = debourseUnitaire(l, rp);
  const unites = UNITES_BAC.includes(l.unite) ? UNITES_BAC : [...UNITES_BAC, l.unite];
  const changerQuantite = (q: number) => maj({ quantite: Math.max(0, arrondi(q)), metre: null });
  const changerCoef = (v: number) => {
    if (!v || Math.abs(v - coef) < 0.005) maj({ coefficient: null });
    else if (v < 1 || v > 3) annoncer('Coefficient entre 1 et 3', 'erreur');
    else {
      maj({ coefficient: arrondi(v) });
      annoncer(`Coefficient ${nombreBac(arrondi(v))} pour « ${l.designation} »`);
    }
  };
  return (
    <div className={`ouv${flash ? ' flash' : ''}`} data-ligne={l.cle}>
      <div className="ouv-txt">
        {l.reference && <span className="ref">{l.reference}</span>}
        <input
          type="text"
          className="ouv-titre"
          value={l.designation}
          data-titre={l.cle}
          aria-label="Désignation"
          onChange={(e) => maj({ designation: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="ouv-sous">
          {l.forfait ? (
            <span className="chip">{l.forfait === 'depl' ? 'Forfait déplacement' : 'Taux horaire dépannage'}</span>
          ) : fixe ? (
            <span className="chip">Prix fixe</span>
          ) : (
            <>
              <span className="chip">{l.achat ? `Fourniture ${euroBac(l.achat)}` : 'Sans fourniture'}</span>
              <span className="chip">{l.heures ? `Pose ${nombreBac(l.heures)} h` : 'Sans pose'}</span>
              <span className="chip prive-chip" title="Visible seulement par le bureau">
                Coût {euroBac(coutU)} / {l.unite}
              </span>
              <button type="button" className="lien" aria-expanded={ouvert} onClick={basculer}>
                {ouvert ? 'Fermer' : 'Modifier le coût'}
              </button>
            </>
          )}
        </div>
        {ouvert && !fixe && (
          <div className="ouv-detail">
            <label>
              Fourniture achetée
              <span className="saisie-u">
                <ChampNombre valeur={Number(l.achat) || 0} onValider={(v) => maj({ achat: Math.max(0, v) })} />
                <i>€ / {l.unite}</i>
              </span>
            </label>
            <label>
              Temps de pose
              <span className="saisie-u">
                <ChampNombre valeur={Number(l.heures) || 0} onValider={(v) => maj({ heures: Math.max(0, v) })} />
                <i>h / {l.unite}</i>
              </span>
            </label>
            <label>
              Unité
              <select value={l.unite} onChange={(e) => maj({ unite: e.target.value })}>
                {unites.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      <div className="ouv-qte">
        <div className="pas">
          {!ao && (
            <button type="button" aria-label="Moins" onClick={() => changerQuantite((l.quantite || 0) - 1)}>
              −
            </button>
          )}
          {ao ? (
            <input type="text" value={nombreBac(l.quantite)} readOnly title="Quantité imposée par le client" aria-label="Quantité" />
          ) : (
            <ChampNombre valeur={l.quantite} data-q={l.cle} aria-label="Quantité" onValider={changerQuantite} />
          )}
          {!ao && (
            <button type="button" aria-label="Plus" onClick={() => changerQuantite((l.quantite || 0) + 1)}>
              +
            </button>
          )}
          <span className="unite">{l.unite}</span>
        </div>
        {!ao && metrable(l.unite) && (
          <button type="button" className="metre-btn" onClick={ouvrirMetre}>
            {l.metre ? `Métré : ${detailMetre(l.metre, l.unite)}` : 'Calculer le métré'}
          </button>
        )}
      </div>
      <div className="ouv-pu">
        <small>Prix unitaire</small>
        {fixe && !l.forfait ? (
          <ChampNombre className="pu-fixe" valeur={l.prix_unitaire} aria-label="Prix unitaire HT" onValider={(v) => maj({ prix_unitaire: arrondi(v) })} />
        ) : (
          <span>{euroBac(l.prix_unitaire)}</span>
        )}
        {fixe ? (
          <span className="coef-fixe">prix fixe</span>
        ) : (
          <span
            className={`coef-l${l.coefficient ? ' perso' : ''}`}
            title={l.coefficient ? 'Coefficient propre à cette ligne' : 'Coefficient global. Modifiez-le pour cette ligne seulement'}
          >
            <span>×</span>
            <ChampNombre valeur={l.coefficient || coef} data-coef={l.cle} aria-label="Coefficient de la ligne" onValider={changerCoef} />
            {!!l.coefficient && (
              <button type="button" title="Revenir au coefficient global" aria-label="Revenir au coefficient global" onClick={() => maj({ coefficient: null })}>
                ↺
              </button>
            )}
          </span>
        )}
      </div>
      <div className="ouv-tot">
        <small>Total HT</small>
        <b>{euroBac(l.quantite * l.prix_unitaire)}</b>
      </div>
      <button className="icone ouv-sup" type="button" aria-label="Supprimer la ligne" title="Supprimer" onClick={supprimer}>
        ✕
      </button>
    </div>
  );
}

/** fenetreMetre() du bac : longueur × hauteur (ou largeur) × nombre, moins les ouvertures, plus la chute. */
function FenetreMetre({ l, rp, fermer, reporter }: { l: LigneEd; rp: ReglagesPrix; fermer: () => void; reporter: (m: Metre, q: number) => void }) {
  const [m, setM] = useState<Metre>(
    () => l.metre ?? { longueur: 1, largeur: 1, hauteur: 1, nombre: 1, deduction: 0, chute: l.unite === 'm²' ? rp.chute : 0 },
  );
  const deux = l.unite !== 'ml';
  const volume = l.unite === 'm³';
  const q = quantiteMetre(m, l.unite);
  const champ = (k: keyof Metre, lib: string) => (
    <label className="champ" key={k}>
      {lib}
      <input type="text" inputMode="decimal" defaultValue={nombreBac(Number(m[k]) || 0)} onChange={(e) => setM((x) => ({ ...x, [k]: Math.max(0, nombre(e.target.value)) }))} />
    </label>
  );
  return (
    <Fenetre
      titre={`Métré · ${l.designation}`}
      fermer={fermer}
      pied={
        <>
          <Bouton type="button" variante="secondaire" data-fermer>
            Annuler
          </Bouton>
          <Bouton type="button" onClick={() => reporter(volume ? m : { ...m, hauteur: 0, largeur: deux ? m.largeur : 1 }, q)}>
            Reporter la quantité
          </Bouton>
        </>
      }
    >
      <p className="gris petit-txt">
        {deux
          ? volume
            ? 'Volume = longueur × largeur × épaisseur × nombre, moins ce qui est à déduire, plus la chute.'
            : 'Surface = longueur × hauteur (ou largeur) × nombre, moins les ouvertures (portes, fenêtres), plus la chute.'
          : 'Longueur = longueur × nombre de tronçons, plus la chute.'}
      </p>
      <div className="ligne-champs">
        {champ('longueur', 'Longueur (m)')}
        {deux && champ('largeur', volume ? 'Largeur (m)' : 'Hauteur ou largeur (m)')}
        {volume && champ('hauteur', 'Épaisseur (m)')}
        {champ('nombre', 'Nombre')}
        {champ('deduction', `À déduire (${l.unite})`)}
        {champ('chute', 'Chute (%)')}
      </div>
      <div className="numero-grand" aria-live="polite">
        {nombreBac(q)} {l.unite}
      </div>
    </Fenetre>
  );
}
