import 'server-only';
import { adresseComplete, fichierAgenda, type RendezVous } from '@chantio/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

// Invitations d'agenda envoyées aux techniciens par e-mail (API Brevo, déjà utilisé pour les codes).
// À régler dans Vercel : BREVO_API_KEY (clé API Brevo) et CHANTIO_EXPEDITEUR (adresse d'envoi validée chez Brevo).
const CLE = process.env.BREVO_API_KEY ?? '';
const EXPEDITEUR = process.env.CHANTIO_EXPEDITEUR ?? '';
export const invitationsActives = Boolean(CLE && EXPEDITEUR);

type Personne = { id: string; prenom: string; nom: string | null; email: string | null };

/** Le rendez-vous d'agenda d'une intervention (sans participants). */
export async function rendezVousIntervention(supabase: SupabaseClient, interventionId: string) {
  const { data } = await supabase
    .from('interventions')
    .select('id, numero, motif, description, date_prevue, heure_prevue, date_fin, duree_prevue, client:clients(nom, telephone), site:sites(adresse, code_postal, ville, acces), entreprise:entreprises(nom)')
    .eq('id', interventionId)
    .maybeSingle();
  if (!data?.date_prevue) return null;
  const i = data as unknown as {
    id: string;
    numero: number;
    motif: string;
    description: string | null;
    date_prevue: string;
    heure_prevue: string | null;
    date_fin: string | null;
    duree_prevue: number | null;
    client: { nom: string; telephone: string | null } | null;
    site: { adresse: string; code_postal: string | null; ville: string | null; acces: string | null } | null;
    entreprise: { nom: string } | null;
  };
  const rdv: RendezVous = {
    uid: i.id,
    titre: `${i.client?.nom ?? 'Intervention'} · ${i.motif}`,
    lieu: adresseComplete(i.site) || undefined,
    date: i.date_prevue,
    heure: i.heure_prevue,
    dateFin: i.date_fin,
    dureeMinutes: i.duree_prevue ? Math.round(Number(i.duree_prevue) * 60) : undefined,
    description: [
      i.description,
      i.client?.telephone && `Client : ${i.client.telephone}`,
      i.site?.acces && `Accès : ${i.site.acces}`,
      'Fiche dans l’appli Chantio.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
  return { rdv, entreprise: i.entreprise?.nom ?? 'Chantio' };
}

async function envoyer(a: Personne, sujet: string, texte: string, ics: string, expediteur: string) {
  const rep = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': CLE, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: expediteur, email: EXPEDITEUR },
      to: [{ email: a.email, name: `${a.prenom} ${a.nom ?? ''}`.trim() }],
      subject: sujet,
      textContent: texte,
      attachment: [{ name: 'invitation.ics', content: Buffer.from(ics).toString('base64') }],
    }),
  });
  if (!rep.ok) console.error('Invitation non envoyée', rep.status, await rep.text().catch(() => ''));
  return rep.ok;
}

/**
 * Envoie l'invitation (ou sa mise à jour) à `inviter`, et une annulation à `annuler`.
 * Renvoie les prénoms des personnes invitées.
 */
export async function envoyerInvitations(
  supabase: SupabaseClient,
  interventionId: string,
  annuler: Personne[],
  inviter: Personne[],
): Promise<string[]> {
  if (!invitationsActives) return [];
  const infos = await rendezVousIntervention(supabase, interventionId);
  const organisateur = (nom: string) => ({ nom, email: EXPEDITEUR });
  const prevenus: string[] = [];

  const envois: Promise<void>[] = [];
  for (const p of inviter) {
    if (!p.email || !infos) continue;
    const ics = fichierAgenda({ ...infos.rdv, organisateur: organisateur(infos.entreprise), participants: [{ nom: p.prenom, email: p.email }] });
    const quand = new Date(`${infos.rdv.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const heure = infos.rdv.heure ? ` à ${infos.rdv.heure.slice(0, 5).replace(':', ' h ')}` : '';
    envois.push(
      envoyer(
        p,
        `Intervention ${quand}${heure} · ${infos.rdv.titre}`,
        `Bonjour ${p.prenom},\n\nUne intervention t’est confiée ${quand}${heure}.\n${infos.rdv.titre}\n${infos.rdv.lieu ?? ''}\n\nOuvre la pièce jointe pour l’ajouter à ton agenda. Le détail est dans l’appli Chantio.\n\n${infos.entreprise}`,
        ics,
        infos.entreprise,
      ).then((ok) => void (ok && prevenus.push(p.prenom))),
    );
  }
  // Retirés de l'intervention, ou intervention sans date : on annule chez eux.
  for (const p of annuler) {
    if (!p.email) continue;
    const base = infos?.rdv ?? { uid: interventionId, titre: 'Intervention', date: new Date().toISOString().slice(0, 10) };
    const ics = fichierAgenda({ ...base, annule: true, organisateur: organisateur(infos?.entreprise ?? 'Chantio'), participants: [{ nom: p.prenom, email: p.email }] });
    envois.push(
      envoyer(p, `Annulée · ${base.titre}`, `Bonjour ${p.prenom},\n\nCette intervention ne t’est plus confiée : ${base.titre}.`, ics, infos?.entreprise ?? 'Chantio').then(
        () => undefined,
      ),
    );
  }
  await Promise.all(envois);
  return prevenus;
}
