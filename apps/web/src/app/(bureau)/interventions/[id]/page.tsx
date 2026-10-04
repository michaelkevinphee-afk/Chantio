import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  LIBELLE_RESULTAT,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  MESURES,
  aDesImmeubles,
  dateCourte,
  adresseComplete,
  dateLongue,
  duree,
  etatMesure,
  heure,
  numeroIntervention,
  periode,
  peutValider,
  prevuRealise,
  pourcent,
  reglagesPrix,
  euro,
  type Fiche,
  type Fourniture,
  type Media,
  type Occupant,
  type TypeClient,
} from '@chantio/shared';
import { Puce, PuceStatut, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { lireDocument } from '@/lib/devis';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { Planning } from '@/components/planning';
import { BoutonEnvoi } from '@/components/retour';
import { annulerFacturation, facturer, modifierOccupant, renvoyer, supprimer, valider } from '../actions';

type FicheComplete = Fiche & { fournitures: Fourniture[]; medias: Media[] };

export default async function DetailIntervention({ params, searchParams }: PageProps<'/interventions/[id]'>) {
  const { id } = await params;
  const { erreur } = await searchParams;
  const { supabase, membre, entreprise } = await contexteBureau();

  const { data } = await supabase
    .from('interventions')
    .select(
      `${SELECT_LISTE}, site_complet:sites(acces, consignes, gardien, occupants(id, nom, lot)), client_complet:clients(email, contact, type), occupant:occupants(nom, lot, telephone), devis:documents(id, numero), contrat:contrats(id, reference, client_id)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const i = data as InterventionListe & {
    site_complet: { acces: string | null; consignes: string | null; gardien: string | null; occupants: Pick<Occupant, 'id' | 'nom' | 'lot'>[] } | null;
    client_complet: { email: string | null; contact: string | null; type: TypeClient } | null;
    occupant: Pick<Occupant, 'nom' | 'lot' | 'telephone'> | null;
    devis: { id: string; numero: string | null } | null;
    contrat: { id: string; reference: string | null; client_id: string } | null;
  };
  const immeuble = !!i.client_complet && aDesImmeubles(i.client_complet.type);

  const [{ data: fichesBrutes }, equipe] = await Promise.all([
    supabase.from('fiches').select('*, fournitures(*), medias(*)').eq('intervention_id', id).order('cree_le'),
    listerEquipe(supabase),
  ]);
  const fiches = (fichesBrutes ?? []) as FicheComplete[];

  // Prévu au devis contre réalisé : dès qu'une fiche est envoyée sur une intervention venue d'un devis.
  const envoyees = fiches.filter((f) => f.envoyee_le);
  const [devisPrevu, { data: catalogue }] =
    i.devis_id && envoyees.length
      ? await Promise.all([lireDocument(supabase, i.devis_id), supabase.from('articles').select('designation, reference, prix_achat')])
      : [null, { data: null }];
  const rp = reglagesPrix(entreprise.facturation);
  const pr = devisPrevu
    ? prevuRealise(
        { lignes: devisPrevu.lignes, remise: devisPrevu.document.remise },
        {
          minutes: envoyees.reduce((t, f) => t + (f.duree_minutes ?? 0), 0),
          pieces: envoyees.flatMap((f) => f.fournitures.map((p) => ({ designation: p.designation, reference: p.reference, quantite: Number(p.quantite) }))),
        },
        (catalogue ?? []) as { designation: string; reference: string | null; prix_achat: number }[],
        rp,
      )
    : null;

  // Liens temporaires (1 h) vers les photos, rangées dans un stockage privé.
  const chemins = fiches.flatMap((f) => f.medias.map((m) => m.chemin));
  const urls = new Map<string, string>();
  if (chemins.length) {
    const { data: signees } = await supabase.storage.from('medias').createSignedUrls(chemins, 3600);
    signees?.forEach((s) => s.signedUrl && s.path && urls.set(s.path, s.signedUrl));
  }

  const modifiable = ['a_planifier', 'planifiee', 'en_cours', 'a_reprendre'].includes(i.statut);
  const valideur = peutValider(membre.role);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/interventions" className="text-gris hover:underline">← Interventions</Link>
      </p>
      <Titre
        sous={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{numeroIntervention(i)}</span>
            <PuceStatut statut={i.statut} />
            <Puce>{LIBELLE_TYPE[i.type]}</Puce>
            {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
          </span>
        }
        actions={
          <>
            {valideur && ['terminee', 'a_reprendre'].includes(i.statut) && (
              <form action={valider.bind(null, i.id)}><BoutonEnvoi enCours="Validation…">Valider la fiche</BoutonEnvoi></form>
            )}
            {valideur && ['terminee', 'a_reprendre', 'validee'].includes(i.statut) && (
              <form action={renvoyer.bind(null, i.id)}><BoutonEnvoi variante="secondaire" enCours="Envoi…">Renvoyer au technicien</BoutonEnvoi></form>
            )}
            {i.statut === 'validee' && (
              <form action={facturer.bind(null, i.id)}><BoutonEnvoi variante="principal" enCours="Enregistrement…">Marquer facturée</BoutonEnvoi></form>
            )}
            {i.statut === 'facturee' && (
              <form action={annulerFacturation.bind(null, i.id)}><BoutonEnvoi variante="secondaire" enCours="Annulation…">Annuler la facturation</BoutonEnvoi></form>
            )}
          </>
        }
      >
        {i.client?.nom} · {i.motif}
      </Titre>

      {erreur && <p className="mb-6 rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {fiches.length === 0 ? (
            <div className="carte p-6">
              <h2 className="text-2xl font-extrabold">Fiche</h2>
              <p className="mt-2 text-gris">
                {i.statut === 'en_cours'
                  ? 'Le technicien est sur place : la fiche apparaîtra ici dès qu’il l’aura envoyée.'
                  : 'Pas encore de fiche : elle sera remplie par le technicien sur son téléphone.'}
              </p>
            </div>
          ) : (
            fiches.map((f, n) => <BlocFiche key={f.id} fiche={f} rang={fiches.length > 1 ? n + 1 : null} urls={urls} />)
          )}
          {pr && devisPrevu && (pr.heuresPrevues > 0 || pr.fournituresPrevues > 0) && (
            <PrevuContreRealise pr={pr} devis={devisPrevu.document.numero} fiches={envoyees.length} coutHoraire={rp.cout_horaire} frais={rp.frais_generaux} />
          )}
        </div>

        <aside className="space-y-6">
          <section className="carte space-y-3 p-5 text-sm">
            <h2 className="text-xl font-extrabold">Client et lieu</h2>
            <p className="font-semibold">{i.client?.nom}</p>
            {i.client?.telephone && <p><a className="underline" href={`tel:${i.client.telephone}`}>{i.client.telephone}</a></p>}
            {i.client_complet?.email && <p>{i.client_complet.email}</p>}
            <p>{adresseComplete(i.site)}</p>
            {i.site_complet?.acces && <p className="text-gris">Accès : {i.site_complet.acces}</p>}
            {i.site_complet?.gardien && <p className="text-gris">Gardien : {i.site_complet.gardien}</p>}
            {i.occupant && (
              <p>
                Occupant à appeler : <b>{i.occupant.nom}</b>
                {i.occupant.lot && ` · ${i.occupant.lot}`}
                {i.occupant.telephone && (
                  <>
                    {' · '}
                    <a className="underline" href={`tel:${i.occupant.telephone}`}>{i.occupant.telephone}</a>
                  </>
                )}
              </p>
            )}
            {i.ordre_service && <p>Ordre de service : <span className="font-mono">{i.ordre_service}</span></p>}
            {i.devis && (
              <p>
                Devis : <Link className="underline" href={`/devis/${i.devis.id}`}>{i.devis.numero ?? 'brouillon'}</Link>
              </p>
            )}
            {i.contrat && (
              <p>
                Contrat d’entretien :{' '}
                <Link className="underline" href={`/clients/contrats?client=${i.contrat.client_id}`}>
                  {i.contrat.reference}
                </Link>
                {!i.date_prevue && i.souhaitee_le && ` · visite souhaitée vers le ${dateCourte(i.souhaitee_le)}`}
              </p>
            )}
            {immeuble && (
              <details>
                <summary className="cursor-pointer font-bold text-cobalt">
                  {i.occupant || i.ordre_service ? 'Changer l’occupant ou l’ordre de service' : 'Indiquer l’occupant ou l’ordre de service'}
                </summary>
                <form action={modifierOccupant.bind(null, i.id)} className="mt-3 space-y-2">
                  <select name="occupant_id" defaultValue={i.occupant_id ?? ''} className="champ" aria-label="Occupant à appeler">
                    <option value="">Personne en particulier (parties communes)</option>
                    {[...(i.site_complet?.occupants ?? [])]
                      .sort((a, b) => a.nom.localeCompare(b.nom))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nom}
                          {o.lot ? ` · ${o.lot}` : ''}
                        </option>
                      ))}
                  </select>
                  <input name="ordre_service" defaultValue={i.ordre_service ?? ''} className="champ" placeholder="N° d’ordre de service" aria-label="N° d’ordre de service" />
                  <BoutonEnvoi className="w-full" enCours="Enregistrement…">Enregistrer</BoutonEnvoi>
                </form>
                <p className="mt-2 text-xs text-gris">
                  Un nouvel occupant s’ajoute depuis la fiche du client, rubrique Immeubles.
                </p>
              </details>
            )}
            {i.description && <p className="whitespace-pre-line rounded-xl bg-doux p-3">{i.description}</p>}
          </section>

          {modifiable ? (
            <Planning
              interventionId={i.id}
              equipe={equipe.filter((m) => m.role !== 'assistant')}
              initial={{
                date_prevue: i.date_prevue,
                heure_prevue: i.heure_prevue?.slice(0, 5) ?? null,
                date_fin: i.date_fin ?? null,
                fin_midi: !!i.fin_midi,
                duree_prevue: i.duree_prevue == null ? null : Number(i.duree_prevue),
                techniciens: i.affectations.flatMap((a) => (a.membre ? [a.membre.id] : [])),
              }}
            />
          ) : (
            <section className="carte p-5 text-sm">
              <h2 className="mb-3 text-xl font-extrabold">Planning</h2>
              <p>
                {periode(i) ? (
                  <span className="inline-block first-letter:uppercase">{periode(i)}</span>
                ) : (
                  <>
                    {i.date_prevue ? <span className="inline-block first-letter:uppercase">{dateLongue(i.date_prevue)}</span> : 'Sans date'}{' '}
                    {heure(i.heure_prevue)}
                  </>
                )}
                <br />
                {i.affectations.map((a) => a.membre?.prenom).join(', ') || 'Aucun technicien'}
              </p>
            </section>
          )}

          {membre.role === 'dirigeant' && !['validee', 'facturee'].includes(i.statut) && (
            <form action={supprimer.bind(null, i.id)}>
              <BoutonEnvoi variante="danger" className="w-full" enCours="Suppression…">Supprimer l’intervention</BoutonEnvoi>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}

function BlocFiche({ fiche: f, rang, urls }: { fiche: FicheComplete; rang: number | null; urls: Map<string, string> }) {
  const v = f.valeurs ?? {};
  const mesures = MESURES.filter((m) => v.mesures?.[m.code] != null);
  return (
    <article className="carte divide-y divide-trait">
      <header className="flex flex-wrap items-center gap-3 p-5">
        <h2 className="text-2xl font-extrabold">Fiche{rang ? ` · passage ${rang}` : ''}</h2>
        {f.resultat && <Puce ton={f.resultat === 'termine' ? 'vert' : 'rouge'}>{LIBELLE_RESULTAT[f.resultat]}</Puce>}
        <span className="ml-auto text-sm text-gris">
          {f.envoyee_le && `Envoyée le ${new Date(f.envoyee_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`}
          {f.duree_minutes != null && ` · ${duree(f.duree_minutes)} sur place`}
        </span>
      </header>

      <Section titre="Constat">
        {v.constat?.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">{v.constat.map((c) => <Puce key={c}>{c}</Puce>)}</div>
        ) : null}
        {v.constat_detail && <p>{v.constat_detail}</p>}
      </Section>

      <Section titre="Travaux réalisés">
        <p className="whitespace-pre-line">{v.travaux || '—'}</p>
      </Section>

      {mesures.length > 0 && (
        <Section titre="Mesures">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {mesures.map((m) => {
              const val = v.mesures?.[m.code] ?? null;
              const alerte = etatMesure(m.code, val) === 'alerte';
              return (
                <div key={m.code} className={`rounded-xl p-3 ${alerte ? 'bg-rouge-doux text-rouge' : 'bg-doux'}`}>
                  <p className="text-xs font-semibold">{m.libelle}</p>
                  <p className="text-2xl font-extrabold tracking-[-0.02em]">{String(val).replace('.', ',')} {m.unite}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {f.fournitures.length > 0 && (
        <Section titre="Fournitures">
          <ul className="space-y-1">
            {f.fournitures.map((p, n) => (
              <li key={p.id ?? n} className="flex justify-between">
                <span>{p.designation}{p.reference && <span className="text-gris"> · {p.reference}</span>}</span>
                <span className="font-semibold">{String(p.quantite).replace('.', ',')} {p.unite}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {f.medias.length > 0 && (
        <Section titre="Photos">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {f.medias.map((m) => {
              const url = urls.get(m.chemin);
              return url ? (
                <a key={m.chemin} href={url} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={m.legende ?? 'Photo'} className="aspect-square w-full object-cover" />
                  {m.categorie && <span className="absolute left-1.5 top-1.5 rounded-md bg-white/90 px-1.5 text-xs font-bold text-encre">{m.categorie === 'avant' ? 'Avant' : 'Après'}</span>}
                </a>
              ) : null;
            })}
          </div>
        </Section>
      )}

      {(f.reserves || f.recommandations || v.a_prevoir) && (
        <Section titre="À retenir">
          {v.a_prevoir && <p><b>À prévoir :</b> {v.a_prevoir}</p>}
          {f.reserves && <p><b>Réserves :</b> {f.reserves}</p>}
          {f.recommandations && <p><b>Recommandations :</b> {f.recommandations}</p>}
        </Section>
      )}

      <Section titre="Signature du client">
        {f.signature_client ? (
          <div className="flex items-end gap-4">
            <svg viewBox="0 0 300 150" className="h-24 w-48 rounded-xl border border-trait bg-white">
              <path d={f.signature_client} fill="none" stroke="#101A3D" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm">
              {f.signataire_nom}
              {f.signee_le && <span className="block text-gris">{new Date(f.signee_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
            </p>
          </div>
        ) : (
          <p className="text-gris">{f.refus_signature ? `Non signée : ${f.refus_signature}` : 'Non signée (optionnelle).'}</p>
        )}
      </Section>
    </article>
  );
}

const heures = (h: number) => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;

/** Heures et fournitures prévues au devis, comparées aux fiches ; marge nette prévue et réelle. Jamais montré au client. */
function PrevuContreRealise({
  pr,
  devis,
  fiches,
  coutHoraire,
  frais,
}: {
  pr: ReturnType<typeof prevuRealise>;
  devis: string | null;
  fiches: number;
  coutHoraire: number;
  frais: number;
}) {
  const tuiles = [
    { titre: 'Heures', prevu: `${heures(pr.heuresPrevues)} prévues`, reel: `${heures(pr.heuresPassees)} passées`, depasse: pr.heuresPassees > pr.heuresPrevues },
    {
      titre: 'Fournitures',
      prevu: `${euro(pr.fournituresPrevues)} prévues`,
      reel: `${euro(pr.fournituresUtilisees)} utilisées`,
      depasse: pr.fournituresUtilisees > pr.fournituresPrevues,
    },
    {
      titre: 'Marge nette',
      prevu: `${euro(pr.margeNettePrevue)} · ${pourcent(pr.tauxPrevu)} prévue`,
      reel: `${euro(pr.margeNetteReelle)} · ${pourcent(pr.tauxReel)} réelle`,
      depasse: pr.margeNetteReelle < pr.margeNettePrevue,
    },
  ];
  return (
    <section className="carte p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold">Prévu au devis contre réalisé</h2>
        <Puce>Jamais montré au client</Puce>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tuiles.map((t) => (
          <div key={t.titre} className="rounded-xl bg-doux p-3">
            <p className="text-xs font-bold tracking-wide text-gris uppercase">{t.titre}</p>
            <p className="mt-1 text-sm font-semibold">{t.prevu}</p>
            <p className={`text-[15px] font-extrabold ${t.depasse ? 'text-rouge' : 'text-vert'}`}>{t.reel}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gris">
        D’après le devis {devis ?? '(brouillon)'} et {fiches > 1 ? `les ${fiches} fiches` : 'la fiche'} du technicien : temps sur place et pièces notées, au coût
        horaire de {euro(coutHoraire)} et {pourcent(frais)} de frais généraux.
        {pr.piecesSansPrix > 0 &&
          ` ${pr.piecesSansPrix} pièce${pr.piecesSansPrix > 1 ? 's n’ont' : ' n’a'} pas de prix d’achat connu : ajoutez-${pr.piecesSansPrix > 1 ? 'les' : 'la'} au catalogue pour une marge réelle exacte.`}
      </p>
    </section>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="p-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gris">{titre}</h3>
      {children}
    </section>
  );
}
