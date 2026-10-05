'use client';

// Éditeur plein écran d'un devis, d'une facture ou d'un avoir, comme vEditeur() du bac :
// le formulaire à gauche (Client, Dates et références, En-tête, Produits et services, prix et marge),
// le document tel que le client le recevra à droite, la barre du bas (état, Aperçu, ⋮, bouton principal).
// Un brouillon s'enregistre tout seul ; un document validé se lit sans se modifier.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DELAIS_PAIEMENT,
  LIBELLE_PARCOURS,
  LIBELLE_STATUT_DOC,
  VALIDITES_MOIS,
  aDesImmeubles,
  actionsDocument,
  ajouterJours,
  appliquerForfaits,
  appliquerPrix,
  calculer,
  clientDocumentDe,
  dateBac,
  delaiDocument,
  documentModifiable,
  estAppelOffres,
  etatDocumentTexte,
  euroBac,
  finValidite,
  libelleDocument,
  ligneProduit,
  montrerRentabilite,
  nombre,
  nombreBac,
  nomClient,
  parcoursDocument,
  produitsCatalogue,
  reglagesDepannage,
  reglagesPrix,
  texteDelai,
  titreDocument,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type Parcours,
  type Produit,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import { annoncer } from '@/components/retour';
import type { ArticleLu } from '@/lib/devis';
import { enregistrerBrouillon, validerDocument, type DocumentAEnregistrer } from './actions';
import { BarreActions, type InfosBarre } from './barre-actions';
import type { LiensDocument } from './charger';
import { SectionClient, adresseSite, type ClientConnu } from './client-editeur';
import { Interrupteur, SectionConditions } from './conditions';
import { Ouvrages, type LigneEd } from './ouvrages';
import { Papier, type DonneesPapier, type EntreprisePapier } from './papier';
import { Rentabilite } from './rentabilite';

export type { ClientConnu } from './client-editeur';

/** Le document tel que la page le lit (lignes avec leur forfait de dépannage). */
export interface DocumentEditeur {
  id: string;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  statut: StatutDocument;
  numero: string | null;
  situation_numero: number | null;
  date_document: string;
  echeance: string | null;
  client_id: string | null;
  client: ClientDocument;
  objet: string;
  conditions: ConditionsDocument;
  remise: number;
  pourcentage: number;
  avancement: number;
  avancement_precedent: number;
  coefficient: number | null;
  devis_id: string | null;
  facture_id: string | null;
  origine: 'saisie' | 'import';
  envoye_le: string | null;
  finalise_le: string | null;
  signe_le: string | null;
  paye_le: string | null;
  lignes: LigneDocument[];
}

interface Etat {
  client_id: string | null;
  client: ClientDocument;
  objet: string;
  date_document: string;
  echeance: string | null;
  conditions: ConditionsDocument;
  remise: number;
  coefficient: number | null;
  lignes: LigneEd[];
}

const TVAS: [number, string][] = [
  [5.5, '5,5 % (rénovation énergétique)'],
  [10, '10 % (travaux en logement de plus de 2 ans)'],
  [20, '20 % (neuf, local professionnel)'],
];

/** Ligne propre à enregistrer (sans la clé de l'éditeur). */
const ligneDocument = (l: LigneEd | LigneDocument): LigneDocument => {
  const { cle: _cle, ...reste } = l as LigneEd;
  void _cle;
  return reste;
};

