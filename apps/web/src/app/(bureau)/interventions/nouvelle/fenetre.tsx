import {
  HEURE_CHANTIER,
  HEURE_DEMI,
  LIBELLE_TYPE_CLIENT,
  aujourdhui,
  familleIntervention,
  interventionDepuisDevis,
  type FamilleIntervention,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { lireDocument } from '@/lib/devis';
import { liensProfils } from '@/lib/profils';
import { listerClientsAdresses, listerEquipe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { FormulaireIntervention, type ValeursInitiales } from './formulaire';
import '../interventions.css';

/** Préfixe du numéro selon le type, comme prive.prefixe_intervention() côté base. */
const PREFIXES: Record<FamilleIntervention, string> = { depannage: 'DEP', chantier: 'CH', entretien: 'ENT' };
const FAMILLES = Object.keys(PREFIXES) as FamilleIntervention[];

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
const simplifier = (n: string) =>
  n
    .toLowerCase()
    .replace(/^(mme et m\.|mme|m\.|monsieur|madame)\s+/, '')
    .trim();

/**
 * Fenêtre « Nouvelle intervention », comme le bac : par-dessus la page (?nouvelle=1), avec le numéro affiché d'avance.
 * `fermer` = l'adresse de la page sans la fenêtre ; après la création, le volet de la nouvelle intervention s'y ouvre.
 * `valeurs` : ce qui est déjà choisi (depuis une case libre du planning, la fiche d'un client ou un devis).
 */
export async function FenetreNouvelleIntervention({
  fermer,
  valeurs = {},
}: {
  fermer: string;
  valeurs?: {
    client?: string;
    site?: string;
    devis?: string;
    date?: string;
    heure?: string;
    moment?: 'matin' | 'apres-midi';
    technicien?: string;
  };
}) {
  const { supabase } = await contexteBureau();
  const annee = aujourdhui().slice(0, 4);
  const [clients, equipe, lu, { data: premierClient }, ...derniers] = await Promise.all([
    listerClientsAdresses(supabase),
    listerEquipe(supabase),
    valeurs.devis ? lireDocument(supabase, valeurs.devis) : Promise.resolve(null),
    // Donneur d'ordre choisi d'office, comme le bac (S.clients[0]) : le premier client enregistré.
    supabase.from('clients').select('id').order('cree_le').order('nom').limit(1).maybeSingle(),
    ...FAMILLES.map((f) =>
      supabase
        .from('interventions')
        .select('reference')
        .like('reference', `${PREFIXES[f]}-${annee}-%`)
        .order('reference', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  ]);

  // Numéro affiché d'avance : le suivant de chaque préfixe cette année (la base le confirme à la création).
  const numeros = Object.fromEntries(
    FAMILLES.map((f, n) => {
      const dernier = Number(String(derniers[n]?.data?.reference ?? '').split('-')[2]) || 0;
      return [f, `${PREFIXES[f]}-${annee}-${String(dernier + 1).padStart(4, '0')}`];
    }),
  ) as Record<FamilleIntervention, string>;

  const intervenants = equipe.filter((m) => m.role !== 'assistant');
  const photos = await liensProfils(
    supabase,
    intervenants.map((m) => m.photo_chemin),
  );

  // Depuis un devis : client, adresse du chantier, objet et ouvrages déjà remplis.
  const p = lu ? interventionDepuisDevis({ ...lu.document, lignes: lu.lignes }) : null;
  const clientDevis = lu
    ? (clients.find((c) => c.id === lu.document.client_id) ?? clients.find((c) => p && simplifier(c.nom) === simplifier(p.client.nom)))
    : undefined;
  const client =
    valeurs.client && clients.some((c) => c.id === valeurs.client) ? valeurs.client : (clientDevis?.id ?? (p ? 'nouveau' : (premierClient?.id ?? '')));
  const sites = clients.find((c) => c.id === client)?.sites ?? [];
  const siteDevis = p?.adresse ? sites.find((s) => simplifier(s.adresse) === simplifier(p.adresse)) : undefined;
  const site = valeurs.site && sites.some((s) => s.id === valeurs.site) ? valeurs.site : siteDevis?.id;

  // Depuis une case du planning : jour, demi-journée et technicien déjà choisis.
  const heure = valeurs.heure && HEURE.test(valeurs.heure) ? valeurs.heure : undefined;
  const moment = valeurs.moment ? (valeurs.moment === 'apres-midi' ? 1 : 0) : heure && heure >= '12:00' ? 1 : 0;
  const type = p ? familleIntervention(p.type) : 'depannage';
  // L'heure par défaut du moment n'est pas recopiée : elle reste vide, comme dans le bac.
  const heureSaisie = heure && heure !== HEURE_DEMI[moment] && heure !== HEURE_CHANTIER[moment] ? heure : '';

  const initial: ValeursInitiales = {
    type,
    client,
    site,
    date: valeurs.date && JOUR.test(valeurs.date) ? valeurs.date : '',
    moment,
    heure: heureSaisie,
    techniciens: valeurs.technicien && intervenants.some((m) => m.id === valeurs.technicien) ? [valeurs.technicien] : [],
    motif: p?.motif,
    description: p?.description,
    devis: lu ? { id: lu.document.id, numero: lu.document.numero } : undefined,
    nouveauClient: client === 'nouveau' && p ? p.client : undefined,
    adresse: p && !site ? { adresse: p.adresse, code_postal: p.code_postal, ville: p.ville } : undefined,
  };

  return (
    <Fenetre titre="Nouvelle intervention" large sansCroix fermer={fermer}>
      <FormulaireIntervention
        retour={fermer}
        clients={clients}
        numeros={numeros}
        typesClient={Object.entries(LIBELLE_TYPE_CLIENT).map(([valeur, libelle]) => ({ valeur, libelle }))}
        techniciens={intervenants.map((m) => ({
          id: m.id,
          prenom: m.prenom,
          nom: m.nom,
          photo: m.photo_chemin ? (photos.get(m.photo_chemin) ?? null) : null,
          invite: !m.user_id,
        }))}
        initial={initial}
      />
    </Fenetre>
  );
}
