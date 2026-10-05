'use server';

import Anthropic from '@anthropic-ai/sdk';
import { guideEnTexte, SECTIONS_AIDE } from '@/lib/aide-contenu';
import { MISSIONS, type IdMission } from '@/lib/premiers-pas';
import { contexte } from '@/lib/session';

// Assistant de la bulle (« Une question ») : répond sur l'utilisation de Chantio à partir du guide
// seulement (lib/aide-contenu.ts), avec la section à montrer (capture) et la visite guidée à proposer.
// Il passe par la même clé ANTHROPIC_API_KEY que la lecture des devis. Une question sans réponse
// dans le guide part dans les retours, pour que l'équipe complète le guide.

const MODELE = 'claude-sonnet-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reponse: { type: 'string', description: 'Réponse en français, vouvoiement, étapes numérotées courtes si besoin, noms de boutons entre « ».' },
    section: { type: 'string', enum: ['', ...SECTIONS_AIDE.map((s) => s.id)], description: 'Section du guide qui répond, ou vide.' },
    visite: { type: 'string', enum: ['', ...MISSIONS.filter((m) => m.gestes).map((m) => m.id)], description: 'Visite guidée à proposer, ou vide.' },
    trouve: { type: 'boolean', description: 'false si le guide ne contient pas la réponse.' },
  },
  required: ['reponse', 'section', 'visite', 'trouve'],
} as const;

const CONSIGNE = `Tu es l'assistant de Chantio, logiciel de fiches d'intervention, devis et factures pour artisans du bâtiment (plombiers, chauffagistes).
Tu réponds à un artisan qui n'est pas à l'aise avec l'informatique.
Règles :
- Réponds seulement à partir du GUIDE ci-dessous. N'invente aucun bouton, menu ni fonction.
- Si le guide ne contient pas la réponse, dis-le simplement en une phrase, propose la piste la plus proche du guide s'il y en a une, et mets trouve à false.
- Vouvoiement, phrases courtes, pas de jargon. Au plus 6 étapes numérotées. Les noms de boutons entre « ».
- Pas de mise en forme Markdown (pas de **, pas de #). Une étape par ligne.
- section : l'identifiant de la section du guide qui répond. visite : l'identifiant de la visite guidée de cette section, s'il y en a une, sinon vide.

GUIDE
${guideEnTexte()}`;

export type ReponseAide = { ok: true; reponse: string; section: string | null; visite: IdMission | null } | { ok: false; erreur: string };

export async function demanderAide(d: { question: string; page: string; titrePage: string }): Promise<ReponseAide> {
  const { supabase, membre, entreprise } = await contexte();
  const question = typeof d.question === 'string' ? d.question.trim().slice(0, 1000) : '';
  if (!question) return { ok: false, erreur: 'Écrivez ou dictez votre question.' };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, erreur: 'L’assistant n’est pas encore branché. Regardez la page Aide, dans le menu.' };

  try {
    const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic(espace ? { defaultHeaders: { 'anthropic-workspace-id': espace } } : {});
    const r = await client.messages.create({
      model: MODELE,
      max_tokens: 1500,
      system: CONSIGNE,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: `Page affichée : ${String(d.titrePage || d.page).slice(0, 200)}\nQuestion : ${question}` }],
    });
    const bloc = r.content.find((b) => b.type === 'text');
    if (!bloc || bloc.type !== 'text') throw new Error('réponse vide');
    const j = JSON.parse(bloc.text) as { reponse: string; section: string; visite: string; trouve: boolean };
    // Question sans réponse dans le guide : notée dans les retours, pour compléter le guide.
    if (!j.trouve)
      await supabase.from('retours').insert({
        entreprise_id: entreprise.id,
        membre_id: membre.id,
        auteur: [membre.prenom, membre.nom].filter(Boolean).join(' '),
        texte: `Question à l’assistant, sans réponse dans le guide : ${question}`,
        page: String(d.page || '/').slice(0, 1000),
        titre_page: String(d.titrePage || '').slice(0, 300) || null,
      });
    return {
      ok: true,
      reponse: j.reponse,
      section: SECTIONS_AIDE.some((s) => s.id === j.section) ? j.section : null,
      visite: (MISSIONS.find((m) => m.id === j.visite && m.gestes)?.id ?? null) as IdMission | null,
    };
  } catch (e) {
    console.error('Assistant', e);
    return { ok: false, erreur: 'L’assistant ne répond pas pour l’instant. Réessayez, ou regardez la page Aide.' };
  }
}
