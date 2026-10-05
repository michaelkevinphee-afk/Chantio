'use client';

import { useState } from 'react';
import { COULEURS_DOCUMENT, LOGICIELS_COMPTA, MODELES_MAIL, type ReglagesFacturation } from '@chantio/shared';
import { enregistrerReglage } from './actions';
import { CaseAuto, ChampAuto, envoyer, ListeAuto } from './champ-auto';
import { Bientot, Note, Section } from './elements';
import { joursDe, moisDe } from './valeurs';

type R = ReglagesFacturation;
const t = (r: R, k: keyof R) => (r[k] == null ? '' : String(r[k]));

/** Paramètres › E-mails. */
export function RubriqueEmails({ r, email }: { r: R; email: string }) {
  const mail = (k: keyof typeof MODELES_MAIL) => t(r, k) || MODELES_MAIL[k];
  return (
    <>
      {(['devis', 'facture'] as const).map((g) => (
        <Section key={g} titre={g === 'devis' ? 'Envoi des devis' : 'Envoi des factures'}>
          <ChampAuto cle={`mail_${g}_objet`} libelle="Objet" valeur={mail(`mail_${g}_objet`)} large />
          <ChampAuto cle={`mail_${g}_texte`} libelle="Message" valeur={mail(`mail_${g}_texte`)} large lignes={6} />
        </Section>
      ))}
      <Section titre="Réponses">
        <ChampAuto cle="email" libelle="Adresse de réponse" valeur={email} type="email" aide="Vos clients vous répondent à cette adresse." />
        <div className="flex min-w-0 flex-col gap-2.5 min-[1101px]:pt-8">
          <CaseAuto cle="mail_copie" libelle="Recevoir une copie de chaque envoi" coche={!!r.mail_copie} />
        </div>
      </Section>
    </>
  );
}

/** Paramètres › Comptes bancaires. */
export function RubriqueBanque({ r, nom }: { r: R; nom: string }) {
  return (
    <>
      <Section titre="Compte principal">
        <ChampAuto cle="titulaire" libelle="Titulaire du compte" valeur={t(r, 'titulaire')} placeholder={nom} />
        <ChampAuto cle="banque" libelle="Banque" valeur={t(r, 'banque')} />
        <ChampAuto cle="iban" libelle="IBAN" valeur={t(r, 'iban')} large placeholder="FR76 …" />
        <ChampAuto cle="bic" libelle="BIC" valeur={t(r, 'bic')} />
        <CaseAuto
          cle="iban_factures"
          libelle="Afficher l’IBAN et le BIC sur les factures"
          aide="Vos clients peuvent payer par virement sans vous demander vos coordonnées."
          coche={r.iban_factures !== 'non'}
          large
        />
      </Section>
      <Section titre="Rapprochement bancaire" grille={false}>
        <p>
          Relier votre banque pour marquer automatiquement les factures payées. <Bientot />
        </p>
      </Section>
    </>
  );
}

/** Paramètres › Conditions générales. */
export function RubriqueCgv({ r }: { r: R }) {
  return (
    <>
      <Section titre="Devis">
        <ChampAuto cle="validite" libelle="Validité des devis" valeur={moisDe(r.validite)} unite="mois" inputMode="numeric" />
        <ChampAuto cle="acompte" libelle="Acompte demandé à la signature" valeur={r.acompte || '30'} unite="%" inputMode="numeric" />
        <ChampAuto
          cle="conditions_particulieres"
          libelle="Conditions particulières"
          valeur={t(r, 'conditions_particulieres')}
          large
          lignes={3}
          aide="Affichées en bas de chaque devis."
        />
        <ChampAuto cle="rge" libelle="N° RGE (si vous l’êtes)" valeur={t(r, 'rge')} />
        <ChampAuto cle="mediateur" libelle="Médiateur de la consommation" valeur={t(r, 'mediateur')} placeholder="Nom et site internet" />
      </Section>
      <Section titre="Factures">
        <ChampAuto
          cle="delai"
          libelle="Délai de paiement"
          valeur={joursDe(r.delai)}
          unite="jours"
          inputMode="numeric"
          aide="Au plus 60 jours après la date de la facture."
        />
        <Note className="col-span-full">
          Les factures indiquent toujours les pénalités de retard au taux légal et l’indemnité forfaitaire de 40 € pour frais de recouvrement : ces mentions sont
          obligatoires.
        </Note>
      </Section>
      <Section titre="Conditions générales de vente" grille={false}>
        <p>
          Joindre vos conditions générales de vente à chaque devis. <Bientot />
        </p>
      </Section>
    </>
  );
}

