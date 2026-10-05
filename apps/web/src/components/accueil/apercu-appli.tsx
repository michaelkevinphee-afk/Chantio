import Link from 'next/link';
import {
  ajouterJours,
  dateLongue,
  familleIntervention,
  heureCourte,
  jourCourt,
  jourSemaine,
  LIBELLE_STATUT_TERRAIN,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  occupe,
  surPlusieursJours,
  TON_FAMILLE,
  type StatutIntervention,
  type Ton,
  type TypeIntervention,
  type Urgence,
} from '@chantio/shared';
import { etatAffiche } from '@/app/(bureau)/interventions/filtres';
import { Fenetre } from '@/components/fenetre';
import { Puce } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { AvatarTechnicien } from './techniciens';

type LigneAppli = {
  id: string;
  type: TypeIntervention;
  urgence: Urgence;
  motif: string;
  statut: StatutIntervention;
  description: string | null;
  date_prevue: string | null;
  date_fin: string | null;
  heure_prevue: string | null;
  site: { adresse: string } | null;
  client: { nom: string } | null;
  occupant: { nom: string } | null;
  fiches: { envoyee_le: string | null }[] | null;
};
type InterventionAppli = LigneAppli & { etat: StatutIntervention };

const SELECT =
  'id, type, urgence, motif, statut, description, date_prevue, date_fin, heure_prevue, site:sites(adresse), client:clients(nom), occupant:occupants(nom), fiches(envoyee_le), affectations!inner(membre_id)';
const FINIES: StatutIntervention[] = ['terminee', 'validee', 'facturee'];
const TON_ETAT: Partial<Record<StatutIntervention, Ton>> = { planifiee: 'bleu', a_planifier: 'bleu', en_cours: 'cobalt', a_reprendre: 'rouge' };
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const maj1 = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** n-ième jour ouvré (lundi à vendredi) après `jour` (ouvre() du bac). */
function ouvre(jour: string, n: number): string {
  let j = jour;
  for (let k = n; k > 0; ) {
    j = ajouterJours(j, 1);
    if (jourSemaine(j) < 5) k--;
  }
  return j;
}

/** « 14:00 », ou « Chantier · jour 2 sur 4 » pour un chantier sur plusieurs jours (quandTerrain du bac). */
function quand(i: LigneAppli, jour: string): string {
  if (surPlusieursJours(i)) {
    let tot = 0;
    let k = 0;
    for (let d = i.date_prevue!; d <= i.date_fin!; d = ajouterJours(d, 1)) {
      if (occupe(i, d)) {
        tot++;
        if (d <= jour) k = tot;
      }
    }
    return `Chantier · jour ${k} sur ${tot}`;
  }
  return heureCourte(i.heure_prevue) || 'Dans la journée';
}