export function Editeur({
  doc,
  liens,
  clients,
  articles,
  entreprise,
  retour,
  aujourdhui,
  modeles,
}: {
  doc: DocumentEditeur;
  liens: LiensDocument;
  clients: ClientConnu[];
  articles: ArticleLu[];
  entreprise: EntreprisePapier;
  retour: string;
  aujourdhui: string;
  modeles: { objet: string; texte: string };
}) {
  const router = useRouter();
  const reglages = entreprise.facturation;
  const rp = useMemo(() => reglagesPrix(reglages), [reglages]);
  const rd = useMemo(() => reglagesDepannage(reglages), [reglages]);
  const facture = doc.genre === 'facture';
  const avoir = facture && doc.type_facture === 'avoir';
  const mod = documentModifiable(doc);
  const compteur = useRef(0);
  const nouvelleCle = useCallback(() => `n${++compteur.current}`, []);

  const [d, setD] = useState<Etat>(() => ({
    client_id: doc.client_id,
    client: doc.client,
    objet: doc.objet,
    date_document: doc.date_document,
    echeance: doc.echeance,
    conditions: doc.conditions,
    remise: doc.remise,
    coefficient: doc.coefficient,
    lignes: doc.lignes.map((l, i) => ({ ...ligneDocument(l), cle: `l${i}` })),
  }));
  const [remiseOn, setRemiseOn] = useState(doc.remise > 0);
  const [voirApercu, setVoirApercu] = useState(false);

  const c = d.conditions;
  const coef = d.coefficient ?? rp.coefficient;
  const parcours = parcoursDocument({ conditions: c, lignes: d.lignes });
  const ao = estAppelOffres({ genre: doc.genre, conditions: c });
  const tva = c.tva ?? d.lignes.find((l) => !l.titre)?.tva ?? 10;
  const majoration = c.majoration ?? 'normale';
  const client = clients.find((x) => x.id === d.client_id) ?? null;
  const site = client?.sites.find((s) => s.id === c.siteId) ?? null;

  // ---------- Enregistrement automatique (comme le bac, en quittant chaque champ) ----------
  const version = useRef(0);
  const enregistree = useRef(0);
  const actif = useRef(true);
  const file = useRef<Promise<boolean>>(Promise.resolve(true));
  const dernier = useRef(d);
  useEffect(() => {
    dernier.current = d;
  }, [d]);

  const versServeur = useCallback(
    (e: Etat): DocumentAEnregistrer => {
      const cond = e.conditions;
      const ech =
        facture && !avoir
          ? delaiDocument(cond) === 'perso' && e.echeance
            ? e.echeance
            : ajouterJours(e.date_document, delaiDocument(cond) === 'perso' ? 30 : (delaiDocument(cond) as number))
          : null;
      return {
        id: doc.id,
        genre: doc.genre,
        type_facture: doc.type_facture,
        client_id: e.client_id,
        client: e.client,
        objet: e.objet,
        date_document: e.date_document,
        echeance: ech,
        conditions: cond,
        devis_id: doc.devis_id,
        facture_id: doc.facture_id,
        remise: e.remise,
        pourcentage: doc.pourcentage,
        avancement: doc.avancement,
        avancement_precedent: doc.avancement_precedent,
        situation_numero: doc.situation_numero,
        coefficient: e.coefficient,
        lignes: e.lignes.map(ligneDocument),
        origine: doc.origine,
      };
    },
    [doc, facture, avoir],
  );

  const enregistrer = useCallback(() => {
    file.current = file.current.then(async () => {
      const v = version.current;
      if (!actif.current || v === enregistree.current) return true;
      const r = await enregistrerBrouillon(versServeur(dernier.current));
      if (!r.ok) {
        annoncer(r.erreur, 'erreur');
        return false;
      }
      enregistree.current = Math.max(enregistree.current, v);
      return true;
    });
    return file.current;
  }, [versServeur]);

  useEffect(() => {
    if (!mod || version.current === enregistree.current) return;
    const t = setTimeout(enregistrer, 1200);
    return () => clearTimeout(t);
  }, [d, mod, enregistrer]);

  // Rien ne se perd : enregistrement en quittant l'éditeur, avertissement si la page se ferme avant.
  useEffect(() => {
    const v = version;
    const e = enregistree;
    const avant = (ev: BeforeUnloadEvent) => {
      if (actif.current && v.current !== e.current) ev.preventDefault();
    };
    window.addEventListener('beforeunload', avant);
    return () => {
      window.removeEventListener('beforeunload', avant);
      if (v.current !== e.current) void enregistrer();
    };
  }, [enregistrer]);

  /** Change le document : les prix calculés et les forfaits suivent le coefficient et la majoration. */
  const changer = (f: (e: Etat) => Etat) => {
    if (!mod) return;
    version.current++;
    setD((e) => {
      const n = f(e);
      const k = n.coefficient ?? rp.coefficient;
      return { ...n, lignes: appliquerForfaits(appliquerPrix(n.lignes, k, rp), n.conditions.majoration, rd) };
    });
  };
  const majC = (p: Partial<ConditionsDocument>) => changer((e) => ({ ...e, conditions: { ...e.conditions, ...p } }));
  const sansC = (cles: (keyof ConditionsDocument)[]) =>
    changer((e) => {
      const n = { ...e.conditions };
      for (const k of cles) delete n[k];
      return { ...e, conditions: n };
    });
  const modifierLignes = (f: (l: LigneEd[]) => LigneEd[]) => changer((e) => ({ ...e, lignes: f(e.lignes) }));

  const valider = async () => {
    let fin: { ok: boolean; message?: string; erreur?: string } = { ok: false };
    file.current = file.current.then(async () => {
      const v = version.current;
      const r = await validerDocument(versServeur(dernier.current));
      if (!r.ok) {
        fin = r;
        return false;
      }
      enregistree.current = v;
      actif.current = false;
      fin = r;
      return true;
    });
    await file.current;
    if (!fin.ok) return annoncer(fin.erreur ?? 'Validation impossible', 'erreur');
    annoncer(fin.message ?? 'Document validé');
    router.refresh();
  };

  // ---------- Calculs ----------
  const lignesDoc = d.lignes;
  const T = calculer({ ...doc, ...d, lignes: lignesDoc });
  const Tdevis = calculer({ ...doc, ...d, genre: 'devis', type_facture: null, lignes: lignesDoc });
  const echeanceAffichee = facture && !avoir ? (versServeur(d).echeance ?? null) : null;
  const produits = useMemo<Produit[]>(() => produitsCatalogue(articles), [articles]);
  const prix = { coef, rp, rd, majoration };

  const etatDoc = {
    genre: doc.genre,
    type_facture: doc.type_facture,
    statut: doc.statut,
    date_document: d.date_document,
    echeance: doc.statut === 'brouillon' ? echeanceAffichee : doc.echeance,
    envoye_le: doc.envoye_le,
    finalise_le: doc.finalise_le,
    signe_le: doc.signe_le,
    paye_le: doc.paye_le,
    conditions: c,
  };
  const { principal, menu } = actionsDocument(etatDoc, {
    deja: liens.deja,
    parcours,
    interventionLiee: !!liens.intervention,
    contratLie: !!liens.contrat?.aAppliquer,
  });
  const etat = etatDocumentTexte(etatDoc, liens.deja, aujourdhui);

  const papier: DonneesPapier = {
    genre: doc.genre,
    type_facture: doc.type_facture,
    numero: doc.numero,
    date_document: d.date_document,
    echeance: doc.statut === 'brouillon' ? echeanceAffichee : doc.echeance,
    client: d.client,
    objet: d.objet,
    conditions: c,
    remise: d.remise,
    pourcentage: doc.pourcentage,
    avancement: doc.avancement,
    avancement_precedent: doc.avancement_precedent,
    situation_numero: doc.situation_numero,
    lignes: lignesDoc,
    refDevis: liens.refDevis,
    refFacture: liens.refFacture,
    refIntervention: liens.intervention?.reference ?? null,
    refContrat: liens.contrat?.reference ?? null,
    lieu: site ? adresseSite(site) : liens.lieu,
  };

  const infos: InfosBarre = {
    id: doc.id,
    genre: doc.genre,
    avoir,
    numero: doc.numero,
    ao,
    titre: titreDocument(doc.genre, doc.type_facture, doc.situation_numero),
    objet: d.objet,
    net: T.net,
    echeance: doc.echeance,
    email: client?.email || d.client.email || '',
    copie: reglages.mail_copie && entreprise.email ? entreprise.email : '',
    nomClient: client?.nom ?? nomClient(d.client),
    entreprise: entreprise.nom,
    modeles,
    clientId: d.client_id,
    siteId: c.siteId ?? null,
    contrat: liens.contrat ? { id: liens.contrat.id, reference: liens.contrat.reference } : null,
    facturation: { ht: Tdevis.marcheHT, deja: liens.deja, acompte: nombre(c.acompte) || 30 },
    retour,
  };

  // ---------- Client ----------
  const choisirClient = (id: string) => {
    const k = clients.find((x) => x.id === id);
    if (!k) return;
    const imm = k.sites[0] ?? null;
    const syndic = aDesImmeubles(k.type) && !!imm;
    changer((e) => ({
      ...e,
      client_id: k.id,
      client: { ...clientDocumentDe(k.source, imm), bdc: e.client.bdc },
      conditions: { ...e.conditions, siteId: syndic ? imm.id : null, occupant: syndic ? (imm.occupants[0] ?? null) : null },
    }));
  };
  const choisirSite = (id: string) => {
    const imm = client?.sites.find((s) => s.id === id);
    if (!client || !imm) return;
    changer((e) => ({
      ...e,
      client: { ...clientDocumentDe(client.source, imm), bdc: e.client.bdc },
      conditions: { ...e.conditions, siteId: imm.id, occupant: imm.occupants[0] ?? null },
    }));
  };

  const allerLigne = (k: number) => {
    const cle = d.lignes[k]?.cle;
    const ligne = document.querySelector<HTMLElement>(`[data-ligne="${cle}"]`);
    if (!ligne) return;
    ligne.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ligne.classList.remove('flash');
    void ligne.offsetWidth;
    ligne.classList.add('flash');
    setTimeout(() => {
      const i = document.querySelector<HTMLInputElement>(`[data-coef="${cle}"]`);
      i?.focus();
      i?.select();
    }, 350);
  };

  // ---------- Liens en tête du formulaire ----------
  const liensDoc: React.ReactNode[] = [];
  if (d.client_id)
    liensDoc.push(
      <Link key="cl" href={`/clients/${d.client_id}`} className="lien">
        Voir la fiche client
      </Link>,
    );
  if (liens.intervention)
    liensDoc.push(
      <span key="it">
        Intervention{' '}
        <Link href={`/interventions?fiche=${liens.intervention.id}`} className="lien mono">
          {liens.intervention.reference}
        </Link>
      </span>,
    );
  if (liens.origine)
    liensDoc.push(
      <span key="or">
        D’après{' '}
        <Link href={`/devis/${liens.origine.id}`} className="lien mono">
          {liens.origine.numero ?? 'brouillon'}
        </Link>
      </span>,
    );
  for (const x of liens.enfants)
    liensDoc.push(
      <span key={x.id}>
        {x.libelle}{' '}
        <Link href={`/devis/${x.id}`} className="lien mono">
          {x.numero ?? 'brouillon'}
        </Link>
      </span>,
    );
  if (liens.contrat)
    liensDoc.push(
      <span key="ct">
        Contrat <span className="mono">{liens.contrat.reference}</span>
      </span>,
    );

  // ---------- Dates et références ----------
  const delai = delaiDocument(c);
  const validites = [...new Set([...VALIDITES_MOIS.map((n) => `${n} mois`), c.validite])];
  const secDates = !mod ? (
    <section className="ed-sec">
      <h2>Dates et références</h2>
      <p className="ed-lu">
        {[
          <span key="e">
            {facture && avoir ? 'Émis le ' : facture ? 'Émise le ' : 'Émis le '}
            <b>{dateBac(d.date_document)}</b>
          </span>,
          facture && doc.echeance && !avoir ? (
            <span key="ech">
              échéance le <b>{dateBac(doc.echeance)}</b>
            </span>
          ) : null,
          !facture && doc.statut === 'envoye' ? (
            <span key="v">
              valable jusqu’au <b>{dateBac(finValidite(d.date_document, c.validite))}</b>
            </span>
          ) : null,
          c.dateExec ? (
            <span key="x">
              {facture ? 'travaux exécutés le ' : 'début des travaux le '}
              <b>{dateBac(c.dateExec)}</b>
            </span>
          ) : null,
          c.bc ? (
            <span key="bc">
              bon de commande <span className="mono">{c.bc}</span>
            </span>
          ) : null,
          ao ? (
            <span key="ao">
              appel d’offres{c.aoConsultation ? ` « ${c.aoConsultation} »` : ''}
              {c.aoLimite && (
                <>
                  , réponse avant le <b>{dateBac(c.aoLimite)}</b>
                </>
              )}
            </span>
          ) : null,
        ]
          .filter(Boolean)
          .flatMap((x, i) => (i ? [<span key={`s${i}`}> · </span>, x] : [x]))}
      </p>
    </section>
  ) : (
    <section className="ed-sec">
      <h2>Dates et références</h2>
      {facture && !avoir && (
        <div className="ligne-champs">
          <label className="champ">
            Délai de paiement
            <select
              value={delai === 'perso' ? 'perso' : String(delai)}
              onChange={(e) => {
                if (e.target.value === 'perso') return;
                const j = Number(e.target.value);
                changer((x) => ({
                  ...x,
                  echeance: ajouterJours(x.date_document, j),
                  conditions: { ...x.conditions, delaiJours: j, delai: texteDelai(j) },
                }));
              }}
            >
              {DELAIS_PAIEMENT.map(([j, lib]) => (
                <option key={j} value={j}>
                  {lib}
                </option>
              ))}
              {!DELAIS_PAIEMENT.some(([j]) => j === delai) && delai !== 'perso' && <option value={delai}>{delai} jours</option>}
              {delai === 'perso' && <option value="perso">Date choisie</option>}
            </select>
          </label>
          <label className="champ">
            Date d’échéance
            <input
              type="date"
              value={echeanceAffichee ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                changer((x) => ({ ...x, echeance: v, conditions: { ...x.conditions, delaiJours: 'perso', delai: texteDelai('perso', v) } }));
              }}
            />
          </label>
        </div>
      )}
      {!facture && parcours === 'chantier' && (
        <>
          <Interrupteur
            coche={ao}
            onChange={(v) =>
              v ? majC({ ao: true, aoLimite: '', aoConsultation: '', aoQuantites: !d.lignes.some((l) => !l.titre) }) : sansC(['ao', 'aoLimite', 'aoConsultation', 'aoQuantites'])
            }
          >
            Réponse à un appel d’offres
          </Interrupteur>
          {ao && (
            <div className="ed-ao">
              <div className="ligne-champs">
                <label className="champ">
                  Date limite de réponse
                  <input type="date" value={c.aoLimite ?? ''} onChange={(e) => majC({ aoLimite: e.target.value })} />
                </label>
                <label className="champ">
                  Consultation
                  <input
                    type="text"
                    value={c.aoConsultation ?? ''}
                    placeholder="ex. Marché public, lot 11 plomberie"
                    onChange={(e) => majC({ aoConsultation: e.target.value })}
                  />
                </label>
              </div>
              <Interrupteur coche={!!c.aoQuantites} onChange={(v) => majC({ aoQuantites: v })}>
                Quantités imposées par le client (DPGF ou DQE)
              </Interrupteur>
            </div>
          )}
        </>
      )}
      {!facture && (
        <div className="ligne-champs">
          <label className="champ">
            Validité du devis
            <select value={c.validite} onChange={(e) => majC({ validite: e.target.value })}>
              {validites.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="champ">
            Valable jusqu’au
            <input type="text" readOnly tabIndex={-1} value={dateBac(finValidite(d.date_document, c.validite))} />
          </label>
        </div>
      )}
      <Interrupteur
        coche={c.dateExec != null}
        onChange={(v) =>
          v
            ? majC({ dateExec: aujourdhui, ...(facture ? {} : { debut: `le ${dateBac(aujourdhui)}` }) })
            : changer((x) => {
                const n = { ...x.conditions };
                delete n.dateExec;
                if (!facture && /^le \d/.test(n.debut)) n.debut = 'à convenir';
                return { ...x, conditions: n };
              })
        }
      >
        {facture ? 'Ajouter la date d’exécution des travaux' : 'Ajouter une date de début des travaux'}
      </Interrupteur>
      {c.dateExec != null && (
        <label className="champ">
          {facture ? 'Date d’exécution des travaux' : 'Début des travaux'}
          <input
            type="date"
            autoFocus
            value={c.dateExec}
            onChange={(e) => {
              const v = e.target.value || aujourdhui;
              majC({ dateExec: v, ...(facture ? {} : { debut: `le ${dateBac(v)}` }) });
            }}
          />
        </label>
      )}
      <Interrupteur coche={c.bc != null} onChange={(v) => (v ? majC({ bc: '' }) : sansC(['bc']))}>
        Ajouter un numéro de bon de commande
      </Interrupteur>
      {c.bc != null && (
        <label className="champ">
          N° de bon de commande
          <input type="text" autoFocus value={c.bc} placeholder="ex. BC-2026-118" onChange={(e) => majC({ bc: e.target.value })} />
        </label>
      )}
    </section>
  );

  // ---------- En-tête ----------
  const secEntete = !mod ? (
    <section className="ed-sec">
      <h2>En-tête</h2>
      <p className="ed-lu">
        <b>{d.objet || '—'}</b>
        {c.description && (
          <>
            <br />
            <span style={{ whiteSpace: 'pre-line' }}>{c.description}</span>
          </>
        )}
      </p>
    </section>
  ) : (
    <section className="ed-sec">
      <h2>En-tête</h2>
      {!facture && doc.statut === 'brouillon' && (
        <label className="champ">
          Type de devis
          <select
            value={parcours}
            onChange={(e) => {
              const p = e.target.value as Parcours;
              changer((x) => {
                const n: ConditionsDocument = { ...x.conditions, parcours: p };
                if (p !== 'chantier') for (const k of ['ao', 'aoLimite', 'aoConsultation', 'aoQuantites'] as const) delete n[k];
                return { ...x, conditions: n };
              });
            }}
          >
            {(Object.keys(LIBELLE_PARCOURS) as Parcours[]).map((p) => (
              <option key={p} value={p}>
                {LIBELLE_PARCOURS[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="champ">
        Titre
        <input type="text" value={d.objet} placeholder="ex. Remplacement du chauffe-eau" onChange={(e) => changer((x) => ({ ...x, objet: e.target.value }))} />
      </label>
      {c.description != null ? (
        <label className="champ">
          Description
          <textarea
            rows={3}
            autoFocus={c.description === ''}
            value={c.description}
            placeholder="Ce qui est prévu, l’accès au logement, les précisions utiles au client…"
            onChange={(e) => majC({ description: e.target.value })}
          />
        </label>
      ) : (
        <button type="button" className="lien ed-ajout" onClick={() => majC({ description: '' })}>
          + Ajouter une description
        </button>
      )}
    </section>
  );

  // ---------- Produits et services ----------
  const tvas = TVAS.some(([t]) => t === tva) ? TVAS : [...TVAS, [tva, `${nombreBac(tva)} %`] as [number, string]];
  const secLignes = mod && (
    <section className="ed-sec ed-lignes">
      <h2>Produits et services</h2>
      <div className="ligne-champs">
        <label className="champ">
          TVA
          <select
            value={tva}
            onChange={(e) => {
              const t = Number(e.target.value);
              changer((x) => ({ ...x, conditions: { ...x.conditions, tva: t }, lignes: x.lignes.map((l) => (l.titre ? l : { ...l, tva: t })) }));
            }}
          >
            {tvas.map(([t, lib]) => (
              <option key={t} value={t}>
                {lib}
              </option>
            ))}
          </select>
        </label>
        {parcours === 'depannage' && (
          <label className="champ">
            Majoration horaire
            <select value={majoration} onChange={(e) => majC({ majoration: e.target.value as ConditionsDocument['majoration'] })}>
              <option value="normale">Heures normales</option>
              <option value="soir">Soir après 19 h (+{nombreBac(rd.maj_soir)} %)</option>
              <option value="we">Week-end et jour férié (+{nombreBac(rd.maj_we)} %)</option>
            </select>
          </label>
        )}
      </div>
      <Ouvrages
        lignes={d.lignes}
        modifier={modifierLignes}
        coef={coef}
        rp={rp}
        tva={tva}
        ao={ao && !!c.aoQuantites}
        produits={produits}
        prix={prix}
        articlesConnus={articles}
        ajouterProduit={(p) => ({ ...ligneProduit(p, { ...prix, tva }), cle: nouvelleCle() })}
        nouvelleCle={nouvelleCle}
      />
      <Interrupteur
        coche={remiseOn}
        onChange={(v) => {
          setRemiseOn(v);
          if (!v) changer((x) => ({ ...x, remise: 0 }));
        }}
      >
        Remise sur le total HT
      </Interrupteur>
      {remiseOn && (
        <div className="ed-remise">
          <span className="saisie-u">
            <input
              type="text"
              inputMode="decimal"
              autoFocus={!d.remise}
              defaultValue={d.remise ? nombreBac(d.remise) : ''}
              placeholder="0"
              aria-label="Remise en pourcentage du total HT"
              onBlur={(e) => {
                let v = nombre(e.target.value);
                if (v < 0 || v > 100) {
                  annoncer('Remise entre 0 et 100 %', 'erreur');
                  v = Math.min(100, Math.max(0, v));
                  e.target.value = nombreBac(v);
                }
                const r = Math.round(v * 100) / 100;
                if (r !== d.remise) changer((x) => ({ ...x, remise: r }));
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <i>%</i>
          </span>
          <span className="gris">{T.remise ? `soit − ${euroBac(T.remise)} HT sur ${euroBac(T.brut)}` : 'Indiquez le pourcentage de remise'}</span>
        </div>
      )}
    </section>
  );

  const libelle = libelleDocument(doc);
  return (
    <div className={`ed${voirApercu ? ' voir-apercu' : ''}`}>
      <div className="ed-corps">
        <div className="ed-g">
          <div className="ed-form">
            {liensDoc.length > 0 && (
              <p className="liens-doc">{liensDoc.flatMap((x, i) => (i ? [<span key={`p${i}`}> · </span>, x] : [x]))}</p>
            )}
            {!mod && (
              <div className="ban gris">
                {facture
                  ? 'Une facture émise ne se modifie plus : faites un avoir si besoin.'
                  : `Devis ${LIBELLE_STATUT_DOC[doc.statut].toLowerCase()} : dupliquez-le pour faire une variante.`}
              </div>
            )}
            <SectionClient
              modifiable={mod}
              genre={doc.genre}
              clientId={d.client_id}
              clientDoc={d.client}
              clients={clients}
              siteId={c.siteId ?? null}
              occupant={c.occupant ?? null}
              ordreService={c.ordreService ?? null}
              contrat={parcours === 'contrat' ? liens.contrat : null}
              totalHT={Tdevis.marcheHT}
              choisirClient={choisirClient}
              choisirSite={choisirSite}
              changerOccupant={(o) => majC({ occupant: o })}
              changerOrdreService={(v) => majC({ ordreService: v || null })}
            />
            {secDates}
            {secEntete}
            {secLignes}
            {mod && <SectionConditions c={c} pro={d.client.type === 'pro'} facture={facture} maj={majC} />}
            {montrerRentabilite({ genre: doc.genre, type_facture: doc.type_facture, lignes: d.lignes }) && (
              <section className="ed-sec ed-renta" aria-label="Prix et marge">
                <Rentabilite
                  lignes={d.lignes}
                  remise={d.remise}
                  coef={coef}
                  rp={rp}
                  parcours={parcours}
                  lecture={!mod}
                  T={T}
                  onCoef={(k) => changer((x) => ({ ...x, coefficient: k }))}
                  toutAuGlobal={() => {
                    modifierLignes((ls) => ls.map((l) => (l.coefficient ? { ...l, coefficient: null } : l)));
                    annoncer('Toutes les lignes suivent le coefficient global');
                  }}
                  allerLigne={allerLigne}
                />
              </section>
            )}
          </div>
          <BarreActions
            infos={infos}
            etat={etat}
            principal={principal}
            menu={menu}
            apercu={voirApercu}
            basculerApercu={() => {
              setVoirApercu((v) => !v);
              window.scrollTo(0, 0);
            }}
            valider={valider}
            avantAction={async () => (mod ? enregistrer() : true)}
            arreter={() => (actif.current = false)}
          />
        </div>
        <aside className="ed-d" aria-labelledby="ed-ap-t">
          <div className="ed-d-tete">
            <h2 id="ed-ap-t">Prévisualisation</h2>
            <span className="gris petit-txt">Ce que reçoit le client : ni achats, ni heures, ni marge.</span>
          </div>
          <div className="bureau-papier" aria-label={`${libelle} tel que le client le recevra`}>
            <Papier d={papier} entreprise={entreprise} />
          </div>
        </aside>
      </div>
    </div>
  );
}
