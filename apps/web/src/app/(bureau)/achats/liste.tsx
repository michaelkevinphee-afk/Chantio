'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition, type DragEvent } from 'react';
import {
  achatEchu,
  ajouterJours,
  ecartJours,
  euro,
  GROUPES_ACHAT,
  LIBELLE_RECEPTION,
  LIBELLE_STATUT_ACHAT,
  resteAPayer,
  TON_STATUT_ACHAT,
  type ReceptionAchat,
  type StatutAchat,
} from '@chantio/shared';
import { Icone } from '@/components/icones';
import { annoncer } from '@/components/retour';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { Blocs, Compte, Ecran, Picto } from '../devis/composants';
import { Etincelle } from '../devis/tableau';
import { declarerPaiement, enregistrerAchats, lireFacture } from './actions';

export type LigneAchatListe = {
  id: string;
  numero: string | null;
  date_facture: string;
  echeance: string | null;
  montant_ttc: number;
  statut: StatutAchat;
  reception: ReceptionAchat;
  avoir: boolean;
  lecture: 'ia' | 'pas_facture' | 'manuel' | null;
  fichier_nom: string | null;
  planifie_le: string | null;
  moyen_prevu: string | null;
  approuvee_le: string | null;
  cree_le: string;
  fournisseur: { id: string; nom: string; categorie: string } | null;
  responsable: string | null;
  /** Numéro de l'intervention liée (« CH-2026-0012 »). */
  chantier: string | null;
  paiements: { montant: number; date_paiement: string }[];
  paye: number;
};

type EnCours = { cle: string; nom: string; type: string; etat: 'envoi' | 'lecture' | 'fait' | 'erreur'; p: number; detail: string; id?: string };
type Tuile = {
  cle: string;
  libelle: string;
  teinte: string;
  valeur: number;
  montant: number;
  unite: string;
  delta: string;
  sens: 'haut' | 'bas' | 'neutre';
  serie: number[];
  onglet: string;
  filtre?: Filtre;
  alerte?: boolean;
};

