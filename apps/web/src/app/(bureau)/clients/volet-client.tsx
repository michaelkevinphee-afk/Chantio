import {
  LIBELLE_TYPE_CLIENT,
  aDesImmeubles,
  adresseComplete,
  ajouterJours,
  aujourdhui,
  chiffresClient,
  chosesAFaire,
  dateCourte,
  euroRond,
  numeroIntervention,
  resumeClient,
  type ChoseAFaire,
  type Client,
  type ContactClient,
  type Occupant,
  type Site,
  type StatutIntervention,
} from '@chantio/shared';
import Link from 'next/link';
import { Icone } from '@/components/icones';
import { LienBouton, Puce, PuceStatut, classeBouton } from '@/components/ui';
import { BoutonEnvoi } from '@/components/retour';
import { Bloc, Ligne, Volet } from '@/components/volet';
import { contexteBureau } from '@/lib/session';
import { chargerContrats, suivreContrat } from '@/lib/contrats';
import { chargerSuivi } from '@/lib/suivi-clients';
import {
  ajouterContact,
  ajouterEquipement,
  ajouterImmeuble,
  ajouterOccupant,
  changerFacturation,
  modifierEquipement,
  modifierImmeuble,
  supprimerContact,
  supprimerEquipement,
  supprimerOccupant,
} from './actions';

type LigneIntervention = {
  id: string;
  numero: number;
  reference: string | null;
  motif: string;
  date_prevue: string | null;
  statut: StatutIntervention;
  site: { adresse: string } | null;
  occupant: { nom: string } | null;
};
type EquipementSite = {
  id: string;
  categorie: string;
  marque: string | null;
  modele: string | null;
  dernier_passage: string | null;
  prochain_passage: string | null;
  obligation: string | null;
};
type Immeuble = Site & { occupants: Occupant[]; equipements: EquipementSite[] };

const NIVEAU: Record<ChoseAFaire['niveau'], { libelle: string; ton: 'rouge' | 'bleu' | 'gris' }> = {
  urgent: { libelle: 'Urgent', ton: 'rouge' },
  afaire: { libelle: 'À faire', ton: 'bleu' },
  attente: { libelle: 'On attend', ton: 'gris' },
};
const FACTURATION = { intervention: 'Une facture par intervention', mensuel: 'Un relevé par mois pour chaque immeuble' };

