import { notFound } from 'next/navigation';
import { aujourdhui, estBureau, type Achat, type Fournisseur, type PaiementAchat, type RoleMembre } from '@chantio/shared';
import { lectureActivee } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { FicheAchat } from './fiche';

// La lecture d'une facture peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Facture fournisseur · Chantio' };

type Chantier = { id: string; numero: number; motif: string; client: { nom: string } | null };
const SELECT_CHANTIER = 'id, numero, motif, client:clients(nom)';

export default async function PageAchat({ params }: PageProps<'/achats/[id]'>) {
  const { id } = await params;
  const { supabase, entreprise } = await contexteBureau();
  const { data: achat } = await supabase.from('achats').select('*').eq('id', id).maybeSingle<Achat & { modifie_le: string }>();
  if (!achat) notFound();

  const [fournisseurs, membres, interventions, paiements, commentaires, suivants, doublons] = await Promise.all([
    supabase.from('fournisseurs').select('*').order('nom'),
    supabase.from('membres').select('id, prenom, nom, role').eq('actif', true).order('prenom'),
    supabase.from('interventions').select(SELECT_CHANTIER).order('numero', { ascending: false }).limit(200),
    supabase.from('paiements_achats').select('id, achat_id, moyen, montant, date_paiement').eq('achat_id', id).order('date_paiement').order('cree_le'),
    supabase.from('commentaires_achats').select('id, texte, cree_le, membre:membres(prenom, nom)').eq('achat_id', id).order('cree_le'),
    supabase.from('achats').select('id').eq('statut', 'recu').neq('id', id).order('cree_le').limit(1),
    achat.fournisseur_id && achat.numero
      ? supabase.from('achats').select('id, date_facture').eq('fournisseur_id', achat.fournisseur_id).eq('numero', achat.numero).neq('id', id).limit(1)
      : null,
  ]);

  // Le chantier rattaché, même s'il est plus ancien que la liste proposée.
  let chantiers = (interventions.data ?? []) as unknown as Chantier[];
  if (achat.intervention_id && !chantiers.some((c) => c.id === achat.intervention_id)) {
    const { data } = await supabase.from('interventions').select(SELECT_CHANTIER).eq('id', achat.intervention_id).maybeSingle();
    if (data) chantiers = [data as unknown as Chantier, ...chantiers];
  }

  const chemins = [achat.fichier_chemin, ...(achat.pieces ?? []).map((p) => p.chemin)].filter((c): c is string => !!c);
  const { data: liens } = chemins.length ? await supabase.storage.from('documents').createSignedUrls(chemins, 60 * 60) : { data: [] };
  const lienDe = (chemin: string | null) => (chemin ? (liens?.find((l) => l.path === chemin)?.signedUrl ?? null) : null);

  type Commentaire = { id: string; texte: string; cree_le: string; membre: { prenom: string; nom: string } | null };
  return (
    <FicheAchat
      key={achat.modifie_le}
      achat={achat}
      fournisseurs={(fournisseurs.data ?? []) as Fournisseur[]}
      membres={((membres.data ?? []) as { id: string; prenom: string; nom: string; role: RoleMembre }[]).filter((m) => estBureau(m.role) || m.id === achat.responsable_id)}
      chantiers={chantiers.map((c) => ({
        id: c.id,
        libelle: `N° ${String(c.numero).padStart(4, '0')} · ${[c.client?.nom, c.motif].filter(Boolean).join(' · ')}`,
      }))}
      paiements={((paiements.data ?? []) as PaiementAchat[]).map((p) => ({ ...p, montant: Number(p.montant) }))}
      commentaires={((commentaires.data ?? []) as unknown as Commentaire[]).map((c) => ({
        id: c.id,
        texte: c.texte,
        cree_le: c.cree_le,
        auteur: c.membre ? `${c.membre.prenom} ${c.membre.nom}`.trim() : 'Ancien membre',
      }))}
      suivant={(suivants.data?.[0]?.id as string | undefined) ?? null}
      doublon={(doublons?.data?.[0] as { id: string; date_facture: string } | undefined) ?? null}
      lien={lienDe(achat.fichier_chemin)}
      pieces={(achat.pieces ?? []).map((p) => ({ ...p, lien: lienDe(p.chemin) }))}
      lecture={lectureActivee()}
      jour={aujourdhui()}
      entrepriseId={entreprise.id}
    />
  );
}
