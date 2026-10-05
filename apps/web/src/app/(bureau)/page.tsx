import { aujourdhui, dateLongue, familleIntervention, heureCourte, numeroIntervention, occupe, type StatutIntervention } from '@chantio/shared';
import { AFaireAccueil } from '@/components/accueil/a-faire';
import { ApercuAppli } from '@/components/accueil/apercu-appli';
import { InterventionsAccueil } from '@/components/accueil/interventions-accueil';
import { FAITES, QuiEstOu, type InterventionDuJour } from '@/components/accueil/qui-est-ou';
import { Rafraichir } from '@/components/accueil/rafraichir';
import { presentsSurLeTerrain, techniciensTerrain } from '@/components/accueil/techniciens';
import { CarteDuJour, type ArretCarte } from '@/components/carte-du-jour';
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
type EtatCompte = { statut: StatutIntervention; description: string | null; fiches: { envoyee_le: string | null }[] | null };

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
 * Accueil, comme vAujourdhui() du bac à sable : « Bonjour … » et le résumé des choses à faire,
 * la carte du jour et « Qui est où » côte à côte, les quatre compteurs des interventions,
 * puis la liste « À faire » et « On attend aussi ».
 * Par-dessus la page : le volet d'une intervention (?fiche=), la fenêtre « Nouvelle intervention »
 * (?nouvelle=1) et l'aperçu de l'appli d'un technicien (?appli=<membre>).
 */
export default async function Accueil({ searchParams }: PageProps<'/'>) {
  const { supabase, membre, entreprise } = await contexteBureau();
  const sp = await searchParams;
  // Le volet ?fiche= se lit en même temps que la page.
  prechargerVolet(typeof sp.fiche === 'string' ? sp.fiche : undefined);
  const jour = aujourdhui();

  const [{ liste, resume, attente }, equipe, { data: duJour }, { data: ouvertes }] = await Promise.all([
    chargerAFaire(),
    listerEquipe(supabase),
    // Les interventions du jour, et les chantiers sur plusieurs jours en cours aujourd'hui.
    supabase
      .from('interventions')
      .select(SELECT_JOUR)
      .lte('date_prevue', jour)
      .or(`date_prevue.eq.${jour},date_fin.gte.${jour}`)
      .order('heure_prevue', { ascending: true, nullsFirst: false }),
    // Pour les compteurs : mêmes règles que la liste des interventions (une fiche renvoyée compte « renvoyée »).
    supabase.from('interventions').select('statut, description, fiches(envoyee_le)').in('statut', ['a_planifier', 'planifiee', 'terminee', 'a_reprendre']).limit(10000),
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

  const arrets: ArretCarte[] = jourListe.map((i, n) => {
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
    };
  });

  const etats = ((ouvertes ?? []) as unknown as EtatCompte[]).map((i) => etatAffiche(i));
  const compte = (s: StatutIntervention) => etats.filter((e) => e === s).length;

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
          <LienBouton href="/?nouvelle=1" scroll={false} prefetch={false}>
            Nouvelle intervention
          </LienBouton>
        }
      >
        Bonjour {membre.prenom}
      </Titre>

      <div className="flex flex-col gap-4">
        {/* En haut : où sont les techniciens (la carte, puis chacun) ; dessous, ce qui est à faire. */}
        <div className="grid gap-4 menu:grid-cols-2">
          <section aria-labelledby="aj-c" className="carte flex min-w-0 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="aj-c" className="text-[17px] font-extrabold">
                Carte du jour
              </h2>
              {ville && <span className="text-[12.5px] text-gris">{ville}</span>}
            </div>
            <CarteDuJour
              arrets={arrets}
              entreprise={entreprise.adresse ? { nom: entreprise.nom, site: { adresse: entreprise.adresse, code_postal: entreprise.code_postal ?? null, ville: entreprise.ville ?? null, latitude: null, longitude: null } } : null}
              legende={techniciens.map((t) => ({ id: t.id, prenom: t.prenom, couleur: t.couleur }))}
            />
          </section>
          <section aria-labelledby="aj-q" className="carte flex min-w-0 flex-col gap-1.5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="aj-q" className="text-[17px] font-extrabold">
                Qui est où
              </h2>
              <span className="text-[12.5px] text-gris">
                {jourListe.length ? `${jourListe.length} intervention${jourListe.length > 1 ? 's' : ''} aujourd’hui` : 'Aucune intervention aujourd’hui'}
              </span>
            </div>
            <QuiEstOu
              techniciens={techniciens.map((t) => ({ id: t.id, prenom: t.prenom, nom: t.nom, couleur: t.couleur, photo: (t.photo_chemin && photos.get(t.photo_chemin)) || null }))}
              interventions={interventions}
            />
          </section>
        </div>

        <InterventionsAccueil aujourdhui={jourListe.length} aPlanifier={compte('a_planifier')} aValider={compte('terminee')} renvoyees={compte('a_reprendre')} />

        <AFaireAccueil liste={liste} attente={attente} />
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