export const FORMATS_ACHAT = '.pdf,.jpg,.jpeg,.png,.webp,.heic';
const TAILLE_MAX = 20 * 1024 * 1024;
const FILTRES = ['Toutes', 'En retard', 'Sous 7 jours', 'Avoirs'] as const;
type Filtre = (typeof FILTRES)[number];
const COULEURS_AVATAR = ['#2F54EB', '#5925DC', '#0E9F6E', '#7C93F5', '#2442C4', '#C026D3'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const dateFr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const signe = (a: { avoir: boolean }) => (a.avoir ? -1 : 1);
const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? 's' : ''}`;
const initiales = (n: string) =>
  n
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?';

export function typeCourt(nom: string) {
  const ext = nom.split('.').pop()?.toUpperCase() ?? '';
  return ext === 'JPEG' ? 'JPG' : ext.slice(0, 4);
}

/** Extension du fichier envoyé dans le stockage (une photo de téléphone n'a pas toujours de nom parlant). */
export function extension(f: File) {
  const brute = f.name.includes('.') ? f.name.split('.').pop() : f.type.split('/')[1];
  return (brute ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
}

export const fichierAccepte = (f: File) => f.size <= TAILLE_MAX && (/\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name) || /^image\//.test(f.type));

/** Nombre d'éléments par semaine sur les 8 dernières semaines (petite courbe des tuiles). */
function parSemaine(dates: (string | null)[], jour: string) {
  const serie = Array<number>(8).fill(0);
  for (const d of dates) {
    if (!d) continue;
    const s = Math.floor(ecartJours(d.slice(0, 10), jour) / 7);
    if (s >= 0 && s < 8) serie[7 - s] += 1;
  }
  return serie;
}

function Jalons({ statut }: { statut: StatutAchat }) {
  const n = { recu: 0, a_payer: 1, planifie: 2, payee: 3, suspendu: -1, refusee: -1 }[statut];
  const classes = [0, 1, 2, 3].map((i) => (n === 3 ? 'ok' : n === -1 ? (i === 1 ? 'ko' : i < 1 ? 'fait' : '') : i < n ? 'fait' : i === n ? 'actif' : ''));
  return (
    <span className="jalons" aria-hidden="true">
      {classes.map((c, i) => (
        <i key={i} className={c} />
      ))}
    </span>
  );
}

function correspond(a: LigneAchatListe, filtre: Filtre, jour: string) {
  if (filtre === 'En retard') return achatEchu(a, a.paye, jour);
  if (filtre === 'Sous 7 jours')
    return (a.statut === 'a_payer' || a.statut === 'planifie') && !!a.echeance && a.echeance >= jour && a.echeance <= ajouterJours(jour, 7);
  if (filtre === 'Avoirs') return a.avoir;
  return true;
}

function detailMontant(a: LigneAchatListe, jour: string): { texte: string; retard?: boolean } {
  if (a.statut === 'payee') {
    const dernier = a.paiements.map((p) => p.date_paiement).sort().pop() ?? null;
    return { texte: dernier ? `Payée le ${dateFr(dernier)}` : 'Payée' };
  }
  if (a.statut === 'refusee') return { texte: 'TTC · refusée' };
  if (a.statut === 'planifie' && a.planifie_le) return { texte: `Paiement prévu le ${dateFr(a.planifie_le)}` };
  if (achatEchu(a, a.paye, jour)) {
    const j = ecartJours(a.echeance as string, jour);
    return { texte: `En retard de ${j} ${pluriel(j, 'jour')}`, retard: true };
  }
  return { texte: a.echeance ? `Échéance ${dateFr(a.echeance)}` : 'TTC' };
}

export function ListeAchats({
  entrepriseId,
  achats,
  lecture,
  jour,
  ongletInitial,
}: {
  entrepriseId: string;
  achats: LigneAchatListe[];
  lecture: boolean;
  jour: string;
  ongletInitial: string;
}) {
  const router = useRouter();
  const [onglet, setOnglet] = useState(GROUPES_ACHAT.some((g) => g.cle === ongletInitial) ? ongletInitial : 'tous');
  const [filtre, setFiltre] = useState<Filtre>('Toutes');
  const [recherche, setRecherche] = useState('');
  const [tour, setTour] = useState(0);
  const [survol, setSurvol] = useState(false);
  const [fichiers, setFichiers] = useState<EnCours[]>([]);
  const [, demarrer] = useTransition();
  const liste = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const champPhoto = useRef<HTMLInputElement>(null);
  const maj = (cle: string, p: Partial<EnCours>) => setFichiers((fs) => fs.map((f) => (f.cle === cle ? { ...f, ...p } : f)));

  const groupe = GROUPES_ACHAT.find((g) => g.cle === onglet) ?? GROUPES_ACHAT[0];
  const rangs = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return achats.filter(
      (a) =>
        (!groupe.statuts || groupe.statuts.includes(a.statut)) &&
        correspond(a, filtre, jour) &&
        (!q ||
          [a.fournisseur?.nom, a.fournisseur?.categorie, a.numero, a.fichier_nom, a.responsable, euro(a.montant_ttc), dateFr(a.date_facture)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [achats, groupe, filtre, recherche, jour]);
  const total = rangs.reduce((s, a) => s + signe(a) * a.montant_ttc, 0);

  // Tuiles du haut.
  const recues = achats.filter((a) => a.statut === 'recu');
  const aPayer = achats.filter((a) => a.statut === 'a_payer' || a.statut === 'planifie');
  const planifiees = aPayer.filter((a) => a.statut === 'planifie').length;
  const enRetard = aPayer.filter((a) => achatEchu(a, a.paye, jour));
  const retardMax = Math.max(0, ...enRetard.map((a) => ecartJours(a.echeance as string, jour)));
  const lues = recues.filter((a) => a.lecture === 'ia').length;
  const paiementsMois = achats.flatMap((a) => a.paiements.filter((p) => p.date_paiement.startsWith(jour.slice(0, 7))).map((p) => signe(a) * p.montant));
  const reste = (l: LigneAchatListe[]) => l.reduce((s, a) => s + signe(a) * resteAPayer(a, a.paye), 0);
  const tuiles: Tuile[] = [
    {
      cle: 'recu',
      libelle: 'Reçues à vérifier',
      teinte: 'var(--cobalt)',
      valeur: recues.length,
      montant: recues.reduce((s, a) => s + signe(a) * a.montant_ttc, 0),
      unite: pluriel(recues.length, 'facture'),
      delta: !recues.length ? 'Rien à vérifier' : lues ? `${lues} ${pluriel(lues, 'lue')} automatiquement` : 'À compléter',
      sens: 'neutre',
      serie: parSemaine(
        achats.map((a) => a.cree_le),
        jour,
      ),
      onglet: 'recu',
    },
    {
      cle: 'a_payer',
      libelle: 'À payer',
      teinte: 'var(--violet)',
      valeur: aPayer.length,
      montant: reste(aPayer),
      unite: pluriel(aPayer.length, 'facture'),
      delta: planifiees ? `${planifiees} ${pluriel(planifiees, 'paiement')} ${pluriel(planifiees, 'planifié')}` : 'Aucun paiement planifié',
      sens: 'neutre',
      serie: parSemaine(
        achats.map((a) => a.approuvee_le),
        jour,
      ),
      onglet: 'a_payer',
    },
    {
      cle: 'retard',
      libelle: 'En retard',
      teinte: 'var(--rouge)',
      valeur: enRetard.length,
      montant: reste(enRetard),
      unite: pluriel(enRetard.length, 'facture'),
      delta: enRetard.length ? `${retardMax} ${pluriel(retardMax, 'jour')} de retard` : 'Aucun retard',
      sens: enRetard.length ? 'bas' : 'haut',
      serie: parSemaine(
        enRetard.map((a) => a.echeance),
        jour,
      ),
      onglet: 'a_payer',
      filtre: 'En retard',
      alerte: enRetard.length > 0,
    },
    {
      cle: 'paye',
      libelle: 'Payé ce mois-ci',
      teinte: 'var(--vert)',
      valeur: paiementsMois.length,
      montant: paiementsMois.reduce((s, m) => s + m, 0),
      unite: pluriel(paiementsMois.length, 'paiement'),
      delta: `en ${MOIS_LONG[Number(jour.slice(5, 7)) - 1]}`,
      sens: 'neutre',
      serie: parSemaine(
        achats.flatMap((a) => a.paiements.map((p) => p.date_paiement)),
        jour,
      ),
      onglet: 'termine',
    },
  ];

  const choisirOnglet = (o: string, f: Filtre = 'Toutes') => {
    setOnglet(o);
    setFiltre(f);
    setTour((t) => t + 1);
  };

  const deposer = async (liste: FileList | File[] | null, photo = false) => {
    const tous = Array.from(liste ?? []);
    if (!tous.length) return;
    const valides = tous.filter(fichierAccepte);
    if (valides.length < tous.length) annoncer('Certains fichiers sont ignorés : PDF ou photo, 20 Mo au plus', 'erreur');
    if (!valides.length) return;
    const nouveaux: EnCours[] = valides.map((f) => ({ cle: crypto.randomUUID(), nom: f.name, type: typeCourt(f.name), etat: 'envoi', p: 10, detail: 'Envoi…' }));
    setFichiers((fs) => [...nouveaux, ...fs]);
    const supabase = supabaseNavigateur();

    const envoyes: { nom: string; chemin: string; taille: number; type: string; cle: string }[] = [];
    await Promise.all(
      valides.map(async (f, n) => {
        const cle = nouveaux[n].cle;
        const chemin = `${entrepriseId}/achats/${cle}.${extension(f)}`;
        const { error } = await supabase.storage.from('documents').upload(chemin, f, { contentType: f.type || undefined });
        if (error) {
          maj(cle, { etat: 'erreur', p: 100, detail: 'Envoi impossible, réessayez' });
          return;
        }
        maj(cle, { p: 40, detail: 'Reçue' });
        envoyes.push({ nom: f.name, chemin, taille: f.size, type: f.type, cle });
      }),
    );
    if (!envoyes.length) return;
    const r = await enregistrerAchats(
      envoyes.map((e) => ({ nom: e.nom, chemin: e.chemin, taille: e.taille, type: e.type })),
      photo,
    );
    if (!r.ok) {
      envoyes.forEach((e) => maj(e.cle, { etat: 'erreur', p: 100, detail: r.erreur }));
      return;
    }
    router.refresh();
    // Lecture une par une (la plus longue étape).
    for (const [n, id] of r.ids.entries()) {
      const cle = envoyes[n].cle;
      if (!lecture) {
        maj(cle, { etat: 'fait', p: 100, detail: 'À compléter à côté de la facture', id });
        continue;
      }
      maj(cle, { etat: 'lecture', p: 64, detail: 'Lecture de la facture…', id });
      const lu = await lireFacture(id);
      maj(cle, lu.ok ? { etat: 'fait', p: 100, detail: lu.resume } : { etat: 'erreur', p: 100, detail: lu.erreur });
    }
    router.refresh();
  };

  const glisser = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setSurvol(true);
    },
    onDragLeave: () => setSurvol(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setSurvol(false);
      deposer(e.dataTransfer.files);
    },
  };

  const payer = (a: LigneAchatListe) =>
    demarrer(async () => {
      const r = await declarerPaiement(a.id, a.moyen_prevu ?? 'Virement', String(resteAPayer(a, a.paye)), jour);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(a.avoir ? 'Remboursement enregistré' : 'Paiement enregistré');
      router.refresh();
    });

  const occupe = fichiers.some((f) => f.etat === 'envoi' || f.etat === 'lecture');
  const compte = (statuts: StatutAchat[] | null) => (statuts ? achats.filter((a) => statuts.includes(a.statut)).length : achats.length);

  return (
    <Ecran label="Achats">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="deg-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="entete">
        <div>
          <div className="sur">
            Factures fournisseurs
            {recues.length > 0 && ` · ${recues.length} à vérifier`}
          </div>
          <h1>Achats</h1>
        </div>
        <div className="actions">
          <Link className="btn" href="/achats/fournisseurs">
            <Picto nom="pro" />
            Fournisseurs
          </Link>
          <button className="btn seulement-tactile" type="button" onClick={() => champPhoto.current?.click()}>
            <Icone nom="photo" />
            Prendre en photo
          </button>
          <button className="btn plein" type="button" onClick={() => champ.current?.click()}>
            <Picto nom="importer" epaisseur={2.4} />
            Importer des factures
          </button>
          <input
            ref={champ}
            type="file"
            multiple
            accept={FORMATS_ACHAT}
            hidden
            onChange={(e) => {
              deposer(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={champPhoto}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              deposer(e.target.files, true);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {fichiers.length > 0 && (
        <div className="carte fichiers" style={{ marginTop: 0, marginBottom: 18 }}>
          <h3>
            Factures déposées
            <button className="btn petit fantome" type="button" onClick={() => setFichiers([])} disabled={occupe}>
              Masquer
            </button>
          </h3>
          {fichiers.map((f) => (
            <div className="fichier" key={f.cle}>
              <span className="type">{f.type}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nom">{f.nom}</div>
                <div className="detail">{f.detail}</div>
                {f.etat !== 'fait' && f.etat !== 'erreur' && (
                  <div className="barre">
                    <i style={{ width: `${f.p}%` }} />
                  </div>
                )}
              </div>
              {f.etat === 'fait' && f.id ? (
                <Link className="btn petit plein" href={`/achats/${f.id}`}>
                  Vérifier
                </Link>
              ) : f.etat === 'erreur' ? (
                <span className="pastille p-rouge">Erreur</span>
              ) : (
                <span className="pastille p-bleu">{f.etat === 'envoi' ? 'Envoi' : 'Lecture'}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!achats.length && !fichiers.length ? (
        <label className={`depot ${survol ? 'survol' : ''}`} {...glisser}>
          <Blocs className="blocs" />
          <h2>Déposez vos factures fournisseurs ici</h2>
          <p>
            PDF reçus par e-mail, scans ou photos de tickets.{' '}
            {lecture
              ? 'Chantio lit le fournisseur, le numéro, les montants et l’échéance ; vous vérifiez, approuvez, puis notez le paiement.'
              : 'Vous complétez ensuite les champs à côté de chaque facture, puis vous l’approuvez.'}
          </p>
          <span className="btn plein">Choisir des fichiers</span>
          <input
            type="file"
            multiple
            accept={FORMATS_ACHAT}
            hidden
            onChange={(e) => {
              deposer(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="formats">PDF, JPG, PNG, photo de téléphone · 20 Mo maximum par fichier</div>
        </label>
      ) : (
        <>
          <div className="tuiles">
            {tuiles.map((t, i) => (
              <button
                key={t.cle}
                type="button"
                className={`carte tuile apparition ${t.alerte ? 'alerte' : ''}`}
                style={{ ['--teinte' as string]: t.teinte, ['--i' as string]: i }}
                onClick={() => {
                  choisirOnglet(t.onglet, t.filtre);
                  liste.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <span className="lib">
                  <i />
                  {t.libelle}
                </span>
                <span className="val">
                  <span>
                    <Compte valeur={t.valeur} />
                  </span>
                  <small>{t.unite}</small>
                </span>
                <span className="mont">
                  <Compte valeur={t.montant} monnaie />
                </span>
                <span className={`delta ${t.sens}`}>
                  {t.sens === 'haut' ? '↗' : t.sens === 'bas' ? '!' : '·'} {t.delta}
                </span>
                <Etincelle serie={t.serie} />
              </button>
            ))}
          </div>

          <div className={`carte documents ${survol ? 'survol' : ''}`} ref={liste} style={{ scrollMarginTop: 16 }} {...glisser}>
            <div className="onglets" role="tablist">
              {GROUPES_ACHAT.map((g) => (
                <button key={g.cle} role="tab" type="button" aria-selected={onglet === g.cle} onClick={() => choisirOnglet(g.cle)}>
                  {g.libelle}
                  <span>{compte(g.statuts)}</span>
                </button>
              ))}
              <label className="recherche">
                <Picto nom="recherche" />
                <input type="search" placeholder="Fournisseur, numéro, montant…" aria-label="Rechercher" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              </label>
            </div>
            <div className="filtres">
              {FILTRES.map((f) => (
                <button
                  key={f}
                  className="btn petit"
                  type="button"
                  aria-pressed={f === filtre}
                  onClick={() => {
                    setFiltre(f);
                    setTour((t) => t + 1);
                  }}
                >
                  {f}
                </button>
              ))}
              <span className="total">
                {rangs.length} {pluriel(rangs.length, 'facture')} · <b>{euro(total)}</b>
              </span>
            </div>
            <div className="rangs" key={`${onglet}-${filtre}-${tour}`}>
              {rangs.map((a, i) => {
                const lien = `/achats/${a.id}`;
                const nom = a.fournisseur?.nom ?? 'Fournisseur à compléter';
                const detail = detailMontant(a, jour);
                const avance = a.montant_ttc ? Math.min(100, (a.paye / a.montant_ttc) * 100) : 0;
                return (
                  <div
                    key={a.id}
                    className="rang apparu"
                    tabIndex={0}
                    role="link"
                    style={{ ['--i' as string]: i, ['--a' as string]: COULEURS_AVATAR[(nom.length + i) % COULEURS_AVATAR.length] }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.actions-rapides')) return;
                      router.push(lien);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) router.push(lien);
                    }}
                  >
                    <span className="avatar pro">{a.fournisseur ? initiales(a.fournisseur.nom) : '?'}</span>
                    <div className="qui">
                      <b style={a.fournisseur ? undefined : { color: 'var(--gris)' }}>{nom}</b>
                      <span>
                        {a.numero && <span className="ref">{a.numero}</span>}
                        {a.numero ? ' · ' : ''}
                        {dateFr(a.date_facture)}
                        {a.avoir && <span className="origine">Avoir</span>}
                        {a.statut === 'recu' && a.lecture === 'pas_facture' && <span className="origine">Pas une facture ?</span>}
                        {a.statut === 'recu' && a.lecture === 'manuel' && <span className="origine">À compléter</span>}
                      </span>
                    </div>
                    <div className="quoi">
                      {a.fournisseur?.categorie ?? a.fichier_nom ?? 'Facture'}
                      <span>
                        {[a.responsable, a.chantier ? `Chantier ${a.chantier}` : null, LIBELLE_RECEPTION[a.reception]]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {(a.statut === 'a_payer' || a.statut === 'planifie') && (
                        <div className="actions-rapides">
                          <button type="button" onClick={() => payer(a)}>
                            {a.avoir ? 'Remboursé' : 'Payée'} ({euro(resteAPayer(a, a.paye))})
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="combien">
                      <b>{euro(signe(a) * a.montant_ttc)}</b>
                      <span className={detail.retard ? 'retard' : ''}>{detail.texte}</span>
                      {(a.statut === 'a_payer' || a.statut === 'planifie' || a.statut === 'payee') && (
                        <div className="encaisse-barre">
                          <i style={{ ['--w' as string]: a.statut === 'payee' ? 100 : avance }} />
                        </div>
                      )}
                    </div>
                    <div className="etat">
                      <span className={`pastille p-${TON_STATUT_ACHAT[a.statut]}`}>{LIBELLE_STATUT_ACHAT[a.statut]}</span>
                      <Jalons statut={a.statut} />
                    </div>
                    <span className="fleche">
                      <Picto nom="fleche" taille={16} epaisseur={2.4} />
                    </span>
                  </div>
                );
              })}
              {!rangs.length && (
                <div className="vide-liste">
                  {achats.length ? 'Aucune facture ne correspond.' : 'Les factures déposées apparaîtront ici.'}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Ecran>
  );
}
