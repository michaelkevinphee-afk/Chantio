'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { LIBELLE_TYPE_CLIENT, type FacturationClient, type TypeClient } from '@chantio/shared';
import { Icone } from '@/components/icones';
import type { EntrepriseTrouvee } from '@/app/api/entreprises/route';
import { enregistrerClient } from './actions';
import { Champ, Erreur, LigneChamps, Pied, SAISIE, useEnvoi } from './fenetres';

/** Fiche telle que la fenêtre « Modifier » la reçoit. `adresse` : celle du cabinet (syndic, bailleur) ou la première adresse. */
export type ClientAModifier = {
  id: string;
  nom: string;
  type: TypeClient;
  contact: string | null;
  telephone: string | null;
  mobile: string | null;
  email: string | null;
  adresse: string;
  site_id: string | null;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  tva_intracom: string | null;
  site_web: string | null;
  notes: string | null;
  facturation: FacturationClient;
  contacts: Contact[];
};

type Contact = { nom: string; fonction: string; telephone: string; email: string };
const CONTACT_VIDE: Contact = { nom: '', fonction: '', telephone: '', email: '' };
const TYPES = Object.keys(LIBELLE_TYPE_CLIENT) as TypeClient[];

/**
 * Fenêtre « Nouveau client » / « Modifier <nom> » (fenetreClient du bac) : type en puces, recherche de l'entreprise
 * dans l'annuaire officiel, nom, contact, téléphone, e-mail, adresse, SIREN, facturation des syndics et bailleurs.
 * Les informations en plus de la production (SIRET, TVA, autres contacts, notes…) sont dans « Plus d’informations ».
 */
