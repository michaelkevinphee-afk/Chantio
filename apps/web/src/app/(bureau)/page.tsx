import { aujourdhui, dateLongue, eurBac, familleIntervention, heureCourte, numeroIntervention, occupe, rangerAFaire } from '@chantio/shared';
import { AttenteAccueil, lienAccueil, LignesAFaire } from '@/components/accueil/a-faire';
import { ApercuAppli } from '@/components/accueil/apercu-appli';
import { CoupDOeil, type CaseAccueil } from '@/components/accueil/coup-d-oeil';
import { FAITES } from '@/components/accueil/du-jour';
import { EquipeDuJour, type ArretEquipe, type InterventionDuJour } from '@/components/accueil/equipe-du-jour';
import { Rafraichir } from '@/components/accueil/rafraichir';
import { presentsSurLeTerrain, techniciensTerrain } from '@/components/accueil/techniciens';
import { LienBouton, Titre } from '@/components/ui';
import { chargerAFaire } from '@/lib/a-faire';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { Annonce } from './clients/fenetres';
import { messageRetour } from './clients/messages';
import { PARAMS_FICHE, PARAMS_NOUVELLE } from './interventions/adresse';
import { etatAffiche, heureParis } from './interventions/filtres';
import { FenetreNouvelleIntervention } from './interventions/nouvelle/fenetre';
import { prechargerVolet, VoletIntervention } from './interventions/volet-intervention';

export const metadata = { title: 'Accueil · Chantio' };

// Les interventions du jour, avec ce qu'il faut pour l'état affiché (fiche renvoyée) et l'heure d'arrivée.
const SELECT_JOUR = `${SELECT_LISTE}, fiches(debut, envoyee_le)`;
type InterventionJour = InterventionListe & { fiches: { debut: string | null; envoyee_le: string | null }[] | null };

const chaine = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const maj1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** « Paris 16e », sinon la ville de l'entreprise (repère à droite de « Carte du jour »). */
function villeCourte(e: { adresse: string | null; code_postal?: string | null; ville?: string | null }): string {
  let cp = e.code_postal ?? '';
  let ville = e.ville ?? '';
  const m = /(\d{5})\s+([^,\d][^,]*)$/.exec(e.adresse ?? '');
  if (m) {
    cp ||= m[1];
    ville ||= m[2].trim();
  }
  const paris = /^750(\d\d)$/.exec(cp);
  if (paris && /^paris/i.test(ville)) {
    const n = Number(paris[1]);
    return `Paris ${n}${n === 1 ? 'er' : 'e'}`;
  }
  return ville;
}

/**
 * Accueil : « Bonjour … », le résumé des choses à faire, les boutons « Planning équipe » et
 * « Nouvelle intervention » ; puis l'équipe du jour (carte, journée de chacun), et « En un coup d'œil » :
 * les paiements clients en retard en grand et les autres choses à faire rangées en cases.
 * Par-dessus la page : le volet d'une intervention (?fiche=), la fenêtre « Nouvelle intervention »
 * (?nouvelle=1) et l'aperçu de l'appli d'un technicien (?appli=<membre>).
 */
