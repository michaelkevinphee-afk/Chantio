import {
  LIBELLE_RESULTAT,
  LIBELLE_TYPE,
  LIBELLE_URGENCE,
  adresseComplete,
  dateLongue,
  duree,
  heure,
  initiales,
  numeroIntervention,
  type Fiche,
  type Occupant,
} from '@chantio/shared';
import { Icone } from '@/components/icones';
import { Avatar, LienBouton, Puce, PuceStatut } from '@/components/ui';
import { Bloc, Ligne, Volet } from '@/components/volet';
import { liensProfils } from '@/lib/profils';
import { SELECT_LISTE, type InterventionListe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';

type Detail = InterventionListe & {
  site_complet: { acces: string | null; consignes: string | null; gardien: string | null } | null;
  client_complet: { email: string | null; contact: string | null; type: string } | null;
  occupant: Pick<Occupant, 'nom' | 'lot' | 'telephone'> | null;
};

/** Fiche résumée d'une intervention, ouverte au clic dans la liste. */
export async function VoletIntervention({ id, fermer }: { id: string; fermer: string }) {
  const { supabase } = await contexteBureau();
  const [{ data }, { data: fiches }] = await Promise.all([
    supabase
      .from('interventions')
      .select(
        `${SELECT_LISTE}, site_complet:sites(acces, consignes, gardien), client_complet:clients(email, contact, type), occupant:occupants(nom, lot, telephone)`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('fiches')
      .select('*, medias(count)')
      .eq('intervention_id', id)
      .order('cree_le', { ascending: false })
      .limit(1),
  ]);

  if (!data) {
    return (
      <Volet fermer={fermer} titre="Intervention introuvable">
        <p className="text-gris">Elle a peut-être été supprimée.</p>
      </Volet>
    );
  }
  const i = data as Detail;
  const fiche = (fiches?.[0] ?? null) as (Fiche & { medias: { count: number }[] }) | null;
  const v = fiche?.valeurs ?? {};
  const liens = await liensProfils(supabase, i.affectations.map((a) => a.membre?.photo_chemin));
  const adresse = adresseComplete(i.site);

  return (
    <Volet
      fermer={fermer}
      sous={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{numeroIntervention(i)}</span>
          <PuceStatut statut={i.statut} />
          <Puce>{LIBELLE_TYPE[i.type]}</Puce>
          {i.urgence !== 'normale' && <Puce ton="rouge">{LIBELLE_URGENCE[i.urgence]}</Puce>}
        </span>
      }
      titre={i.motif}
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <LienBouton href={`/interventions/${i.id}`}>Ouvrir la fiche complète</LienBouton>
        {i.client?.telephone && (
          <a
            href={`tel:${i.client.telephone}`}
            className="inline-flex items-center gap-2 rounded-[14px] bg-white px-5 py-3 text-[15px] font-extrabold shadow-[inset_0_0_0_2px_var(--color-trait)] transition hover:shadow-[inset_0_0_0_2px_var(--color-cobalt)]"
          >
            <Icone nom="telephone" taille={18} /> Appeler
          </a>
        )}
      </div>

      <Bloc titre="Client et lieu">
        <p className="text-lg font-extrabold">{i.client?.nom}</p>
        {i.client_complet?.contact && <p className="text-sm text-gris">Contact : {i.client_complet.contact}</p>}
        <div className="mt-3 space-y-2 text-sm">
          {i.client?.telephone && (
            <p className="flex items-center gap-2">
              <Icone nom="telephone" taille={16} className="text-cobalt" />
              <a href={`tel:${i.client.telephone}`} className="font-semibold hover:underline">{i.client.telephone}</a>
            </p>
          )}
          {i.client_complet?.email && (
            <p className="flex items-center gap-2">
              <Icone nom="email" taille={16} className="text-cobalt" />
              <a href={`mailto:${i.client_complet.email}`} className="font-semibold hover:underline">{i.client_complet.email}</a>
            </p>
          )}
          {adresse && (
            <p className="flex items-center gap-2">
              <Icone nom="lieu" taille={16} className="text-cobalt" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold hover:underline"
              >
                {adresse}
              </a>
            </p>
          )}
        </div>
        {i.occupant && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
            <Icone nom="clients" taille={16} className="text-cobalt" />
            <span>
              Occupant à appeler : <b>{i.occupant.nom}</b>
              {i.occupant.lot && ` · ${i.occupant.lot}`}
            </span>
            {i.occupant.telephone && (
              <a href={`tel:${i.occupant.telephone}`} className="font-semibold hover:underline">{i.occupant.telephone}</a>
            )}
          </p>
        )}
        {(i.site_complet?.acces || i.site_complet?.consignes || i.site_complet?.gardien) && (
          <div className="mt-3 rounded-xl bg-doux p-3 text-sm">
            {i.site_complet?.acces && <p><b>Accès :</b> {i.site_complet.acces}</p>}
            {i.site_complet?.gardien && <p><b>Gardien :</b> {i.site_complet.gardien}</p>}
            {i.site_complet?.consignes && <p><b>Consignes :</b> {i.site_complet.consignes}</p>}
          </div>
        )}
      </Bloc>

      <Bloc titre="Demande">
        <Ligne libelle="Motif">{i.motif}</Ligne>
        <Ligne libelle="Type">{LIBELLE_TYPE[i.type]}</Ligne>
        <Ligne libelle="Urgence">{LIBELLE_URGENCE[i.urgence]}</Ligne>
        <Ligne libelle="Description">{i.description && <span className="whitespace-pre-line font-medium">{i.description}</span>}</Ligne>
      </Bloc>

      <Bloc titre="Planning">
        <p className="flex items-center gap-2 font-semibold">
          <Icone nom="calendrier" taille={18} className="text-cobalt" />
          {i.date_prevue ? (
            <span className="first-letter:uppercase">
              {dateLongue(i.date_prevue)} {heure(i.heure_prevue) && `à ${heure(i.heure_prevue)}`}
            </span>
          ) : (
            <span className="text-gris">Pas encore de date</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {i.affectations.length === 0 && <span className="text-sm text-gris">Aucun technicien affecté</span>}
          {i.affectations.map(({ membre: m }) =>
            m ? (
              <span key={m.id} className="inline-flex items-center gap-2 rounded-full border border-trait bg-white py-1 pl-1 pr-3 text-sm font-semibold">
                <Avatar url={m.photo_chemin ? liens.get(m.photo_chemin) : null} initiales={initiales(m.prenom, m.nom)} taille={28} />
                {m.prenom} {m.nom}
              </span>
            ) : null,
          )}
        </div>
      </Bloc>

      <Bloc titre="Compte rendu du technicien">
        {!fiche ? (
          <p className="text-sm text-gris">
            {i.statut === 'en_cours'
              ? 'Le technicien est sur place : son compte rendu arrivera ici.'
              : 'Pas encore de compte rendu : il sera rempli sur le téléphone du technicien.'}
          </p>
        ) : (
          <>
            {fiche.resultat && (
              <p className="mb-3">
                <Puce ton={fiche.resultat === 'termine' ? 'vert' : 'rouge'}>{LIBELLE_RESULTAT[fiche.resultat]}</Puce>
              </p>
            )}
            {v.constat?.length ? (
              <div className="mb-3 flex flex-wrap gap-1.5">{v.constat.map((c) => <Puce key={c}>{c}</Puce>)}</div>
            ) : null}
            <Ligne libelle="Constat">{v.constat_detail}</Ligne>
            <Ligne libelle="Travaux">{v.travaux && <span className="whitespace-pre-line font-medium">{v.travaux}</span>}</Ligne>
            <Ligne libelle="À prévoir">{v.a_prevoir}</Ligne>
            <Ligne libelle="Temps sur place">{fiche.duree_minutes != null && duree(fiche.duree_minutes)}</Ligne>
            <Ligne libelle="Photos">{(fiche.medias[0]?.count ?? 0) > 0 && `${fiche.medias[0].count} photo${fiche.medias[0].count > 1 ? 's' : ''}`}</Ligne>
            <Ligne libelle="Signature">{fiche.signature_client ? `Signée${fiche.signataire_nom ? ` par ${fiche.signataire_nom}` : ''}` : 'Non signée'}</Ligne>
          </>
        )}
      </Bloc>
    </Volet>
  );
}
