'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ReglagesFacturation } from '@chantio/shared';
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

export function Reglages({ valeurs, modifiable }: { valeurs: ReglagesFacturation; modifiable: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [r, setR] = useState<ReglagesFacturation>(valeurs);

  const enregistrer = () =>
    demarrer(async () => {
      const res = await enregistrerReglages(r);
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
