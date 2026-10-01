import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  LIBELLE_RESULTAT,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  MESURES,
  adresseComplete,
  dateLongue,
  duree,
  etatMesure,
  heure,
  numero,
  peutValider,
  type Fiche,
  type Fourniture,
  type Media,
} from '@chantio/shared';
import { Bouton, Puce, PuceStatut, Titre } from '@/components/ui';
import { contexteBureau } from '@/lib/session';
import { listerEquipe, SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { annulerFacturation, facturer, planifier, renvoyer, supprimer, valider } from '../actions';

type FicheComplete = Fiche & { fournitures: Fourniture[]; medias: Media[] };

export default async function DetailIntervention({ params, searchParams }: PageProps<'/interventions/[id]'>) {
  const { id } = await params;
  const { erreur } = await searchParams;
  const { supabase, membre } = await contexteBureau();

  const { data } = await supabase
    .from('interventions')
    .select(`${SELECT_LISTE}, site_complet:sites(acces, consignes), client_complet:clients(email, contact)`)
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const i = data as InterventionListe & {
    site_complet: { acces: string | null; consignes: string | null } | null;
    client_complet: { email: string | null; contact: string | null } | null;
  };

  const [{ data: fichesBrutes }, equipe] = await Promise.all([
    supabase.from('fiches').select('*, fournitures(*), medias(*)').eq('intervention_id', id).order('cree_le'),
    listerEquipe(supabase),
  ]);
  const fiches = (fichesBrutes ?? []) as FicheComplete[];

  // Liens temporaires (1 h) vers les photos, rangées dans un stockage privé.
  const chemins = fiches.flatMap((f) => f.medias.map((m) => m.chemin));
  const urls = new Map<string, string>();
  if (chemins.length) {
    const { data: signees } = await supabase.storage.from('medias').createSignedUrls(chemins, 3600);
    signees?.forEach((s) => s.signedUrl && s.path && urls.set(s.path, s.signedUrl));
  }

  const affectes = new Set(i.affectations.map((a) => a.membre?.id));
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
            <span className="font-mono text-xs">{numero(i.numero)}</span>
            <PuceStatut statut={i.statut} />
            <Puce>{LIBELLE_TYPE[i.type]}</Puce>
            {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
          </span>
        }
        actions={
          <>
            {valideur && ['terminee', 'a_reprendre'].includes(i.statut) && (
              <form action={valider.bind(null, i.id)}><Bouton>Valider la fiche</Bouton></form>
            )}
            {valideur && ['terminee', 'a_reprendre', 'validee'].includes(i.statut) && (
              <form action={renvoyer.bind(null, i.id)}><Bouton variante="secondaire">Renvoyer au technicien</Bouton></form>
            )}
            {i.statut === 'validee' && (
              <form action={facturer.bind(null, i.id)}><Bouton variante="principal">Marquer facturée</Bouton></form>
            )}
            {i.statut === 'facturee' && (
              <form action={annulerFacturation.bind(null, i.id)}><Bouton variante="secondaire">Annuler la facturation</Bouton></form>
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
        </div>

        <aside className="space-y-6">
          <section className="carte space-y-3 p-5 text-sm">
            <h2 className="text-xl font-extrabold">Client et lieu</h2>
            <p className="font-semibold">{i.client?.nom}</p>
            {i.client?.telephone && <p><a className="underline" href={`tel:${i.client.telephone}`}>{i.client.telephone}</a></p>}
            {i.client_complet?.email && <p>{i.client_complet.email}</p>}
            <p>{adresseComplete(i.site)}</p>
            {i.site_complet?.acces && <p className="text-gris">Accès : {i.site_complet.acces}</p>}
            {i.description && <p className="rounded-xl bg-doux p-3">{i.description}</p>}
          </section>

          <section className="carte p-5 text-sm">
            <h2 className="mb-3 text-xl font-extrabold">Planning</h2>
            {modifiable ? (
              <form action={planifier.bind(null, i.id)} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input name="date_prevue" type="date" className="champ" defaultValue={i.date_prevue ?? ''} aria-label="Date" />
                  <input name="heure_prevue" type="time" className="champ" defaultValue={i.heure_prevue?.slice(0, 5) ?? ''} aria-label="Heure" />
                </div>
                <div className="space-y-1.5">
                  {equipe.filter((m) => m.role !== 'assistant').map((m) => (
                    <label key={m.id} className="flex items-center gap-2">
                      <input type="checkbox" name="techniciens" value={m.id} defaultChecked={affectes.has(m.id)} className="h-4 w-4 accent-cobalt" />
                      {m.prenom} {m.nom}
                    </label>
                  ))}
                </div>
                <Bouton variante="principal" className="w-full">Enregistrer</Bouton>
              </form>
            ) : (
              <p>
                {i.date_prevue ? <span className="inline-block first-letter:uppercase">{dateLongue(i.date_prevue)}</span> : 'Sans date'}{' '}
                {heure(i.heure_prevue)}
                <br />
                {i.affectations.map((a) => a.membre?.prenom).join(', ') || 'Aucun technicien'}
              </p>
            )}
          </section>

          {membre.role === 'dirigeant' && !['validee', 'facturee'].includes(i.statut) && (
            <form action={supprimer.bind(null, i.id)}>
              <Bouton variante="danger" className="w-full">Supprimer l’intervention</Bouton>
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

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="p-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gris">{titre}</h3>
      {children}
    </section>
  );
}
