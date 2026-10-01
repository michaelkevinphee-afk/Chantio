'use client';

import { Fragment, useActionState, useRef, useState } from 'react';
import { LIBELLE_TYPE_CLIENT } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { BoutonEnvoi } from '@/components/volet';
import type { EntrepriseTrouvee } from '@/app/api/entreprises/route';
import { ajouterClient } from './actions';

type Contact = { nom: string; fonction: string; telephone: string; email: string };
const CONTACT_VIDE: Contact = { nom: '', fonction: '', telephone: '', email: '' };

const TYPES_PRO = (['entreprise', 'syndic', 'bailleur', 'collectivite'] as const).map((t) => [t, LIBELLE_TYPE_CLIENT[t]]);

/** Fiche « Nouveau client » : particulier ou professionnel, avec recherche dans l'annuaire des entreprises. */
export function FormulaireClient() {
  const [etat, envoyer] = useActionState(ajouterClient, undefined);
  const [genre, setGenre] = useState<'particulier' | 'pro'>('particulier');
  const [pro, setPro] = useState<Partial<EntrepriseTrouvee>>({});
  const [contacts, setContacts] = useState<Contact[]>([CONTACT_VIDE]);
  const [factureAilleurs, setFactureAilleurs] = useState(false);

  const choisir = (e: EntrepriseTrouvee) => {
    setPro(e);
    // Le premier dirigeant devient le premier contact, si rien n'est encore saisi.
    if (e.dirigeants[0] && contacts.every((c) => !c.nom)) {
      setContacts([{ ...CONTACT_VIDE, nom: e.dirigeants[0].nom, fonction: e.dirigeants[0].fonction ?? '' }]);
    }
  };
  const champPro = (cle: keyof EntrepriseTrouvee) => ({
    name: cle,
    value: (pro[cle] as string | null | undefined) ?? '',
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setPro((p) => ({ ...p, [cle]: ev.target.value })),
  });
  const majContact = (k: number, cle: keyof Contact, v: string) =>
    setContacts((cs) => cs.map((c, n) => (n === k ? { ...c, [cle]: v } : c)));

  return (
    <form action={envoyer} className="space-y-5">
      <input type="hidden" name="genre" value={genre} />

      <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-trait bg-white p-1">
        {(['particulier', 'pro'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(g)}
            className={`rounded-[12px] py-2.5 text-sm font-extrabold transition ${genre === g ? 'degrade text-white' : 'text-gris hover:text-encre'}`}
          >
            {g === 'particulier' ? 'Particulier' : 'Professionnel'}
          </button>
        ))}
      </div>

      {genre === 'pro' ? (
        <Fragment key="pro">
          <RechercheEntreprise onChoix={choisir} />
          <Groupe titre="Identité">
            <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-2">
              <Champ libelle="Raison sociale">
                <input {...champPro('nom')} className="champ" required />
              </Champ>
              <Champ libelle="Type">
                <select name="type" className="champ" defaultValue="entreprise">
                  {TYPES_PRO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Champ>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Champ libelle="SIREN">
                <input {...champPro('siren')} className="champ" inputMode="numeric" pattern="\s*(\d\s*){9}" title="9 chiffres" />
              </Champ>
              <Champ libelle="SIRET">
                <input {...champPro('siret')} className="champ" inputMode="numeric" pattern="\s*(\d\s*){14}" title="14 chiffres" />
              </Champ>
              <Champ libelle="Forme juridique">
                <input {...champPro('forme_juridique')} className="champ" />
              </Champ>
              <Champ libelle="TVA intracom.">
                <input {...champPro('tva_intracom')} className="champ" />
              </Champ>
            </div>
            <input type="hidden" name="activite" value={pro.activite ?? ''} />
          </Groupe>

          <Groupe titre="Coordonnées">
            <div className="grid grid-cols-2 gap-2">
              <Champ libelle="Téléphone (standard)">
                <input name="telephone" type="tel" className="champ" />
              </Champ>
              <Champ libelle="E-mail">
                <input name="email" type="email" className="champ" />
              </Champ>
            </div>
            <Champ libelle="Site internet">
              <input name="site_web" className="champ" placeholder="www.exemple.fr" />
            </Champ>
          </Groupe>

          <Groupe titre="Contacts">
            {contacts.map((c, k) => (
              <div key={k} className="space-y-2 rounded-[16px] bg-fond p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input name="contact_nom" value={c.nom} onChange={(e) => majContact(k, 'nom', e.target.value)} className="champ" placeholder="Nom et prénom" aria-label="Nom du contact" />
                  <input name="contact_fonction" value={c.fonction} onChange={(e) => majContact(k, 'fonction', e.target.value)} className="champ" placeholder="Fonction (gestionnaire…)" aria-label="Fonction" />
                  <input name="contact_telephone" type="tel" value={c.telephone} onChange={(e) => majContact(k, 'telephone', e.target.value)} className="champ" placeholder="Téléphone" aria-label="Téléphone du contact" />
                  <input name="contact_email" type="email" value={c.email} onChange={(e) => majContact(k, 'email', e.target.value)} className="champ" placeholder="E-mail" aria-label="E-mail du contact" />
                </div>
                {contacts.length > 1 && (
                  <button type="button" onClick={() => setContacts((cs) => cs.filter((_, n) => n !== k))} className="text-sm font-semibold text-gris underline">
                    Retirer ce contact
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setContacts((cs) => [...cs, CONTACT_VIDE])} className="inline-flex items-center gap-1.5 text-sm font-bold text-cobalt">
              <Icone nom="plus" taille={16} /> Ajouter un contact
            </button>
          </Groupe>
        </Fragment>
      ) : (
        <Fragment key="particulier">
          <Groupe titre="Identité">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <Champ libelle="Civilité">
                <select name="civilite" className="champ" defaultValue="">
                  <option value="">—</option>
                  <option>Mme</option>
                  <option>M.</option>
                </select>
              </Champ>
              <Champ libelle="Prénom">
                <input name="prenom" className="champ" />
              </Champ>
              <Champ libelle="Nom">
                <input name="nom" className="champ" required />
              </Champ>
            </div>
          </Groupe>
          <Groupe titre="Coordonnées">
            <div className="grid grid-cols-2 gap-2">
              <Champ libelle="Portable">
                <input name="mobile" type="tel" className="champ" />
              </Champ>
              <Champ libelle="Téléphone fixe">
                <input name="telephone" type="tel" className="champ" />
              </Champ>
            </div>
            <Champ libelle="E-mail (pour le rapport)">
              <input name="email" type="email" className="champ" />
            </Champ>
          </Groupe>
        </Fragment>
      )}

      <Groupe key={`adresse-${genre}`} titre={genre === 'pro' ? 'Adresse d’intervention ou du siège' : 'Adresse d’intervention'}>
        <Champ libelle="Adresse">
          <input {...(genre === 'pro' ? champPro('adresse') : { name: 'adresse' })} className="champ" />
        </Champ>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
          <Champ libelle="Code postal">
            <input {...(genre === 'pro' ? champPro('code_postal') : { name: 'code_postal' })} className="champ" inputMode="numeric" />
          </Champ>
          <Champ libelle="Ville">
            <input {...(genre === 'pro' ? champPro('ville') : { name: 'ville' })} className="champ" />
          </Champ>
        </div>
        {genre === 'pro' && (
          <>
            <input type="hidden" name="latitude" value={pro.latitude ?? ''} />
            <input type="hidden" name="longitude" value={pro.longitude ?? ''} />
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Champ libelle="Accès">
            <input name="acces" className="champ" placeholder="Code, étage, bâtiment" />
          </Champ>
          <Champ libelle="Consignes">
            <input name="consignes" className="champ" placeholder="Chien, horaires…" />
          </Champ>
        </div>
        <label className="flex items-center gap-2 pt-1 text-sm font-semibold">
          <input type="checkbox" checked={factureAilleurs} onChange={(e) => setFactureAilleurs(e.target.checked)} className="h-4 w-4 accent-cobalt" />
          Adresse de facturation différente
        </label>
        {factureAilleurs && <textarea name="adresse_facturation" rows={2} className="champ" placeholder="Adresse de facturation" aria-label="Adresse de facturation" />}
      </Groupe>

      <Groupe titre="Notes">
        <textarea name="notes" rows={3} className="champ" placeholder="Infos utiles : bailleur, gardien, habitudes…" aria-label="Notes" />
      </Groupe>

      {etat?.erreur && <p className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{etat.erreur}</p>}
      <div className="sticky -bottom-6 -mx-6 -mb-6 border-t border-trait bg-fond/90 px-6 py-4 backdrop-blur">
        <BoutonEnvoi className="w-full">Créer le client</BoutonEnvoi>
      </div>
    </form>
  );
}

/** Recherche par nom ou SIREN dans l'annuaire public des entreprises. */
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
    <div className="carte p-4">
      <label className="etiquette" htmlFor="recherche-entreprise">Retrouver l’entreprise</label>
      <div className="relative">
        <Icone nom="recherche" taille={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gris" />
        <input
          id="recherche-entreprise"
          value={q}
          onChange={(e) => chercher(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="champ pl-11"
          placeholder="Nom, SIREN ou SIRET"
          autoComplete="off"
        />
        {etat === 'recherche' && (
          <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-trait border-t-cobalt" />
        )}
      </div>
      <p className="mt-1.5 text-xs text-gris">Annuaire officiel des entreprises (gratuit) : la fiche se remplit toute seule.</p>

      {etat === 'vide' && <p className="mt-3 text-sm text-gris">Aucune entreprise trouvée.</p>}
      {etat === 'erreur' && <p className="mt-3 text-sm font-semibold text-rouge">{message}</p>}
      {resultats.length > 0 && (
        <ul className="mt-3 divide-y divide-trait overflow-hidden rounded-[14px] border border-trait">
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
                  <span className="block truncate font-bold">{r.nom}</span>
                  <span className="block truncate text-xs text-gris">
                    SIREN {r.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                    {r.ville && ` · ${r.code_postal ?? ''} ${r.ville}`}
                    {r.forme_juridique && ` · ${r.forme_juridique}`}
                  </span>
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

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="carte space-y-3 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-gris">{titre}</p>
      {children}
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
