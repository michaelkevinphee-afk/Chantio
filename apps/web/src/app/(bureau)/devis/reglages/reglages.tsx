'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { coefficientPlancher, euro, nombre, pourcent, REGLAGES_PRIX_DEFAUT, reglagesPrix, type ReglagesFacturation, type ReglagesPrix } from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import { enregistrerReglages } from '../actions';
import { Ecran } from '../composants';

const GROUPES: { titre: string; aide: string; champs: [keyof ReglagesFacturation, string, string?][] }[] = [
  {
    titre: 'Identité de l’entreprise',
    aide: 'Imprimé en haut de chaque devis et facture.',
    champs: [
      ['forme', 'Forme juridique', 'SARL, SAS, EI…'],
      ['capital', 'Capital social', '10 000 €'],
      ['siret', 'SIRET', '14 chiffres'],
      ['tva_intra', 'TVA intracommunautaire', 'FR…'],
      ['rcs', 'RCS ou RM', 'RCS Paris 123 456 789'],
      ['slogan', 'Ligne sous le nom', 'Plomberie · Chauffage · depuis 1984'],
    ],
  },
  {
    titre: 'Assurance et médiation',
    aide: 'Obligatoires sur les devis : ils pré-remplissent chaque nouveau document.',
    champs: [
      ['assureur', 'Assureur décennale'],
      ['contrat', 'N° de contrat'],
      ['zone', 'Zone couverte', 'France métropolitaine'],
      ['mediateur', 'Médiateur de la consommation', 'Nom et site internet'],
      ['rge', 'N° RGE (si vous l’êtes)'],
    ],
  },
  {
    titre: 'Paiement',
    aide: 'Affiché en bas des factures.',
    champs: [
      ['iban', 'IBAN'],
      ['bic', 'BIC'],
    ],
  },
];

type ClePrix = keyof ReglagesPrix;

const PRIX: { k: ClePrix; lib: string; unite: string; aide: string }[] = [
  { k: 'cout_horaire', lib: 'Coût horaire chargé', unite: '€ HT / h', aide: 'Salaires et charges, divisés par les heures facturables.' },
  { k: 'frais_generaux', lib: 'Frais généraux', unite: '% du déboursé', aide: 'Loyer, véhicules, assurances, bureau, comptable.' },
  { k: 'coefficient', lib: 'Coefficient global par défaut', unite: '×', aide: 'Proposé à chaque nouveau devis, modifiable devis par devis.' },
  { k: 'marge_min', lib: 'Marge nette minimale', unite: '%', aide: 'En dessous, le devis vous alerte.' },
  { k: 'chute', lib: 'Chute des métrés en m²', unite: '%', aide: 'Ajoutée par défaut aux surfaces (carrelage, faïence).' },
];

const texte = (n: number | undefined) => (n == null ? '' : String(n).replace('.', ','));

