import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  aujourdhui,
  dateCourte,
  dateLongue,
  initiales,
  LIBELLE_ROLE,
  type Membre,
  type Pointage,
  type PositionMembre,
  type StatutIntervention,
} from '@chantio/shared';
import { Compteur } from '@/components/compteur';
import { EquipeEnDirect } from '@/components/equipe-en-direct';
import { Icone } from '@/components/icones';
import { LienBouton, Panneau } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { liensProfils } from '@/lib/profils';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';

export const metadata = { title: 'Pilotage · Chantio' };

// Décale l'apparition de chaque bloc.
const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

export default async function Pilotage() {
  const { supabase, membre } = await contexteBureau();
  const jour = aujourdhui();
  const debutMois = `${jour.slice(0, 8)}01`;

  const [{ data: duJour }, { data: enAttente }, { count: factureesMois }, equipe, { data: positions }] = await Promise.all([
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
    // Dernières positions partagées : seuls le dirigeant et les chefs de chantier les reçoivent.
    supabase.from('positions').select('membre_id, latitude, longitude, precision_m, enregistree_le'),
  ]);

  const jourListe = (duJour ?? []) as InterventionListe[];
  const { data: pointages } = jourListe.length
    ? await supabase
        .from('pointages')
        .select('intervention_id, membre_id, genre, latitude, longitude, le')
        .in('intervention_id', jourListe.map((i) => i.id))
    : { data: [] };
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

      <EquipeEnDirect
        membres={terrain.map((m) => ({
          id: m.id,
          prenom: m.prenom,
          nom: m.nom,
          initiales: initiales(m.prenom, m.nom),
          role: LIBELLE_ROLE[m.role],
          telephone: m.telephone,
          photo: photo(m) ?? null,
          partage: !!m.partage_position,
        }))}
        interventions={jourListe.map((i) => ({
          id: i.id,
          heure: i.heure_prevue,
          client: i.client?.nom ?? i.motif,
          motif: i.motif,
          ville: i.site?.ville ?? null,
          statut: i.statut,
          membres: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
          site: i.site,
        }))}
        positions={(positions ?? []) as PositionMembre[]}
        pointages={(pointages ?? []) as Pointage[]}
        aTraiter={
            <Panneau style={cascade(4)} className="apparition" titre="À traiter">
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
        }
      />
    </>
  );
}
