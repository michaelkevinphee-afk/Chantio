import Link from 'next/link';
import type { CSSProperties } from 'react';
import { aujourdhui, dateCourte, dateLongue, initiales, type Membre, type StatutIntervention } from '@chantio/shared';
import { Compteur } from '@/components/compteur';
import { Icone } from '@/components/icones';
import { Avatar, PuceStatut, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';

export const metadata = { title: 'Pilotage · Chantio' };

// « 08:30:00 » → « 8:30 », comme sur les maquettes.
const hhmm = (h: string | null) => (h ? `${Number(h.slice(0, 2))}:${h.slice(3, 5)}` : '');

// Décale l'apparition de chaque bloc.
const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

// Couleur du bloc horaire selon le statut, comme le planning des maquettes.
const BLOC: Record<StatutIntervention, string> = {
  a_planifier: 'bg-[#ECEBE6]',
  planifiee: 'bg-bleu-doux',
  en_cours: 'bg-jaune-doux ring-2 ring-jaune',
  terminee: 'bg-vert-doux',
  a_reprendre: 'bg-rouge-doux',
  validee: 'bg-vert-doux',
  facturee: 'bg-[#ECEBE6]',
};

export default async function Pilotage() {
  const { supabase, membre } = await contexteBureau();
  const jour = aujourdhui();
  const debutMois = `${jour.slice(0, 8)}01`;

  const [{ data: duJour }, { data: enAttente }, { count: factureesMois }, equipe] = await Promise.all([
    supabase.from('interventions').select(SELECT_LISTE).eq('date_prevue', jour).order('heure_prevue'),
    supabase
      .from('interventions')
      .select(SELECT_LISTE)
      .in('statut', ['terminee', 'a_reprendre', 'validee'])
      .order('modifie_le', { ascending: true }),
    supabase
      .from('interventions')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'facturee')
      .gte('facturee_le', debutMois),
    listerEquipe(supabase),
  ]);

  const jourListe = (duJour ?? []) as InterventionListe[];
  const attente = (enAttente ?? []) as InterventionListe[];
  const aValider = attente.filter((i) => i.statut === 'terminee');
  const aReprendre = attente.filter((i) => i.statut === 'a_reprendre');
  const aFacturer = attente.filter((i) => i.statut === 'validee');
  const facturees = factureesMois ?? 0;
  const partFacturee = facturees + aFacturer.length ? facturees / (facturees + aFacturer.length) : 0;

  const terrain = equipe.filter((m) => ['technicien', 'chef_chantier', 'apprenti', 'sous_traitant', 'dirigeant'].includes(m.role));
  const liens = await liensProfils(supabase, [membre.photo_chemin, ...equipe.map((m) => m.photo_chemin)]);
  const photo = (m: Pick<Membre, 'photo_chemin'> | null | undefined) => (m?.photo_chemin ? liens.get(m.photo_chemin) : null);

  const compte = (...s: StatutIntervention[]) => jourListe.filter((i) => s.includes(i.statut)).length;
  const tuiles = [
    { valeur: jourListe.length, libelle: 'Prévues', couleur: 'text-marine' },
    { valeur: compte('en_cours'), libelle: 'En cours', couleur: 'text-orange' },
    { valeur: compte('terminee', 'validee', 'facturee'), libelle: 'Terminées', couleur: 'text-vert' },
    { valeur: aReprendre.length, libelle: 'À reprendre', couleur: 'text-rouge', alerte: aReprendre.length > 0 },
  ];

  return (
    <>
      <Titre
        sous={<span className="inline-block first-letter:uppercase">{dateLongue(jour)} · Bonjour {membre.prenom}</span>}
        actions={<Avatar url={photo(membre)} initiales={initiales(membre.prenom, membre.nom)} taille={64} anneau />}
      >
        Pilotage
      </Titre>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tuiles.map((t, n) => (
              <div
                key={t.libelle}
                style={cascade(n)}
                className={`apparition rounded-[22px] p-5 ${t.alerte ? 'bg-rouge text-white' : 'carte'}`}
              >
                <p className={`font-titre text-6xl font-extrabold leading-none ${t.alerte ? '' : t.couleur}`}>
                  <Compteur valeur={t.valeur} />
                </p>
                <p className={`mt-1 font-bold ${t.alerte ? '' : t.couleur}`}>{t.libelle}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {aReprendre.length > 0 && (
              <Link
                href="/interventions?statut=a_reprendre"
                style={cascade(4)}
                className="carte-lien apparition flex items-center gap-4 rounded-[22px] bg-rouge px-5 py-4 text-white"
              >
                <Icone nom="alerte" taille={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-extrabold">
                    {aReprendre.length} intervention{aReprendre.length > 1 ? 's' : ''} à reprendre
                  </span>
                  <span className="block truncate text-white/85">
                    {aReprendre[0].client?.nom} · {aReprendre[0].motif}
                  </span>
                </span>
                <Icone nom="chevron" />
              </Link>
            )}
            <Link
              href="/interventions?statut=terminee"
              style={cascade(5)}
              className={`carte-lien apparition flex items-center gap-4 rounded-[22px] px-5 py-4 ${
                aValider.length ? 'bg-jaune text-marine' : 'carte'
              }`}
            >
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${aValider.length ? 'bg-white/70' : 'bg-beton'}`}>
                <Icone nom="valider" taille={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold">
                  {aValider.length
                    ? `${aValider.length} fiche${aValider.length > 1 ? 's' : ''} à valider`
                    : 'Aucune fiche à valider'}
                </span>
                <span className="block truncate opacity-80">
                  {aValider.length
                    ? `La plus ancienne : ${aValider[0].client?.nom}, ${dateCourte(aValider[0].modifie_le.slice(0, 10)).toLowerCase()}`
                    : 'Les fiches envoyées par les techniciens arrivent ici.'}
                </span>
              </span>
              <Icone nom="chevron" />
            </Link>
          </div>

          <section style={cascade(6)} className="apparition">
            <h2 className="surtitre mb-3">Aujourd’hui</h2>
            {jourListe.length === 0 ? (
              <div className="carte px-6 py-10 text-center">
                <p className="font-bold">Rien de prévu aujourd’hui</p>
                <Link href="/interventions/nouvelle" className="mt-2 inline-block text-sm font-bold underline">
                  Planifier une intervention
                </Link>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {jourListe.map((i, n) => {
                  const tech = i.affectations[0]?.membre;
                  return (
                    <li key={i.id} style={cascade(7 + n)} className="apparition">
                      <Link
                        href={`/interventions/${i.id}`}
                        className="carte carte-lien flex items-center gap-4 p-3 pr-5"
                      >
                        <span className={`w-20 shrink-0 rounded-2xl px-3 py-2.5 text-center ${BLOC[i.statut]}`}>
                          <span className="block font-titre text-2xl font-extrabold leading-none">
                            {hhmm(i.heure_prevue) || '—'}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-lg font-extrabold">{i.client?.nom}</span>
                          <span className="block truncate text-gris">
                            {i.motif}
                            {i.site?.ville ? ` · ${i.site.ville}` : ''}
                          </span>
                        </span>
                        {tech && (
                          <span className="hidden items-center gap-2 sm:flex">
                            <Avatar url={photo(tech)} initiales={initiales(tech.prenom, tech.nom)} taille={32} />
                            <span className="text-sm font-bold text-gris">{techniciens(i)}</span>
                          </span>
                        )}
                        <PuceStatut statut={i.statut} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section style={cascade(3)} className="carte apparition p-5">
            <p className="font-bold text-gris">Facturées ce mois-ci</p>
            <p className="mt-1 font-titre text-6xl font-extrabold leading-none">
              <Compteur valeur={facturees} />
              <span className="ml-2 font-sans text-lg font-bold text-gris">intervention{facturees > 1 ? 's' : ''}</span>
            </p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-beton">
              <div className="remplissage h-full rounded-full bg-jaune" style={{ width: `${Math.round(partFacturee * 100)}%` }} />
            </div>
            <Link href="/interventions?statut=validee" className="mt-3 flex items-center justify-between text-sm font-bold">
              <span>
                {aFacturer.length ? `${aFacturer.length} validée${aFacturer.length > 1 ? 's' : ''} à facturer` : 'Rien en attente de facturation'}
              </span>
              <Icone nom="chevron" taille={16} />
            </Link>
          </section>

          <section style={cascade(4)} className="apparition">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="surtitre flex items-center gap-2">
                <span className="en-direct inline-block h-2 w-2 rounded-full bg-jaune" />
                L’équipe en direct
              </h2>
              <Link href="/equipe" className="text-sm font-bold underline">
                Gérer
              </Link>
            </div>
            <ul className="space-y-2.5">
              {terrain.map((m, n) => {
                const situation = situationDuJour(m.id, jourListe);
                return (
                  <li key={m.id} style={cascade(5 + n)} className="carte apparition flex items-center gap-3 p-3">
                    <Avatar url={photo(m)} initiales={initiales(m.prenom, m.nom)} taille={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold">
                        {m.prenom} {m.nom ? `${m.nom.slice(0, 1)}.` : ''}
                      </span>
                      <span className={`mt-0.5 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-bold ${situation.ton}`}>
                        {situation.texte}
                      </span>
                    </span>
                    {m.telephone && (
                      <a
                        href={`tel:${m.telephone.replace(/\s/g, '')}`}
                        aria-label={`Appeler ${m.prenom}`}
                        className="grid h-11 w-11 place-items-center rounded-2xl bg-beton transition hover:bg-trait"
                      >
                        <Icone nom="telephone" taille={18} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

/** Ce que fait un membre aujourd'hui, d'après ses interventions du jour. */
function situationDuJour(membreId: string, jour: InterventionListe[]) {
  const siennes = jour.filter((i) => i.affectations.some((a) => a.membre?.id === membreId));
  const enCours = siennes.find((i) => i.statut === 'en_cours');
  if (enCours) return { texte: `Sur site · ${enCours.client?.nom ?? ''}`, ton: 'bg-jaune-doux text-[#8A6100]' };
  const suivante = siennes.find((i) => i.statut === 'planifiee' || i.statut === 'a_planifier');
  if (suivante)
    return { texte: `Prochaine ${hhmm(suivante.heure_prevue) || 'aujourd’hui'} · ${suivante.client?.nom ?? ''}`, ton: 'bg-bleu-doux text-bleu' };
  if (siennes.length) return { texte: 'Journée terminée', ton: 'bg-vert-doux text-vert' };
  return { texte: 'Rien de prévu aujourd’hui', ton: 'bg-[#ECEBE6] text-gris' };
}