/** Fiche d'un client : où on en est, ses chiffres, ses interventions, ses immeubles et occupants. */
export async function VoletClient({ id, fermer, cree }: { id: string; fermer: string; cree: boolean }) {
  const { supabase } = await contexteBureau();
  const [{ data }, { data: contactsBruts }, { data: lignes }, suivi, contrats] = await Promise.all([
    supabase.from('clients').select('*, sites(*, occupants(*), equipements(*))').eq('id', id).maybeSingle(),
    // Table ajoutée par la migration « clients_detail » : sans elle, la fiche s'affiche quand même.
    supabase.from('contacts_client').select('*').eq('client_id', id).order('cree_le'),
    supabase
      .from('interventions')
      .select('id, numero, reference, motif, date_prevue, statut, site:sites(adresse), occupant:occupants(nom)')
      .eq('client_id', id)
      .order('date_prevue', { ascending: false, nullsFirst: true })
      .limit(60),
    chargerSuivi(supabase, id),
    chargerContrats(supabase, id),
  ]);

  if (!data) {
    return (
      <Volet fermer={fermer} titre="Client introuvable">
        <p className="text-gris">Il a peut-être été supprimé.</p>
      </Volet>
    );
  }
  const c = data as Client & { sites: Immeuble[] };
  c.sites.sort((a, b) => a.adresse.localeCompare(b.adresse));
  const contacts = (contactsBruts ?? []) as ContactClient[];
  const interventions = (lignes ?? []) as unknown as LigneIntervention[];
  const pro = c.type !== 'particulier';
  const immeubles = aDesImmeubles(c.type);
  const ajd = aujourdhui();

  const suiviInterventions = suivi.interventions.get(id) ?? [];
  const suiviDocuments = suivi.documents.get(id) ?? [];
  const liste = chosesAFaire({ id, type: c.type, facturation: c.facturation, immeubles: c.sites.length }, suiviInterventions, suiviDocuments, ajd);
  const resume = resumeClient(liste, interventions.length > 0 || suiviDocuments.length > 0);
  const chiffres = chiffresClient(suiviDocuments, suiviInterventions, ajd);
  const aFaire = liste.filter((x) => x.niveau !== 'attente');
  const attente = liste.filter((x) => x.niveau === 'attente');

  const prochaines = interventions
    .filter((i) => i.date_prevue && i.date_prevue >= ajd && ['a_planifier', 'planifiee', 'en_cours'].includes(i.statut))
    .sort((a, b) => (a.date_prevue ?? '').localeCompare(b.date_prevue ?? ''));
  const historique = interventions.filter((i) => !prochaines.includes(i)).slice(0, 10);

  // « Service technique, M. Garnier » : on appelle la personne, pas le service.
  const telephone = c.mobile ?? c.telephone;
  const morceaux = (c.contact ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const appel = morceaux.find((x) => /^(M\.|Mme|Mlle)\s/.test(x)) ?? morceaux[0] ?? '';
  const lieu = (i: LigneIntervention) => (immeubles && i.site ? [i.site.adresse, i.occupant?.nom].filter(Boolean).join(', ') : null);

  const ligneIntervention = (i: LigneIntervention) => (
    <li key={i.id}>
      <Link href={`/interventions?fiche=${i.id}`} className="flex items-center gap-3 py-2.5 hover:text-cobalt">
        <span className="font-mono text-xs text-gris">{numeroIntervention(i)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{i.motif}</span>
          {lieu(i) && <span className="block truncate text-xs text-gris">{lieu(i)}</span>}
        </span>
        <span className="text-xs text-gris">{dateCourte(i.date_prevue)}</span>
        <PuceStatut statut={i.statut} />
      </Link>
    </li>
  );

  return (
    <Volet
      fermer={fermer}
      sous={
        <span className="flex flex-wrap items-center gap-2">
          <Puce ton={pro ? 'bleu' : 'gris'}>{LIBELLE_TYPE_CLIENT[c.type]}</Puce>
          {c.forme_juridique && <Puce>{c.forme_juridique}</Puce>}
          {immeubles && <Puce>{c.sites.length ? `${c.sites.length} immeuble${c.sites.length > 1 ? 's' : ''}` : 'Aucun immeuble'}</Puce>}
          <Puce ton={resume.ton}>{resume.etiquette}</Puce>
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
        {telephone && (
          <a href={`tel:${telephone.replace(/[^\d+]/g, '')}`} className={classeBouton('secondaire')}>
            <Icone nom="telephone" taille={18} /> {appel ? `Appeler ${appel}` : 'Appeler'}
          </a>
        )}
      </div>

      <Bloc titre="Où on en est">
        {liste.length === 0 ? (
          <p className="text-sm text-gris">
            {resume.etiquette === 'À jour' ? 'Rien à faire pour ce client en ce moment.' : 'Rien encore : créez une intervention ou un devis.'}
          </p>
        ) : (
          <>
            {chiffres.enRetard > 0.005 && (
              <p className="mb-3 rounded-xl bg-rouge-doux px-3 py-2 text-sm font-semibold text-rouge">
                Factures en retard de paiement : {euroRond(chiffres.enRetard)} TTC.
              </p>
            )}
            <ul className="divide-y divide-trait">
              {[...aFaire, ...attente].map((x, n) => (
                <li key={n} className={`flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0 ${x.niveau === 'attente' ? 'text-gris' : ''}`}>
                  <span className="pt-0.5">
                    <Puce ton={NIVEAU[x.niveau].ton}>{NIVEAU[x.niveau].libelle}</Puce>
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{x.texte}</span>
                  <Link href={x.lien} className="text-sm font-bold whitespace-nowrap text-cobalt hover:underline">
                    {x.bouton}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloc>

      <Bloc titre={`Cette année`}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Facturé', `${euroRond(chiffres.factureHT)} HT`, 'depuis janvier, avoirs déduits'],
            ['Encaissé', `${euroRond(chiffres.encaisse)} TTC`, 'depuis janvier'],
            ['À encaisser', `${euroRond(chiffres.aEncaisser)} TTC`, chiffres.enRetard > 0.005 ? `dont ${euroRond(chiffres.enRetard)} en retard` : 'aucun retard'],
            ['Interventions', String(chiffres.interventions), 'depuis janvier'],
          ].map(([libelle, valeur, aide]) => (
            <div key={libelle} className="rounded-xl bg-fond px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-gris">{libelle}</p>
              <p className="text-lg font-extrabold">{valeur}</p>
              <p className="text-xs text-gris">{aide}</p>
            </div>
          ))}
        </div>
      </Bloc>

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
        {immeubles && (
          <div className="flex gap-3 border-b border-trait py-2 text-sm last:border-0 first:pt-0 last:pb-0">
            <span className="w-32 shrink-0 text-gris">Factures</span>
            <form action={changerFacturation.bind(null, c.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <select name="facturation" defaultValue={c.facturation ?? 'intervention'} className="champ w-auto py-1.5 text-sm" aria-label="Facturation">
                {Object.entries(FACTURATION).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <BoutonEnvoi className="px-3 py-1.5 text-sm" enCours="…">
                Enregistrer
              </BoutonEnvoi>
            </form>
          </div>
        )}
        {!c.mobile && !c.telephone && !c.email && !c.site_web && !c.adresse_facturation && !immeubles && (
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
          {!c.siren && !c.siret && !c.forme_juridique && !c.tva_intracom && <p className="text-sm text-gris">SIREN non renseigné.</p>}
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

      {prochaines.length > 0 && (
        <Bloc titre="Prochaines interventions">
          <ul className="divide-y divide-trait text-sm">{prochaines.map(ligneIntervention)}</ul>
        </Bloc>
      )}

      <Bloc
        titre={`Contrats d’entretien${contrats.length ? ` (${contrats.length})` : ''}`}
        action={
          <Link href={`/clients/contrats?nouveau=1&client=${c.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-cobalt hover:underline">
            <Icone nom="plus" taille={14} /> Nouveau contrat
          </Link>
        }
      >
        {contrats.length === 0 ? (
          <p className="text-sm text-gris">Aucun contrat. Un contrat d’entretien suit les visites, la date limite de préavis et prépare le renouvellement.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">
            {contrats.map((ct) => {
              const { etat, aPlanifier } = suivreContrat(ct, ajd);
              return (
                <li key={ct.id}>
                  <Link href={`/clients/contrats?client=${c.id}`} className="flex items-start gap-3 py-2.5 first:pt-0 hover:text-cobalt">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        <span className="font-mono text-xs font-normal text-gris">{ct.reference}</span> {ct.objet}
                      </span>
                      <span className="block text-xs text-gris">
                        {etat.detail}
                        {aPlanifier.length ? ` ${aPlanifier.length} visite${aPlanifier.length > 1 ? 's' : ''} à créer.` : ''}
                      </span>
                    </span>
                    <Puce ton={etat.ton}>{etat.etiquette}</Puce>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Bloc>

      {immeubles ? (
        <div id="immeubles">
          <Bloc titre={`Immeubles${c.sites.length ? ` (${c.sites.length})` : ''}`}>
            {c.sites.length === 0 && <p className="mb-3 text-sm text-gris">Ajoutez ses immeubles pour y créer des interventions chez les occupants.</p>}
            <ul className="divide-y divide-trait text-sm">
              {c.sites.map((s) => (
                <li key={s.id} className="py-3 first:pt-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <Icone nom="lieu" taille={16} className="shrink-0 text-cobalt" /> {adresseComplete(s)}
                  </p>
                  {(s.acces || s.gardien || s.copropriete) && (
                    <p className="mt-1 pl-6 text-gris">
                      {[s.acces && `Accès : ${s.acces}`, s.gardien && `Gardien : ${s.gardien}`, s.copropriete].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1 pl-6">
                    {s.occupants
                      .sort((a, b) => a.nom.localeCompare(b.nom))
                      .map((o) => (
                        <li key={o.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold">{o.nom}</span>
                            {o.lot && <span className="text-gris"> · {o.lot}</span>}
                            {o.telephone && (
                              <a href={`tel:${o.telephone}`} className="ml-2 hover:underline">
                                {o.telephone}
                              </a>
                            )}
                          </span>
                          <form action={supprimerOccupant.bind(null, o.id)}>
                            <button aria-label={`Retirer ${o.nom}`} className="text-gris transition hover:text-rouge">
                              <Icone nom="fermer" taille={14} />
                            </button>
                          </form>
                        </li>
                      ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-4 pl-6">
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
                        <Icone nom="plus" taille={14} /> Ajouter un occupant
                      </summary>
                      <form action={ajouterOccupant.bind(null, s.id)} className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input name="nom" required className="champ" placeholder="Mme Martin, ou Parties communes" aria-label="Nom de l’occupant" />
                          <input name="lot" className="champ" placeholder="3e gauche, lot 12…" aria-label="Étage, porte ou lot" />
                          <input name="telephone" type="tel" className="champ" placeholder="Téléphone" aria-label="Téléphone de l’occupant" />
                          <input name="email" type="email" className="champ" placeholder="E-mail" aria-label="E-mail de l’occupant" />
                        </div>
                        <BoutonEnvoi className="w-full" enCours="Ajout…">Ajouter l’occupant</BoutonEnvoi>
                      </form>
                    </details>
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
                        Modifier l’immeuble
                      </summary>
                      <form action={modifierImmeuble.bind(null, s.id)} className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input name="acces" defaultValue={s.acces ?? ''} className="champ" placeholder="Code, étage, badge" aria-label="Accès" />
                          <input name="gardien" defaultValue={s.gardien ?? ''} className="champ" placeholder="Gardien et téléphone" aria-label="Gardien" />
                          <input name="copropriete" defaultValue={s.copropriete ?? ''} className="champ col-span-2" placeholder="Syndicat des copropriétaires du…" aria-label="Copropriété" />
                          <input name="consignes" defaultValue={s.consignes ?? ''} className="champ col-span-2" placeholder="Consignes pour le technicien" aria-label="Consignes" />
                        </div>
                        <BoutonEnvoi className="w-full" enCours="Enregistrement…">Enregistrer</BoutonEnvoi>
                      </form>
                    </details>
                  </div>
                  <Equipements site={s} jour={ajd} />
                </li>
              ))}
            </ul>
            <details className="group mt-3 border-t border-trait pt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
                <Icone nom="plus" taille={16} /> Ajouter un immeuble
              </summary>
              <form action={ajouterImmeuble.bind(null, c.id)} className="mt-3 space-y-2">
                <input name="adresse" required className="champ" placeholder="12 rue de la Pompe" aria-label="Adresse de l’immeuble" />
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                  <input name="code_postal" className="champ" placeholder="75016" inputMode="numeric" aria-label="Code postal" />
                  <input name="ville" className="champ" placeholder="Paris" aria-label="Ville" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input name="acces" className="champ" placeholder="Code 4521B" aria-label="Accès" />
                  <input name="gardien" className="champ" placeholder="Gardien et téléphone" aria-label="Gardien" />
                </div>
                <input name="copropriete" className="champ" placeholder="Syndicat des copropriétaires du 12 rue de la Pompe" aria-label="Copropriété" />
                <BoutonEnvoi className="w-full" enCours="Ajout…">Ajouter l’immeuble</BoutonEnvoi>
              </form>
            </details>
          </Bloc>
        </div>
      ) : (
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
                  {(s.acces || s.consignes) && <p className="mt-1 pl-6 text-gris">{[s.acces, s.consignes].filter(Boolean).join(' · ')}</p>}
                  <Equipements site={s} jour={ajd} />
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      )}

      <Bloc titre="Historique">
        {historique.length === 0 ? (
          <p className="text-sm text-gris">Aucune intervention passée pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-trait text-sm">{historique.map(ligneIntervention)}</ul>
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

const jjmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Équipements suivis à une adresse, avec le prochain passage ; ajout et modification sur place. */
function Equipements({ site, jour }: { site: Immeuble; jour: string }) {
  const champs = (q?: EquipementSite) => (
    <div className="grid grid-cols-2 gap-2">
      <input name="categorie" required defaultValue={q?.categorie ?? ''} className="champ col-span-2" placeholder="Chaudière gaz à condensation 35 kW" aria-label="Équipement" />
      <input name="marque" defaultValue={q?.marque ?? ''} className="champ" placeholder="Marque" aria-label="Marque" />
      <input name="modele" defaultValue={q?.modele ?? ''} className="champ" placeholder="Modèle, année de pose" aria-label="Modèle" />
      <label className="block text-xs font-bold text-gris">
        Dernier passage
        <input name="dernier_passage" type="date" defaultValue={q?.dernier_passage ?? ''} className="champ mt-1" />
      </label>
      <label className="block text-xs font-bold text-gris">
        Prochain passage
        <input name="prochain_passage" type="date" defaultValue={q?.prochain_passage ?? ''} className="champ mt-1" />
      </label>
      <input name="obligation" defaultValue={q?.obligation ?? ''} className="champ col-span-2" placeholder="Obligation : entretien annuel obligatoire…" aria-label="Obligation réglementaire" />
    </div>
  );
  const equipements = [...(site.equipements ?? [])].sort((a, b) => (a.prochain_passage ?? '9999').localeCompare(b.prochain_passage ?? '9999'));
  return (
    <div className="mt-2 pl-6">
      {equipements.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {equipements.map((q) => {
            const proche = q.prochain_passage && q.prochain_passage <= ajouterJours(jour, 15);
            return (
              <li key={q.id} className="rounded-xl bg-fond px-3 py-2">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{q.categorie}</span>
                    {(q.marque || q.modele) && <span className="block text-xs text-gris">{[q.marque, q.modele].filter(Boolean).join(' · ')}</span>}
                    {q.obligation && <span className="mt-1 inline-block rounded-full bg-violet-doux px-2 text-[11px] font-bold text-violet">{q.obligation}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="block text-gris">Prochain passage</span>
                    <b className={`tabular-nums ${proche ? 'text-rouge' : ''}`}>{q.prochain_passage ? jjmmaaaa(q.prochain_passage) : '—'}</b>
                    {q.dernier_passage && <span className="block text-gris">Dernier {jjmmaaaa(q.dernier_passage)}</span>}
                  </span>
                </div>
                <details className="group mt-1">
                  <summary className="inline-flex cursor-pointer list-none text-xs font-bold text-cobalt">Modifier</summary>
                  <form action={modifierEquipement.bind(null, q.id)} className="mt-2 space-y-2">
                    {champs(q)}
                    <div className="flex gap-2">
                      <button formAction={supprimerEquipement.bind(null, q.id)} formNoValidate className={classeBouton('danger', '!px-3 !py-1.5 text-sm')}>
                        Retirer
                      </button>
                      <BoutonEnvoi className="flex-1 !py-1.5 text-sm" enCours="Enregistrement…">
                        Enregistrer
                      </BoutonEnvoi>
                    </div>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-cobalt">
          <Icone nom="plus" taille={14} /> Ajouter un équipement
        </summary>
        <form action={ajouterEquipement.bind(null, site.id)} className="mt-2 space-y-2">
          {champs()}
          <BoutonEnvoi className="w-full" enCours="Ajout…">Ajouter l’équipement</BoutonEnvoi>
        </form>
      </details>
    </div>
  );
}