/** Paramètres › Tenue comptable. */
export function RubriqueCompta({ r }: { r: R }) {
  return (
    <>
      <Section titre="Expert-comptable">
        <ChampAuto cle="comptable" libelle="Cabinet" valeur={t(r, 'comptable')} placeholder="Nom du cabinet" />
        <ChampAuto cle="comptable_email" libelle="E-mail du cabinet" valeur={t(r, 'comptable_email')} type="email" />
        <ListeAuto
          cle="logiciel_compta"
          libelle="Logiciel comptable du cabinet"
          valeur={t(r, 'logiciel_compta')}
          options={[['', 'Je ne sais pas'], ...LOGICIELS_COMPTA.map((l): [string, string] => [l, l])]}
        />
      </Section>
      <Section titre="TVA">
        <ListeAuto
          cle="tva_regime"
          libelle="TVA due"
          valeur={r.tva_regime ?? 'encaissements'}
          large
          options={[
            ['encaissements', 'Sur les encaissements (cas courant pour les travaux)'],
            ['debits', 'Sur les débits (sur option)'],
          ]}
        />
      </Section>
      <Section titre="Export comptable" grille={false}>
        <p>
          Le journal des ventes et le fichier des écritures comptables (FEC), prêts pour le cabinet. <Bientot />
        </p>
      </Section>
    </>
  );
}

/** Couleur des documents : 5 pastilles et l'aperçu d'un document, mis à jour au choix. */
export function CouleurDocuments({ valeur, nom, modifiable }: { valeur: string; nom: string; modifiable: boolean }) {
  const [choix, setChoix] = useState(COULEURS_DOCUMENT.some((c) => c[0] === valeur) ? valeur : 'marine');
  const couleur = (COULEURS_DOCUMENT.find((c) => c[0] === choix) ?? COULEURS_DOCUMENT[0])[2];
  return (
    <>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur des documents">
        {COULEURS_DOCUMENT.map(([cle, libelle, hexa]) => (
          <label
            key={cle}
            className={`inline-flex items-center gap-2 rounded-full border py-2 pr-3 pl-2.5 text-[14px] font-bold transition ${
              choix === cle ? 'border-cobalt bg-doux' : 'border-trait bg-white'
            } ${modifiable ? 'cursor-pointer hover:border-cobalt' : 'opacity-70'}`}
          >
            <input
              type="radio"
              name="couleur_doc"
              value={cle}
              checked={choix === cle}
              disabled={!modifiable}
              className="m-0 accent-cobalt"
              onChange={async () => {
                const avant = choix;
                setChoix(cle);
                const r = await envoyer(enregistrerReglage, 'couleur_doc', cle);
                if (!r.ok) setChoix(avant);
              }}
            />
            <i className="h-[18px] w-[18px] shrink-0 rounded-full" style={{ background: hexa }} aria-hidden="true" />
            {libelle}
          </label>
        ))}
      </div>
      <div
        className="mt-1.5 flex max-w-[360px] flex-col gap-2 rounded-[12px] border border-trait bg-white p-4 shadow-[0_10px_24px_-18px_rgb(16_26_61/0.35)]"
        aria-label="Aperçu"
      >
        <b className="text-lg font-extrabold" style={{ color: couleur }}>
          {nom}
        </b>
        <span className="h-2 rounded bg-fond" />
        <span className="h-2 w-3/5 rounded bg-fond" />
        <div className="flex justify-between border-t-2 pt-1.5 font-extrabold" style={{ borderColor: couleur, color: couleur }}>
          <span>Total TTC</span>
          <b className="tabular-nums">1 234,00 €</b>
        </div>
      </div>
    </>
  );
}

/** Bas de page des documents. */
export function BasDePage({ valeur }: { valeur: string }) {
  return (
    <ChampAuto
      cle="pied_page"
      libelle="Texte ajouté en bas de chaque document"
      valeur={valeur}
      large
      lignes={3}
      placeholder="ex. Qualification RGE · Merci de votre confiance"
    />
  );
}

