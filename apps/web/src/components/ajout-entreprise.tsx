'use client';

import { startTransition, useActionState, useRef, useState, type FormEvent } from 'react';
import type { EntrepriseTrouvee } from '@/app/api/entreprises/route';
import { creerEntreprise, demanderAcces } from '@/app/(bureau)/entreprises/actions';
import { formaterNumero, numeroValide } from '@/lib/siret';
import { Icone } from './icones';
import { Roue } from './retour';
import { Bouton } from './ui';

/** Envoi sans remise à zéro du formulaire : en cas d'erreur, la saisie reste. */
const soumettre = (envoyer: (d: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const donnees = new FormData(e.currentTarget);
  startTransition(() => envoyer(donnees));
};

type Etape = { type: 'recherche' } | { type: 'fiche'; e: Partial<EntrepriseTrouvee>; manuelle: boolean } | { type: 'acces'; siren: string; entreprise: string; prenom?: string; nom?: string };

/**
 * Ajout d'une entreprise en deux étapes : on la retrouve dans l'annuaire officiel
 * (nom, SIREN ou SIRET), puis on vérifie la fiche pré-remplie et on atteste en être
 * le représentant légal. Une entreprise déjà inscrite propose « Demander l'accès ».
 */
export function AjoutEntreprise({
  retour,
  prenom = '',
  nom = '',
  identiteConnue = false,
}: {
  retour: 'bienvenue' | 'entreprises';
  prenom?: string;
  nom?: string;
  /** Le compte a déjà un prénom et un nom (membre d'une autre entreprise) : on ne les redemande pas. */
  identiteConnue?: boolean;
}) {
  const [etape, setEtape] = useState<Etape>({ type: 'recherche' });

  if (etape.type === 'recherche') {
    return (
      <div className="space-y-3">
        <Recherche
          onChoix={(e) => setEtape(e.inscrite ? { type: 'acces', siren: e.siren, entreprise: e.nom } : { type: 'fiche', e, manuelle: false })}
        />
        <button
          type="button"
          onClick={() => setEtape({ type: 'fiche', e: {}, manuelle: true })}
          className="px-1 text-sm font-bold text-cobalt hover:underline"
        >
          Je ne la trouve pas : saisir à la main
        </button>
      </div>
    );
  }
  if (etape.type === 'acces') {
    return (
      <DemandeAcces
        siren={etape.siren}
        entreprise={etape.entreprise}
        retour={retour}
        prenom={etape.prenom || prenom}
        nom={etape.nom || nom}
        identiteConnue={identiteConnue}
        annuler={() => setEtape({ type: 'recherche' })}
      />
    );
  }
  return (
    <Fiche
      depart={etape.e}
      manuelle={etape.manuelle}
      retour={retour}
      prenom={prenom}
      nom={nom}
      identiteConnue={identiteConnue}
      annuler={() => setEtape({ type: 'recherche' })}
      demanderAcces={(siren, p, n) => setEtape({ type: 'acces', siren, entreprise: 'Cette entreprise', prenom: p, nom: n })}
    />
  );
}

function Recherche({ onChoix }: { onChoix: (e: EntrepriseTrouvee) => void }) {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<EntrepriseTrouvee[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'vide' | 'erreur'>('repos');
  const [message, setMessage] = useState('');
  const derniere = useRef(0);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cherche 300 ms après la dernière frappe ; seule la dernière réponse compte.
  const chercher = (valeur: string) => {
    setQ(valeur);
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
        setMessage(json.erreur ?? '');
        setEtat(json.erreur ? 'erreur' : json.resultats.length ? 'repos' : 'vide');
      } catch {
        if (n === derniere.current) {
          setEtat('erreur');
          setMessage('La recherche ne répond pas, saisissez la fiche à la main.');
        }
      }
    }, 300);
  };

  return (
    <div className="carte p-5">
      <label className="etiquette" htmlFor="recherche-societe">
        Retrouvez votre entreprise
      </label>
      <div className="relative">
        <Icone nom="recherche" taille={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-gris" />
        <input
          id="recherche-societe"
          value={q}
          onChange={(e) => chercher(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="champ pl-11"
          placeholder="Raison sociale, SIREN ou SIRET"
          autoComplete="off"
          autoFocus
        />
        {etat === 'recherche' && (
          <span className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-trait border-t-cobalt" />
        )}
      </div>
      <p className="mt-1.5 text-xs text-gris">Annuaire officiel des entreprises : la fiche se remplit toute seule.</p>

      {etat === 'vide' && <p className="mt-3 text-sm text-gris">Aucune entreprise trouvée.</p>}
      {etat === 'erreur' && <p className="mt-3 text-sm font-semibold text-rouge">{message}</p>}
      {resultats.length > 0 && (
        <ul className="mt-3 divide-y divide-trait overflow-hidden rounded-[14px] border border-trait">
          {resultats.map((r) => (
            <li key={r.siren}>
              <button
                type="button"
                disabled={r.fermee}
                onClick={() => onChoix(r)}
                className="flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left text-sm transition hover:bg-fond disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.nom}</span>
                  <span className="block truncate text-xs text-gris">
                    SIREN {formaterNumero(r.siren)}
                    {r.ville && ` · ${r.code_postal ?? ''} ${r.ville}`}
                    {r.forme_juridique && ` · ${r.forme_juridique}`}
                  </span>
                </span>
                {r.fermee ? (
                  <span className="rounded-full bg-rouge-doux px-2 py-0.5 text-xs font-bold text-rouge">Fermée</span>
                ) : r.inscrite ? (
                  <span className="rounded-full bg-violet-doux px-2 py-0.5 text-xs font-bold text-violet">Déjà sur Chantio</span>
                ) : (
                  <Icone nom="chevron" taille={16} className="text-gris" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold text-gris">{libelle}</span>
      {children}
    </label>
  );
}

function Fiche({
  depart,
  manuelle,
  retour,
  prenom,
  nom,
  identiteConnue,
  annuler,
  demanderAcces,
}: {
  depart: Partial<EntrepriseTrouvee>;
  manuelle: boolean;
  retour: string;
  prenom: string;
  nom: string;
  identiteConnue: boolean;
  annuler: () => void;
  demanderAcces: (siren: string, prenom: string, nom: string) => void;
}) {
  const [etat, envoyer, enCours] = useActionState(creerEntreprise, undefined);
  const formulaire = useRef<HTMLFormElement>(null);
  const saisi = (cle: string) => String(new FormData(formulaire.current ?? undefined).get(cle) ?? '');
  const [siret, setSiret] = useState(depart.siret ?? '');
  const [enAttribution, setEnAttribution] = useState(false);
  const siretFaux = manuelle && !enAttribution && siret.replace(/\s/g, '').length >= 14 && !numeroValide(siret);

  return (
    <form ref={formulaire} onSubmit={soumettre(envoyer)} className="space-y-4">
      <input type="hidden" name="retour" value={retour} />
      <input type="hidden" name="siren" value={depart.siren ?? ''} />
      <input type="hidden" name="tva_intracom" value={depart.tva_intracom ?? ''} />
      <input type="hidden" name="activite" value={depart.activite ?? ''} />

      <div className="carte space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-[0.08em] text-gris uppercase">{manuelle ? 'Votre entreprise' : 'Fiche trouvée au registre'}</p>
          <button type="button" onClick={annuler} className="text-sm font-bold text-cobalt hover:underline">
            Changer
          </button>
        </div>
        <Champ libelle="Raison sociale">
          <input name="nom" defaultValue={depart.nom ?? ''} className="champ" required />
        </Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="SIRET du siège">
            <input
              name="siret"
              value={enAttribution ? '' : siret}
              onChange={(e) => setSiret(e.target.value)}
              disabled={enAttribution}
              className="champ"
              inputMode="numeric"
              pattern="\s*(\d\s*){14}"
              title="14 chiffres"
              required={manuelle && !enAttribution}
              readOnly={!manuelle && !!depart.siret}
            />
          </Champ>
          <Champ libelle="Forme juridique">
            <input name="forme_juridique" defaultValue={depart.forme_juridique ?? ''} className="champ" placeholder="SARL, SAS, EI…" />
          </Champ>
        </div>
        {manuelle && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={enAttribution} onChange={(e) => setEnAttribution(e.target.checked)} className="h-4 w-4 accent-cobalt" />
            SIRET en cours d’attribution (entreprise en création)
          </label>
        )}
        {siretFaux && <p className="text-sm font-semibold text-rouge">Ce SIRET n’est pas valide : vérifiez les 14 chiffres.</p>}
        <Champ libelle="Adresse du siège">
          <input name="adresse" defaultValue={depart.adresse ?? ''} className="champ" />
        </Champ>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <Champ libelle="Code postal">
            <input name="code_postal" defaultValue={depart.code_postal ?? ''} className="champ" inputMode="numeric" />
          </Champ>
          <Champ libelle="Ville">
            <input name="ville" defaultValue={depart.ville ?? ''} className="champ" />
          </Champ>
        </div>
        {!!depart.dirigeants?.length && (
          <p className="text-sm text-gris">
            Dirigeants déclarés : <b className="text-encre">{depart.dirigeants.map((d) => d.nom).join(', ')}</b>
          </p>
        )}
      </div>

      <div className="carte space-y-3 p-5">
        <p className="text-xs font-bold tracking-[0.08em] text-gris uppercase">Vous</p>
        {identiteConnue ? (
          <p className="text-sm">
            Vous serez <b>dirigeant</b> de cette entreprise sous le nom{' '}
            <b>
              {prenom} {nom}
            </b>
            .
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle="Prénom">
              <input name="prenom" defaultValue={prenom} className="champ" required autoComplete="given-name" />
            </Champ>
            <Champ libelle="Nom">
              <input name="nom_famille" defaultValue={nom} className="champ" required autoComplete="family-name" />
            </Champ>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-[14px] bg-fond p-3 text-sm">
          <input type="checkbox" name="atteste" required className="mt-0.5 h-4 w-4 shrink-0 accent-cobalt" />
          <span>
            J’atteste être le <b>représentant légal</b> de cette entreprise (gérant, président…) ou disposer d’un pouvoir pour l’inscrire.
            Votre nom est ensuite recherché parmi les dirigeants déclarés au registre ; s’il n’y figure pas, une pièce d’identité vous sera demandée.
          </span>
        </label>
      </div>

      {etat?.erreur && (
        <div className="rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">
          {etat.erreur}
          {etat.dejaInscrite?.siren && (
            <button
              type="button"
              onClick={() => demanderAcces(etat.dejaInscrite!.siren, saisi('prenom'), saisi('nom_famille'))}
              className="ml-2 font-extrabold text-cobalt underline"
            >
              Demander l’accès
            </button>
          )}
        </div>
      )}
      <Bouton className="w-full py-3" disabled={siretFaux || enCours}>
        {enCours ? (
          <>
            <Roue /> Création…
          </>
        ) : (
          'Créer l’entreprise'
        )}
      </Bouton>
    </form>
  );
}

function DemandeAcces({
  siren,
  entreprise,
  retour,
  prenom,
  nom,
  identiteConnue,
  annuler,
}: {
  siren: string;
  entreprise: string;
  retour: string;
  prenom: string;
  nom: string;
  identiteConnue: boolean;
  annuler: () => void;
}) {
  const [etat, envoyer, enCours] = useActionState(demanderAcces, undefined);
  return (
    <form onSubmit={soumettre(envoyer)} className="carte space-y-4 p-5">
      <input type="hidden" name="retour" value={retour} />
      <input type="hidden" name="siren" value={siren} />
      <div>
        <p className="text-lg font-extrabold">{entreprise} est déjà sur Chantio</p>
        <p className="mt-1 text-sm text-gris">
          Demandez à la rejoindre : son dirigeant reçoit votre demande et choisit votre rôle (bureau, technicien…).
        </p>
      </div>
      {identiteConnue ? (
        <>
          <input type="hidden" name="prenom" value={prenom} />
          <input type="hidden" name="nom_famille" value={nom} />
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Prénom">
            <input name="prenom" defaultValue={prenom} className="champ" required autoComplete="given-name" />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom_famille" defaultValue={nom} className="champ" autoComplete="family-name" />
          </Champ>
        </div>
      )}
      <Champ libelle="Message (facultatif)">
        <textarea name="message" rows={2} className="champ" placeholder="Ex. : je suis la nouvelle assistante du bureau" />
      </Champ>
      {etat?.erreur && <p className="rounded-[14px] bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <Bouton disabled={enCours}>
          {enCours && <Roue />} {enCours ? 'Envoi…' : 'Demander l’accès'}
        </Bouton>
        <button type="button" onClick={annuler} className="px-3 text-sm font-bold text-gris hover:text-encre">
          Retour
        </button>
      </div>
    </form>
  );
}
