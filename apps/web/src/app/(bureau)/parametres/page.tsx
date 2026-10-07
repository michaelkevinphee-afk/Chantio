import Link from 'next/link';
import type { ReactNode } from 'react';
import { aujourdhui, initiales, libelleAcces, type Formule, type ReglagesFacturation, type StatutAbonnement } from '@chantio/shared';
import { deconnecter } from '@/app/actions-session';
import { EnvoiPhoto } from '@/components/envoi-photo';
import { Icone } from '@/components/icones';
import { Avatar, Bouton, LienBouton, Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { contexteBureau, mesEntreprises } from '@/lib/session';
import { Note, Section } from './elements';
import { lireBudget } from '../chiffres/annee/donnees';
import { RubriquePrix } from './formulaire';
import { RubriqueMembres } from './membres';
import { RubriqueAcces } from './acces';
import { RubriqueRetours } from './retours';
import { RubriqueBudget, RubriqueProduction } from './pilotage';
import { CasesNotifications } from './notifications';
import { ChampsProfil, ChangerMotDePasse } from './profil';
import { RubriqueEntreprise } from './rubrique-entreprise';
import { GROUPES, RUBRIQUES, rubriqueDemandee, type CleRubrique } from './rubriques';
import { RubriqueAbonnement, RubriqueConnectivite, RubriqueDonnees, RubriqueEfacture } from './rubriques-info';
import { BasDePage, CouleurDocuments, RubriqueBanque, RubriqueCgv, RubriqueCompta, RubriqueEmails } from './rubriques-reglages';
import { adresseComplete, capitalDe, nafDe, NOTIFICATIONS_DEFAUT, type Notifications } from './valeurs';

export const metadata = { title: 'Paramètres · Chantio' };

/** Rubriques que tout le bureau peut modifier (les autres sont réservées au dirigeant). */
const POUR_TOUS: CleRubrique[] = ['profil', 'notifications', 'retours'];

const NUMEROS: [string, string][] = [
  ['DEP', 'Dépannages'],
  ['CH', 'Chantiers'],
  ['ENT', 'Entretiens'],
  ['DE', 'Devis'],
  ['FA', 'Factures'],
  ['AV', 'Avoirs'],
  ['CT', 'Contrats'],
];

const jjmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function Parametres({ searchParams }: PageProps<'/parametres'>) {
  const ctx = await contexteBureau();
  const { supabase, entreprise, membre } = ctx;
  const sp = await searchParams;
  const dirigeant = membre.role === 'dirigeant';
  // Sur téléphone, sans rubrique dans l'adresse, seule la liste des rubriques s'affiche ;
  // sur ordinateur, « Mon entreprise » s'ouvre d'office.
  const demandee = rubriqueDemandee(sp.rubrique, dirigeant);
  const active = demandee ?? RUBRIQUES[0];
  const cle = active.cle;
  const r: ReglagesFacturation = entreprise.facturation ?? {};
  const t = (k: keyof ReglagesFacturation) => (r[k] == null ? '' : String(r[k]));

  let aide: ReactNode = active.aide;
  let bouton: ReactNode = null;
  let contenu: ReactNode = null;

  if (cle === 'entreprise') {
    contenu = (
      <RubriqueEntreprise
        v={{
          raison: t('raison'),
          nom: entreprise.nom,
          siren: entreprise.siren ? `${entreprise.siren.slice(0, 3)} ${entreprise.siren.slice(3, 6)} ${entreprise.siren.slice(6)}` : '',
          siret: entreprise.siret ? entreprise.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') : t('siret'),
          siretAttente: !!r.siret_attente,
          sirenFige: entreprise.identite_statut === 'en_attente' || entreprise.identite_statut === 'verifiee',
          forme: entreprise.forme_juridique ?? r.forme ?? '',
          capital: capitalDe(r.capital),
          tva: entreprise.tva_intracom ?? r.tva_intra ?? '',
          rcs: t('rcs'),
          naf: nafDe(entreprise.activite),
          adresse: adresseComplete(entreprise),
          telephone: entreprise.telephone ?? '',
          email: entreprise.email ?? '',
          slogan: t('slogan'),
          assureur: t('assureur'),
          contrat: t('contrat'),
          zone: t('zone'),
        }}
      />
    );
  } else if (cle === 'numerotation') {
    const an = aujourdhui().slice(0, 4);
    const dernier = async (table: 'interventions' | 'documents' | 'contrats', colonne: string, prefixe: string) => {
      const { data } = await supabase.from(table).select(colonne).like(colonne, `${prefixe}-${an}-%`).order(colonne, { ascending: false }).limit(1);
      return ((data?.[0] as Record<string, string> | undefined)?.[colonne] ?? null) as string | null;
    };
    const derniers = await Promise.all(
      NUMEROS.map(([p]) =>
        p === 'CT' ? dernier('contrats', 'reference', p) : ['DE', 'FA', 'AV'].includes(p) ? dernier('documents', 'numero', p) : dernier('interventions', 'reference', p),
      ),
    );
    contenu = (
      <>
        <Section titre="Prochains numéros" grille={false}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
            {NUMEROS.map(([p, libelle], k) => {
              const n = derniers[k] ? Number(derniers[k]!.slice(-4)) + 1 : 1;
              return (
                <div key={p} className="flex flex-col rounded-[10px] bg-fond px-2.5 py-2">
                  <small className="text-xs text-gris">{libelle}</small>
                  <b className="font-mono text-sm font-bold text-cobalt">{`${p}-${an}-${String(n).padStart(4, '0')}`}</b>
                  <small className="text-xs text-gris">prochain numéro</small>
                </div>
              );
            })}
          </div>
        </Section>
        <Section titre="Format" grille={false}>
          <p>
            Le préfixe, l’année, puis un numéro à 4 chiffres : <b className="font-mono">FA-{an}-0001</b>. Le compteur repart à 1 chaque 1<sup>er</sup> janvier.
          </p>
          <Note>Les factures se suivent sans trou ni doublon, comme la loi le demande. Un brouillon n’a pas encore de numéro : il le reçoit quand on le finalise.</Note>
        </Section>
      </>
    );
  } else if (cle === 'emails') {
    contenu = <RubriqueEmails r={r} email={entreprise.email ?? ''} />;
  } else if (cle === 'banque') {
    contenu = <RubriqueBanque r={r} nom={entreprise.nom} />;
  } else if (cle === 'efacture') {
    contenu = <RubriqueEfacture />;
  } else if (cle === 'profil') {
    const [{ data: compte }, entreprises, liens] = await Promise.all([supabase.auth.getUser(), mesEntreprises(), liensProfils(supabase, [membre.photo_chemin])]);
    const photo = membre.photo_chemin ? liens.get(membre.photo_chemin) : null;
    const valide = compte.user?.email_confirmed_at;
    aide = `Votre compte est le même dans toutes vos entreprises. Vous êtes ${libelleAcces(membre.role).toLowerCase()} de ${entreprise.nom}.`;
    contenu = (
      <>
        <Section titre="Mes informations">
          <ChampsProfil
            prenom={membre.prenom}
            nom={membre.nom ?? ''}
            email={ctx.user.email ?? membre.email}
            telephone={membre.telephone ?? ''}
            valideLe={valide ? jjmmaaaa(valide) : null}
            modifiable={dirigeant}
          />
          <div className="col-span-full flex flex-wrap items-center gap-3">
            <Avatar url={photo} initiales={initiales(membre.prenom, membre.nom)} taille={44} />
            <EnvoiPhoto entrepriseId={entreprise.id} membreId={membre.id} libelle={membre.photo_chemin ? 'Changer ma photo' : 'Ajouter ma photo'} />
          </div>
        </Section>
        <Section titre="Connexion" grille={false}>
          <p>Avec votre e-mail et votre mot de passe. Le code reçu par e-mail n’a servi qu’une fois, pour valider l’adresse.</p>
          <div className="flex flex-wrap gap-2">
            <ChangerMotDePasse />
            <form action={deconnecter}>
              <Bouton variante="secondaire" className="!px-4 !py-2.5 text-sm">
                Se déconnecter
              </Bouton>
            </form>
          </div>
        </Section>
        <Section titre="Mes entreprises" grille={false}>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {entreprises.map((e) => (
              <li key={e.id}>
                <b>{e.nom}</b> : {libelleAcces(e.role).toLowerCase()}
              </li>
            ))}
          </ul>
          <LienBouton href="/entreprises?depuis=profil" variante="secondaire" className="w-full !py-2.5 text-sm">
            Gérer vos entreprises
          </LienBouton>
        </Section>
      </>
    );
  } else if (cle === 'notifications') {
    const { data: compte } = await supabase.auth.getUser();
    const n: Notifications = { ...NOTIFICATIONS_DEFAUT, ...((compte.user?.user_metadata?.notifications ?? {}) as Partial<Notifications>) };
    contenu = (
      <>
        <Section titre="Me prévenir quand…" grille={false}>
          <CasesNotifications n={n} />
        </Section>
        <Note className="mt-5">Ces envois ne sont pas encore en place : vos choix sont déjà enregistrés pour votre compte.</Note>
      </>
    );
  } else if (cle === 'connectivite') {
    contenu = <RubriqueConnectivite />;
  } else if (cle === 'perso') {
    const liens = await liensProfils(supabase, [entreprise.logo_chemin]);
    const logo = entreprise.logo_chemin ? liens.get(entreprise.logo_chemin) : null;
    contenu = (
      <>
        <Section titre="Couleur des documents" grille={false}>
          <CouleurDocuments valeur={t('couleur_doc')} nom={entreprise.nom} modifiable={dirigeant} />
        </Section>
        <Section titre="Logo" grille={false}>
          <p>Votre logo en haut des documents.</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-trait bg-fond p-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo de l’entreprise" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-2xl font-extrabold text-lavande">{entreprise.nom.slice(0, 1)}</span>
              )}
            </span>
            {dirigeant && <EnvoiPhoto entrepriseId={entreprise.id} logo libelle={entreprise.logo_chemin ? 'Changer le logo' : 'Ajouter le logo'} />}
          </div>
          {!logo && <Note>En attendant, le nom commercial est écrit en toutes lettres.</Note>}
        </Section>
        <Section titre="Bas de page">
          <BasDePage valeur={t('pied_page')} />
        </Section>
      </>
    );
  } else if (cle === 'abonnement') {
    const { data: etat } = await supabase.from('abonnements').select('statut, essai_fin').eq('entreprise_id', entreprise.id).maybeSingle();
    contenu = <RubriqueAbonnement formule={(entreprise.formule ?? 'equipe') as Formule} etat={etat as { statut: StatutAbonnement; essai_fin: string | null } | null} />;
  } else if (cle === 'donnees') {
    contenu = <RubriqueDonnees />;
  } else if (cle === 'membres') {
    bouton = (
      <LienBouton href="/parametres?rubrique=membres&nouveau=1" scroll={false} className="!px-4 !py-2.5 text-sm">
        <Icone nom="plus" taille={18} /> Nouveau collaborateur
      </LienBouton>
    );
    contenu = <RubriqueMembres ctx={ctx} sp={sp} />;
  } else if (cle === 'cgv') {
    contenu = <RubriqueCgv r={r} />;
  } else if (cle === 'retours') {
    contenu = <RubriqueRetours ctx={ctx} />;
  } else if (cle === 'acces') {
    contenu = <RubriqueAcces ctx={ctx} sp={sp} />;
  } else if (cle === 'budget' || cle === 'production') {
    // Réservées au dirigeant (rubriqueDemandee les refuse aux autres), comme les tables du pilotage.
    const annee = Number(aujourdhui().slice(0, 4));
    const [{ data: budgetLu }, { data: importeeLue }] = await Promise.all([
      supabase.from('budgets').select('*').eq('annee', annee).maybeSingle(),
      cle === 'production'
        ? supabase.from('production_importee').select('mois, famille, montant_ht').gte('mois', `${annee - 1}-01-01`).lt('mois', `${annee + 1}-01-01`)
        : Promise.resolve({ data: [] }),
    ]);
    const budget = lireBudget(budgetLu as Record<string, unknown> | null, annee);
    contenu =
      cle === 'budget' ? (
        <RubriqueBudget annee={annee} budget={budget} />
      ) : (
        <RubriqueProduction
          annee={annee}
          importee={((importeeLue ?? []) as { mois: string; famille: 'depannage' | 'chantier' | 'total'; montant_ht: number | string }[]).map((l) => ({ ...l, montant_ht: Number(l.montant_ht) || 0 }))}
          carnet={{ carnet_accepte: budget.carnet_accepte, carnet_facture: budget.carnet_facture, carnet_le: budget.carnet_le }}
        />
      );
  } else if (cle === 'prix') {
    contenu = <RubriquePrix r={r} />;
  } else {
    contenu = <RubriqueCompta r={r} />;
  }

  // Réglages de l'entreprise en lecture seule pour qui n'est pas dirigeant.
  const lectureSeule = !dirigeant && !POUR_TOUS.includes(cle);
  const visibles = GROUPES.map((g) => ({ ...g, rubriques: g.rubriques.filter((x) => dirigeant || !x.dirigeantSeul) }));

  return (
    <>
      <div className={demandee ? 'max-menu:hidden' : ''}>
        <Titre
          actions={
            <span className="pb-1 text-[13px] font-semibold text-gris max-menu:hidden">
              {dirigeant ? 'Chaque changement est enregistré tout de suite.' : 'Seul le dirigeant peut modifier les réglages de l’entreprise.'}
            </span>
          }
        >
          Paramètres
        </Titre>
      </div>
      {demandee && (
        <Link href="/parametres" className="mb-3 inline-block text-[15px] font-bold text-cobalt hover:underline menu:hidden">
          ← Paramètres
        </Link>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[18px] min-[821px]:grid-cols-[220px_minmax(0,1fr)] min-[1101px]:grid-cols-[268px_minmax(0,1fr)]">
        <nav
          aria-label="Rubriques des paramètres"
          className={`carte flex flex-col gap-1 px-2 py-1.5 menu:sticky menu:top-4 menu:max-h-[calc(100dvh-32px)] menu:overflow-y-auto menu:p-2.5 ${demandee ? 'max-menu:hidden' : ''}`}
        >
          {visibles.map((g) => (
            <div key={g.titre}>
              <h2 className="px-2.5 pt-2.5 pb-1 text-[12.5px] font-bold tracking-normal text-gris">{g.titre}</h2>
              {g.rubriques.map((x) => {
                const on = !!demandee && x.cle === cle;
                const allume = x.cle === cle;
                return (
                  <Link
                    key={x.cle}
                    href={`/parametres?rubrique=${x.cle}`}
                    aria-current={allume ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14.5px] leading-snug font-semibold transition max-menu:min-h-12 ${
                      allume ? `menu:bg-doux menu:text-cobalt ${on ? 'max-menu:bg-doux max-menu:text-cobalt' : ''}` : 'text-encre hover:bg-fond'
                    }`}
                  >
                    <Icone nom={x.icone} taille={18} className={`shrink-0 text-gris ${allume ? 'menu:text-cobalt' : ''}`} />
                    <span className="min-w-0">{x.libelle}</span>
                    <span className="ml-auto text-[22px] leading-none text-gris menu:hidden" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <section aria-labelledby="rubrique-titre" className={`carte min-w-0 p-4 menu:px-6 menu:pt-[22px] menu:pb-[26px] ${demandee ? '' : 'max-menu:hidden'}`} key={cle}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-b border-trait pb-4">
            <div className="min-w-0 flex-[1_1_260px]">
              <h2 id="rubrique-titre" className="text-xl font-extrabold">
                {active.libelle}
              </h2>
              {aide && <p className="mt-1 max-w-[70ch] text-[15px] text-gris">{aide}</p>}
            </div>
            {bouton}
          </div>
          {lectureSeule ? (
            <fieldset disabled className="min-w-0">
              {contenu}
            </fieldset>
          ) : (
            contenu
          )}
        </section>
      </div>
    </>
  );
}
