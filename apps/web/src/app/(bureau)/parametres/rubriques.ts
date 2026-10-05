import type { NomIcone } from '@/components/icones';

// Rubriques de Paramètres, dans l'ordre et avec les mots du bac à sable (PARAM et PAGES_P de 45-reglages.js).

export type CleRubrique =
  | 'entreprise'
  | 'numerotation'
  | 'emails'
  | 'banque'
  | 'efacture'
  | 'profil'
  | 'notifications'
  | 'connectivite'
  | 'perso'
  | 'abonnement'
  | 'donnees'
  | 'membres'
  | 'cgv'
  | 'prix'
  | 'budget'
  | 'production'
  | 'compta'
  | 'retours';

export interface Rubrique {
  cle: CleRubrique;
  libelle: string;
  /** Phrase d'aide sous le titre de la rubrique ('' : calculée par la page, ex. Mon profil). */
  aide: string;
  icone: NomIcone;
  /** Masquée pour qui n'est pas dirigeant (comme dans le bac). */
  dirigeantSeul?: boolean;
}

export const GROUPES: { titre: string; rubriques: Rubrique[] }[] = [
  {
    titre: 'Général',
    rubriques: [
      { cle: 'entreprise', libelle: 'Mon entreprise', aide: 'Ces informations apparaissent sur vos devis et vos factures.', icone: 'p_entreprise' },
      {
        cle: 'numerotation',
        libelle: 'Numérotation',
        aide: 'Un compteur par type de document et par année. Un numéro attribué n’est jamais réutilisé, même si le document ou l’intervention est supprimé.',
        icone: 'p_numerotation',
      },
      {
        cle: 'emails',
        libelle: 'E-mails',
        aide: 'Le texte proposé quand vous envoyez un devis ou une facture. Les mots entre accolades sont remplacés par les vraies valeurs : {numero}, {client}, {montant}, {echeance}, {entreprise}.',
        icone: 'enveloppe',
      },
      { cle: 'banque', libelle: 'Comptes bancaires', aide: 'Le compte sur lequel vos clients vous paient.', icone: 'p_banque' },
      { cle: 'efacture', libelle: 'Facturation électronique', aide: 'La réforme de la facture électronique entre entreprises.', icone: 'p_efacture' },
      { cle: 'profil', libelle: 'Mon profil', aide: '', icone: 'p_profil' },
      { cle: 'notifications', libelle: 'Mes notifications', aide: 'Ce qui vous est signalé par e-mail et sur votre téléphone.', icone: 'p_notifications' },
      { cle: 'connectivite', libelle: 'Connectivité', aide: 'Les logiciels et services reliés à Chantio.', icone: 'p_connectivite' },
      { cle: 'perso', libelle: 'Personnalisation', aide: 'L’apparence de vos devis et de vos factures.', icone: 'p_perso' },
      { cle: 'abonnement', libelle: 'Abonnement', aide: 'Votre formule Chantio.', icone: 'p_abonnement', dirigeantSeul: true },
      { cle: 'donnees', libelle: 'Mes données', aide: 'Vos données.', icone: 'p_donnees', dirigeantSeul: true },
      {
        cle: 'membres',
        libelle: 'Membres',
        aide: 'Les personnes qui utilisent Chantio : le bureau sur ordinateur, les techniciens sur leur téléphone.',
        icone: 'p_membres',
        dirigeantSeul: true,
      },
      { cle: 'cgv', libelle: 'Conditions générales', aide: 'Les conditions reprises sur chaque devis et chaque facture.', icone: 'p_cgv' },
    ],
  },
  {
    titre: 'Chiffrage',
    rubriques: [
      {
        cle: 'prix',
        libelle: 'Prix et coefficients',
        aide: 'Les valeurs par défaut de chaque nouveau devis. Elles restent modifiables sur chaque devis et sur chaque ligne.',
        icone: 'p_prix',
      },
    ],
  },
  {
    titre: 'Pilotage',
    rubriques: [
      {
        cle: 'budget',
        libelle: 'Budget de l’année',
        aide: 'Objectifs, achats, frais généraux et coefficients : ce que vous visez cette année. Chiffres › Objectifs de l’année le compare à ce qui est facturé.',
        icone: 'chiffres',
        dirigeantSeul: true,
      },
      {
        cle: 'production',
        libelle: 'Production avant Chantio',
        aide: 'Les mois facturés dans un autre logiciel, l’année précédente et le carnet de commandes. Dès que vous facturez dans Chantio, les mois suivants se remplissent seuls.',
        icone: 'pilotage',
        dirigeantSeul: true,
      },
    ],
  },
  {
    titre: 'Comptabilité',
    rubriques: [{ cle: 'compta', libelle: 'Tenue comptable', aide: 'Ce qu’il faut pour transmettre vos ventes à votre expert-comptable.', icone: 'p_compta' }],
  },
  {
    titre: 'Chantio',
    rubriques: [
      {
        cle: 'retours',
        libelle: 'Retours sur Chantio',
        aide: 'Les idées et remarques envoyées avec la bulle en bas à droite, avec la page exacte où elles ont été dites.',
        icone: 'p_retours',
      },
    ],
  },
];

export const RUBRIQUES: Rubrique[] = GROUPES.flatMap((g) => g.rubriques);

/** Rubrique demandée dans l'adresse (?rubrique=), l'ancienne clé « conditions » ouvrant « cgv ». */
export function rubriqueDemandee(valeur: string | string[] | undefined, dirigeant: boolean): Rubrique | null {
  const cle = (Array.isArray(valeur) ? valeur[0] : valeur) === 'conditions' ? 'cgv' : Array.isArray(valeur) ? valeur[0] : valeur;
  const r = RUBRIQUES.find((x) => x.cle === cle);
  if (!r || (r.dirigeantSeul && !dirigeant)) return null;
  return r;
}
