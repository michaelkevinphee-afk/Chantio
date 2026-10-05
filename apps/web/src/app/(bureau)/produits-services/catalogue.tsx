'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import {
  CATEGORIES_PRODUIT,
  euro,
  FILTRES_PRODUITS,
  nombre,
  nombreBac,
  prixProduit,
  produitsCatalogue,
  reglagesDepannage,
  reglagesPrix,
  sansAccents,
  type CategorieProduit,
  type Produit,
  type ReglagesFacturation,
} from '@chantio/shared';
import { Fenetre, FenetreConfirmation } from '@/components/fenetre';
import { Icone } from '@/components/icones';
import { LienVentes } from '@/components/lien-ventes';
import { ChampRecherche, PucesFiltre } from '@/components/outils-liste';
import { annoncer, Roue } from '@/components/retour';
import { Bouton, classeBouton, Titre } from '@/components/ui';
import type { ArticleLu } from '@/lib/devis';
import { enregistrerArticle, importerTarif, retirerArticle, type ArticleAEnregistrer } from '../devis/actions';

// « Produits et services » du bac (vCatalogue) : recherche, puces de catégorie, une ligne par article
// (pastille, désignation, achat, pose, prix de vente HT avec son coefficient), crayon et croix au bout,
// et les deux forfaits des Paramètres (déplacement, heure de dépannage). Le prix affiché est celui que
// prendra une ligne de devis (même calcul que la recherche rapide de l'éditeur).

const PASTILLE: Record<CategorieProduit, string> = {
  ouvrage: 'bg-doux text-cobalt',
  fourniture: 'bg-[#E0F2FE] text-[#026AA2]',
  mo: 'bg-vert-doux text-vert',
  forfait: 'bg-violet-doux text-violet',
};
const ORDRE: CategorieProduit[] = ['forfait', 'fourniture', 'mo', 'ouvrage'];

/** Catégories de la base (colonne articles.categorie) proposées dans la fenêtre, avec les libellés du bac. */
const CATEGORIES: [string, string][] = [
  ['Ouvrages', 'Ouvrage (fourniture + pose)'],
  ['Fournitures', 'Fourniture seule'],
  ['Main-d’œuvre', 'Main d’œuvre'],
  ['Forfaits', 'Forfait'],
];
const UNITES = ['u', 'm²', 'ml', 'm³', 'h', 'forfait', 'ens', 'visite'];

const ETIQUETTE = 'mb-1 block text-[13px] font-bold text-gris';
const CHAMP = 'champ rounded-[12px] px-3 py-2.5 text-[15px]';
const RANGEE = 'grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5';
const ICONE = 'grid h-9 w-9 place-items-center rounded-lg text-[15px] text-gris transition hover:bg-doux hover:text-encre';

const LIGNE =
  'grid grid-cols-[34px_minmax(0,1fr)_90px_70px_140px_64px] items-center gap-3 border-b border-trait px-2 py-2.5 max-[980px]:grid-cols-[34px_minmax(0,1fr)_auto] max-[980px]:gap-x-2.5 max-[980px]:gap-y-2 max-[980px]:px-1';

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
  const iH = col(/temps|pose|heure/, -1);
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
      heures: iH >= 0 ? nombre(c[iH]) : 0,
    };
  });
}

type Saisie = { id: string | null; categorie: string; unite: string; designation: string; achat: string; heures: string; vente: string; tva: number; reference: string };

const saisieDe = (a: ArticleLu | null): Saisie =>
  a
    ? {
        id: a.id,
        categorie: a.categorie,
        unite: a.unite,
        designation: a.designation,
        achat: nombreBac(a.prix_achat),
        heures: nombreBac(a.heures),
        vente: nombreBac(a.prix_vente),
        tva: a.tva,
        reference: a.reference ?? '',
      }
    : { id: null, categorie: 'Ouvrages', unite: 'u', designation: '', achat: '0', heures: '0', vente: '0', tva: 10, reference: '' };

