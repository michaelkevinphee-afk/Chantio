'use client';

import { useState } from 'react';
import { CODES_NAF, FORMES_JURIDIQUES } from '@chantio/shared';
import { CaseAuto, ChampAuto, ListeAuto } from './champ-auto';
import { Section } from './elements';
import { sirenDe } from './valeurs';

export interface ValeursEntreprise {
  raison: string;
  nom: string;
  siren: string;
  siret: string;
  siretAttente: boolean;
  /** Identité vérifiée ou en cours : le SIREN ne suit plus le SIRET. */
  sirenFige: boolean;
  forme: string;
  capital: string;
  tva: string;
  rcs: string;
  naf: string;
  adresse: string;
  telephone: string;
  email: string;
  slogan: string;
  assureur: string;
  contrat: string;
  zone: string;
}

/** Paramètres › Mon entreprise (sections et champs du bac). */
export function RubriqueEntreprise({ v }: { v: ValeursEntreprise }) {
  const [attente, setAttente] = useState(v.siretAttente);
  const [siren, setSiren] = useState(v.siren || sirenDe(v.siret));
  const formes: [string, string][] = [...(v.forme ? [] : [['', 'À choisir'] as [string, string]]), ...FORMES_JURIDIQUES.map((f): [string, string] => [f, f])];
  if (v.forme && !formes.some(([f]) => f === v.forme)) formes.unshift([v.forme, v.forme]);
  const nafs: [string, string][] = [['', 'À choisir'], ...CODES_NAF.map(([c, l]): [string, string] => [c, `${c} · ${l}`])];
  if (v.naf && !nafs.some(([c]) => c === v.naf)) nafs.splice(1, 0, [v.naf, v.naf]);

  return (
    <>
      <Section titre="Informations de l’entreprise">
        <ChampAuto cle="raison" libelle="Raison sociale" valeur={v.raison} />
        <ChampAuto cle="nom" libelle="Nom commercial" valeur={v.nom} aide="Le nom affiché en haut des documents et dans le menu." />
        <ChampAuto
          cle="siren"
          libelle="SIREN"
          valeur={attente ? '' : siren}
          lectureSeule
          aide="Ce champ n’est pas modifiable. Le SIREN est automatiquement mis à jour lorsque vous modifiez le SIRET."
          key={`siren-${attente}-${siren}`}
        />
        <div className="flex min-w-0 flex-col gap-2.5">
          <ChampAuto
            cle="siret"
            libelle="SIRET"
            valeur={v.siret}
            desactive={attente}
            inputMode="numeric"
            onEnregistre={(s) => !v.sirenFige && setSiren(sirenDe(s))}
          />
          <CaseAuto cle="siret_attente" libelle="SIRET en cours d’attribution" coche={v.siretAttente} onEnregistre={setAttente} />
        </div>
        <ListeAuto cle="forme_juridique" libelle="Forme juridique" valeur={v.forme} options={formes} />
        <ChampAuto cle="capital" libelle="Capital social" valeur={v.capital} unite="€" inputMode="numeric" aide="Sans objet pour un entrepreneur individuel." />
        <ChampAuto cle="tva_intracom" libelle="N° de TVA" valeur={v.tva} />
        <ChampAuto cle="rcs" libelle="Numéro de RCS" valeur={v.rcs} placeholder="ex. RCS Paris 123 456 789" />
        <ListeAuto cle="activite" libelle="Secteur d’activité" valeur={v.naf} options={nafs} large />
      </Section>
      <Section titre="Coordonnées">
        <ChampAuto cle="adresse" libelle="Adresse" valeur={v.adresse} large autoComplete="street-address" />
        <ChampAuto cle="telephone" libelle="Téléphone" valeur={v.telephone} type="tel" />
        <ChampAuto cle="email" libelle="E-mail" valeur={v.email} type="email" />
        <ChampAuto cle="slogan" libelle="Activité affichée sous le nom" valeur={v.slogan} large placeholder="ex. Plomberie · Chauffage" />
      </Section>
      <Section titre="Assurance">
        <ChampAuto
          cle="assureur"
          libelle="Assurance décennale"
          valeur={v.assureur}
          large
          aide="Assureur, n° de police, zone couverte : la mention est obligatoire sur les devis et factures de travaux."
        />
        <ChampAuto cle="contrat" libelle="N° de police" valeur={v.contrat} />
        <ChampAuto cle="zone" libelle="Zone couverte" valeur={v.zone} placeholder="France métropolitaine" />
      </Section>
    </>
  );
}
