import {
  HEURE_CHANTIER,
  HEURE_DEMI,
  LIBELLE_TYPE_CLIENT,
  aujourdhui,
  familleIntervention,
  interventionDepuisDevis,
  type FamilleIntervention,
  type TypeIntervention,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { lireDocument } from '@/lib/devis';
import type { FicheLue } from '@/lib/lecture';
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

/** Ce que la lecture a gardé d'une ancienne fiche d'intervention (voir lireFicheImportee). */
type FicheImportee = Partial<FicheLue> & { message?: string };

/** Une fiche importée, mise dans la même forme que le pré-remplissage depuis un devis. */
function depuisFiche(f: FicheImportee) {
  const fournitures = (f.fournitures ?? []).filter((l) => l.designation?.trim());
  const description = [
    f.demande?.trim() && `Demande : ${f.demande.trim()}`,
    f.travaux?.trim() && `Travaux réalisés : ${f.travaux.trim()}`,
    fournitures.length && `Fournitures : ${fournitures.map((l) => `${l.quantite || 1} × ${l.designation.trim()}`).join(', ')}`,
    [f.technicien?.trim() && `Technicien : ${f.technicien.trim()}`, f.duree?.trim() && `Durée : ${f.duree.trim()}`].filter(Boolean).join(' · '),
    f.observations?.trim() && `Observations : ${f.observations.trim()}`,
    f.numero?.trim() && `Fiche d’origine n° ${f.numero.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    type: (f.type ?? 'depannage') as TypeIntervention,
    client: { nom: f.client?.trim() ?? '', telephone: f.telephone?.trim() ?? '', type: f.client_type ?? 'particulier' },
    adresse: f.adresse?.trim() ?? '',
    code_postal: f.code_postal?.trim() ?? '',
    ville: f.ville?.trim() ?? '',
    motif: f.motif?.trim() ?? '',
    description,
  };
}

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
    /** Ancienne fiche d'intervention importée et lue (Interventions › Importer). */
    importe?: string;
  };
}) {
  const { supabase } = await contexteBureau();
  const annee = aujourdhui().slice(0, 4);
  const [clients, equipe, lu, importe, { data: premierClient }, ...derniers] = await Promise.all([
    listerClientsAdresses(supabase),
    listerEquipe(supabase),
    valeurs.devis ? lireDocument(supabase, valeurs.devis) : Promise.resolve(null),
    valeurs.importe
      ? supabase.from('imports').select('nom_fichier, champs').eq('id', valeurs.importe).maybeSingle().then((r) => r.data as { nom_fichier: string; champs: FicheImportee } | null)
      : Promise.resolve(null),
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
  const p = lu ? interventionDepuisDevis({ ...lu.document, lignes: lu.lignes }) : (importe ? depuisFiche(importe.champs) : null);
  const fi = importe?.champs;
  const clientDevis = lu
    ? (clients.find((c) => c.id === lu.document.client_id) ?? clients.find((c) => p && simplifier(c.nom) === simplifier(p.client.nom)))
    : p && p.client.nom
      ? clients.find((c) => simplifier(c.nom) === simplifier(p.client.nom))
      : undefined;
  const client =
    valeurs.client && clients.some((c) => c.id === valeurs.client)
      ? valeurs.client
      : (clientDevis?.id ?? (p && (lu || p.client.nom) ? 'nouveau' : (premierClient?.id ?? '')));
  const sites = clients.find((c) => c.id === client)?.sites ?? [];
  const siteDevis = p?.adresse ? sites.find((s) => simplifier(s.adresse) === simplifier(p.adresse)) : undefined;
  const site = valeurs.site && sites.some((s) => s.id === valeurs.site) ? valeurs.site : siteDevis?.id;

  // Depuis une case du planning : jour, demi-journée et technicien déjà choisis.
  const heure = valeurs.heure && HEURE.test(valeurs.heure) ? valeurs.heure : undefined;
  const moment = valeurs.moment ? (valeurs.moment === 'apres-midi' ? 1 : 0) : heure && heure >= '12:00' ? 1 : 0;
  const type = p ? familleIntervention(p.type) : 'depannage';
  // Depuis une fiche importée : jour, heure et technicien écrits sur la fiche.
  const dateFiche = fi?.date && JOUR.test(fi.date) ? fi.date : '';
  const heureFiche = fi?.heure && HEURE.test(fi.heure) ? fi.heure : '';
  const techFiche = fi?.technicien?.trim()
    ? intervenants.find((m) => simplifier(fi.technicien!).split(/\s+/).some((mot) => mot.length > 2 && [m.prenom, m.nom].some((n) => simplifier(n ?? '') === mot)))
    : undefined;
  // L'heure par défaut du moment n'est pas recopiée : elle reste vide, comme dans le bac.
  const heureSaisie = heure && heure !== HEURE_DEMI[moment] && heure !== HEURE_CHANTIER[moment] ? heure : '';

  const initial: ValeursInitiales = {
    type,
    client,
    site,
    date: valeurs.date && JOUR.test(valeurs.date) ? valeurs.date : dateFiche,
    moment: heureFiche ? (heureFiche >= '12:00' ? 1 : 0) : moment,
    heure: heureFiche || heureSaisie,
    techniciens: valeurs.technicien && intervenants.some((m) => m.id === valeurs.technicien) ? [valeurs.technicien] : techFiche ? [techFiche.id] : [],
    motif: p?.motif,
    description: p?.description,
    devis: lu ? { id: lu.document.id, numero: lu.document.numero } : undefined,
    importe: importe ? { nom: importe.nom_fichier, message: fi?.message } : undefined,
    nouveauClient: client === 'nouveau' && p ? p.client : undefined,
    adresse: p && !site && (lu || p.adresse) ? { adresse: p.adresse, code_postal: p.code_postal, ville: p.ville } : undefined,
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