export function ProduitsServices({ articles, reglages, nouveau }: { articles: ArticleLu[]; reglages: ReglagesFacturation; nouveau: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const rp = reglagesPrix(reglages);
  const rd = reglagesDepannage(reglages);
  const contexte = { coef: rp.coefficient, rp, rd };
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState<'tout' | CategorieProduit>('tout');
  const [saisie, setSaisie] = useState<Saisie | null>(() => (nouveau ? saisieDe(null) : null));
  const [aRetirer, setARetirer] = useState<ArticleLu | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const produits = useMemo(() => produitsCatalogue(articles), [articles]);
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  // Par catégorie (forfaits, fournitures, main d'œuvre, ouvrages) puis par nom, comme le bac.
  const liste = produits
    .filter((p) => (filtre === 'tout' || p.c === filtre) && mots.every((m) => sansAccents(`${p.designation} ${p.mots}`).includes(m)))
    .sort((a, b) => ORDRE.indexOf(a.c) - ORDRE.indexOf(b.c) || a.designation.localeCompare(b.designation, 'fr'));

  const ouvrir = (a: ArticleLu | null) => setSaisie(saisieDe(a));

  const enregistrer = (s: Saisie, p: Produit) => {
    if (!s.designation.trim()) return annoncer('Indiquez la désignation', 'erreur');
    demarrer(async () => {
      const r = await enregistrerArticle({
        id: s.id,
        designation: s.designation,
        categorie: s.categorie,
        unite: s.unite,
        reference: s.reference,
        prix_achat: nombre(s.achat),
        heures: nombre(s.heures),
        // Avec un coût, le prix suit le coefficient : on garde celui du coefficient par défaut.
        prix_vente: p.prixFixe == null ? prixProduit(p, contexte) : nombre(s.vente),
        tva: s.tva,
      });
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setSaisie(null);
      annoncer(s.id ? 'Article enregistré' : 'Ajouté : on le retrouve dans la recherche rapide');
      router.refresh();
    });
  };

  const retirer = (a: ArticleLu) =>
    demarrer(async () => {
      const r = await retirerArticle(a.id);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setARetirer(null);
      annoncer('Article retiré');
      router.refresh();
    });

  const importer = async (fichiers: FileList | null) => {
    const fi = fichiers?.[0];
    if (fichier.current) fichier.current.value = '';
    if (!fi) return;
    if (!/\.(csv|txt)$/i.test(fi.name)) return annoncer('Enregistrez votre tarif en CSV depuis Excel, puis importez-le', 'erreur');
    const lignes = lireCsv(await fi.text());
    demarrer(async () => {
      const r = await importerTarif(lignes);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(`Tarif importé : ${r.nombre} articles`);
      router.refresh();
    });
  };

  return (
    <>
      <Titre
        retour={<LienVentes />}
        texte="Vos ouvrages, fournitures, main d’œuvre et forfaits : on les retrouve par la recherche rapide des devis et dans l’appli du technicien."
        actions={
          <button type="button" className={classeBouton('principal', 'px-4 py-2.5')} onClick={() => ouvrir(null)}>
            <Icone nom="plus" taille={18} />
            Créer un produit ou service
          </button>
        }
      >
        Produits et services
      </Titre>

      <section aria-label="Produits et services" className="carte p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ChampRecherche etiquette="Rechercher un produit ou service" placeholder="Rechercher un article…" valeur={q} onChange={setQ} loupe={false} />
          <PucesFiltre etiquette="Catégorie" choix={FILTRES_PRODUITS} actif={filtre} onChoisir={(v) => setFiltre(v as 'tout' | CategorieProduit)} />
        </div>

        {liste.length ? (
          <div role="table" aria-label="Produits et services" className="flex flex-col">
            <div role="row" className={`${LIGNE} rounded-t-lg border-b-0 bg-fond py-2 text-[11.5px] font-bold tracking-[0.05em] text-gris uppercase max-[980px]:hidden`}>
              <span role="columnheader" aria-label="Catégorie" />
              <span role="columnheader">Désignation</span>
              <span role="columnheader" className="text-right">
                Achat
              </span>
              <span role="columnheader" className="text-right">
                Pose
              </span>
              <span role="columnheader" className="text-right">
                Prix de vente HT
              </span>
              <span role="columnheader" aria-label="Actions" />
            </div>
            {liste.map((p) => {
              const a = p.article_id ? parId.get(p.article_id) : undefined;
              const [libelle, lettre] = CATEGORIES_PRODUIT[p.c];
              return (
                <div role="row" key={p.id} className={LIGNE}>
                  <span role="cell" aria-label={libelle} className={`grid h-[34px] w-[34px] place-items-center rounded-[10px] text-sm font-extrabold ${PASTILLE[p.c]}`}>
                    {lettre}
                  </span>
                  <span role="cell" className="min-w-0">
                    <b className="block font-bold break-words">{p.designation}</b>
                    <small className="block text-xs font-medium text-gris">
                      {libelle} · par {p.unite}
                    </small>
                  </span>
                  <span role="cell" className="text-right tabular-nums max-[980px]:hidden">
                    {p.forfait ? '—' : euro(p.achat)}
                  </span>
                  <span role="cell" className="text-right tabular-nums max-[980px]:hidden">
                    {p.forfait ? '—' : `${nombreBac(p.heures)} h`}
                  </span>
                  <span role="cell" className="text-right tabular-nums">
                    <b className="block font-bold whitespace-nowrap">{euro(prixProduit(p, contexte))}</b>
                    <small className="block text-xs font-medium text-gris">
                      {p.forfait ? 'fixé dans Paramètres' : p.prixFixe != null ? 'prix fixe' : `× ${nombreBac(rp.coefficient)}`}
                    </small>
                  </span>
                  <span role="cell" className="flex justify-end gap-0.5 max-[980px]:col-[2/-1] max-[980px]:justify-start">
                    {a && (
                      <>
                        <button type="button" className={ICONE} aria-label={`Modifier ${p.designation}`} title="Modifier" onClick={() => ouvrir(a)}>
                          ✎
                        </button>
                        <button type="button" className={ICONE} aria-label={`Supprimer ${p.designation}`} title="Supprimer" onClick={() => setARetirer(a)}>
                          ✕
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-10 text-center text-[15px] text-gris">Aucun article.</div>
        )}

        <p className="mt-3 text-[13px] text-gris">
          Prix de vente = (achat + pose × {euro(rp.cout_horaire)}) × coefficient par défaut {nombreBac(rp.coefficient)}. Sur un devis, le coefficient du devis ou de la ligne
          s’applique.
        </p>
        <p className="mt-2 text-[13px] text-gris">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 font-bold text-cobalt hover:underline disabled:opacity-50"
            onClick={() => fichier.current?.click()}
            disabled={enCours}
            title="Fichier CSV : désignation ; unité ; prix d’achat ; prix de vente ; TVA ; référence ; catégorie"
          >
            {enCours && <Roue taille={14} />}
            Importer un tarif fournisseur (CSV)
          </button>
          <input ref={fichier} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => importer(e.target.files)} />
        </p>
      </section>

      {saisie && <FenetreArticle saisie={saisie} enCours={enCours} contexte={contexte} fermer={() => setSaisie(null)} enregistrer={enregistrer} />}
      {aRetirer && (
        <FenetreConfirmation
          titre={`Retirer « ${aRetirer.designation} » ?`}
          texte="Les devis existants gardent leurs lignes."
          bouton="Retirer"
          danger
          enCours={enCours}
          onConfirmer={() => retirer(aRetirer)}
          fermer={() => setARetirer(null)}
        />
      )}
    </>
  );
}

/** Fenêtre « Nouveau produit ou service » / « Modifier le produit ou service » (fenetreArticle du bac). */
function FenetreArticle({
  saisie,
  enCours,
  contexte,
  fermer,
  enregistrer,
}: {
  saisie: Saisie;
  enCours: boolean;
  contexte: Parameters<typeof prixProduit>[1];
  fermer: () => void;
  enregistrer: (s: Saisie, p: Produit) => void;
}) {
  const [s, setS] = useState(saisie);
  const maj = (p: Partial<Saisie>) => setS((x) => ({ ...x, ...p }));
  // Le produit tel que le verra la recherche rapide des devis : son prix, calculé ou fixe.
  const produit = produitsCatalogue([
    { id: s.id ?? 'nouveau', designation: s.designation, categorie: s.categorie, unite: s.unite, reference: s.reference, prix_achat: nombre(s.achat), prix_vente: nombre(s.vente), heures: nombre(s.heures), tva: s.tva, utilisations: 0 },
  ])[0];
  const fixe = produit.prixFixe != null;
  const categories = CATEGORIES.some(([c]) => c === s.categorie) ? CATEGORIES : [...CATEGORIES, [s.categorie, s.categorie] as [string, string]];
  const unites = UNITES.includes(s.unite) ? UNITES : [...UNITES, s.unite];

  return (
    <Fenetre
      titre={s.id ? 'Modifier le produit ou service' : 'Nouveau produit ou service'}
      fermer={fermer}
      pied={
        <>
          <Bouton type="button" variante="secondaire" data-fermer className="px-4 py-2.5 !text-cobalt">
            Annuler
          </Bouton>
          <Bouton type="button" className="px-4 py-2.5" onClick={() => enregistrer(s, produit)} disabled={enCours} aria-busy={enCours}>
            {enCours && <Roue />}
            {s.id ? 'Enregistrer' : 'Ajouter aux produits et services'}
          </Bouton>
        </>
      }
    >
      <div className={RANGEE}>
        <label>
          <span className={ETIQUETTE}>Catégorie</span>
          <select className={CHAMP} value={s.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
            {categories.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ETIQUETTE}>Unité</span>
          <select className={CHAMP} value={s.unite} onChange={(e) => maj({ unite: e.target.value })}>
            {unites.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span className={ETIQUETTE}>Désignation</span>
        <input
          type="text"
          className={CHAMP}
          value={s.designation}
          onChange={(e) => maj({ designation: e.target.value })}
          placeholder="ex. Pose lave-mains d’angle"
          autoFocus
        />
      </label>
      <div className={RANGEE}>
        <label>
          <span className={ETIQUETTE}>Prix d’achat (€ HT)</span>
          <input type="text" inputMode="decimal" className={CHAMP} value={s.achat} onChange={(e) => maj({ achat: e.target.value })} />
        </label>
        <label>
          <span className={ETIQUETTE}>Temps de pose (h)</span>
          <input type="text" inputMode="decimal" className={CHAMP} value={s.heures} onChange={(e) => maj({ heures: e.target.value })} />
        </label>
      </div>
      <div className={RANGEE}>
        {fixe && (
          <label>
            <span className={ETIQUETTE}>Prix de vente (€ HT)</span>
            <input type="text" inputMode="decimal" className={CHAMP} value={s.vente} onChange={(e) => maj({ vente: e.target.value })} />
          </label>
        )}
        <label>
          <span className={ETIQUETTE}>TVA par défaut</span>
          <select className={CHAMP} value={s.tva} onChange={(e) => maj({ tva: Number(e.target.value) })}>
            {[...new Set([10, 5.5, 20, s.tva])].map((t) => (
              <option key={t} value={t}>
                {String(t).replace('.', ',')} %
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={ETIQUETTE}>Référence fournisseur</span>
          <input type="text" className={CHAMP} value={s.reference} onChange={(e) => maj({ reference: e.target.value })} />
        </label>
      </div>
      <p className="rounded-[10px] bg-doux px-3 py-2.5 text-[13px] leading-relaxed" aria-live="polite">
        {fixe ? 'Prix de vente fixe, sans achat ni temps de pose : ' : 'Prix de vente avec le coefficient par défaut : '}
        <b className="font-bold text-cobalt">
          {euro(prixProduit(produit, contexte))} HT / {s.unite}
        </b>
      </p>
    </Fenetre>
  );
}
