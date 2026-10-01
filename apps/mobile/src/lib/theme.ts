import { couleurs, degrade, tons } from '@chantio/shared';

// Couleurs de l'appli mobile : la même charte que le site Chantio
// (bleu cobalt, pervenche, lavande du logo, fond bleuté clair).
// Le bleu encre sert au texte, jamais en aplat, et pas d'orange.
export { couleurs, degrade, tons };

/** Palette commune + compléments propres au mobile. */
export const c = {
  ...couleurs,
  /** Puces et pastilles bleues du site (« Joint fibre », « Code 4589B »…). */
  puce: '#E3E9FF',
  puceTexte: '#2442C4',
  /** Chevrons, textes indicatifs des champs. */
  grisClair: '#98A2C3',
  /** Texte secondaire posé sur le dégradé cobalt. */
  surCobalt: '#DCE4FF',
  /** Fond d'un bouton doux sous le doigt. */
  presse: '#DCE4FF',
};

/** Ombres « halo bleu » du site, discrètes (grand étalement négatif). */
export const ombres = {
  carte: '0px 16px 32px -24px rgba(47, 84, 235, 0.35)',
  bouton: '0px 14px 28px -14px rgba(47, 84, 235, 0.45)',
  bloc: '0px 24px 40px -22px rgba(47, 84, 235, 0.6)',
};

/** Plus Jakarta Sans partout, comme le site. */
export const polices = {
  titre: 'PlusJakartaSans_800ExtraBold',
  texte: 'PlusJakartaSans_500Medium',
  texte600: 'PlusJakartaSans_600SemiBold',
  texte700: 'PlusJakartaSans_700Bold',
  texte800: 'PlusJakartaSans_800ExtraBold',
};

/** Interlettrage des titres du site (-0,03 em), en points pour une taille donnée. */
export const serre = (taille: number) => -0.03 * taille;
