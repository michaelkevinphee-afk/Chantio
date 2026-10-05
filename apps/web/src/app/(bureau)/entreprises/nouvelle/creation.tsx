'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CODES_NAF, FORMES_JURIDIQUES } from '@chantio/shared';
import type { EntrepriseTrouvee } from '@/app/api/entreprises/route';
import { BarrePleine } from '@/components/barre-pleine';
import { Fenetre } from '@/components/fenetre';
import { Icone } from '@/components/icones';
import { annoncer, BoutonEnvoi, Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { formaterNumero } from '@/lib/siret';
import { adresseComplete } from '../../parametres/valeurs';
import { choisirEntreprise, creerEntreprise, demanderAcces } from '../actions';
import { ORDRE_CHAMPS, TAILLES, TRANCHES_CA } from './listes';

// « Créer une entreprise » en deux étapes, comme pageCreation() du bac : 1. retrouver l'entreprise dans
// l'annuaire officiel (ou la saisir à la main), 2. vérifier la fiche pré-remplie et attester être le représentant légal.

type Mienne = { id: string; nom: string; siren: string | null };
type Fiche = Partial<EntrepriseTrouvee>;

const LIEN = 'font-bold text-cobalt hover:underline';
const CHAMP = 'champ min-h-[46px] !rounded-[10px] px-3 text-[15px] aria-[invalid=true]:!border-rouge';

/** N° de TVA intracommunautaire tiré du SIREN (clé = (12 + 3 × (SIREN mod 97)) mod 97). */
function tvaDe(siret: string) {
  const siren = siret.replace(/\D/g, '').slice(0, 9);
  if (siren.length !== 9) return '';
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, '0')}${siren}`;
}

export function CreationEntreprise({ miennes, prenom, nom }: { miennes: Mienne[]; prenom: string; nom: string }) {
  const [etape, setEtape] = useState<1 | 2>(1);
  const [fiche, setFiche] = useState<{ depart: Fiche; annuaire: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [message, setMessage] = useState<ReactNode>(null);
  const [demande, setDemande] = useState<{ siren: string; nom: string } | null>(null);

  const remplir = (depart: Fiche, annuaire: boolean) => {
    setFiche({ depart, annuaire });
    setMessage(null);
    setEtape(2);
    window.scrollTo(0, 0);
  };

  // Choix d'une entreprise de l'annuaire (choisirAnnuaire du bac).
  const choisir = (r: EntrepriseTrouvee) => {
    setQ(r.nom);
    const mienne = miennes.find((m) => m.siren === r.siren);
    if (r.fermee) return setMessage(<>{r.nom} est fermée au registre : elle ne peut pas être ajoutée.</>);
    if (mienne)
      return setMessage(
        <>
          Vous avez déjà accès à {mienne.nom}.{' '}
          <form action={choisirEntreprise.bind(null, mienne.id, '/')} className="contents">
            <button className={LIEN}>L’ouvrir</button>
          </form>
        </>,
      );
    if (r.inscrite)
      return setMessage(
        <>
          {r.nom} utilise déjà Chantio. Son dirigeant peut vous inviter, ou vous pouvez lui demander l’accès.{' '}
          <Bouton type="button" variante="secondaire" className="!rounded-[10px] !px-3 !py-1.5 !text-[13px]" onClick={() => setDemande({ siren: r.siren, nom: r.nom })}>
            Demander l’accès
          </Bouton>
        </>,
      );
    remplir(r, true);
  };

  return (
    <>
      <BarrePleine
        titre={
          <span className="flex flex-col items-center leading-tight max-[700px]:items-start">
            Créer une entreprise
            <small className="text-[13.5px] font-medium text-gris">Étape {etape}/2</small>
          </span>
        }
        retour="/entreprises"
        libelleRetour="Fermer et revenir à vos entreprises"
      />
      <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
        <i className="h-1 bg-cobalt" />
        <i className={`h-1 ${etape >= 2 ? 'bg-cobalt' : 'bg-trait'}`} />
      </div>
      <div className="mx-auto max-w-[760px] px-5 pt-9 pb-16 max-[760px]:px-4 max-[760px]:pt-6">
        <h2 className="mb-[22px] text-[28px] leading-tight font-extrabold max-[760px]:text-2xl">Informations de l’entreprise</h2>
        {etape === 1 ? (
          <Recherche q={q} setQ={setQ} choisir={choisir} message={message} effacer={() => setMessage(null)} aLaMain={() => remplir({}, false)} />
        ) : (
          <FicheEntreprise
            key={fiche?.depart.siren ?? 'main'}
            depart={fiche?.depart ?? {}}
            annuaire={!!fiche?.annuaire}
            prenom={prenom}
            nom={nom}
            retour={() => setEtape(1)}
            demander={setDemande}
          />
        )}
      </div>
      {demande && <FenetreDemande siren={demande.siren} entreprise={demande.nom} prenom={prenom} nomFamille={nom} fermer={() => setDemande(null)} />}
    </>
  );
}

function Recherche({
  q,
  setQ,
  choisir,
  message,
  effacer,
  aLaMain,
}: {
  q: string;
  setQ: (v: string) => void;
  choisir: (r: EntrepriseTrouvee) => void;
  message: ReactNode;
  effacer: () => void;
  aLaMain: () => void;
}) {
  const [resultats, setResultats] = useState<EntrepriseTrouvee[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'vide' | 'erreur'>('repos');
  const [erreur, setErreur] = useState('');
  const derniere = useRef(0);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  // Cherche 300 ms après la dernière frappe ; seule la dernière réponse compte.
  const chercher = (valeur: string) => {
    setQ(valeur);
    effacer();
    clearTimeout(minuterie.current);
    const terme = valeur.trim();
    const n = ++derniere.current;
    if (terme.length < 3) {
      setResultats([]);
      setEtat('repos');
      return;
    }
    setEtat('recherche');
    minuterie.current = setTimeout(async () => {
      try {
        const rep = await fetch(`/api/entreprises?q=${encodeURIComponent(terme)}`);
        const json = (await rep.json()) as { resultats: EntrepriseTrouvee[]; erreur?: string };
        if (n !== derniere.current) return;
        setResultats(json.resultats);
        setErreur(json.erreur ?? '');
        setEtat(json.erreur ? 'erreur' : json.resultats.length ? 'repos' : 'vide');
      } catch {
        if (n === derniere.current) {
          setEtat('erreur');
          setErreur('La recherche ne répond pas, remplissez la fiche à la main.');
        }
      }
    }, 300);
  };

  // Clavier du bac : flèche bas depuis le champ, flèches entre les résultats, Échap revient au champ.
  const options = () => Array.from(liste.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
  const naviguer = (e: KeyboardEvent) => {
    const l = options();
    const i = l.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      l[Math.min(l.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) champ.current?.focus();
      else l[i - 1].focus();
    } else if (e.key === 'Escape') champ.current?.focus();
  };
  const chiffres = q.replace(/\D/g, '');
  const numero = chiffres.length === 9 || chiffres.length === 14;

  return (
    <>
      <div className="relative">
        <label htmlFor="ce-q" className="sr-only">
          Raison sociale ou numéro SIREN/SIRET
        </label>
        <input
          ref={champ}
          id="ce-q"
          value={q}
          onChange={(e) => chercher(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              options()[0]?.focus();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (resultats.length === 1) choisir(resultats[0]);
            }
          }}
          className={`${CHAMP} !min-h-[50px] pr-11 !text-base`}
          placeholder="Raison sociale ou numéro SIREN/SIRET"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="ce-res"
          aria-expanded={resultats.length > 0}
          autoFocus
        />
        <span className="pointer-events-none absolute top-1/2 right-3.5 grid -translate-y-1/2 text-gris" aria-hidden="true">
          {etat === 'recherche' ? <Roue taille={18} /> : <Icone nom="chevron_bas" taille={20} />}
        </span>
      </div>
      <div
        ref={liste}
        id="ce-res"
        role="listbox"
        aria-label="Entreprises trouvées"
        onKeyDown={naviguer}
        className={`mt-1.5 flex flex-col gap-0.5 rounded-[12px] border border-trait p-1 shadow-[0_12px_30px_-20px_rgb(16_26_61/0.4)] ${
          resultats.length || etat === 'vide' ? '' : 'hidden'
        }`}
      >
        {resultats.map((r) => (
          <button
            key={r.siren}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => choisir(r)}
            className="flex w-full items-center justify-between gap-2.5 rounded-[9px] px-3 py-2.5 text-left transition hover:bg-fond focus-visible:bg-fond"
          >
            <span className="flex min-w-0 flex-col">
              <b className="truncate font-bold">{r.nom}</b>
              <small className="truncate text-gris">
                SIREN {formaterNumero(r.siren)}
                {r.ville && ` · ${r.ville}`}
                {r.forme_juridique && ` · ${r.forme_juridique}`}
              </small>
            </span>
            {r.fermee ? (
              <span className="rounded-full bg-rouge-doux px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-rouge">Fermée</span>
            ) : r.inscrite ? (
              <span className="degrade rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-white">Déjà sur Chantio</span>
            ) : null}
          </button>
        ))}
        {etat === 'vide' && (
          <div className="px-3 py-2.5 text-gris">
            {numero ? 'Aucune entreprise avec ce numéro dans l’annuaire.' : 'Aucune entreprise trouvée.'}{' '}
            <button type="button" onClick={aLaMain} className={LIEN}>
              Remplir à la main
            </button>
          </div>
        )}
      </div>
      <div role="status" className="empty:hidden">
        {etat === 'erreur' && <p className="mt-3 rounded-[12px] bg-rouge-doux px-3.5 py-3 text-sm font-semibold text-rouge">{erreur}</p>}
        {message && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] bg-doux px-3.5 py-3">{message}</div>}
      </div>
      <p className="mt-4 mb-1.5 text-[13.5px] text-gris">Chantio cherche dans l’annuaire officiel des entreprises, puis remplit le formulaire pour vous.</p>
      <button type="button" onClick={aLaMain} className={`text-left ${LIEN}`}>
        Mon entreprise n’apparaît pas ou est en cours d’immatriculation
      </button>
    </>
  );
}

function Champ({
  id,
  libelle,
  erreur,
  large,
  apres,
  children,
}: {
  id: string;
  libelle: string;
  erreur?: string;
  large?: boolean;
  /** Sous le message d'erreur (la case « SIRET en cours d'attribution », comme le bac). */
  apres?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${large ? 'col-span-full' : ''}`}>
      <label htmlFor={`cf-${id}`} className="text-sm font-bold text-encre">
        {libelle}
      </label>
      {children}
      {erreur && (
        <span id={`cf-${id}-e`} className="text-[12.5px] font-semibold text-rouge">
          {erreur}
        </span>
      )}
      {apres}
    </div>
  );
}