export default async function Accueil({ searchParams }: PageProps<'/'>) {
  const { supabase, membre, entreprise } = await contexteBureau();
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const jour = aujourdhui();

  const [{ liste, resume, attente }, equipe, { data: duJour }] = await Promise.all([
    chargerAFaire(),
    listerEquipe(supabase),
    // Les interventions du jour, et les chantiers sur plusieurs jours en cours aujourd'hui.
    supabase
      .from('interventions')
      .select(SELECT_JOUR)
      .lte('date_prevue', jour)
      .or(`date_prevue.eq.${jour},date_fin.gte.${jour}`)
      .order('heure_prevue', { ascending: true, nullsFirst: false }),
  ]);

  const jourListe = ((duJour ?? []) as unknown as InterventionJour[]).filter((i) => occupe(i, jour));
  const { data: arrivees } = jourListe.length
    ? await supabase
        .from('pointages')
        .select('intervention_id, le')
        .eq('genre', 'arrivee')
        .in(
          'intervention_id',
          jourListe.map((i) => i.id),
        )
    : { data: [] };
  const arrivee = new Map<string, string>();
  for (const p of (arrivees ?? []) as { intervention_id: string; le: string }[]) {
    const deja = arrivee.get(p.intervention_id);
    if (!deja || p.le < deja) arrivee.set(p.intervention_id, p.le);
  }

  const tousTechniciens = techniciensTerrain(equipe);
  // Comme le bac (techsTerrain) : les comptes ouverts, et les invités qui ont une intervention aujourd'hui.
  const techniciens = presentsSurLeTerrain(
    tousTechniciens,
    jourListe.flatMap((i) => i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : []))),
  );
  const photos = await liensProfils(
    supabase,
    tousTechniciens.map((t) => t.photo_chemin),
  );
  const couleur = new Map(tousTechniciens.map((t) => [t.id, t.couleur]));

  const interventions: InterventionDuJour[] = jourListe.map((i) => {
    const etat = etatAffiche({ statut: i.statut, description: i.description, fiches: i.fiches });
    const debut = (i.fiches ?? []).map((f) => f.debut).filter((d): d is string => !!d).sort().at(-1);
    const depuis = arrivee.get(i.id) ?? debut;
    return {
      id: i.id,
      reference: numeroIntervention(i),
      heure: heureCourte(i.heure_prevue),
      motif: i.motif,
      famille: familleIntervention(i.type),
      etat,
      lieu: i.site?.adresse || i.client?.nom || '—',
      membres: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
      depuis: etat === 'en_cours' && depuis ? heureParis(depuis) : null,
    };
  });

  const arrets: ArretEquipe[] = jourListe.map((i, n) => {
    const iv = interventions[n];
    const premier = i.affectations.find((a) => a.membre)?.membre ?? null;
    return {
      id: i.id,
      heure: iv.heure,
      titre: `${iv.reference} · ${i.motif}`,
      detail: [i.client?.nom, i.site?.adresse].filter(Boolean).join(' · '),
      enCours: iv.etat === 'en_cours',
      fait: FAITES.includes(iv.etat),
      couleur: premier ? couleur.get(premier.id) : undefined,
      etiquette: [iv.heure, premier?.prenom].filter(Boolean).join(' ') || iv.reference,
      lien: `/?fiche=${i.id}`,
      site: i.site,
      membres: iv.membres,
    };
  });

  // « En un coup d'œil » : les retards de paiement en grand, puis une case par sorte de chose à faire.
  const [retards, ...autres] = rangerAFaire(liste);
  const cases: CaseAccueil[] = autres.map((c) => ({
    cle: c.cle,
    titre: c.titre,
    phrase: c.phrase,
    n: c.lignes.length,
    urgent: c.urgent,
    somme: c.montant > 0 ? `${eurBac(c.montant, 0)} ${c.cle === 'devis' ? 'HT' : 'TTC'}` : null,
  }));
  const details = Object.fromEntries([retards, ...autres].filter((c) => c.lignes.length).map((c) => [c.cle, <LignesAFaire key={c.cle} lignes={c.lignes} />]));

  // Adresse de l'Accueil sans le volet, la fenêtre ou l'aperçu : là où l'on revient en les fermant.
  const sans = (cles: readonly string[]) => {
    const p = new URLSearchParams();
    for (const [cle, v] of Object.entries(sp)) if (typeof v === 'string' && !cles.includes(cle)) p.set(cle, v);
    const qs = p.toString();
    return qs ? `/?${qs}` : '/';
  };
  const fiche = chaine(sp.fiche);
  const nouvelle = sp.nouvelle === '1';
  const appli = tousTechniciens.find((t) => t.id === chaine(sp.appli));
  const moment = chaine(sp.moment);
  const annonce = chaine(sp.visites) ? messageRetour({ visites: sp.visites, de: sp.de, a: sp.a }) : null;
  const ville = villeCourte(entreprise);

  return (
    <>
      <Titre
        texte={`${maj1(dateLongue(jour))} · ${resume.texte}`}
        actions={
          <>
            <LienBouton variante="secondaire" href="/planning">
              Planning équipe
            </LienBouton>
            <LienBouton href="/?nouvelle=1" scroll={false} prefetch={false}>
              Nouvelle intervention
            </LienBouton>
          </>
        }
      >
        Bonjour {membre.prenom}
      </Titre>

      <div className="flex flex-col gap-4">
        {/* En haut : l'équipe (la carte, puis chacun et sa journée) ; dessous, les choses à faire rangées en cases. */}
        <EquipeDuJour
          arrets={arrets}
          entreprise={entreprise.adresse ? { nom: entreprise.nom, site: { adresse: entreprise.adresse, code_postal: entreprise.code_postal ?? null, ville: entreprise.ville ?? null, latitude: null, longitude: null } } : null}
          techniciens={techniciens.map((t) => ({ id: t.id, prenom: t.prenom, nom: t.nom, couleur: t.couleur, photo: (t.photo_chemin && photos.get(t.photo_chemin)) || null }))}
          interventions={interventions}
          aPlacer={cases.find((c) => c.cle === 'placer')?.n ?? 0}
          repere={[ville, jourListe.length ? `${jourListe.length} intervention${jourListe.length > 1 ? 's' : ''} aujourd’hui` : 'Aucune intervention aujourd’hui'].filter(Boolean).join(' · ')}
        />

        <CoupDOeil
          retards={retards.lignes.map((x) => ({
            cle: x.cle,
            qui: x.client?.nom ?? x.module ?? 'Sans client',
            montant: eurBac(x.montant ?? 0, 0),
            jours: x.jours ?? null,
            lien: lienAccueil(x.lien),
          }))}
          totalRetards={eurBac(retards.montant, 0)}
          cases={cases}
          details={details}
        />

        {attente && <AttenteAccueil attente={attente} />}
      </div>

      {fiche && <VoletIntervention key={fiche} id={fiche} fermer={sans([...PARAMS_FICHE, ...PARAMS_NOUVELLE, 'appli'])} />}
      {nouvelle && (
        <FenetreNouvelleIntervention
          fermer={sans(PARAMS_NOUVELLE)}
          valeurs={{
            client: chaine(sp.client),
            site: chaine(sp.site),
            devis: chaine(sp.devis),
            date: chaine(sp.date),
            heure: chaine(sp.heure),
            moment: moment === 'matin' || moment === 'apres-midi' ? moment : undefined,
            technicien: chaine(sp.technicien),
          }}
        />
      )}
      {appli && !fiche && (
        <ApercuAppli
          key={appli.id}
          technicien={{ id: appli.id, prenom: appli.prenom, nom: appli.nom, couleur: appli.couleur, photo: (appli.photo_chemin && photos.get(appli.photo_chemin)) || null }}
          fermer={sans(['appli'])}
          jour={jour}
        />
      )}
      {annonce && <Annonce message={annonce.message} ton={annonce.ton} retirer={annonce.retirer} />}
      {!fiche && !nouvelle && !appli && <Rafraichir />}
    </>
  );
}
