import { notFound } from 'next/navigation';
import { LIBELLE_IDENTITE, peutConsole, TON_IDENTITE, type StatutIdentite } from '@chantio/shared';
import { EnClair, Ligne, Message } from '@/components/console/elements';
import { BoutonEnvoi } from '@/components/retour';
import { Puce, Titre, Vide } from '@/components/ui';
import { contexteConsole, jour, quand } from '@/lib/console';
import { ficheSiren, figureParmiDirigeants } from '@/lib/registre';
import { deciderIdentite } from '../../actions';

export const metadata = { title: 'Identités à vérifier · Console Chantio' };

// Identités à vérifier : le dirigeant a déposé une pièce d'identité et un Kbis parce que son nom
// n'a pas été trouvé au registre. L'équipe compare et valide (facturation électronique ensuite).

type Demande = {
  id: string;
  nom: string;
  siren: string | null;
  forme_juridique: string | null;
  ville: string | null;
  identite_statut: StatutIdentite;
  identite_mode: 'registre' | 'documents' | null;
  identite_documents: string[] | null;
  identite_le: string | null;
  identite_motif: string | null;
  representant: string | null;
  atteste_le: string | null;
  dirigeant: string | null;
  dirigeant_email: string | null;
};

export default async function Identites({ searchParams }: PageProps<'/console/identites'>) {
  const [sp, { supabase, moi }] = await Promise.all([searchParams, contexteConsole()]);
  if (!peutConsole(moi.role, 'identite')) notFound();
  const { data, error } = await supabase.rpc('console_identites');
  if (error) console.error('console_identites', error);
  const demandes = (data ?? []) as Demande[];
  const enAttente = demandes.filter((d) => d.identite_statut === 'en_attente');
  const decidees = demandes.filter((d) => d.identite_statut !== 'en_attente');

  // Liens de lecture des pièces (10 minutes) et dirigeants déclarés au registre, en parallèle.
  const details = await Promise.all(
    enAttente.map(async (d) => {
      const chemins = d.identite_documents ?? [];
      const [liens, registre] = await Promise.all([
        chemins.length ? supabase.storage.from('justificatifs').createSignedUrls(chemins, 600) : Promise.resolve({ data: [] }),
        d.siren ? ficheSiren(d.siren).catch(() => null) : Promise.resolve(null),
      ]);
      const [prenom, ...reste] = (d.dirigeant ?? '').split(' ');
      return {
        d,
        pieces: (liens.data ?? []).flatMap((l, i) => (l.signedUrl ? [{ nom: chemins[i]?.split('/').pop() ?? `pièce ${i + 1}`, url: l.signedUrl }] : [])),
        registre,
        trouve: registre ? figureParmiDirigeants(registre, prenom ?? '', reste.join(' ') || null) : null,
      };
    }),
  );

  return (
    <>
      <Titre texte="Les dirigeants qui n’ont pas été reconnus au registre et ont déposé leurs justificatifs.">Identités à vérifier</Titre>
      <Message sp={sp} />
      <EnClair>
        Comparez la pièce d’identité et le Kbis avec le nom du dirigeant et le SIREN. Validez si tout concorde : le client peut alors activer la facturation
        électronique. Si vous refusez, écrivez pourquoi : il le lira dans son bureau et pourra redéposer.
      </EnClair>

      {details.length ? (
        <div className="grid gap-5">
          {details.map(({ d, pieces, registre, trouve }) => (
            <section key={d.id} className="carte p-5 sm:p-6">
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-extrabold">{d.nom}</h2>
                <Puce ton={TON_IDENTITE[d.identite_statut]}>{LIBELLE_IDENTITE[d.identite_statut]}</Puce>
                <span className="ml-auto text-[13px] text-gris">Déposé {quand(d.identite_le)}</span>
              </header>
              <div className="grid gap-5 lg:grid-cols-2">
                <dl className="divide-y divide-trait">
                  <Ligne libelle="Dirigeant">
                    {d.dirigeant}
                    {d.dirigeant_email && <small className="block text-gris">{d.dirigeant_email}</small>}
                  </Ligne>
                  <Ligne libelle="SIREN">{d.siren}</Ligne>
                  <Ligne libelle="Forme juridique">{d.forme_juridique}</Ligne>
                  <Ligne libelle="Ville">{d.ville}</Ligne>
                  <Ligne libelle="Attestation">{d.atteste_le ? `Le dirigeant atteste être habilité (${jour(d.atteste_le)})` : null}</Ligne>
                  <Ligne libelle="Registre">
                    {registre ? (
                      <>
                        {registre.dirigeants.length ? registre.dirigeants.map((x) => x.nom).join(', ') : 'Aucun dirigeant publié'}
                        <small className={`block font-semibold ${trouve ? 'text-vert' : 'text-gris'}`}>
                          {trouve ? 'Le nom figure au registre.' : 'Le nom ne figure pas tel quel au registre : comparez avec le Kbis.'}
                        </small>
                      </>
                    ) : d.siren ? (
                      'Le registre ne répond pas.'
                    ) : null}
                  </Ligne>
                </dl>
                <div>
                  <p className="etiquette">Justificatifs</p>
                  {pieces.length ? (
                    <ul className="grid gap-2">
                      {pieces.map((p) => (
                        <li key={p.nom}>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-[14px] border border-trait bg-white px-3.5 py-2.5 font-bold text-cobalt hover:border-cobalt"
                          >
                            {p.nom} <span className="ml-auto text-[13px] font-semibold text-gris">Ouvrir ↗</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gris">Aucune pièce lisible.</p>
                  )}
                  <p className="mt-2 text-[13px] text-gris">Les liens marchent 10 minutes : rechargez la page au besoin.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 border-t border-trait pt-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
                <form action={deciderIdentite}>
                  <input type="hidden" name="entreprise" value={d.id} />
                  <input type="hidden" name="decision" value="valider" />
                  <BoutonEnvoi enCours="Validation…">Valider l’identité</BoutonEnvoi>
                </form>
                <form action={deciderIdentite} className="flex flex-wrap items-end gap-2.5">
                  <input type="hidden" name="entreprise" value={d.id} />
                  <input type="hidden" name="decision" value="refuser" />
                  <label className="block min-w-[220px] flex-1">
                    <span className="etiquette">Ou refuser, parce que…</span>
                    <input name="motif" required maxLength={300} className="champ" placeholder="Le Kbis a plus de 3 mois" />
                  </label>
                  <BoutonEnvoi variante="danger" enCours="Envoi…">
                    Refuser
                  </BoutonEnvoi>
                </form>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Vide titre="Aucune identité à vérifier">Les dirigeants reconnus au registre sont validés tout seuls.</Vide>
      )}

      {decidees.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[17px] font-extrabold">Décidées ces 60 derniers jours</h2>
          <ul className="carte divide-y divide-trait">
            {decidees.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[14.5px]">
                <b>{d.nom}</b>
                <span className="text-gris">{d.dirigeant}</span>
                {d.identite_motif && <span className="text-gris">· « {d.identite_motif} »</span>}
                <span className="ml-auto flex items-center gap-2 text-[13px] text-gris">
                  {jour(d.identite_le)}
                  <Puce ton={TON_IDENTITE[d.identite_statut]}>
                    {d.identite_mode === 'registre' && d.identite_statut === 'verifiee' ? 'Vérifiée au registre' : LIBELLE_IDENTITE[d.identite_statut]}
                  </Puce>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