function FicheEntreprise({
  depart,
  annuaire,
  prenom,
  nom,
  retour,
  demander,
}: {
  depart: Fiche;
  annuaire: boolean;
  prenom: string;
  nom: string;
  retour: () => void;
  demander: (d: { siren: string; nom: string }) => void;
}) {
  const [etat, envoyer, enCours] = useActionState(creerEntreprise, undefined);
  const formulaire = useRef<HTMLFormElement>(null);
  const [attente, setAttente] = useState(false);
  const e = etat?.champs ?? {};
  const inv = (id: string) => (e[id] ? { 'aria-invalid': true as const, 'aria-describedby': `cf-${id}-e` } : {});
  const naf = (depart.activite ?? '').replace(/^NAF\s*/, '');
  const nafs = CODES_NAF.some(([c]) => c === naf) || !naf ? CODES_NAF : [[naf, naf] as const, ...CODES_NAF];
  const forme = depart.forme_juridique ?? '';
  const formes: readonly string[] = !forme || (FORMES_JURIDIQUES as readonly string[]).includes(forme) ? FORMES_JURIDIQUES : [forme, ...FORMES_JURIDIQUES];

  // Après un refus : bulle du premier message et focus sur son champ, comme le bac.
  useEffect(() => {
    if (!etat?.erreur) return;
    annoncer(etat.erreur, 'erreur');
    const premier = ORDRE_CHAMPS.find((k) => etat.champs?.[k]);
    if (premier) document.getElementById(`cf-${premier}`)?.focus();
  }, [etat]);

  const soumettre = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const donnees = new FormData(ev.currentTarget);
    startTransition(() => envoyer(donnees));
  };

  return (
    <form ref={formulaire} onSubmit={soumettre} noValidate>
      <input type="hidden" name="formulaire" value="complet" />
      <input type="hidden" name="retour" value="entreprises" />
      <input type="hidden" name="siren" value={depart.siren ?? ''} />
      <input type="hidden" name="annuaire" value={annuaire ? '1' : ''} />
      <input type="hidden" name="prenom" value={prenom} />
      <input type="hidden" name="nom_famille" value={nom} />

      <p className="mb-5 flex items-start gap-2.5 rounded-[12px] bg-fond px-3.5 py-3 text-[13.5px]">
        <Icone nom="bouclier" taille={20} className="shrink-0 text-cobalt" />
        {annuaire ? (
          <span>
            Rempli depuis l’annuaire officiel.
            {!!depart.dirigeants?.length && (
              <>
                {' '}
                {depart.dirigeants.length > 1 ? 'Dirigeants inscrits au registre' : 'Dirigeant inscrit au registre'} :{' '}
                {depart.dirigeants.map((d, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <b>{d.nom}</b>
                    {d.fonction && ` (${d.fonction})`}
                  </span>
                ))}
                .
              </>
            )}
          </span>
        ) : (
          <span>Remplissez la fiche à la main. Votre identité sera vérifiée avec une pièce d’identité.</span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-x-[18px] gap-y-4 max-[560px]:grid-cols-1">
        <Champ id="nom" libelle="Raison sociale" erreur={e.nom}>
          <input id="cf-nom" name="nom" defaultValue={depart.nom ?? ''} autoComplete="organization" autoFocus className={CHAMP} {...inv('nom')} />
        </Champ>
        <Champ id="nom_commercial" libelle="Nom commercial">
          <input id="cf-nom_commercial" name="nom_commercial" className={CHAMP} />
        </Champ>
        <Champ id="adresse" libelle="Adresse" erreur={e.adresse} large>
          <input
            id="cf-adresse"
            name="adresse"
            defaultValue={depart.adresse || depart.ville ? adresseComplete({ adresse: depart.adresse, code_postal: depart.code_postal, ville: depart.ville }) : ''}
            autoComplete="street-address"
            placeholder="Numéro, rue, code postal, ville"
            className={CHAMP}
            {...inv('adresse')}
          />
        </Champ>
        <Champ
          id="siret"
          libelle="SIRET"
          erreur={e.siret}
          apres={
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-gris">
                <input type="checkbox" id="cf-attente" name="siret_attente" checked={attente} onChange={(ev) => setAttente(ev.target.checked)} className="h-4 w-4 accent-cobalt" />
                SIRET en cours d’attribution
              </label>
              {etat?.dejaInscrite?.siren && (
                <button type="button" onClick={() => demander({ siren: etat.dejaInscrite!.siren, nom: etat.dejaInscrite!.nom })} className={`self-start text-sm ${LIEN}`}>
                  Demander l’accès
                </button>
              )}
            </>
          }
        >
          <input
            id="cf-siret"
            name="siret"
            inputMode="numeric"
            defaultValue={depart.siret ? formaterNumero(depart.siret) : ''}
            disabled={attente}
            onChange={(ev) => {
              const s = ev.target.value.replace(/\D/g, '');
              if (s.length !== 14) return;
              ev.target.value = formaterNumero(s);
              const tva = formulaire.current?.elements.namedItem('tva_intracom') as HTMLInputElement | null;
              if (tva && !tva.value.trim()) tva.value = tvaDe(s);
            }}
            className={`${CHAMP} disabled:bg-gris-doux`}
            {...inv('siret')}
          />
        </Champ>
        <Champ id="forme_juridique" libelle="Forme juridique" erreur={e.forme_juridique}>
          <select id="cf-forme_juridique" name="forme_juridique" defaultValue={forme} className={CHAMP} {...inv('forme_juridique')}>
            <option value="">Choisir</option>
            {formes.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Champ>
        <Champ id="naf" libelle="Secteur d’activité" large>
          <select id="cf-naf" name="naf" defaultValue={naf} className={CHAMP}>
            <option value="">Choisir un secteur</option>
            {nafs.map(([c, l]) => (
              <option key={c} value={c}>
                {c === l ? c : `${c} · ${l}`}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="capital" libelle="Capital social" erreur={e.capital}>
          <span className="relative block">
            <input id="cf-capital" name="capital" inputMode="numeric" className={`${CHAMP} w-full pr-[52px]`} {...inv('capital')} />
            <i className="absolute top-1/2 right-3 -translate-y-1/2 text-sm font-semibold text-gris not-italic">EUR</i>
          </span>
        </Champ>
        <Champ id="tva_intracom" libelle="N° de TVA">
          <input id="cf-tva_intracom" name="tva_intracom" defaultValue={depart.tva_intracom ?? ''} className={CHAMP} />
        </Champ>
        <Champ id="taille" libelle="Quelle est la taille de votre entreprise ?" erreur={e.taille} large>
          <select id="cf-taille" name="taille" defaultValue="" className={CHAMP} {...inv('taille')}>
            <option value="">Sélectionnez un nombre de salariés</option>
            {TAILLES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Champ>
        <Champ id="ca" libelle="Quelle est la tranche de chiffre d’affaires de votre entreprise ?" erreur={e.ca} large>
          <select id="cf-ca" name="ca" defaultValue="" className={CHAMP} {...inv('ca')}>
            <option value="">Sélectionnez une tranche de CA</option>
            {TRANCHES_CA.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Champ>
      </div>

      <label className="mt-[22px] flex items-start gap-2 text-[15px]">
        <input type="checkbox" id="cf-atteste" name="atteste" className="mt-1 h-4 w-4 shrink-0 accent-cobalt" {...inv('atteste')} />
        J’atteste être le représentant légal, ainsi que l’exactitude des données fournies
      </label>
      {e.atteste && (
        <span id="cf-atteste-e" className="mt-1 ml-6 block text-[12.5px] font-semibold text-rouge">
          {e.atteste}
        </span>
      )}
      {etat?.erreur && !etat.champs && <p className="mt-4 rounded-[12px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}

      <div className="mt-[26px] flex flex-wrap justify-end gap-2.5">
        <Bouton type="button" variante="secondaire" onClick={retour}>
          Retour
        </Bouton>
        <Bouton disabled={enCours} aria-busy={enCours}>
          {enCours && <Roue />} {enCours ? 'Création…' : 'Créer l’entreprise'}
        </Bouton>
      </div>
    </form>
  );
}

/** « Demander l'accès à … » (demanderAcces du bac) : le dirigeant reçoit la demande et choisit le rôle. */
function FenetreDemande({
  siren,
  entreprise,
  prenom,
  nomFamille,
  fermer,
}: {
  siren: string;
  entreprise: string;
  prenom: string;
  nomFamille: string;
  fermer: () => void;
}) {
  const [etat, envoyer] = useActionState(demanderAcces, undefined);
  return (
    <Fenetre titre={`Demander l’accès à ${entreprise}`} fermer={fermer} sansCroix>
      <form action={envoyer} className="space-y-4">
        <input type="hidden" name="retour" value="entreprises" />
        <input type="hidden" name="siren" value={siren} />
        <input type="hidden" name="prenom" value={prenom} />
        <input type="hidden" name="nom_famille" value={nomFamille} />
        <p>Son dirigeant reçoit votre demande par e-mail et choisit votre rôle.</p>
        <label className="block">
          <span className="etiquette">Message</span>
          <textarea name="message" rows={3} className="champ" placeholder="ex. Je suis la comptable de l’entreprise" />
          <span className="mt-1 block text-xs font-medium text-gris">Facultatif</span>
        </label>
        {etat?.erreur && <p className="rounded-[12px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Bouton type="button" variante="secondaire" data-fermer>
            Annuler
          </Bouton>
          <BoutonEnvoi enCours="Envoi…">Envoyer la demande</BoutonEnvoi>
        </div>
      </form>
    </Fenetre>
  );
}