export function FormulaireClient({
  client,
  fermer,
  peutSupprimer = false,
  focus,
}: {
  client?: ClientAModifier;
  fermer: string;
  peutSupprimer?: boolean;
  focus?: 'tel';
}) {
  const nouveau = !client;
  const { etat, envoyer } = useEnvoi(enregistrerClient.bind(null, client?.id ?? null, fermer), fermer);
  const [type, setType] = useState<TypeClient>(client?.type ?? 'particulier');
  const [champs, setChamps] = useState({
    nom: client?.nom ?? '',
    adresse: client?.adresse ?? '',
    siren: client?.siren ?? '',
    siret: client?.siret ?? '',
    forme_juridique: client?.forme_juridique ?? '',
    tva_intracom: client?.tva_intracom ?? '',
  });
  const [annuaire, setAnnuaire] = useState<Partial<EntrepriseTrouvee> | null>(null);
  const [contacts, setContacts] = useState<Contact[]>(client?.contacts.length ? client.contacts : [CONTACT_VIDE]);
  const pro = type !== 'particulier';
  const imms = type === 'syndic' || type === 'bailleur';
  // Le téléphone principal est le portable s'il y en a un, sinon le fixe (comme la liste).
  const colonne = client?.mobile ? 'mobile' : 'telephone';
  const principal = client ? (client.mobile ?? client.telephone ?? '') : '';
  const secondaire = client ? ((colonne === 'mobile' ? client.telephone : client.mobile) ?? '') : '';

  const saisie = (cle: keyof typeof champs) => ({
    name: cle,
    value: champs[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setChamps((c) => ({ ...c, [cle]: e.target.value })),
  });
  const choisir = (e: EntrepriseTrouvee) => {
    setAnnuaire(e);
    setChamps((c) => ({
      ...c,
      nom: e.nom,
      siren: e.siren,
      siret: e.siret ?? c.siret,
      forme_juridique: e.forme_juridique ?? c.forme_juridique,
      tva_intracom: e.tva_intracom ?? c.tva_intracom,
      adresse: [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || c.adresse,
    }));
    // Le premier dirigeant devient le premier contact, si rien n'est encore saisi.
    if (e.dirigeants[0] && contacts.every((k) => !k.nom)) setContacts([{ ...CONTACT_VIDE, nom: e.dirigeants[0].nom, fonction: e.dirigeants[0].fonction ?? '' }]);
  };
  const majContact = (k: number, cle: keyof Contact, v: string) => setContacts((cs) => cs.map((c, n) => (n === k ? { ...c, [cle]: v } : c)));

  return (
    <form action={envoyer} className="flex flex-col gap-3.5">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="tel_colonne" value={colonne} />
      {client?.site_id && <input type="hidden" name="site_id" value={client.site_id} />}
      {annuaire && (
        <>
          <input type="hidden" name="activite" value={annuaire.activite ?? ''} />
          <input type="hidden" name="latitude" value={annuaire.latitude ?? ''} />
          <input type="hidden" name="longitude" value={annuaire.longitude ?? ''} />
        </>
      )}

      <div className="flex flex-col gap-1 text-[13px] font-bold text-gris">
        <span id="type-client">Type de client</span>
        <div role="radiogroup" aria-labelledby="type-client" className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition max-sm:py-2 ${
                type === t ? 'border-cobalt bg-cobalt text-white' : 'border-trait bg-white text-gris hover:border-cobalt hover:text-encre'
              }`}
            >
              {LIBELLE_TYPE_CLIENT[t]}
            </button>
          ))}
        </div>
      </div>

      {pro && <RechercheEntreprise onChoix={choisir} />}

      <LigneChamps>
        <Champ libelle={pro ? 'Raison sociale' : 'Nom'}>
          <input {...saisie('nom')} className={SAISIE} placeholder={pro ? 'ex. Cabinet Dupré Gestion' : 'ex. M. et Mme Lambert'} required autoFocus={!focus} />
        </Champ>
        <Champ libelle="Contact">
          <input name="contact" defaultValue={client?.contact ?? ''} className={SAISIE} placeholder={pro ? 'ex. M. Leroy, gestionnaire' : 'ex. Mme Lambert'} />
        </Champ>
      </LigneChamps>
      <LigneChamps>
        <Champ libelle="Téléphone">
          <input name="telephone" type="tel" defaultValue={principal} className={SAISIE} autoFocus={focus === 'tel'} />
        </Champ>
        <Champ libelle="E-mail">
          <input name="email" type="email" defaultValue={client?.email ?? ''} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <LigneChamps>
        <Champ libelle="Adresse">
          <input {...saisie('adresse')} className={SAISIE} placeholder="Numéro, rue, code postal, ville" />
        </Champ>
        {pro && (
          <Champ libelle="SIREN">
            <input {...saisie('siren')} className={SAISIE} inputMode="numeric" />
          </Champ>
        )}
      </LigneChamps>
      {imms && (
        <Champ libelle="Facturation">
          <select name="facturation" defaultValue={client?.facturation ?? 'intervention'} className={SAISIE}>
            <option value="intervention">Une facture par intervention</option>
            <option value="mensuel">Un relevé par mois pour chaque immeuble</option>
          </select>
        </Champ>
      )}
      {imms && nouveau && (
        <p className="text-[13px] text-gris">Après l’enregistrement, ajoutez ses immeubles et leurs occupants depuis sa fiche, section «&nbsp;Ses immeubles&nbsp;».</p>
      )}

      <details className="group rounded-[14px] border border-trait px-3.5 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
          <Icone nom="chevron" taille={16} className="transition group-open:rotate-90" /> Plus d’informations
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <LigneChamps>
            <Champ libelle="Autre téléphone">
              <input name="autre_telephone" type="tel" defaultValue={secondaire} className={SAISIE} />
            </Champ>
            {pro && (
              <Champ libelle="Site internet">
                <input name="site_web" defaultValue={client?.site_web ?? ''} className={SAISIE} placeholder="www.exemple.fr" />
              </Champ>
            )}
          </LigneChamps>
          {pro && (
            <LigneChamps>
              <Champ libelle="SIRET">
                <input {...saisie('siret')} className={SAISIE} inputMode="numeric" pattern="\s*(\d\s*){14}" title="14 chiffres" />
              </Champ>
              <Champ libelle="Forme juridique">
                <input {...saisie('forme_juridique')} className={SAISIE} />
              </Champ>
              <Champ libelle="TVA intracom.">
                <input {...saisie('tva_intracom')} className={SAISIE} />
              </Champ>
            </LigneChamps>
          )}
          {pro && (
            <div className="flex flex-col gap-2">
              <input type="hidden" name="contacts_envoyes" value="1" />
              <span className="text-[13px] font-bold text-gris">Autres contacts</span>
              {contacts.map((c, k) => (
                <div key={k} className="flex flex-col gap-2 rounded-[14px] bg-fond p-3">
                  <LigneChamps>
                    <input name="contact_nom" value={c.nom} onChange={(e) => majContact(k, 'nom', e.target.value)} className={SAISIE} placeholder="Nom et prénom" aria-label="Nom du contact" />
                    <input name="contact_fonction" value={c.fonction} onChange={(e) => majContact(k, 'fonction', e.target.value)} className={SAISIE} placeholder="Fonction (gestionnaire…)" aria-label="Fonction" />
                  </LigneChamps>
                  <LigneChamps>
                    <input name="contact_telephone" type="tel" value={c.telephone} onChange={(e) => majContact(k, 'telephone', e.target.value)} className={SAISIE} placeholder="Téléphone" aria-label="Téléphone du contact" />
                    <input name="contact_email" type="email" value={c.email} onChange={(e) => majContact(k, 'email', e.target.value)} className={SAISIE} placeholder="E-mail" aria-label="E-mail du contact" />
                  </LigneChamps>
                  {(contacts.length > 1 || c.nom) && (
                    <button
                      type="button"
                      onClick={() => setContacts((cs) => (cs.length > 1 ? cs.filter((_, n) => n !== k) : [CONTACT_VIDE]))}
                      className="self-start text-sm font-semibold text-gris underline"
                    >
                      Retirer ce contact
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setContacts((cs) => [...cs, CONTACT_VIDE])} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-cobalt">
                <Icone nom="plus" taille={16} /> Ajouter un contact
              </button>
            </div>
          )}
          <Champ libelle="Notes">
            <textarea name="notes" rows={2} defaultValue={client?.notes ?? ''} className={SAISIE} placeholder="Infos utiles : habitudes, horaires…" />
          </Champ>
        </div>
      </details>

      <Erreur etat={etat} />
      <Pied
        valider={nouveau ? 'Créer le client' : 'Enregistrer'}
        gauche={
          peutSupprimer && client ? (
            // Sur la page de la fiche (fermer), avec son ?depuis : on y revient si l'on annule.
            <Link href={`${fermer}${fermer.includes('?') ? '&' : '?'}supprimer=1`} scroll={false} className="text-sm font-bold text-rouge hover:underline">
              Supprimer ce client
            </Link>
          ) : undefined
        }
      />
    </form>
  );
}

/** Recherche par nom ou SIREN dans l'annuaire officiel des entreprises : la fiche se remplit toute seule. */
function RechercheEntreprise({ onChoix }: { onChoix: (e: EntrepriseTrouvee) => void }) {
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<EntrepriseTrouvee[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'vide' | 'erreur'>('repos');
  const [message, setMessage] = useState('');
  const [choisi, setChoisi] = useState<string | null>(null);
  const derniere = useRef(0);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cherche 300 ms après la dernière frappe ; seule la dernière réponse compte.
  const chercher = (valeur: string) => {
    setQ(valeur);
    setChoisi(null);
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
          setMessage('La recherche ne répond pas, remplissez la fiche à la main.');
        }
      }
    }, 300);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Champ libelle="Rechercher l’entreprise par nom ou SIREN" aide="Annuaire officiel des entreprises : la fiche se remplit toute seule.">
        <span className="relative block">
          <input
            type="search"
            value={q}
            onChange={(e) => chercher(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            className={`${SAISIE} pr-10`}
            placeholder="Nom, SIREN ou SIRET"
            autoComplete="off"
          />
          {etat === 'recherche' && (
            <span className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-trait border-t-cobalt" />
          )}
        </span>
      </Champ>
      {etat === 'vide' && <p className="text-[13px] text-gris">Rien dans l’annuaire. Remplissez la fiche à la main.</p>}
      {etat === 'erreur' && <p className="text-[13px] font-semibold text-rouge">{message}</p>}
      {resultats.length > 0 && (
        <ul className="divide-y divide-trait overflow-hidden rounded-[14px] border border-trait">
          {resultats.map((r) => (
            <li key={r.siren}>
              <button
                type="button"
                onClick={() => {
                  onChoix(r);
                  setChoisi(r.siren);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-fond ${choisi === r.siren ? 'bg-doux' : 'bg-white'}`}
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{r.nom}</b>
                  <small className="block truncate text-xs text-gris">
                    SIREN {r.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                    {(r.adresse || r.ville) && ` · ${[r.adresse, [r.code_postal, r.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`}
                  </small>
                </span>
                {r.fermee && <span className="rounded-full bg-rouge-doux px-2 py-0.5 text-xs font-bold text-rouge">Fermée</span>}
                {choisi === r.siren && <span className="text-xs font-bold text-vert">✓ Repris</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
