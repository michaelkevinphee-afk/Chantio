'use client';

// Conditions particulières (page 2 du document) : reprises des Paramètres à la création, réglables ici
// pour ce document. Le bac n'a pas cette partie ; elle reste repliée en bas du formulaire.

import type { ReactNode } from 'react';
import { nombre, type ConditionsDocument } from '@chantio/shared';

export function Interrupteur({ coche, onChange, children }: { coche: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="ed-sw">
      <input type="checkbox" role="switch" checked={coche} onChange={(e) => onChange(e.target.checked)} />
      <span className="ed-sw-c" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

function Texte({ label, valeur, onChange, placeholder }: { label: string; valeur: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="champ">
      {label}
      <input type="text" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SectionConditions({
  c,
  pro,
  facture,
  maj,
}: {
  c: ConditionsDocument;
  pro: boolean;
  facture: boolean;
  maj: (p: Partial<ConditionsDocument>) => void;
}) {
  return (
    <details className="ed-sec ed-cond">
      <summary>
        <h2>Conditions particulières</h2>
        <span className="gris petit-txt">Imprimées en page 2 du document, reprises des Paramètres</span>
      </summary>
      <div className="ed-cond-corps">
        {!facture && (
          <div className="ligne-champs">
            <label className="champ">
              Échéancier
              <select value={c.echeancier} onChange={(e) => maj({ echeancier: e.target.value as ConditionsDocument['echeancier'] })}>
                <option value="acompte">Acompte à la commande, solde à la réception</option>
                <option value="303040">30 % à la commande, 40 % à mi-chantier, 30 % à la réception</option>
                <option value="situations">Situations mensuelles selon l’avancement</option>
                <option value="fin">Totalité à la réception des travaux</option>
              </select>
            </label>
            {c.echeancier === 'acompte' && (
              <label className="champ">
                Acompte à la signature
                <span className="saisie-u">
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={c.acompte}
                    aria-label="Acompte en pourcentage"
                    onBlur={(e) => maj({ acompte: String(Math.min(100, Math.max(0, Math.round(nombre(e.target.value) * 100) / 100))) })}
                  />
                  <i>%</i>
                </span>
              </label>
            )}
          </div>
        )}
        <div className="ligne-champs">
          <Texte label="Début des travaux" valeur={c.debut} onChange={(v) => maj({ debut: v })} />
          <Texte label="Durée prévue" valeur={c.duree} onChange={(v) => maj({ duree: v })} />
        </div>
        <div className="ed-cond-moyens" role="group" aria-label="Moyens de paiement acceptés">
          <span className="etiq">Moyens de paiement acceptés</span>
          {(
            [
              ['virement', 'Virement'],
              ['cheque', 'Chèque'],
              ['carte', 'Carte par lien'],
              ['especes', 'Espèces'],
            ] as const
          ).map(([k, lib]) => (
            <label key={k} className="case">
              <input type="checkbox" checked={c[k]} onChange={(e) => maj({ [k]: e.target.checked })} /> {lib}
            </label>
          ))}
        </div>
        <Interrupteur coche={c.escompte} onChange={(v) => maj({ escompte: v })}>
          Escompte pour paiement anticipé
        </Interrupteur>
        {c.escompte && (
          <div className="ed-ao">
            <Texte label="Taux d’escompte" valeur={c.escompteTaux} onChange={(v) => maj({ escompteTaux: v })} />
          </div>
        )}
        <Interrupteur coche={c.reserve} onChange={(v) => maj({ reserve: v })}>
          Réserve de propriété
        </Interrupteur>
        <Interrupteur coche={c.retenue} onChange={(v) => maj({ retenue: v })}>
          Retenue de garantie de 5 %
        </Interrupteur>
        {c.retenue && (
          <div className="ed-ao">
            <label className="case">
              <input type="checkbox" checked={c.caution} onChange={(e) => maj({ caution: e.target.checked })} /> Remplacée par une caution bancaire
            </label>
          </div>
        )}
        <Interrupteur coche={c.decennale} onChange={(v) => maj({ decennale: v })}>
          Assurance décennale
        </Interrupteur>
        {c.decennale && (
          <div className="ed-ao">
            <div className="ligne-champs">
              <Texte label="Assureur" valeur={c.assureur} onChange={(v) => maj({ assureur: v })} />
              <Texte label="N° de contrat" valeur={c.contrat} onChange={(v) => maj({ contrat: v })} />
              <Texte label="Zone couverte" valeur={c.zone} onChange={(v) => maj({ zone: v })} />
            </div>
          </div>
        )}
        {pro ? (
          <Interrupteur coche={c.autoliq} onChange={(v) => maj({ autoliq: v })}>
            Autoliquidation de la TVA (sous-traitance)
          </Interrupteur>
        ) : (
          <Interrupteur coche={c.attTva} onChange={(v) => maj({ attTva: v })}>
            Attestation de TVA réduite jointe
          </Interrupteur>
        )}
        {!facture && (
          <>
            <Interrupteur coche={c.aide} onChange={(v) => maj({ aide: v })}>
              Prime déduite (MaPrimeRénov’, CEE)
            </Interrupteur>
            {c.aide && (
              <div className="ed-ao">
                <div className="ligne-champs">
                  <Texte label="Montant de la prime" valeur={c.aideMontant} onChange={(v) => maj({ aideMontant: v })} />
                  <Texte label="Organisme" valeur={c.aideOrga} onChange={(v) => maj({ aideOrga: v })} />
                  <Texte label="N° RGE" valeur={c.rge} onChange={(v) => maj({ rge: v })} />
                </div>
              </div>
            )}
          </>
        )}
        <Interrupteur coche={c.revision} onChange={(v) => maj({ revision: v })}>
          Prix révisables
        </Interrupteur>
        {c.revision && (
          <div className="ed-ao">
            <div className="ligne-champs">
              <label className="champ">
                Indice
                <select value={c.indice} onChange={(e) => maj({ indice: e.target.value })}>
                  {[...new Set(['BT38 Plomberie sanitaire', 'BT40 Chauffage central', 'BT41 Ventilation et climatisation', c.indice])].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <Texte label="Mois de référence" valeur={c.moisRef} placeholder="ex. septembre 2026" onChange={(v) => maj({ moisRef: v })} />
            </div>
          </div>
        )}
        <Interrupteur coche={c.dechets} onChange={(v) => maj({ dechets: v })}>
          Gestion des déchets
        </Interrupteur>
        {c.dechets && (
          <div className="ed-ao">
            <div className="ligne-champs">
              <Texte label="Quantité estimée" valeur={c.dechetsQte} onChange={(v) => maj({ dechetsQte: v })} />
              <Texte label="Point de collecte" valeur={c.dechetsLieu} onChange={(v) => maj({ dechetsLieu: v })} />
              <Texte label="Coût" valeur={c.dechetsCout} onChange={(v) => maj({ dechetsCout: v })} />
            </div>
          </div>
        )}
        {pro ? (
          <>
            <Interrupteur coche={c.prorata} onChange={(v) => maj({ prorata: v })}>
              Compte prorata
            </Interrupteur>
            {c.prorata && (
              <div className="ed-ao">
                <Texte label="Part retenue" valeur={c.prorataTaux} onChange={(v) => maj({ prorataTaux: v })} />
              </div>
            )}
            <Interrupteur coche={c.penExec} onChange={(v) => maj({ penExec: v })}>
              Pénalités de retard de chantier
            </Interrupteur>
            {c.penExec && (
              <div className="ed-ao">
                <Texte label="Par jour calendaire" valeur={c.penExecMontant} onChange={(v) => maj({ penExecMontant: v })} />
              </div>
            )}
          </>
        ) : (
          <>
            <Interrupteur coche={c.retract} onChange={(v) => maj({ retract: v })}>
              Droit de rétractation de 14 jours (signé chez le client)
            </Interrupteur>
            <Texte label="Médiateur de la consommation" valeur={c.mediateur} onChange={(v) => maj({ mediateur: v })} />
          </>
        )}
      </div>
    </details>
  );
}