function Carte({ i, jour, grand = false }: { i: InterventionAppli; jour: string; grand?: boolean }) {
  const famille = familleIntervention(i.type);
  const detail = i.occupant?.nom ?? i.client?.nom;
  return (
    <Link
      href={`/?fiche=${i.id}`}
      scroll={false}
      className={`flex flex-col gap-1 rounded-[16px] border bg-white p-3 transition hover:border-cobalt ${
        grand ? 'border-2 border-cobalt p-[11px] shadow-[0_14px_30px_-22px_rgba(47,84,235,0.8)]' : 'border-trait'
      } ${i.etat === 'a_reprendre' ? '!border-rouge' : ''} ${FINIES.includes(i.etat) ? 'opacity-70' : ''}`}
    >
      <span className="text-[15px] font-extrabold text-cobalt tabular-nums">{quand(i, jour)}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Puce ton={TON_FAMILLE[famille]}>{LIBELLE_TYPE[i.type]}</Puce>
        {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
        <Puce ton={TON_ETAT[i.etat] ?? 'vert'}>{LIBELLE_STATUT_TERRAIN[i.etat]}</Puce>
      </span>
      <b className="text-[16.5px] leading-snug font-extrabold [overflow-wrap:anywhere]">{i.motif}</b>
      <span className="text-[13.5px] text-gris [overflow-wrap:anywhere]">
        {i.site?.adresse ?? '—'}
        {detail ? ` · ${detail}` : ''}
      </span>
      {grand && i.description?.trim() && (
        <span className="mt-1 rounded-[10px] bg-violet-doux px-2.5 py-2 text-[13.5px] whitespace-pre-line [overflow-wrap:anywhere]">{i.description.trim()}</span>
      )}
    </Link>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-extrabold tracking-[0.07em] text-gris uppercase">{titre}</h3>
      {children}
    </section>
  );
}

/**
 * « Son appli » : ce que le technicien voit aujourd'hui sur son téléphone (tJournee du bac), en aperçu
 * dans une fenêtre par-dessus l'Accueil (?appli=<membre>) : à reprendre, en cours, maintenant, à suivre,
 * terminées, demain et plus tard. Un clic sur une intervention ouvre son volet.
 */
export async function ApercuAppli({
  technicien,
  fermer,
  jour,
}: {
  technicien: { id: string; prenom: string; nom: string | null; couleur: string; photo: string | null };
  fermer: string;
  jour: string;
}) {
  const { supabase } = await contexteBureau();
  const fin = ouvre(jour, 6);
  const [{ data: periode }, { data: ouvertes }] = await Promise.all([
    // Ses interventions d'aujourd'hui aux six prochains jours ouvrés…
    supabase
      .from('interventions')
      .select(SELECT)
      .eq('affectations.membre_id', technicien.id)
      .lte('date_prevue', fin)
      .or(`date_prevue.gte.${jour},date_fin.gte.${jour}`)
      .limit(500),
    // … et celles en cours ou à reprendre, quelle que soit leur date.
    supabase
      .from('interventions')
      .select(SELECT)
      .eq('affectations.membre_id', technicien.id)
      .in('statut', ['en_cours', 'a_reprendre', 'a_planifier', 'planifiee'])
      .limit(500),
  ]);
  const lignes = [...(periode ?? []), ...(ouvertes ?? [])] as unknown as LigneAppli[];
  const toutes = [...new Map(lignes.map((i) => [i.id, i])).values()].map(
    (i): InterventionAppli => ({ ...i, etat: etatAffiche({ statut: i.statut, description: i.description, fiches: i.fiches }) }),
  );
  const parHeure = (a: InterventionAppli, b: InterventionAppli) => (a.heure_prevue ?? '99').localeCompare(b.heure_prevue ?? '99');
  const duJour = (j: string) => toutes.filter((i) => occupe(i, j)).sort(parHeure);

  const duj = duJour(jour);
  const reprendre = toutes.filter((i) => i.etat === 'a_reprendre');
  const enCours = toutes.filter((i) => i.etat === 'en_cours');
  const aFaire = duj.filter((i) => i.etat === 'planifiee');
  const finies = duj.filter((i) => FINIES.includes(i.etat));
  const demainJ = ouvre(jour, 1);
  const demain = duJour(demainJ).filter((i) => i.etat === 'planifiee');
  const plusTard: { i: InterventionAppli; j: string }[] = [];
  for (let k = 2; k <= 6; k++) {
    const j = ouvre(jour, k);
    for (const i of duJour(j)) {
      if (i.etat === 'planifiee' && !plusTard.some((x) => x.i.id === i.id) && !demain.some((x) => x.id === i.id)) plusTard.push({ i, j });
    }
  }
  const nom = [technicien.prenom, technicien.nom].filter(Boolean).join(' ');
  const liste = (titre: string, l: InterventionAppli[], grand = false) =>
    l.length > 0 && (
      <Section titre={titre}>
        {l.map((i, n) => (
          <Carte key={i.id} i={i} jour={jour} grand={grand && n === 0} />
        ))}
      </Section>
    );

  return (
    <Fenetre
      titre="Appli technicien"
      texte={
        <>
          Vous voyez l’appli comme <b className="font-extrabold text-encre">{nom}</b>, sur son téléphone.
        </>
      }
      fermer={fermer}
    >
      <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border-[7px] border-doux bg-fond">
        <div className="grid grid-cols-[30px_minmax(0,1fr)_30px] items-center gap-2 border-b border-trait bg-white px-4 py-3">
          <span aria-hidden="true" />
          <b className="text-center text-[16px] font-extrabold">Ma journée</b>
          <AvatarTechnicien prenom={technicien.prenom} nom={technicien.nom} couleur={technicien.couleur} photo={technicien.photo} taille={30} />
        </div>
        <div className="flex flex-col gap-3.5 p-4">
          <div>
            <h2 className="text-[22px] font-extrabold">Bonjour {technicien.prenom}</h2>
            <p className="text-gris">
              {maj1(dateLongue(jour))} · {pluriel(duj.length, 'intervention', 'interventions')}
              {finies.length ? `, ${pluriel(finies.length, 'terminée', 'terminées')}` : ''}
            </p>
          </div>
          {liste('À reprendre', reprendre, true)}
          {liste('En cours', enCours, true)}
          {liste('Maintenant', aFaire.slice(0, 1), true)}
          {liste('À suivre', aFaire.slice(1))}
          {liste('Terminées', finies)}
          {!duj.length && !reprendre.length && !enCours.length && (
            <div className="flex flex-col items-center gap-2.5 px-2.5 py-7 text-center text-gris">
              <p>Rien de prévu aujourd’hui.</p>
              <p className="text-[12.5px]">Côté bureau, glissez une intervention sur {technicien.prenom} dans le planning : elle apparaît ici.</p>
            </div>
          )}
          {liste(`Demain · ${jourCourt(demainJ)}`, demain)}
          {plusTard.length > 0 && (
            <Section titre="Plus tard">
              {plusTard.map(({ i, j }) => (
                <Link
                  key={i.id}
                  href={`/?fiche=${i.id}`}
                  scroll={false}
                  className="grid grid-cols-[74px_minmax(0,1fr)] gap-x-2.5 rounded-[12px] border border-trait bg-white px-3 py-2.5 transition hover:border-cobalt"
                >
                  <span className="row-span-2 text-[13px] font-bold text-cobalt">{jourCourt(j)}</span>
                  <b className="font-extrabold [overflow-wrap:anywhere]">{i.motif}</b>
                  <small className="col-start-2 text-[12.5px] text-gris [overflow-wrap:anywhere]">{i.site?.adresse ?? '—'}</small>
                </Link>
              ))}
            </Section>
          )}
        </div>
      </div>
    </Fenetre>
  );
}
