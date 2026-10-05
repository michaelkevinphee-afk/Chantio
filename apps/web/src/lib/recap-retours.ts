import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

// Récapitulatif des retours envoyés avec la bulle (Paramètres › Retours sur Chantio).
// Utilise Claude (Anthropic) avec la même clé ANTHROPIC_API_KEY que la lecture des devis.

const MODELE = 'claude-opus-5-5';

const CONSIGNE = `Tu prépares, pour l'éditeur du logiciel Chantio (gestion d'interventions pour artisans du BTP), le récapitulatif des retours envoyés par ses utilisateurs pendant leurs tests.
Chaque retour indique sa date, son auteur, la page où il a été dit (titre affiché et adresse) et le texte, souvent dicté à voix haute : corrige les fautes de dictée sans changer le sens.
Écris en français simple, sans jargon, en texte brut sans Markdown (pas de #, pas de **, pas de tableaux).
Structure :
1. « En bref : » puis deux ou trois phrases sur ce qui ressort.
2. « Par thème : » puis un bloc par thème (titre du thème seul sur sa ligne), avec des lignes commençant par « • » : la demande reformulée, puis entre parenthèses la page et l'auteur. Regroupe les retours qui disent la même chose.
3. « À faire en premier : » trois à cinq lignes « • » classées par importance pour l'utilisateur, avec une raison courte.
4. « À clarifier : » les retours ambigus et la question à poser à leur auteur (omets la section s'il n'y en a pas).
N'invente rien qui ne soit pas dans les retours.`;

export type RetourARecap = {
  cree_le: string;
  auteur: string | null;
  page: string;
  titre_page: string | null;
  statut: string;
  texte: string;
};

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

export async function resumerRetours(retours: RetourARecap[]): Promise<{ texte: string } | { erreur: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { erreur: 'Clé ANTHROPIC_API_KEY absente dans Vercel : le récap ne peut pas être fait.' };
  const liste = retours
    .map(
      (r, i) =>
        `Retour ${i + 1} · ${quand(r.cree_le)} · ${r.auteur || 'Membre'} · statut ${r.statut}\nPage : ${r.titre_page || '?'} (${r.page})\n${r.texte}`,
    )
    .join('\n\n');
  try {
    const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic(espace ? { defaultHeaders: { 'anthropic-workspace-id': espace } } : {});
    const reponse = await client.messages.create({
      model: MODELE,
      max_tokens: 8000,
      system: CONSIGNE,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `Voici ${retours.length} retour(s) :\n\n${liste}` }],
    });
    const texte = reponse.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!texte || reponse.stop_reason === 'refusal') return { erreur: 'Le récap n’a pas pu être fait : relancez-le.' };
    return { texte };
  } catch (e) {
    console.error('Récap des retours', e);
    if (e instanceof Anthropic.APIError) {
      if (e.status === 401) return { erreur: 'Clé ANTHROPIC_API_KEY refusée : vérifiez-la dans Vercel.' };
      if (/credit balance/i.test(String(e.message))) return { erreur: 'Crédit Anthropic épuisé : ajoutez du crédit sur console.anthropic.com.' };
      if (e.status === 429 || (e.status ?? 0) >= 500) return { erreur: 'Le service est surchargé : relancez dans quelques minutes.' };
    }
    return { erreur: 'Le récap n’a pas pu être fait : relancez-le dans un instant.' };
  }
}
