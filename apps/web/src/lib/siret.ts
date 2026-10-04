// Contrôles de forme des numéros d'entreprise (utilisables côté navigateur).

/** Contrôle de Luhn d'un SIREN ou d'un SIRET (La Poste exceptée). */
export function numeroValide(numero: string) {
  const n = numero.replace(/\s/g, '');
  if (!/^\d{9}$|^\d{14}$/.test(n)) return false;
  if (n.startsWith('356000000')) return true;
  let somme = 0;
  for (let i = 0; i < n.length; i++) {
    let c = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) c = c * 2 > 9 ? c * 2 - 9 : c * 2;
    somme += c;
  }
  return somme % 10 === 0;
}

/** « 123456789 » → « 123 456 789 », « 12345678900012 » → « 123 456 789 00012 ». */
export function formaterNumero(numero: string | null | undefined) {
  const n = (numero ?? '').replace(/\s/g, '');
  if (/^\d{14}$/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
  if (/^\d{9}$/.test(n)) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  return numero ?? '';
}
