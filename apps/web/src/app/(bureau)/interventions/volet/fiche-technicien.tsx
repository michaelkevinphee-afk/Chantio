import { LIBELLE_RESULTAT, MESURES, etatMesure, euro, type Fiche, type Fourniture, type Media } from '@chantio/shared';
import { heureParis } from '../filtres';
import { SECTION, TITRE_SECTION } from './styles';

export type FicheComplete = Fiche & { cree_le: string; fournitures: Fourniture[]; medias: Media[] };

const ETIQ = 'text-[11px] font-bold tracking-[0.07em] text-gris uppercase';
const nb = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * « Fiche du technicien », dans l'ordre du bac : Constat, Mesures, Pièces et fournitures (prix d'achat réservé
 * au bureau), Travaux réalisés, Résultat, Durée, Photos, Signature du client.
 */
export function FicheTechnicien({
  fiches,
  urls,
  prixAchat,
}: {
  fiches: FicheComplete[];
  /** Liens temporaires vers les photos. */
  urls: Map<string, string>;
  /** Prix d'achat d'une pièce (catalogue), ou null s'il est inconnu. */
  prixAchat: (p: Fourniture) => number | null;
}) {
  if (!fiches.length) return null;
  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>Fiche du technicien</h3>
      {fiches.map((f, n) => (
        <Rapport key={f.id} fiche={f} passage={fiches.length > 1 ? n + 1 : null} urls={urls} prixAchat={prixAchat} />
      ))}
    </section>
  );
}

function Rapport({
  fiche: f,
  passage,
  urls,
  prixAchat,
}: {
  fiche: FicheComplete;
  passage: number | null;
  urls: Map<string, string>;
  prixAchat: (p: Fourniture) => number | null;
}) {
  const v = f.valeurs ?? {};
  const mesures = MESURES.filter((m) => v.mesures?.[m.code] != null);
  const reste = v.a_prevoir?.trim();
  const heures = f.duree_minutes != null ? f.duree_minutes / 60 : null;
  const photos = [...f.medias].sort((a, b) => Number(a.categorie === 'apres') - Number(b.categorie === 'apres'));
  return (
    <div className={`flex flex-col gap-3 ${passage && passage > 1 ? 'border-t border-dashed border-trait pt-3' : ''}`}>
      {passage && <p className="text-[13px] font-bold text-gris">Passage {passage}</p>}
      {!f.envoyee_le && (
        <p className="text-[12.5px] text-gris">Fiche commencée{f.debut ? ` à ${heureParis(f.debut)}` : ''}, pas encore envoyée.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={ETIQ}>Constat</span>
        <div className="flex flex-wrap gap-1.5">
          {v.constat?.length ? (
            v.constat.map((c) => (
              <span key={c} className="rounded-full bg-doux px-2.5 py-0.5 text-[12.5px] font-bold text-cobalt">
                {c}
              </span>
            ))
          ) : (
            <span className="text-gris">—</span>
          )}
        </div>
        {v.constat_detail && <p className="text-[14px]">{v.constat_detail}</p>}
      </div>
      {mesures.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Mesures</span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
            {mesures.map((m) => {
              const val = v.mesures?.[m.code] ?? null;
              const e = etatMesure(m.code, val);
              return (
                <div key={m.code} className="flex flex-col rounded-lg bg-fond px-2.5 py-2">
                  <small className="text-xs text-gris">{m.libelle}</small>
                  <b className={e === 'alerte' ? 'text-rouge' : ''}>
                    {nb(Number(val))} {m.unite}
                    {e === 'alerte' ? ' · hors norme' : e === 'ok' && (m.min != null || m.max != null) ? ' ✓' : ''}
                  </b>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {f.fournitures.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Pièces et fournitures</span>
          <div className="flex flex-col">
            {f.fournitures.map((p, k) => {
              const prix = prixAchat(p);
              return (
                <div key={p.id ?? k} className="flex items-center gap-2.5 border-b border-dashed border-trait py-1.5 text-[14px]">
                  <span className="min-w-0 flex-1">{p.designation}</span>
                  <b>× {nb(Number(p.quantite))}</b>
                  <small className="text-[11px] font-bold text-violet">{prix != null ? euro(prix * Number(p.quantite)) : 'prix à compléter'}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {v.travaux && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Travaux réalisés</span>
          <p className="text-[14px] whitespace-pre-line">{v.travaux}</p>
        </div>
      )}
      {f.resultat && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Résultat</span>
          <p className="text-[14px]">
            <b className="font-extrabold">{LIBELLE_RESULTAT[f.resultat]}</b>
            {reste && ` · ${reste}`}
          </p>
          {f.reserves && <p className="text-[13px] text-gris">Réserves : {f.reserves}</p>}
          {f.recommandations && <p className="text-[13px] text-gris">Recommandations : {f.recommandations}</p>}
        </div>
      )}
      {heures != null && heures > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Durée</span>
          <p className="text-[14px]">
            <b className="font-extrabold">{nb(heures)} h</b>
            {f.debut && ` · arrivée ${heureParis(f.debut)}`}
          </p>
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Photos</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((m) => {
              const url = urls.get(m.chemin);
              return url ? (
                <figure key={m.chemin} className="m-0 flex flex-col gap-0.5">
                  <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-trait">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${m.categorie === 'apres' ? 'après' : 'avant'}`} className="h-24 w-24 object-cover" />
                  </a>
                  <figcaption className="text-xs text-gris">{m.categorie === 'apres' ? 'Après' : m.categorie === 'avant' ? 'Avant' : (m.legende ?? 'Photo')}</figcaption>
                </figure>
              ) : null;
            })}
          </div>
        </div>
      )}
      {(f.signature_client || f.refus_signature) && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQ}>Signature du client</span>
          {f.signature_client ? (
            <div className="flex flex-col gap-0.5">
              <svg viewBox="0 0 300 150" aria-label="Signature" className="h-auto w-[220px] max-w-full rounded-lg border border-trait bg-white">
                <path d={f.signature_client} fill="none" stroke="#101A3D" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {f.signataire_nom && <small className="text-gris">{f.signataire_nom}</small>}
            </div>
          ) : (
            <p className="text-[13px] text-gris">Non signée : {f.refus_signature}</p>
          )}
        </div>
      )}
    </div>
  );
}
