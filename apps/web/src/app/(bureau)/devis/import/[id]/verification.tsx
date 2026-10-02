'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { euro, nombre } from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import type { ChampsLus, ImportLu } from '@/lib/devis';
import { enregistrerChampsImport, lireImport } from '../../actions';
import { Ecran } from '../../composants';

type Ligne = NonNullable<ChampsLus['lignes']>[number];

const CHAMPS_CLIENT: [keyof ChampsLus, string][] = [
  ['client', 'Client'],
  ['adresse', 'Adresse'],
  ['ville', 'Code postal, ville'],
  ['telephone', 'Téléphone'],
  ['email', 'E-mail'],
  ['siret', 'SIRET'],
  ['objet', 'Objet'],
  ['date', 'Date du document'],
  ['numero', 'N° d’origine'],
];
const CHAMPS_CONDITIONS: [keyof ChampsLus, string][] = [
  ['validite', 'Validité'],
  ['acompte', 'Acompte'],
];

function Fiabilite({ v }: { v?: number }) {
  if (v === undefined) return <span className="fiab ok">À saisir</span>;
  return <span className={`fiab ${v < 80 ? 'doute' : 'sur'}`}>{Math.round(v)} %</span>;
}

export function Verification({ imp, lien, suivant, lecture }: { imp: ImportLu; lien: string | null; suivant: string | null; lecture: boolean }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [c, setC] = useState<ChampsLus>(imp.champs ?? {});
  const [balayage, setBalayage] = useState(1);
  const zoneChamps = useRef<HTMLDivElement>(null);
  const pdf = /pdf/i.test(imp.type_mime ?? '') || /\.pdf$/i.test(imp.nom_fichier);

  const confiance = c.confiance ?? {};
  const valeurs = Object.values(confiance);
  const moyenne = valeurs.length ? Math.round(valeurs.reduce((s, v) => s + v, 0) / valeurs.length) : 0;
  const doutes = Object.entries(confiance).filter(([, v]) => v < 80);
  const lignes = c.lignes ?? [];
  const totalHT = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const totalTTC = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire * (1 + l.tva / 100), 0);
  const ecart = c.total_ttc ? Math.abs(totalTTC - c.total_ttc) : 0;
  const nbChamps = CHAMPS_CLIENT.filter(([k]) => c[k]).length + lignes.length;

  const majChamp = (k: keyof ChampsLus, v: string) => setC((x) => ({ ...x, [k]: v, confiance: { ...(x.confiance ?? {}), ...(k in (x.confiance ?? {}) ? { [k]: 100 } : {}) } }));
  const majLigne = (i: number, p: Partial<Ligne>) => setC((x) => ({ ...x, lignes: (x.lignes ?? []).map((l, j) => (j === i ? { ...l, ...p, doute: false } : l)) }));

  const relire = () =>
    demarrer(async () => {
      setBalayage((b) => b + 1);
      const r = await lireImport(imp.id);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setC(r.champs);
      annoncer(r.champs.message ?? 'Document relu');
    });

  const creer = () =>
    demarrer(async () => {
      const r = await enregistrerChampsImport(imp.id, c);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      router.push(`/devis/nouveau?import=${imp.id}${c.genre === 'facture' ? '&genre=facture' : ''}`);
    });

  const genre = c.genre === 'facture' ? 'la facture' : 'le devis';

  return (
    <Ecran label="Lecture du document">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/devis/import" style={{ color: 'inherit' }}>
              Importer
            </Link>{' '}
            · {imp.nom_fichier}
          </div>
          <h1>Vérifier la lecture</h1>
        </div>
        <div className="actions">
          {suivant && (
            <Link className="btn" href={`/devis/import/${suivant}`}>
              Document suivant
            </Link>
          )}
          <button className="btn plein" type="button" onClick={creer} disabled={enCours}>
            {enCours && <Roue />}
            Créer {genre} avec ces champs
          </button>
        </div>
      </div>
      <div className="grille-ocr">
        <div className="carte visionneuse">
          <div className="visionneuse-haut">
            <div>
              <b>Document d’origine</b> <span>{imp.taille ? `${Math.round(imp.taille / 1024)} Ko` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {lien && (
                <a className="btn petit" href={lien} target="_blank" rel="noreferrer">
                  Ouvrir
                </a>
              )}
              {lecture && (
                <button className="btn petit" type="button" onClick={relire} disabled={enCours}>
                  Relancer la lecture
                </button>
              )}
            </div>
          </div>
          <div className="table-lumineuse">
            <div className="scan" style={{ padding: 0, aspectRatio: '1 / 1.3', overflow: 'hidden' }}>
              {lien ? (
                pdf ? (
                  <iframe src={`${lien}#toolbar=0&view=FitH`} title={imp.nom_fichier} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lien} alt={imp.nom_fichier} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
                )
              ) : (
                <div style={{ padding: 28 }}>Aperçu indisponible.</div>
              )}
              <div className="balayage joue" key={balayage} />
            </div>
          </div>
          <div className="legende-ocr">
            <span>
              <i style={{ background: 'var(--vert-doux)', outline: '2px solid #ABEFC6' }} />
              Lu avec certitude
            </span>
            <span>
              <i style={{ background: 'rgb(89 37 220 / .2)', outline: '2px solid rgb(89 37 220 / .7)' }} />
              À vérifier
            </span>
          </div>
        </div>

        <div ref={zoneChamps}>
          <div className="carte resume-ocr">
            <div className="jauge" style={{ background: `conic-gradient(var(--cobalt) 0 ${moyenne}%, var(--doux) ${moyenne}% 100%)` }}>
              <b className="num">{valeurs.length ? `${moyenne} %` : '·'}</b>
            </div>
            <div className="txt">
              {valeurs.length ? (
                <>
                  <b>
                    {nbChamps} champs lus{doutes.length ? `, ${doutes.length} à vérifier` : ''}
                  </b>
                  <span>
                    {doutes.length ? 'Certains caractères sont mal imprimés sur le document. Corrigez-les, le reste est prêt.' : 'Tout a été lu avec certitude. Relisez puis créez le document.'}
                  </span>
                </>
              ) : (
                <>
                  <b>{lecture ? 'Lecture en attente' : 'Saisie à la main'}</b>
                  <span>{c.message ?? 'Recopiez les informations du document, puis créez-le.'}</span>
                </>
              )}
            </div>
            {doutes.length > 0 && (
              <button
                className="btn petit"
                type="button"
                onClick={() => zoneChamps.current?.querySelector<HTMLInputElement>('.champ-ocr.doute input')?.focus()}
              >
                Voir {doutes.length > 1 ? `les ${doutes.length} champs` : 'le champ'}
              </button>
            )}
          </div>

          <div className="carte groupe">
            <h3>Client et chantier</h3>
            {CHAMPS_CLIENT.map(([k, lib]) => (
              <div key={k} className={`champ-ocr ${(confiance[k] ?? 100) < 80 ? 'doute' : ''}`}>
                <label htmlFor={`o-${k}`}>{lib}</label>
                <input id={`o-${k}`} value={String(c[k] ?? '')} onChange={(e) => majChamp(k, e.target.value)} />
                {k in confiance ? <Fiabilite v={confiance[k]} /> : <span />}
              </div>
            ))}
            <div className="champ-ocr">
              <label htmlFor="o-genre">Type</label>
              <select id="o-genre" className="saisie" value={c.genre ?? 'devis'} onChange={(e) => setC((x) => ({ ...x, genre: e.target.value as 'devis' | 'facture' }))}>
                <option value="devis">Devis</option>
                <option value="facture">Facture</option>
              </select>
              <span />
            </div>
          </div>

          <div className="carte groupe">
            <h3>Lignes reconnues</h3>
            <div className="lignes-ocr">
              {lignes.map((l, i) => (
                <div key={i} className={`lo ${l.doute ? 'doute' : ''}`}>
                  <input value={l.designation} aria-label="Désignation" onChange={(e) => majLigne(i, { designation: e.target.value })} />
                  <input value={String(l.quantite).replace('.', ',')} aria-label="Quantité" inputMode="decimal" onChange={(e) => majLigne(i, { quantite: nombre(e.target.value) })} />
                  <input
                    className="prix"
                    defaultValue={String(l.prix_unitaire).replace('.', ',')}
                    aria-label="Prix unitaire HT"
                    inputMode="decimal"
                    onChange={(e) => majLigne(i, { prix_unitaire: nombre(e.target.value) })}
                  />
                  <span className={`fiab ${l.doute ? 'doute' : 'sur'}`}>{l.doute ? 'À vérifier' : 'Lu'}</span>
                </div>
              ))}
              <button
                className="btn petit"
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => setC((x) => ({ ...x, lignes: [...(x.lignes ?? []), { designation: '', quantite: 1, unite: 'u', prix_unitaire: 0, tva: x.tva || 10 }] }))}
              >
                Ajouter une ligne
              </button>
            </div>
          </div>

          <div className="carte groupe">
            <h3>Conditions</h3>
            <div className="champ-ocr">
              <label htmlFor="o-tva">TVA (%)</label>
              <input id="o-tva" value={String(c.tva ?? '')} inputMode="decimal" onChange={(e) => setC((x) => ({ ...x, tva: nombre(e.target.value) }))} />
              {'tva' in confiance ? <Fiabilite v={confiance.tva} /> : <span />}
            </div>
            {CHAMPS_CONDITIONS.map(([k, lib]) => (
              <div key={k} className={`champ-ocr ${(confiance[k] ?? 100) < 80 ? 'doute' : ''}`}>
                <label htmlFor={`o-${k}`}>{lib}</label>
                <input id={`o-${k}`} value={String(c[k] ?? '')} onChange={(e) => majChamp(k, e.target.value)} />
                {k in confiance ? <Fiabilite v={confiance[k]} /> : <span />}
              </div>
            ))}
            <div className="champ-ocr">
              <label htmlFor="o-ttc">Total TTC lu</label>
              <input id="o-ttc" value={c.total_ttc ? euro(c.total_ttc) : ''} readOnly />
              {c.total_ttc && lignes.length ? (
                <span className={`fiab ${ecart < 0.05 ? 'ok' : 'doute'}`}>{ecart < 0.05 ? 'Recalculé : identique' : `Recalculé : ${euro(totalTTC)}`}</span>
              ) : (
                <span />
              )}
            </div>
            <div className="pied-ocr">
              <p>
                {lignes.length ? `${lignes.length} lignes · ${euro(totalHT)} HT. ` : ''}Les lignes arrivent dans l’éditeur, où vous pouvez les relier à votre catalogue.
              </p>
              <button className="btn plein" type="button" onClick={creer} disabled={enCours}>
                {enCours && <Roue />}
                Créer {genre}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Ecran>
  );
}
