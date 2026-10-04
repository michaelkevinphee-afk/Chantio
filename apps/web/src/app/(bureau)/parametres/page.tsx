import Link from 'next/link';
import type { ReactNode } from 'react';
import { ACOMPTES, DELAIS, LIBELLE_ROLE, MODELES_MAIL, VALIDITES, aujourdhui, initiales, type ReglagesFacturation } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { Avatar, LienBouton, Puce, Titre } from '@/components/ui';
import { liensProfils } from '@/lib/profils';
import { listerEquipe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';
import { ChampsPrix, FormulaireParametres } from './formulaire';

export const metadata = { title: 'Paramètres · Chantio' };

type CleRubrique = 'entreprise' | 'numerotation' | 'emails' | 'banque' | 'conditions' | 'membres' | 'prix';
const RUBRIQUES: { groupe: string; liste: [CleRubrique, string, string][] }[] = [
  { groupe: 'Général', liste: [
    ['entreprise', 'Mon entreprise', 'Imprimé en haut et en bas de chaque devis et facture.'],
    ['numerotation', 'Numérotation', 'Un compteur par type de document et par année. Un numéro attribué n’est jamais réutilisé.'],
    ['emails', 'E-mails', 'Le texte proposé quand vous envoyez un devis ou une facture depuis votre messagerie.'],
    ['banque', 'Comptes bancaires', 'Le compte sur lequel vos clients vous paient.'],
    ['conditions', 'Conditions des devis', 'Proposées sur chaque nouveau devis, modifiables devis par devis.'],
    ['membres', 'Membres', 'Le bureau sur ordinateur, les techniciens sur leur téléphone.'],
  ] },
  { groupe: 'Chiffrage', liste: [['prix', 'Prix et coefficients', 'Les valeurs par défaut de chaque nouveau devis. Elles restent modifiables sur chaque devis et chaque ligne.']] },
];

const NUMEROS: [string, string][] = [
  ['DEP', 'Dépannages'],
  ['CH', 'Chantiers'],
  ['ENT', 'Entretiens'],
  ['DE', 'Devis'],
  ['FA', 'Factures'],
  ['AV', 'Avoirs'],
  ['CT', 'Contrats d’entretien'],
];

function Champ({ libelle, aide, large, children }: { libelle: string; aide?: string; large?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${large ? 'sm:col-span-2' : ''}`}>
      <span className="etiquette">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-gris">{aide}</span>}
    </label>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-bold tracking-[0.08em] text-gris uppercase">{titre}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function Parametres({ searchParams }: PageProps<'/parametres'>) {
  const { supabase, entreprise, membre } = await contexteBureau();
  const { rubrique } = await searchParams;
  const toutes = RUBRIQUES.flatMap((g) => g.liste);
  const active = toutes.find(([k]) => k === rubrique) ?? toutes[0];
  const cle = active[0];
  const modifiable = membre.role === 'dirigeant';
  const r: ReglagesFacturation = { siret: entreprise.siret ?? '', ...(entreprise.facturation ?? {}) };
  const t = (k: keyof ReglagesFacturation) => String(r[k] ?? '');

  let contenu: ReactNode = null;
  if (cle === 'entreprise') {
    contenu = (
      <FormulaireParametres rubrique="entreprise" modifiable={modifiable}>
        <Section titre="Identité">
          <Champ libelle="Forme juridique">
            <input name="forme" className="champ" defaultValue={t('forme')} placeholder="SARL, SAS, EI…" />
          </Champ>
          <Champ libelle="Capital social">
            <input name="capital" className="champ" defaultValue={t('capital')} placeholder="10 000 €" />
          </Champ>
          <Champ libelle="SIRET">
            <input name="siret" className="champ" defaultValue={t('siret')} placeholder="14 chiffres" />
          </Champ>
          <Champ libelle="TVA intracommunautaire">
            <input name="tva_intra" className="champ" defaultValue={t('tva_intra')} placeholder="FR…" />
          </Champ>
          <Champ libelle="RCS ou RM">
            <input name="rcs" className="champ" defaultValue={t('rcs')} placeholder="RCS Paris 123 456 789" />
          </Champ>
          <Champ libelle="Ligne sous le nom">
            <input name="slogan" className="champ" defaultValue={t('slogan')} placeholder="Plomberie · Chauffage · depuis 1984" />
          </Champ>
        </Section>
        <Section titre="Assurance et médiation">
          <Champ libelle="Assureur décennale" aide="Obligatoire sur les devis et factures de travaux.">
            <input name="assureur" className="champ" defaultValue={t('assureur')} />
          </Champ>
          <Champ libelle="N° de contrat">
            <input name="contrat" className="champ" defaultValue={t('contrat')} />
          </Champ>
          <Champ libelle="Zone couverte">
            <input name="zone" className="champ" defaultValue={t('zone')} placeholder="France métropolitaine" />
          </Champ>
          <Champ libelle="N° RGE (si vous l’êtes)">
            <input name="rge" className="champ" defaultValue={t('rge')} />
          </Champ>
          <Champ libelle="Médiateur de la consommation" large>
            <input name="mediateur" className="champ" defaultValue={t('mediateur')} placeholder="Nom et site internet" />
          </Champ>
        </Section>
        <p className="text-sm text-gris">
          Le nom, l’adresse et la vérification d’identité de l’entreprise se gèrent dans{' '}
          <Link href="/entreprises" className="font-bold text-cobalt hover:underline">
            Mes entreprises
          </Link>
          .
        </p>
      </FormulaireParametres>
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
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {NUMEROS.map(([p, libelle], k) => {
            const n = derniers[k] ? Number(derniers[k]!.slice(-4)) + 1 : 1;
            return (
              <div key={p} className="rounded-2xl bg-fond px-4 py-3">
                <p className="text-xs font-bold text-gris">{libelle}</p>
                <p className="font-mono text-lg font-extrabold">{`${p}-${an}-${String(n).padStart(4, '0')}`}</p>
                <p className="text-xs text-gris">{derniers[k] ? `après ${derniers[k]}` : 'premier de l’année'}</p>
              </div>
            );
          })}
        </div>
        <div className="space-y-2 text-sm">
          <p>
            Le préfixe, l’année, puis un numéro à 4 chiffres : <b className="font-mono">FA-{an}-0001</b>. Le compteur repart à 1 chaque 1<sup>er</sup> janvier.
          </p>
          <p className="text-gris">
            Les factures se suivent sans trou ni doublon, comme la loi le demande. Un brouillon n’a pas encore de numéro : il le reçoit quand on le valide.
          </p>
        </div>
      </div>
    );
  } else if (cle === 'emails') {
    contenu = (
      <FormulaireParametres rubrique="emails" modifiable={modifiable}>
        <p className="rounded-xl bg-doux px-4 py-3 text-sm">
          Les mots entre accolades sont remplacés au moment de l’envoi : <b>{'{numero}'}</b>, <b>{'{client}'}</b>, <b>{'{objet}'}</b>, <b>{'{montant}'}</b>,{' '}
          <b>{'{entreprise}'}</b>. Laissez un champ vide pour reprendre le texte de Chantio.
        </p>
        {(['devis', 'facture'] as const).map((g) => (
          <Section key={g} titre={g === 'devis' ? 'Envoi des devis' : 'Envoi des factures'}>
            <Champ libelle="Objet" large>
              <input name={`mail_${g}_objet`} className="champ" defaultValue={t(`mail_${g}_objet`)} placeholder={MODELES_MAIL[`mail_${g}_objet`]} />
            </Champ>
            <Champ libelle="Message" large>
              <textarea
                name={`mail_${g}_texte`}
                rows={7}
                className="champ"
                defaultValue={t(`mail_${g}_texte`)}
                placeholder={MODELES_MAIL[`mail_${g}_texte`]}
              />
            </Champ>
          </Section>
        ))}
      </FormulaireParametres>
    );
  } else if (cle === 'banque') {
    contenu = (
      <FormulaireParametres rubrique="banque" modifiable={modifiable}>
        <Section titre="Compte principal">
          <Champ libelle="Titulaire du compte">
            <input name="titulaire" className="champ" defaultValue={t('titulaire')} placeholder={entreprise.nom} />
          </Champ>
          <Champ libelle="Banque">
            <input name="banque" className="champ" defaultValue={t('banque')} />
          </Champ>
          <Champ libelle="IBAN" large>
            <input name="iban" className="champ font-mono" defaultValue={t('iban')} placeholder="FR76 …" />
          </Champ>
          <Champ libelle="BIC">
            <input name="bic" className="champ font-mono" defaultValue={t('bic')} />
          </Champ>
        </Section>
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input name="iban_factures" type="checkbox" defaultChecked={r.iban_factures !== 'non'} className="mt-0.5 h-4 w-4 accent-cobalt" />
          <span>
            Afficher l’IBAN et le BIC sur les factures
            <span className="block font-normal text-gris">Vos clients peuvent payer par virement sans vous demander vos coordonnées.</span>
          </span>
        </label>
      </FormulaireParametres>
    );
  } else if (cle === 'conditions') {
    const choix = (nom: 'validite' | 'acompte' | 'delai', liste: readonly string[], defaut: string, suffixe = '') => (
      <select name={nom} className="champ" defaultValue={t(nom) || defaut}>
        {liste.map((v) => (
          <option key={v} value={v}>
            {v}
            {suffixe}
          </option>
        ))}
      </select>
    );
    contenu = (
      <FormulaireParametres rubrique="conditions" modifiable={modifiable}>
        <Section titre="Nouveaux devis">
          <Champ libelle="Validité du devis">{choix('validite', VALIDITES, '1 mois')}</Champ>
          <Champ libelle="Acompte à la commande">{choix('acompte', ACOMPTES, '30', ' %')}</Champ>
          <Champ libelle="Délai de paiement des factures" large aide="Au plus 60 jours après la date de la facture.">
            {choix('delai', DELAIS, 'À réception de facture')}
          </Champ>
        </Section>
        <p className="text-sm text-gris">
          Les factures indiquent toujours les pénalités de retard et l’indemnité forfaitaire de 40 € pour frais de recouvrement : ces mentions sont obligatoires.
        </p>
      </FormulaireParametres>
    );
  } else if (cle === 'membres') {
    const equipe = await listerEquipe(supabase);
    const liens = await liensProfils(supabase, equipe.map((m) => m.photo_chemin));
    contenu = (
      <div>
        <ul className="divide-y divide-trait">
          {equipe.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0">
              <Avatar url={m.photo_chemin ? liens.get(m.photo_chemin) : null} initiales={initiales(m.prenom, m.nom)} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {m.prenom} {m.nom}
                </span>
                <span className="block truncate text-sm text-gris">{m.email}</span>
              </span>
              <Puce ton={m.role === 'dirigeant' ? 'cobalt' : 'gris'}>{LIBELLE_ROLE[m.role]}</Puce>
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-trait pt-5">
          <LienBouton href="/equipe" variante="secondaire">
            <Icone nom="equipe" taille={18} /> Inviter ou modifier dans Équipe
          </LienBouton>
        </div>
      </div>
    );
  } else {
    contenu = (
      <FormulaireParametres rubrique="prix" modifiable={modifiable}>
        <ChampsPrix valeurs={r} />
        <Section titre="Objectif du mois">
          <Champ libelle="Chiffre d’affaires visé chaque mois (€ HT)" aide="Sert à l’anneau « Ce mois-ci » du tableau de bord des devis.">
            <input name="objectif_mensuel" className="champ tabular-nums" inputMode="numeric" defaultValue={r.objectif_mensuel ?? ''} placeholder="20000" />
          </Champ>
        </Section>
      </FormulaireParametres>
    );
  }

  return (
    <>
      <Titre sous={modifiable ? 'Chaque rubrique s’enregistre séparément' : 'Seul le dirigeant peut modifier les paramètres'}>Paramètres</Titre>
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="carte flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-6 lg:flex-col lg:overflow-visible" aria-label="Rubriques des paramètres">
          {RUBRIQUES.map((g) => (
            <div key={g.groupe} className="contents lg:block">
              <p className="hidden px-3 pt-3 pb-1 text-xs font-bold tracking-[0.08em] text-gris uppercase lg:block">{g.groupe}</p>
              {g.liste.map(([k, libelle]) => (
                <Link
                  key={k}
                  href={`/parametres?rubrique=${k}`}
                  aria-current={k === cle ? 'page' : undefined}
                  className={`block shrink-0 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                    k === cle ? 'bg-doux text-cobalt' : 'text-encre hover:bg-fond'
                  }`}
                >
                  {libelle}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <section className="carte apparition p-6" key={cle}>
          <h2 className="text-2xl font-extrabold">{active[1]}</h2>
          <p className="mt-1 mb-6 text-sm text-gris">{active[2]}</p>
          {contenu}
        </section>
      </div>
    </>
  );
}