export function Reglages({ valeurs, modifiable }: { valeurs: ReglagesFacturation; modifiable: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [r, setR] = useState<ReglagesFacturation>(valeurs);
  // Prix et coefficients : saisis en texte (« 1,45 »), vides pour la valeur par défaut.
  const [prix, setPrix] = useState(() => Object.fromEntries(PRIX.map(({ k }) => [k, texte(valeurs[k])])) as Record<ClePrix, string>);
  const prixSaisis = Object.fromEntries(PRIX.map(({ k }) => [k, prix[k].trim() ? nombre(prix[k]) : undefined])) as Partial<ReglagesPrix>;
  const essai = reglagesPrix(prixSaisis);
  const exemple = { vente: 100 * essai.coefficient, revient: 100 * (1 + essai.frais_generaux / 100) };
  const margeExemple = exemple.vente - exemple.revient;

  const enregistrer = () =>
    demarrer(async () => {
      const res = await enregistrerReglages({ ...r, ...prixSaisis });
      if (!res.ok) return annoncer(res.erreur, 'erreur');
      annoncer('Mentions enregistrées');
      router.push('/devis');
    });

  return (
    <Ecran label="Mentions de facturation">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/devis" style={{ color: 'inherit' }}>
              Devis et factures
            </Link>
          </div>
          <h1>Mentions de facturation</h1>
        </div>
        {modifiable && (
          <div className="actions">
            <button className="btn plein" type="button" onClick={enregistrer} disabled={enCours}>
              {enCours && <Roue />}
              Enregistrer
            </button>
          </div>
        )}
      </div>
      {!modifiable && <div className="info" style={{ marginBottom: 16 }}>Seul le dirigeant peut modifier ces mentions.</div>}
      <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
        <div className="carte bloc">
          <div className="bloc-titre">
            <h2>Objectif du mois</h2>
          </div>
          <div className="champs">
            <div>
              <div className="etiq">Chiffre d’affaires visé chaque mois (HT)</div>
              <input
                className="saisie num"
                inputMode="numeric"
                disabled={!modifiable}
                value={r.objectif_mensuel ?? ''}
                placeholder="20000"
                onChange={(e) => setR({ ...r, objectif_mensuel: Number(e.target.value.replace(/\D/g, '')) || undefined })}
              />
            </div>
          </div>
          <p className="note-tva">Sert à l’anneau « Ce mois-ci » du tableau de bord. Sans objectif, Chantio compare à votre moyenne mensuelle.</p>
        </div>
        <div className="carte bloc">
          <div className="bloc-titre">
            <h2>Prix et coefficients</h2>
            <span className="surtitre">Calcul des prix des devis</span>
          </div>
          <div className="champs">
            {PRIX.map(({ k, lib, unite, aide }) => (
              <div key={k}>
                <div className="etiq">
                  {lib} <span className="marque-auto">{unite}</span>
                </div>
                <input
                  className="saisie num"
                  inputMode="decimal"
                  disabled={!modifiable}
                  value={prix[k]}
                  placeholder={texte(REGLAGES_PRIX_DEFAUT[k])}
                  onChange={(e) => setPrix({ ...prix, [k]: e.target.value })}
                />
                <p className="note-tva" style={{ marginTop: 6, padding: 0, background: 'none' }}>
                  {aide}
                </p>
              </div>
            ))}
          </div>
          <div className="calcul-marge">
            <div>
              <small>Prix de vente</small>
              <b>{euro(exemple.vente)}</b>
            </div>
            <div>
              <small>Prix de revient</small>
              <b>{euro(exemple.revient)}</b>
            </div>
            <div>
              <small>Marge nette</small>
              <b style={{ color: margeExemple / exemple.vente < essai.marge_min / 100 ? 'var(--rouge)' : 'var(--vert)' }}>
                {pourcent(exemple.vente ? (margeExemple / exemple.vente) * 100 : 0)}
              </b>
            </div>
          </div>
          <p className="note-tva">
            Pour 100 € de déboursé sec (fournitures et main-d’œuvre) avec le coefficient × {texte(essai.coefficient)}. Prix d’un ouvrage = (fourniture + temps de pose ×{' '}
            {euro(essai.cout_horaire)}) × coefficient. Pour garder {pourcent(essai.marge_min)} de marge nette, ne descendez pas sous × {texte(coefficientPlancher(essai))}.
          </p>
        </div>
        {GROUPES.map((g) => (
          <div className="carte bloc" key={g.titre}>
            <div className="bloc-titre">
              <h2>{g.titre}</h2>
              <span className="surtitre">{g.aide}</span>
            </div>
            <div className="champs">
              {g.champs.map(([k, lib, exemple]) => (
                <div key={k}>
                  <div className="etiq">{lib}</div>
                  <input
                    className="saisie"
                    disabled={!modifiable}
                    placeholder={exemple}
                    value={String(r[k] ?? '')}
                    onChange={(e) => setR({ ...r, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Ecran>
  );
}
