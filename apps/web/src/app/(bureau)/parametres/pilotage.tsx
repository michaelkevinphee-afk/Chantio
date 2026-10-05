'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MOIS_COURTS, MOIS_LONGS, totauxBudget, type BudgetPilotage, type FamilleImportee, type FraisBudget, type MoisImporte } from '@chantio/shared';
import { enregistrerBudget, enregistrerMois } from '../chiffres/annee/actions';
import { CaseImport } from '../chiffres/annee/import';
import { c, ChampNombre, eur, fr } from '../chiffres/annee/outils';
import { Section } from './elements';

// Paramètres › Pilotage : le budget de l'année (l'onglet « Plan » du fichier Excel) et la production
// des mois facturés hors Chantio. Chaque champ est enregistré quand on le quitte.

type Modif = Partial<Omit<BudgetPilotage, 'annee'>>;

function Ligne({ libelle, aide, children, calc = false }: { libelle: string; aide?: string; children: React.ReactNode; calc?: boolean }) {
  return (
    <div className={c('ligne', calc && 'calc')}>
      <span className={c('lib')}>
        {libelle}
        {aide && <small>{aide}</small>}
      </span>
      {children}
    </div>
  );
}

export function RubriqueBudget({ annee, budget: initial }: { annee: number; budget: BudgetPilotage }) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const B = totauxBudget(b);

  const enregistrer = async (m: Modif) => {
    const avant = b;
    setB({ ...b, ...m });
    const r = await enregistrerBudget(annee, m);
    if (!r.ok) {
      setB(avant);
      return r.erreur;
    }
    router.refresh();
    return null;
  };
  const champ = (cle: keyof Modif, libelle: string, unite: string, decimales = 0) => (
    <ChampNombre valeur={b[cle] as number} unite={unite} decimales={decimales} libelle={libelle} enregistrer={(v) => enregistrer({ [cle]: v ?? 0 })} />
  );
  const frais = (liste: FraisBudget[]) => enregistrer({ frais: liste });

  return (
    <div className={c('annee')}>
      <div className={c('budget')}>
        <div className="flex min-w-0 flex-col">
          <Section titre={`Ce que vous visez en ${annee}`} grille={false}>
            <div>
              <Ligne libelle="Objectif dépannages" aide="entretien compris, hors taxes">
                {champ('objectif_depannage', 'Objectif dépannages', '€')}
              </Ligne>
              <Ligne libelle="Objectif chantiers" aide="hors taxes">
                {champ('objectif_chantier', 'Objectif chantiers', '€')}
              </Ligne>
            </div>
          </Section>
          <Section titre="Achats" grille={false}>
            <div>
              <Ligne libelle="Matières, chantier et dépannage" aide="en % du chiffre d’affaires">
                {champ('achats_pc', 'Matières en % du chiffre d’affaires', '%', 2)}
              </Ligne>
              <Ligne libelle="Sous-traitance">{champ('sous_traitance', 'Sous-traitance', '€')}</Ligne>
            </div>
          </Section>
          <Section titre="Frais généraux" grille={false}>
            <p className="text-[13px] text-gris">Montants à l’année. Chantio les répartit par douzièmes.</p>
            <div>
              {b.frais.map((f, i) => (
                <div key={`${i}-${b.frais.length}`} className={c('ligne frais')}>
                  <input
                    className={c('libelle-frais')}
                    aria-label={`Libellé du poste ${i + 1}`}
                    defaultValue={f.libelle}
                    placeholder="Nom du poste"
                    onBlur={(e) => {
                      const libelle = e.target.value.trim();
                      if (libelle !== f.libelle) frais(b.frais.map((x, k) => (k === i ? { ...x, libelle } : x)));
                    }}
                  />
                  <ChampNombre
                    valeur={f.montant}
                    unite="€"
                    libelle={`Montant de ${f.libelle || 'ce poste'}`}
                    enregistrer={(v) => frais(b.frais.map((x, k) => (k === i ? { ...x, montant: v ?? 0 } : x)))}
                  />
                  <button type="button" className={c('retirer')} aria-label={`Retirer ${f.libelle || 'ce poste'}`} onClick={() => frais(b.frais.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </div>
              ))}
              <Ligne libelle="Salaires" aide="à l’année, hors charges">
                {champ('salaires', 'Salaires', '€')}
              </Ligne>
              <Ligne libelle="Charges sociales et fiscales" aide="en % des salaires">
                {champ('charges_pc', 'Charges en % des salaires', '%', 2)}
              </Ligne>
            </div>
            <div>
              <button type="button" className={c('btn')} onClick={() => frais([...b.frais, { libelle: '', montant: 0 }])}>
                Ajouter un poste
              </button>
            </div>
          </Section>
          <Section titre="Coefficients pour la marge" grille={false}>
            <p className="text-[13px] text-gris">Prix de vente divisé par le coût. Ils servent au résultat théorique du mois.</p>
            <div>
              <Ligne libelle="Dépannages" aide={`marge de ${fr(Math.round((1 - 1 / Math.max(1, b.coef_depannage)) * 1000) / 10)} % du prix`}>
                {champ('coef_depannage', 'Coefficient des dépannages', '×', 3)}
              </Ligne>
              <Ligne libelle="Chantiers" aide={`marge de ${fr(Math.round((1 - 1 / Math.max(1, b.coef_chantier)) * 1000) / 10)} % du prix`}>
                {champ('coef_chantier', 'Coefficient des chantiers', '×', 3)}
              </Ligne>
              <Ligne libelle="Impôt sur le résultat" aide="en % du résultat">
                {champ('impot_pc', 'Impôt en % du résultat', '%', 2)}
              </Ligne>
            </div>
          </Section>
        </div>
        <aside className={c('carte collant bilan')} aria-label="Budget en un coup d’œil">
          <h2>Votre budget {annee}</h2>
          <div className={c('l')}>
            <span>Chiffre d’affaires visé</span>
            <b>{eur(B.ca)}</b>
          </div>
          <div className={c('l')}>
            <span>soit par mois</span>
            <span>{eur(B.ca / 12)}</span>
          </div>
          <div className={c('l')}>
            <span>Achats et sous-traitance</span>
            <span>−{eur(B.achats)}</span>
          </div>
          <div className={c('l')}>
            <span>Marge brute</span>
            <span>
              {eur(B.mb)}
              {B.ca ? ` · ${Math.round((B.mb / B.ca) * 100)} %` : ''}
            </span>
          </div>
          <div className={c('l')}>
            <span>Frais généraux</span>
            <span>−{eur(B.fg)}</span>
          </div>
          <div className={c('l fort')}>
            <span>Résultat visé</span>
            <span className={c(B.res >= 0 ? 'pos' : 'neg')}>{eur(B.res)}</span>
          </div>
          <div className={c('l')}>
            <span>Impôt ({fr(b.impot_pc)} %)</span>
            <span>−{eur(B.impot)}</span>
          </div>
          <div className={c('l')}>
            <span>Après impôt</span>
            <b>{eur(B.apres)}</b>
          </div>
          <p className={c('note')}>Les graphiques de Chiffres › Objectifs de l’année suivent chaque changement.</p>
          <Link href="/chiffres?vue=annee" className={c('btn principal')} style={{ textAlign: 'center' }}>
            Voir les objectifs de l’année
          </Link>
        </aside>
      </div>
    </div>
  );
}

const ROWS: [string, FamilleImportee, 0 | 1][] = [
  ['Dépannages', 'depannage', 0],
  ['Chantiers', 'chantier', 0],
  ['Année précédente (total)', 'total', 1],
];

export function RubriqueProduction({
  annee,
  importee,
  carnet,
}: {
  annee: number;
  importee: MoisImporte[];
  carnet: Pick<BudgetPilotage, 'carnet_accepte' | 'carnet_facture' | 'carnet_le'>;
}) {
  const router = useRouter();
  const [k, setK] = useState(carnet);
  const valeur = (famille: FamilleImportee, a: number, m: number) =>
    importee.find((l) => l.famille === famille && l.mois === `${a}-${String(m + 1).padStart(2, '0')}-01`)?.montant_ht ?? null;
  const ecrireCarnet = async (m: Partial<typeof carnet>) => {
    const avant = k;
    setK({ ...k, ...m });
    const r = await enregistrerBudget(annee, m);
    if (!r.ok) {
      setK(avant);
      return r.erreur;
    }
    router.refresh();
    return null;
  };
  const reste = k.carnet_accepte != null ? Math.max(0, k.carnet_accepte - (k.carnet_facture ?? 0)) : null;

  return (
    <div className={c('annee')}>
      <CaseImport annee={annee} titre="Importer le fichier de pilotage ou un export" />
      <Section titre="Mois facturés hors Chantio" grille={false}>
        <p className="text-[13px] text-gris">
          Montants hors taxes. Un mois rempli ici remplace les factures Chantio de ce mois-là ; videz la case pour revenir à Chantio.
        </p>
        <div className={c('grille-mois')}>
          <table>
            <thead>
              <tr>
                <th />
                {MOIS_COURTS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([lib, famille, recul]) => {
                const a = annee - recul;
                return (
                  <tr key={famille}>
                    <td>
                      {lib} <small className="text-gris">{a}</small>
                    </td>
                    {MOIS_COURTS.map((_, m) => (
                      <td key={m}>
                        <CaseMois
                          libelle={`${lib} ${MOIS_LONGS[m]} ${a}`}
                          valeur={valeur(famille, a, m)}
                          enregistrer={async (v) => {
                            const r = await enregistrerMois(a, m, famille, v);
                            if (!r.ok) return r.erreur;
                            router.refresh();
                            return null;
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section titre="Carnet de commandes hors Chantio" grille={false}>
        <p className="text-[13px] text-gris">Tant que des devis de chantier sont suivis dans un autre logiciel. Les devis signés dans Chantio s’ajoutent tout seuls.</p>
        <div>
          <Ligne libelle="Devis acceptés" aide={k.carnet_le ? `au ${k.carnet_le.slice(8, 10)}/${k.carnet_le.slice(5, 7)}/${k.carnet_le.slice(0, 4)}` : undefined}>
            <ChampNombre
              valeur={k.carnet_accepte}
              unite="€"
              libelle="Devis acceptés"
              vide
              enregistrer={(v) => ecrireCarnet({ carnet_accepte: v, carnet_le: new Date().toISOString().slice(0, 10) })}
            />
          </Ligne>
          <Ligne libelle="Déjà facturé sur ces devis">
            <ChampNombre valeur={k.carnet_facture} unite="€" libelle="Déjà facturé sur ces devis" vide enregistrer={(v) => ecrireCarnet({ carnet_facture: v, carnet_le: new Date().toISOString().slice(0, 10) })} />
          </Ligne>
          <Ligne libelle="Reste à exécuter" calc>
            <b className="text-right tabular-nums">{reste == null ? '—' : eur(reste)}</b>
          </Ligne>
        </div>
      </Section>
    </div>
  );
}

/** Une case de la grille des mois : vide = rien d'importé (Chantio compte ses factures). */
function CaseMois({ libelle, valeur, enregistrer }: { libelle: string; valeur: number | null; enregistrer: (v: number | null) => Promise<string | null> }) {
  const ecrire = (v: number | null) => (v == null ? '' : Math.round(v).toLocaleString('fr-FR'));
  const [texte, setTexte] = useState(ecrire(valeur));
  const [vu, setVu] = useState(valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  if (vu !== valeur) {
    setVu(valeur);
    setTexte(ecrire(valeur));
  }
  return (
    <input
      aria-label={libelle}
      title={erreur ?? undefined}
      aria-invalid={!!erreur}
      className={c(valeur != null && 'importe')}
      inputMode="decimal"
      placeholder="—"
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={async () => {
        const t = texte.replace(/[\s  €]/g, '').replace(',', '.');
        const v = t === '' ? null : Number(t);
        if (v != null && !Number.isFinite(v)) return setTexte(ecrire(valeur));
        if (v === valeur || (v != null && valeur != null && Math.round(v) === Math.round(valeur))) return setTexte(ecrire(valeur));
        setErreur(null);
        const e = await enregistrer(v);
        if (e) {
          setErreur(e);
          setTexte(ecrire(valeur));
        }
      }}
    />
  );
}
