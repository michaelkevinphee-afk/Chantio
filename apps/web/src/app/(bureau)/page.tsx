import Link from 'next/link';
import type { CSSProperties } from 'react';
import { aujourdhui, dateCourte, dateLongue, initiales, type Membre, type StatutIntervention } from '@chantio/shared';
import { CarteDuJour } from '@/components/carte-du-jour';
import { Compteur } from '@/components/compteur';
import { Icone } from '@/components/icones';
import { Avatar, LienBouton, Panneau, PuceStatut } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, SELECT_LISTE, techniciens, type InterventionListe } from '@/lib/requetes';

export const metadata = { title: 'Pilotage · Chantio' };

// « 08:30:00 » → « 8:30 », comme sur les maquettes.
const hhmm = (h: string | null) => (h ? `${Number(h.slice(0, 2))}:${h.slice(3, 5)}` : '');

// Décale l'apparition de chaque bloc.
const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

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
  const chiffres = [
    { valeur: jourListe.length, libelle: 'Prévues', point: 'bg-pervenche', couleur: 'text-encre' },
    { valeur: compte('en_cours'), libelle: 'En cours', point: 'bg-cobalt en-direct', couleur: 'text-cobalt' },
    { valeur: compte('terminee', 'validee', 'facturee'), libelle: 'Terminées', point: 'bg-menthe', couleur: 'text-vert' },
    { valeur: aValider.length, libelle: 'À valider', point: 'bg-violet', couleur: aValider.length ? 'text-violet' : 'text-encre' },
    { valeur: aReprendre.length, libelle: 'À reprendre', point: 'bg-rouge', couleur: aReprendre.length ? 'text-rouge' : 'text-encre' },
  ];

  // Ce que le bureau doit traiter, du plus urgent au moins urgent.
  const aTraiter = [
    {
      n: aReprendre.length,
      href: '/interventions?statut=a_reprendre',
      icone: 'alerte' as const,
      ton: 'bg-rouge-doux text-rouge',
      titre: `${aReprendre.length} à reprendre`,
      detail: aReprendre[0] ? `${aReprendre[0].client?.nom} · ${aReprendre[0].motif}` : 'Aucune intervention à reprendre',
    },
    {
      n: aValider.length,
      href: '/interventions?statut=terminee',
      icone: 'valider' as const,
      ton: 'bg-violet-doux text-violet',
      titre: `${aValider.length} fiche${aValider.length > 1 ? 's' : ''} à valider`,
      detail: aValider[0]
        ? `La plus ancienne : ${aValider[0].client?.nom}, ${dateCourte(aValider[0].modifie_le.slice(0, 10)).toLowerCase()}`
        : 'Les fiches des techniciens arrivent ici',
    },
    {
      n: aFacturer.length,
      href: '/interventions?statut=validee',
      icone: 'euro' as const,
      ton: 'bg-vert-doux text-vert',
      titre: `${aFacturer.length} à facturer`,
      detail: `${facturees} facturée${facturees > 1 ? 's' : ''} ce mois-ci`,
    },
  ];

  return (
    <>
      <header className="apparition mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-gris">
            <span className="inline-block first-letter:uppercase">{dateLongue(jour)}</span>
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.1] text-encre">Bonjour {membre.prenom}</h1>
        </div>
        <LienBouton href="/interventions/nouvelle" variante="secondaire" className="!py-2.5">
          <Icone nom="plus" taille={18} /> Planifier
        </LienBouton>
      </header>

      {/* Chiffres du jour : une seule bande, cases séparées par des filets. */}
      <section
        style={cascade(1)}
        className="carte apparition mb-6 grid grid-cols-2 divide-trait max-md:divide-y sm:grid-cols-3 md:grid-cols-5 md:divide-x"
      >
        {chiffres.map((c) => (
          <div key={c.libelle} className="px-5 py-4">
            <p className="flex items-center gap-2 text-[13px] font-bold text-gris">
              <span className={`h-2 w-2 rounded-full ${c.point}`} />
              {c.libelle}
            </p>
            <p className={`mt-1.5 text-4xl font-extrabold leading-none tracking-[-0.03em] tabular-nums ${c.couleur}`}>
              <Compteur valeur={c.valeur} />
            </p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panneau
          style={cascade(2)}
          className="apparition"
          titre="Aujourd’hui"
          nombre={jourListe.length}
          action={
            <Link href="/interventions" className="inline-flex items-center gap-1 hover:underline">
              Toutes les interventions <Icone nom="chevron" taille={16} />
            </Link>
          }
        >
          {jourListe.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-bold">Rien de prévu aujourd’hui</p>
              <Link href="/interventions/nouvelle" className="mt-2 inline-block text-sm font-bold text-cobalt underline">
                Planifier une intervention
              </Link>
            </div>
          ) : (
            <>
              <div className="border-b border-trait">
                <CarteDuJour
                  arrets={jourListe.map((i) => ({
                    id: i.id,
                    heure: hhmm(i.heure_prevue) || 'Sans heure',
                    titre: i.client?.nom ?? i.motif,
                    detail: [i.motif, techniciens(i)].filter((t) => t && t !== '—').join(' · '),
                    enCours: i.statut === 'en_cours',
                    site: i.site,
                  }))}
                />
              </div>
              <ol className="divide-y divide-trait">
                {jourListe.map((i, n) => {
                  const tech = i.affectations[0]?.membre;
                  return (
                    <li key={i.id}>
                      <Link
                        href={`/interventions/${i.id}`}
                        className="grid grid-cols-[28px_56px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition hover:bg-fond sm:grid-cols-[28px_56px_minmax(0,1fr)_150px_104px]"
                      >
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold ${
                            i.statut === 'en_cours' ? 'bg-menthe text-white' : 'bg-doux text-cobalt'
                          }`}
                        >
                          {n + 1}
                        </span>
                        <span className={`text-lg font-extrabold tabular-nums ${i.statut === 'en_cours' ? 'text-cobalt' : ''}`}>
                          {hhmm(i.heure_prevue) || '—'}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-extrabold">{i.client?.nom}</span>
                          <span className="block truncate text-sm text-gris">
                            {i.motif}
                            {i.site?.ville ? ` · ${i.site.ville}` : ''}
                          </span>
                        </span>
                        <span className="hidden min-w-0 items-center gap-2 sm:flex">
                          {tech ? (
                            <>
                              <Avatar url={photo(tech)} initiales={initiales(tech.prenom, tech.nom)} taille={28} />
                              <span className="truncate text-sm font-bold text-gris">{techniciens(i)}</span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-gris">Sans technicien</span>
                          )}
                        </span>
                        <span className="justify-self-end">
                          <PuceStatut statut={i.statut} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Panneau>

        <div className="grid gap-6">
          <Panneau style={cascade(3)} className="apparition" titre="À traiter">
            <ul className="divide-y divide-trait">
              {aTraiter.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className={`flex items-center gap-3 px-5 py-3.5 transition hover:bg-fond ${t.n ? '' : 'opacity-60'}`}>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.n ? t.ton : 'bg-gris-doux text-gris'}`}>
                      <Icone nom={t.icone} taille={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">{t.titre}</span>
                      <span className="block truncate text-sm text-gris">{t.detail}</span>
                    </span>
                    <Icone nom="chevron" taille={18} className="text-gris" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-trait px-5 py-4">
              <div className="mb-2 flex justify-between text-[13px] font-bold text-gris">
                <span>Facturation du mois</span>
                <span className="tabular-nums">{Math.round(partFacturee * 100)} %</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-doux">
                <div className="remplissage degrade h-full rounded-full shadow-none" style={{ width: `${Math.round(partFacturee * 100)}%` }} />
              </div>
            </div>
          </Panneau>

          <Panneau
            style={cascade(4)}
            className="apparition"
            titre={
              <>
                <span className="en-direct inline-block h-2 w-2 rounded-full bg-menthe" />
                Équipe en direct
              </>
            }
            action={
              <Link href="/equipe" className="hover:underline">
                Gérer
              </Link>
            }
          >
            <ul className="divide-y divide-trait">
              {terrain.map((m) => {
                const situation = situationDuJour(m.id, jourListe);
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar url={photo(m)} initiales={initiales(m.prenom, m.nom)} taille={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold">
                        {m.prenom} {m.nom ? `${m.nom.slice(0, 1)}.` : ''}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-gris">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${situation.point}`} />
                        <span className="truncate">{situation.texte}</span>
                      </span>
                    </span>
                    {m.telephone && (
                      <a
                        href={`tel:${m.telephone.replace(/\s/g, '')}`}
                        aria-label={`Appeler ${m.prenom}`}
                        className="grid h-9 w-9 place-items-center rounded-xl border border-trait text-cobalt transition hover:border-cobalt hover:bg-doux"
                      >
                        <Icone nom="telephone" taille={16} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panneau>
        </div>
      </div>
    </>
  );
}

/** Ce que fait un membre aujourd'hui, d'après ses interventions du jour. */
function situationDuJour(membreId: string, jour: InterventionListe[]) {
  const siennes = jour.filter((i) => i.affectations.some((a) => a.membre?.id === membreId));
  const enCours = siennes.find((i) => i.statut === 'en_cours');
  if (enCours) return { texte: `Sur site · ${enCours.client?.nom ?? ''}`, point: 'bg-cobalt en-direct' };
  const suivante = siennes.find((i) => i.statut === 'planifiee' || i.statut === 'a_planifier');
  if (suivante)
    return { texte: `Prochaine ${hhmm(suivante.heure_prevue) || 'aujourd’hui'} · ${suivante.client?.nom ?? ''}`, point: 'bg-pervenche' };
  if (siennes.length) return { texte: 'Journée terminée', point: 'bg-menthe' };
  return { texte: 'Rien de prévu aujourd’hui', point: 'bg-trait' };
}
