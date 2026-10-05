import { classeBouton } from '@/components/ui';

// Habillage commun du volet d'une intervention et de la fenêtre de création : la disposition du bac
// (rubriques séparées par des filets, rangées de champs), avec les classes de la charte Chantio.

/** Une rubrique du volet (.v-sec du bac). */
export const SECTION = 'flex flex-col gap-2.5 border-b border-trait pb-4';
/** Titre d'une rubrique. */
export const TITRE_SECTION = 'flex items-center gap-2 text-[15px] font-extrabold text-encre';
/** Libellé d'un champ (petit, gris, gras). */
export const ETIQUETTE = 'mb-1 block text-[13px] font-bold text-gris';
/** Champ de saisie un peu plus compact que .champ seul. */
export const CHAMP = 'champ rounded-[12px] px-3 py-2 text-[14.5px] disabled:bg-fond disabled:text-gris';
/** Rangée de champs : autant de colonnes qu'il en tient (170 px au moins), en colonne sur téléphone. */
export const RANGEE = 'grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5';
/** Rangée du volet : deux colonnes au plus (Date · Moment, puis Heure · Durée), une seule sous 350 px. */
export const RANGEE_VOLET = 'grid grid-cols-[repeat(auto-fit,minmax(max(170px,calc((100%-10px)/2)),1fr))] gap-2.5';
/** Petit texte d'aide sous un champ. */
export const AIDE = 'mt-1 block text-xs font-medium text-gris';
/** Petits boutons des bandeaux et rubriques (bouton petit du bac). */
export const PETIT = classeBouton('principal', '!rounded-[10px] !px-3 !py-1.5 !text-[13px]');
export const PETIT_SECOND = classeBouton('secondaire', '!rounded-[10px] !px-3 !py-1.5 !text-[13px] !text-cobalt');
export const PETIT_DANGER = classeBouton('danger', '!rounded-[10px] !px-3 !py-1.5 !text-[13px]');
/** Encadré « Qui paie » / « La facture partira à » (.payeur du bac). */
export const PAYEUR = 'rounded-[10px] bg-doux px-3 py-2.5 text-[13px] leading-relaxed [&_b]:font-bold [&_b]:text-cobalt';
/** Puce d'un technicien à cocher (.puce-t du bac). */
export const PUCE_TECH =
  'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-[3px] pr-[11px] pl-1 text-[13px] font-bold transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cobalt';
export const PUCE_TECH_ON = 'border-cobalt bg-doux text-cobalt';
export const PUCE_TECH_OFF = 'border-trait bg-white text-encre hover:border-pervenche';
/** Bandeaux d'action en tête du volet (.ban du bac). */
export const BANDEAU = {
  violet: 'bg-violet-doux [&>b:first-child]:text-violet',
  rouge: 'bg-rouge-doux [&>b:first-child]:text-rouge',
  vert: 'bg-vert-doux [&>b:first-child]:text-vert',
  gris: 'bg-fond text-gris',
  cobalt: 'bg-doux [&>b:first-child]:text-cobalt',
} as const;
export type TonBandeau = keyof typeof BANDEAU;
