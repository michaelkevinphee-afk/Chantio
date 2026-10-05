// Bulles affichées au retour d'une action serveur qui redirige (planifier les visites, préparer le renouvellement).
// Les paramètres de l'adresse (?visites=4&de=ENT-2026-0012&a=ENT-2026-0015) sont lus puis retirés par <Annonce>.

type Param = string | string[] | undefined;
const un = (v: Param) => (typeof v === 'string' ? v : '');

/** Message de la bulle, ou null s'il n'y a rien à annoncer. */
export function messageRetour(p: { visites?: Param; de?: Param; a?: Param; erreur?: Param }): { message: string; ton: 'ok' | 'erreur'; retirer: string[] } | null {
  const retirer = ['visites', 'de', 'a', 'erreur'];
  const erreur = un(p.erreur);
  if (erreur) return { message: erreur, ton: 'erreur', retirer };
  const visites = un(p.visites);
  if (!visites) return null;
  if (visites === 'deja') return { message: 'Toutes les visites de l’année sont déjà planifiées', ton: 'ok', retirer };
  const n = Number(visites);
  if (!Number.isFinite(n) || n <= 0) return { message: 'Les visites n’ont pas pu être créées. Réessayez.', ton: 'erreur', retirer };
  const de = un(p.de);
  const a = un(p.a);
  const nums = de ? ` (${de}${n > 1 && a ? ` à ${a}` : ''})` : '';
  return { message: `${n} visite${n > 1 ? 's créées' : ' créée'}${nums}, à placer au planning`, ton: 'ok', retirer };
}
