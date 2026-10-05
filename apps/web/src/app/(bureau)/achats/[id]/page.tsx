import { notFound } from 'next/navigation';
import { aujourdhui, euroAchat, LIBELLE_STATUT_ACHAT, numeroIntervention, type Achat, type Fournisseur, type PaiementAchat, type StatutAchat } from '@chantio/shared';
import { PleinEcran } from '@/components/plein-ecran';
import { lectureActivee } from '@/lib/lecture';
import { contexteBureau } from '@/lib/session';
import { FicheAchat, type FactureFournisseurCourte } from './fiche';

// La lecture d'une facture peut prendre jusqu'à une minute.
export const maxDuration = 60;

export const metadata = { title: 'Facture fournisseur · Chantio' };

type Chantier = { id: string; numero: number; reference: string | null; motif: string; client: { nom: string } | null };
const SELECT_CHANTIER = 'id, numero, reference, motif, client:clients(nom)';

/** Fiche plein écran d'une facture fournisseur ; ?payer=1 ouvre directement « Déclarer un paiement ». */
export default async function PageAchat({ params, searchParams }: PageProps<'/achats/[id]'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, entreprise } = await contexteBureau();
  const { data: achat } = await supabase.from('achats').select('*').eq('id', id).maybeSingle<Achat>();
  if (!achat) notFound();

  const echapper = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);
  const [fournisseurs, membres, interventions, paiements, commentaires, factures, doublons] = await Promise.all([
    supabase.from('fournisseurs').select('*').order('nom'),
    supabase.from('membres').select('id, prenom, nom').eq('actif', true).order('prenom'),
    // Seulement les chantiers, du plus récent au plus ancien (comme le bac).
    supabase.from('interventions').select(SELECT_CHANTIER).eq('type', 'chantier').order('date_prevue', { ascending: false, nullsFirst: false }).limit(300),
    supabase.from('paiements_achats').select('id, achat_id, moyen, montant, date_paiement').eq('achat_id', id).order('date_paiement').order('cree_le'),
    supabase.from('commentaires_achats').select('id, texte, cree_le, membre:membres(prenom, nom)').eq('achat_id', id).order('cree_le'),
    // Les factures de chaque fournisseur, pour « Ses factures » dans la fenêtre du fournisseur.
    supabase.from('achats').select('id, fournisseur_id, numero, date_facture, montant_ttc, statut, avoir').not('fournisseur_id', 'is', null).order('date_facture', { ascending: false }).limit(2000),
    achat.fournisseur_id && achat.numero
      ? supabase
          .from('achats')
          .select('id, numero, statut, montant_ttc, avoir, fournisseur:fournisseurs(nom)')
          .eq('fournisseur_id', achat.fournisseur_id)
          .ilike('numero', echapper(achat.numero.trim()))
          .neq('id', id)
          .limit(1)
      : null,
  ]);

  // Le chantier rattaché, même s'il n'est plus dans la liste proposée.
  let chantiers = (interventions.data ?? []) as unknown as Chantier[];
  if (achat.intervention_id && !chantiers.some((c) => c.id === achat.intervention_id)) {
    const { data } = await supabase.from('interventions').select(SELECT_CHANTIER).eq('id', achat.intervention_id).maybeSingle();
    if (data) chantiers = [data as unknown as Chantier, ...chantiers];
  }

  const chemins = [achat.fichier_chemin, ...(achat.pieces ?? []).map((p) => p.chemin)].filter((c): c is string => !!c);
  const { data: liens } = chemins.length ? await supabase.storage.from('documents').createSignedUrls(chemins, 60 * 60) : { data: [] };
  const lienDe = (chemin: string | null) => (chemin ? (liens?.find((l) => l.path === chemin)?.signedUrl ?? null) : null);

  type Commentaire = { id: string; texte: string; cree_le: string; membre: { prenom: string; nom: string } | null };
  type Doublon = { id: string; numero: string; statut: StatutAchat; montant_ttc: number; avoir: boolean; fournisseur: { nom: string } | null };
  const d = (doublons?.data?.[0] as unknown as Doublon | undefined) ?? null;

  return (
    <PleinEcran>
      <FicheAchat
        // Nouvelle fiche quand le statut, le type ou le résultat de la lecture changent ; sinon les champs en cours restent.
        key={`${achat.statut}|${achat.avoir}|${achat.lecture ?? ''}`}
        achat={{ ...achat, montant_ht: Number(achat.montant_ht), montant_tva: Number(achat.montant_tva), montant_ttc: Number(achat.montant_ttc), taux_tva: Number(achat.taux_tva) }}
        fournisseurs={(fournisseurs.data ?? []) as Fournisseur[]}
        factures={((factures.data ?? []) as FactureFournisseurCourte[]).map((f) => ({ ...f, montant_ttc: Number(f.montant_ttc) }))}
        membres={(membres.data ?? []).map((m) => ({ id: m.id as string, nom: `${m.prenom} ${m.nom ?? ''}`.trim() }))}
        chantiers={chantiers.map((c) => ({ id: c.id, libelle: `${numeroIntervention(c)} · ${c.motif}${c.client?.nom ? ` (${c.client.nom})` : ''}` }))}
        paiements={((paiements.data ?? []) as PaiementAchat[]).map((p) => ({ ...p, montant: Number(p.montant) }))}
        commentaires={((commentaires.data ?? []) as unknown as Commentaire[]).map((c) => ({
          id: c.id,
          texte: c.texte,
          cree_le: c.cree_le,
          auteur: c.membre ? `${c.membre.prenom} ${c.membre.nom ?? ''}`.trim() : 'Ancien membre',
        }))}
        doublon={
          d
            ? {
                id: d.id,
                texte: `La facture n° ${d.numero} de ${d.fournisseur?.nom ?? 'ce fournisseur'} existe déjà (${LIBELLE_STATUT_ACHAT[d.statut].toLowerCase()}, ${euroAchat(d, Number(d.montant_ttc))} TTC).`,
              }
            : null
        }
        lien={lienDe(achat.fichier_chemin)}
        pieces={(achat.pieces ?? []).map((p) => ({ ...p, lien: lienDe(p.chemin) }))}
        // « Facturé à » : la raison sociale si elle est renseignée, comme le bac (ENT.raison || ENT.nom).
        entreprise={{ nom: entreprise.facturation?.raison?.trim() || entreprise.nom, adresse: entreprise.adresse ?? null }}
        lecture={lectureActivee()}
        jour={aujourdhui()}
        entrepriseId={entreprise.id}
        payer={sp.payer === '1'}
      />
    </PleinEcran>
  );
}
