import {
  LIBELLE_TYPE_CLIENT,
  adresseComplete,
  dateCourte,
  numero,
  type Client,
  type ContactClient,
  type Site,
  type StatutIntervention,
} from '@chantio/shared';
import Link from 'next/link';
import { Icone } from '@/components/icones';
import { LienBouton, Puce, PuceStatut } from '@/components/ui';
import { BoutonEnvoi } from '@/components/retour';
import { Bloc, Ligne, Volet } from '@/components/volet';
import { contexteBureau } from '@/lib/session';
import { ajouterContact, supprimerContact } from './actions';

type Recente = { id: string; numero: number; motif: string; date_prevue: string | null; statut: StatutIntervention };

/** Fiche détaillée d'un client : identité, contacts, adresses, dernières interventions. */
export async function VoletClient({ id, fermer, cree }: { id: string; fermer: string; cree: boolean }) {
  const { supabase } = await contexteBureau();
  const [{ data }, { data: contactsBruts }, { data: recentes }] = await Promise.all([
    supabase.from('clients').select('*, sites(*)').eq('id', id).maybeSingle(),
    // Table ajoutée par la migration « clients_detail » : sans elle, la fiche s'affiche quand même.
    supabase.from('contacts_client').select('*').eq('client_id', id).order('cree_le'),
    supabase
      .from('interventions')
      .select('id, numero, motif, date_prevue, statut')
      .eq('client_id', id)
      .order('date_prevue', { ascending: false, nullsFirst: true })
      .limit(5),
  ]);

  if (!data) {
    return (
      <Volet fermer={fermer} titre="Client introuvable">
        <p className="text-gris">Il a peut-être été supprimé.</p>
      </Volet>
    );
  }
  const c = data as Client & { sites: Site[] };
  const contacts = (contactsBruts ?? []) as ContactClient[];
  const interventions = (recentes ?? []) as Recente[];
  const pro = c.type !== 'particulier';

  return (
    <Volet
      fermer={fermer}
      sous={
        <span className="flex flex-wrap items-center gap-2">
          <Puce ton={pro ? 'bleu' : 'gris'}>{LIBELLE_TYPE_CLIENT[c.type]}</Puce>
          {c.forme_juridique && <Puce>{c.forme_juridique}</Puce>}
        </span>
      }
      titre={[c.civilite, c.nom].filter(Boolean).join(' ')}
    >
      {cree && (
        <p className="apparition mb-5 flex items-center gap-2 rounded-xl bg-vert-doux px-4 py-3 text-sm font-semibold text-vert">
          ✓ Client ajouté.
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <LienBouton href={`/interventions/nouvelle?client=${c.id}`}>
          <Icone nom="plus" taille={18} /> Nouvelle intervention
        </LienBouton>
      </div>

      <Bloc titre="Coordonnées">
        <Ligne libelle="Portable">{c.mobile && <a href={`tel:${c.mobile}`} className="hover:underline">{c.mobile}</a>}</Ligne>
        <Ligne libelle="Téléphone">{c.telephone && <a href={`tel:${c.telephone}`} className="hover:underline">{c.telephone}</a>}</Ligne>
        <Ligne libelle="E-mail">{c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}</Ligne>
        <Ligne libelle="Site internet">
          {c.site_web && (
            <a href={/^https?:/.test(c.site_web) ? c.site_web : `https://${c.site_web}`} target="_blank" rel="noreferrer" className="hover:underline">
              {c.site_web}
            </a>
          )}
        </Ligne>
        <Ligne libelle="Facturation">{c.adresse_facturation}</Ligne>
        {!c.mobile && !c.telephone && !c.email && !c.site_web && !c.adresse_facturation && (
          <p className="text-sm text-gris">Aucune coordonnée renseignée.</p>
        )}
      </Bloc>

      {pro && (
        <Bloc titre="Entreprise">
          <Ligne libelle="SIREN">{c.siren?.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</Ligne>
          <Ligne libelle="SIRET">{c.siret?.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4')}</Ligne>
          <Ligne libelle="Forme juridique">{c.forme_juridique}</Ligne>
          <Ligne libelle="Activité">{c.activite}</Ligne>
          <Ligne libelle="TVA intracom.">{c.tva_intracom}</Ligne>
          {!c.siren && !c.siret && !c.forme_juridique && !c.tva_intracom && (
            <p className="text-sm text-gris">SIREN non renseigné.</p>
          )}
        </Bloc>
      )}

      <Bloc titre={`Contacts${contacts.length ? ` (${contacts.length})` : ''}`}>
        {c.contact && contacts.length === 0 && <p className="mb-3 text-sm">{c.contact}</p>}
        {contacts.length > 0 && (
          <ul className="mb-4 divide-y divide-trait">
            {contacts.map((p) => (
              <li key={p.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bleu-doux text-sm font-extrabold text-bleu">
                  {p.nom.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">
                    {p.nom} {p.fonction && <span className="font-medium text-gris">· {p.fonction}</span>}
                  </span>
                  {p.telephone && <a href={`tel:${p.telephone}`} className="mr-3 hover:underline">{p.telephone}</a>}
                  {p.email && <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a>}
                </span>
                <form action={supprimerContact.bind(null, p.id)}>
                  <button aria-label={`Retirer ${p.nom}`} className="text-gris transition hover:text-rouge">
                    <Icone nom="fermer" taille={16} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
            <Icone nom="plus" taille={16} /> Ajouter un contact
          </summary>
          <form action={ajouterContact.bind(null, c.id)} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="nom" required className="champ" placeholder="Nom et prénom" aria-label="Nom" />
              <input name="fonction" className="champ" placeholder="Fonction" aria-label="Fonction" />
              <input name="telephone" type="tel" className="champ" placeholder="Téléphone" aria-label="Téléphone" />
              <input name="email" type="email" className="champ" placeholder="E-mail" aria-label="E-mail" />
            </div>
            <BoutonEnvoi className="w-full" enCours="Ajout…">Ajouter le contact</BoutonEnvoi>
          </form>
        </details>
      </Bloc>

      <Bloc titre={`Adresses${c.sites.length ? ` (${c.sites.length})` : ''}`}>
        {c.sites.length === 0 ? (
          <p className="text-sm text-gris">Aucune adresse : elle sera ajoutée avec la première intervention.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {c.sites.map((s) => (
              <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="flex items-center gap-2 font-semibold">
                  <Icone nom="lieu" taille={16} className="shrink-0 text-cobalt" /> {adresseComplete(s)}
                </p>
                {(s.acces || s.consignes) && (
                  <p className="mt-1 pl-6 text-gris">{[s.acces, s.consignes].filter(Boolean).join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloc>

      <Bloc titre="Dernières interventions">
        {interventions.length === 0 ? (
          <p className="text-sm text-gris">Aucune intervention pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {interventions.map((i) => (
              <li key={i.id}>
                <Link href={`/interventions?fiche=${i.id}`} className="flex items-center gap-3 py-2.5 hover:text-cobalt">
                  <span className="font-mono text-xs text-gris">{numero(i.numero)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{i.motif}</span>
                  <span className="text-xs text-gris">{dateCourte(i.date_prevue)}</span>
                  <PuceStatut statut={i.statut} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bloc>

      {c.notes && (
        <Bloc titre="Notes">
          <p className="whitespace-pre-line text-sm">{c.notes}</p>
        </Bloc>
      )}
    </Volet>
  );
}
