import 'server-only';

// E-mail simple envoyé par l'API Brevo (déjà réglée pour les invitations d'agenda) :
// BREVO_API_KEY et CHANTIO_EXPEDITEUR dans Vercel. Sans eux, rien n'est envoyé.
const CLE = process.env.BREVO_API_KEY ?? '';
const EXPEDITEUR = process.env.CHANTIO_EXPEDITEUR ?? '';
export const courrielActif = Boolean(CLE && EXPEDITEUR);

/** Envoie un e-mail en texte brut ; renvoie vrai s'il est parti. */
export async function envoyerCourriel(a: { email: string; nom?: string | null }, sujet: string, texte: string) {
  if (!courrielActif) return false;
  try {
    const rep = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': CLE, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Chantio', email: EXPEDITEUR },
        to: [{ email: a.email, ...(a.nom ? { name: a.nom } : {}) }],
        subject: sujet,
        textContent: texte,
      }),
    });
    if (!rep.ok) console.error('Brevo', rep.status, await rep.text().catch(() => ''));
    return rep.ok;
  } catch (e) {
    console.error('Brevo', e);
    return false;
  }
}
