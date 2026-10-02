'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  calculer,
  cleTva,
  controlerSiret,
  euro,
  formaterSiret,
  luhn,
  nombre,
  nomClient,
  tvaParDefaut,
  UNITES,
  type ClientDocument,
  type ConditionsDocument,
  type GenreDocument,
  type LigneDocument,
  type StatutDocument,
  type TypeFacture,
} from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import type { ArticleLu, HistoriqueDevis } from '@/lib/devis';
import { enregistrerDocument, facturerDevis, type DocumentAEnregistrer } from './actions';
import { Ecran, Picto } from './composants';
import { nombreClauses, Papier, type DonneesPapier, type EntreprisePapier } from './papier';

type Etape = 'client' | 'ouvrages' | 'conditions';
const ORDRE: Etape[] = ['client', 'ouvrages', 'conditions'];

type Ligne = LigneDocument & { cle: number; neuve?: boolean };

// Clé stable de chaque ligne affichée (pour React).
let derniereCle = 0;
const nouvelleCle = () => ++derniereCle;

export interface InitialEditeur extends DonneesPapier {
  client_id: string | null;
  devis_id: string | null;
  facture_id: string | null;
  import_id: string | null;
  origine: 'saisie' | 'import';
  /** Champs remplis par la lecture automatique (affichés en violet). */
  lus: string[];
}

export interface ClientConnu {
  id: string;
  nom: string;
  type: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
}

export interface PropsEditeur {
  id: string | null;
  statut: StatutDocument;
  initial: InitialEditeur;
  articles: ArticleLu[];
  entreprise: EntreprisePapier;
  historique: HistoriqueDevis | null;
  facturesValidees: { id: string; numero: string; client: string; total: number }[];
  devisSignes: { id: string; numero: string; client: string; objet: string }[];
  clients: ClientConnu[];
  etapeInitiale?: Etape;
}

const BANDE: { tf: TypeFacture; titre: string; aide: string }[] = [
  { tf: 'acompte', titre: 'Acompte', aide: 'Un pourcentage du marché, à la commande' },
  { tf: 'avancement', titre: 'Avancement', aide: 'Un pourcentage global du chantier réalisé' },
  { tf: 'situation', titre: 'Situation de travaux', aide: 'Avancement ligne par ligne, en cumulé' },
  { tf: 'solde', titre: 'Solde et décompte final', aide: 'Ce qui reste dû à la réception' },
  { tf: 'totale', titre: 'Facture unique', aide: 'Travaux terminés, facturés en une fois' },
  { tf: 'avoir', titre: 'Avoir', aide: 'Annule ou corrige une facture' },
];

const OUVRAGES_TYPES: { nom: string; lignes: Omit<LigneDocument, 'tva'>[] }[] = [
  {
    nom: 'Remplacement WC',
    lignes: [
      { titre: true, designation: 'Remplacement WC', quantite: 0, unite: 'u', prix_unitaire: 0 },
      { designation: 'Dépose WC existant et évacuation', quantite: 1, unite: 'forfait', prix_unitaire: 95 },
      { designation: 'WC suspendu avec bâti-support', quantite: 1, unite: 'u', prix_unitaire: 540 },
      { designation: 'Main-d’œuvre plombier', quantite: 4, unite: 'h', prix_unitaire: 62 },
      { designation: 'Raccordement et mise en service', quantite: 1, unite: 'forfait', prix_unitaire: 70 },
    ],
  },
  {
    nom: 'Remplacement chauffe-eau',
    lignes: [
      { titre: true, designation: 'Remplacement chauffe-eau électrique', quantite: 0, unite: 'u', prix_unitaire: 0 },
      { designation: 'Chauffe-eau électrique 200 L vertical', quantite: 1, unite: 'u', prix_unitaire: 689 },
      { designation: 'Groupe de sécurité 3/4', quantite: 1, unite: 'u', prix_unitaire: 38.5 },
      { designation: 'Main-d’œuvre plombier', quantite: 4, unite: 'h', prix_unitaire: 62 },
      { designation: 'Dépose et évacuation de l’ancien appareil', quantite: 1, unite: 'forfait', prix_unitaire: 60 },
    ],
  },
  {
    nom: 'Entretien chaudière gaz',
    lignes: [
      { titre: true, designation: 'Entretien annuel', quantite: 0, unite: 'u', prix_unitaire: 0 },
      { designation: 'Entretien annuel chaudière gaz (attestation fournie)', quantite: 1, unite: 'forfait', prix_unitaire: 140 },
      { designation: 'Déplacement Paris intra-muros', quantite: 1, unite: 'forfait', prix_unitaire: 45 },
    ],
  },
];

const formatPrix = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');
const formatQte = (n: number) => String(+n.toFixed(3)).replace('.', ',');

type EntrepriseTrouvee = {
  nom: string;
  siren: string;
  siret: string | null;
  forme_juridique: string | null;
  activite: string | null;
  tva_intracom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  dirigeants: { nom: string; fonction: string | null }[];
  fermee: boolean;
};

/** Champ texte qui garde sa saisie libre (« 12,5 ») et renvoie un nombre. */
function ChampNombre({
  valeur,
  onChange,
  format = formatPrix,
  ...props
}: { valeur: number; onChange: (n: number) => void; format?: (n: number) => string } & Omit<React.ComponentProps<'input'>, 'onChange' | 'value'>) {
  const [texte, setTexte] = useState(format(valeur));
  const focus = useRef(false);
  useEffect(() => {
    if (!focus.current) setTexte(format(valeur));
  }, [valeur, format]);
  return (
    <input
      {...props}
      inputMode="decimal"
      value={texte}
      onFocus={() => (focus.current = true)}
      onBlur={() => {
        focus.current = false;
        setTexte(format(valeur));
      }}
      onChange={(e) => {
        setTexte(e.target.value);
        onChange(nombre(e.target.value));
      }}
    />
  );
}

function Interrupteur({ coche, onChange, label }: { coche: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="interrupteur">
      <input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

function Auto() {
  return (
    <span className="auto-ico">
      <Picto nom="coche" taille={20} epaisseur={2.6} />
    </span>
  );
}

function Regle({ titre, texte, badge, children, interrupteur }: { titre: string; texte: string; badge?: string; children?: ReactNode; interrupteur?: ReactNode }) {
  return (
    <div className="regle">
      {interrupteur ?? <Auto />}
      <div>
        <b>
          {titre}
          {badge && <span className="obligatoire">{badge}</span>}
        </b>
        <p>{texte}</p>
        {children}
      </div>
    </div>
  );
}

export function Editeur(props: PropsEditeur) {
  const { initial, entreprise, historique, articles } = props;
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [id, setId] = useState(props.id);
  const numero = initial.numero;
  const [genre, setGenre] = useState<GenreDocument>(initial.genre);
  const [tf, setTf] = useState<TypeFacture>(initial.type_facture ?? 'totale');
  const [cl, setCl] = useState<ClientDocument>(initial.client);
  const [clientId, setClientId] = useState<string | null>(initial.client_id);
  const [objet, setObjet] = useState(initial.objet);
  const [date, setDate] = useState(initial.date_document);
  const [c, setC] = useState<ConditionsDocument>(initial.conditions);
  const [remise, setRemise] = useState(initial.remise);
  const [pourcentage, setPourcentage] = useState(initial.pourcentage || 30);
  const [avancement, setAvancement] = useState(initial.avancement);
  const [avPrec, setAvPrec] = useState(initial.avancement_precedent);
  const [situationNumero, setSituationNumero] = useState(initial.situation_numero);
  const [factureId, setFactureId] = useState(initial.facture_id);
  const [lignes, setLignes] = useState<Ligne[]>(() => initial.lignes.map((l) => ({ ...l, cle: nouvelleCle() })));
  const [etape, setEtape] = useState<Etape>(props.etapeInitiale ?? 'client');
  const [flash, setFlash] = useState<number | undefined>();
  const [modifie, setModifie] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const lus = new Set(initial.lus);

  // Recherche d'entreprise (SIRET, SIREN ou nom)
  const [q, setQ] = useState(initial.client.siret || '');
  const [resultats, setResultats] = useState<EntrepriseTrouvee[] | null>(null);
  const [cherche, setCherche] = useState(false);
  // Catalogue
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [rechercheCat, setRechercheCat] = useState('');
  const [typesOuverts, setTypesOuverts] = useState(false);
  const choix = useRef<HTMLDivElement>(null);

  const facture = genre === 'facture';
  const pro = cl.type === 'pro';

  useEffect(() => {
    const fermer = (e: MouseEvent) => {
      if (choix.current && !choix.current.contains(e.target as Node)) {
        setChoixOuvert(false);
        setTypesOuverts(false);
      }
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setChoixOuvert(false);
        setTypesOuverts(false);
      }
    };
    document.addEventListener('click', fermer);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('click', fermer);
      document.removeEventListener('keydown', echap);
    };
  }, []);

  // Prévenir avant de quitter avec des modifications non enregistrées.
  useEffect(() => {
    if (!modifie) return;
    const avant = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, [modifie]);

  const toucher = () => setModifie(true);
  const majCl = (p: Partial<ClientDocument>) => {
    setCl((x) => ({ ...x, ...p }));
    toucher();
  };
  const majC = (p: Partial<ConditionsDocument>) => {
    setC((x) => ({ ...x, ...p }));
    toucher();
  };
  const majLigne = (i: number, p: Partial<Ligne>) => {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
    setFlash(i);
    toucher();
  };
  const ajouter = (nouvelles: LigneDocument[]) => {
    setLignes((ls) => [
      ...ls,
      ...nouvelles.map((l) => ({ avancement: 0, avancement_precedent: 0, ...l, cle: nouvelleCle(), neuve: true })),
    ]);
    toucher();
  };

  const papier: DonneesPapier = {
    genre,
    type_facture: facture ? tf : null,
    numero,
    date_document: date,
    echeance: initial.echeance,
    client: cl,
    objet,
    conditions: c,
    remise,
    pourcentage,
    avancement,
    avancement_precedent: avPrec,
    situation_numero: situationNumero,
    lignes,
    refDevis: historique?.numero ?? initial.refDevis,
    refFacture: props.facturesValidees.find((f) => f.id === factureId)?.numero ?? initial.refFacture,
  };
  const T = calculer(papier);
  const nbOuvrages = lignes.filter((l) => !l.titre).length;
  const nbClauses = nombreClauses(papier);

  // --- Genre et type de facture
  const changerGenre = (g: GenreDocument) => {
    if (numero || g === genre) return;
    setGenre(g);
    toucher();
  };
  const changerType = (t: TypeFacture) => {
    setTf(t);
    if (historique) {
      if (t === 'avancement' || t === 'solde') {
        setAvPrec(historique.dejaPct);
        if (t === 'avancement' && avancement <= historique.dejaPct) setAvancement(Math.min(100, historique.dejaPct + 10));
      } else setAvPrec(0);
      if (t === 'situation') {
        setSituationNumero(historique.situationNumero);
        setLignes((ls) =>
          ls.map((l, i) => {
            const prec = historique.avancementsSituation[i] ?? 0;
            return { ...l, avancement_precedent: prec, avancement: Math.max(l.avancement ?? 0, prec) };
          }),
        );
      }
    }
    if (t === 'acompte' && !pourcentage) setPourcentage(Number(c.acompte) || 30);
    toucher();
  };

  // --- Client
  const changerTypeClient = (type: ClientDocument['type']) => {
    const estPro = type === 'pro';
    setCl((x) => ({ ...x, type }));
    setC((x) => ({ ...x, retenue: estPro, attTva: !estPro, retract: !estPro && cl.domicile }));
    setLignes((ls) => ls.map((l) => (l.titre ? l : { ...l, tva: estPro ? 20 : cl.plus2ans ? 10 : 20 })));
    toucher();
  };
  const reprendreClient = (idClient: string) => {
    const k = props.clients.find((x) => x.id === idClient);
    setClientId(idClient || null);
    if (!k) return;
    if (k.type === 'particulier') {
      const m = k.nom.match(/^(Mme et M\.|Mme|M\.)\s+(.*)$/);
      majCl({ type: 'particulier', civ: m?.[1] ?? cl.civ, nom: m?.[2] ?? k.nom, prenom: '', tel: k.telephone ?? '', email: k.email ?? '', adresse: k.adresse ?? '' });
    } else {
      changerTypeClient('pro');
      majCl({ type: 'pro', raison: k.nom, tel: k.telephone ?? '', email: k.email ?? '', adresse: k.adresse ?? '' });
    }
  };

  const chiffres = q.replace(/\D/g, '');
  let controle: ReactNode;
  if (!chiffres.length)
    controle = <span className="puce-ctrl neutre">{/[a-zé]/i.test(q) ? 'Recherche par nom' : '9 chiffres pour un SIREN, 14 pour un SIRET'}</span>;
  else if (chiffres.length !== 9 && chiffres.length !== 14)
    controle = (
      <span className="puce-ctrl neutre">
        {chiffres.length} chiffres sur {chiffres.length < 9 ? 9 : 14}
      </span>
    );
  else if (controlerSiret(chiffres) || !luhn(chiffres.slice(0, 9)))
    controle = (
      <>
        <span className="puce-ctrl ko">Clé de contrôle incorrecte</span> Un chiffre est sans doute faux.
      </>
    );
  else
    controle = (
      <>
        <span className="puce-ctrl ok">{chiffres.length === 9 ? 'SIREN' : 'SIRET'} valide</span> TVA intracommunautaire :{' '}
        <b className="num">{cleTva(chiffres.slice(0, 9))}</b>
      </>
    );

  const chercher = async () => {
    if (q.trim().length < 3) return;
    setCherche(true);
    try {
      const rep = await fetch(`/api/entreprises?q=${encodeURIComponent(q.trim())}`);
      const json = (await rep.json()) as { resultats: EntrepriseTrouvee[]; erreur?: string };
      if (json.erreur) annoncer(json.erreur, 'erreur');
      setResultats(json.resultats ?? []);
    } catch {
      annoncer('La recherche ne répond pas, remplissez la fiche à la main.', 'erreur');
      setResultats([]);
    } finally {
      setCherche(false);
    }
  };
  const prendre = (e: EntrepriseTrouvee) => {
    const siret = e.siret ?? (chiffres.length === 14 ? chiffres : '');
    majCl({
      raison: e.nom,
      siret: siret ? formaterSiret(siret) : formaterSiret(e.siren),
      tvaIntra: e.tva_intracom,
      forme: e.forme_juridique ?? '',
      naf: e.activite ?? '',
      adresse: [e.adresse, [e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      contact: cl.contact || e.dirigeants[0]?.nom || '',
    });
    setResultats(null);
    annoncer('Entreprise remplie : raison sociale, SIRET, TVA et adresse');
  };

  // --- Enregistrement
  const versServeur = (): DocumentAEnregistrer => ({
    id,
    genre,
    type_facture: facture ? tf : null,
    client_id: clientId,
    client: cl,
    objet,
    date_document: date,
    conditions: c,
    devis_id: initial.devis_id,
    facture_id: factureId,
    remise,
    pourcentage,
    avancement,
    avancement_precedent: avPrec,
    situation_numero: facture && tf === 'situation' ? situationNumero : null,
    lignes: lignes.map((l) => {
      const { cle, neuve, ...reste } = l;
      void cle;
      void neuve;
      return reste;
    }),
    origine: initial.origine,
    import_id: initial.import_id,
  });

  const enregistrer = (valider: boolean) =>
    demarrer(async () => {
      const r = await enregistrerDocument(versServeur(), valider);
      if (!r.ok) {
        annoncer(r.erreur, 'erreur');
        return;
      }
      setModifie(false);
      if (valider) {
        annoncer(`${facture ? (tf === 'avoir' ? 'Avoir' : 'Facture') : 'Devis'} ${r.numero} validé`);
        router.push(`/devis/${r.id}`);
        router.refresh();
        return;
      }
      annoncer('Brouillon enregistré');
      if (!id) {
        setId(r.id);
        router.replace(`/devis/${r.id}`);
      } else router.refresh();
    });

  const lierDevis = (devisId: string) =>
    demarrer(async () => {
      if (!devisId) return;
      const r = await facturerDevis(devisId, tf);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer('Facture reprise du devis');
      router.push(`/devis/${r.id}?etape=ouvrages`);
    });

  const montrer = (e: Etape) => {
    setEtape(e);
    const f = formulaire.current;
    if (f && f.getBoundingClientRect().top < 0) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const i = ORDRE.indexOf(etape);
  const libelleValider = facture ? (tf === 'avoir' ? 'Valider l’avoir' : 'Valider la facture') : 'Valider le devis';

  const catalogueFiltre = useMemo(() => {
    const s = rechercheCat.trim().toLowerCase();
    return articles.filter((a) => !s || (a.designation + a.categorie + (a.reference ?? '')).toLowerCase().includes(s)).slice(0, 60);
  }, [articles, rechercheCat]);

  const titreEcran = facture ? (tf === 'situation' ? 'Faire une situation de travaux' : tf === 'avoir' ? 'Faire un avoir' : 'Faire une facture') : 'Faire un devis';
  const sur = [
    initial.origine === 'import' && !id ? 'Prérempli depuis un document importé' : null,
    numero ?? (id ? 'Brouillon' : 'Nouveau document'),
    facture && historique?.numero ? `chantier du devis ${historique.numero}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Ecran label="Devis ou facture">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/devis" style={{ color: 'inherit' }}>
              Devis et factures
            </Link>{' '}
            · {sur}
          </div>
          <h1>{titreEcran}</h1>
        </div>
        <div className="actions" style={{ alignItems: 'center' }}>
          {id && (
            <Link className="btn" href={`/impression/${id}`} target="_blank">
              <Picto nom="imprimer" />
              Aperçu PDF
            </Link>
          )}
          <div className="genre" role="group" aria-label="Type de document">
            {(['devis', 'facture'] as const).map((g) => (
              <button key={g} type="button" aria-pressed={genre === g} onClick={() => changerGenre(g)} disabled={!!numero && genre !== g}>
                {g === 'devis' ? 'Devis' : 'Facture'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {facture && (
        <div className="bande-types" role="group" aria-label="Type de facture">
          {BANDE.map((b) => (
            <button key={b.tf} type="button" aria-pressed={tf === b.tf} onClick={() => changerType(b.tf)}>
              <b>{b.titre}</b>
              <span>{b.aide}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grille-editeur">
        <form ref={formulaire} autoComplete="off" onSubmit={(e) => e.preventDefault()} style={{ scrollMarginTop: 12 }}>
          <nav className="etapes" aria-label="Étapes">
            {ORDRE.map((e, n) => (
              <button key={e} type="button" aria-current={etape === e ? 'step' : undefined} onClick={() => montrer(e)}>
                <span className="rond-n">{n + 1}</span>
                <div>
                  <b>{e === 'client' ? 'Client' : e === 'ouvrages' ? 'Ouvrages' : 'Conditions'}</b>
                  <small>
                    {e === 'client'
                      ? pro
                        ? cl.raison || 'Professionnel'
                        : `Particulier${cl.nom ? ' · ' + [cl.civ, cl.nom].join(' ') : ''}`
                      : e === 'ouvrages'
                        ? `${nbOuvrages} ligne${nbOuvrages > 1 ? 's' : ''} · ${euro(T.marcheHT)} HT`
                        : `${nbClauses} clauses`}
                  </small>
                </div>
              </button>
            ))}
          </nav>

          {/* 1. Client */}
          <div className="panneau" hidden={etape !== 'client'}>
            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Pour qui est ce document ?</h2>
                {props.clients.length > 0 && (
                  <select className="saisie" style={{ width: 'auto', maxWidth: 260 }} value={clientId ?? ''} onChange={(e) => reprendreClient(e.target.value)} aria-label="Reprendre un client existant">
                    <option value="">Reprendre un client…</option>
                    {props.clients.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nom}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="type-client">
                <button type="button" aria-pressed={!pro} onClick={() => changerTypeClient('particulier')}>
                  <Picto nom="particulier" taille={26} epaisseur={2} />
                  <div>
                    <b>Particulier</b>
                    <span>Propriétaire ou locataire</span>
                  </div>
                </button>
                <button type="button" aria-pressed={pro} onClick={() => changerTypeClient('pro')}>
                  <Picto nom="pro" taille={26} epaisseur={2} />
                  <div>
                    <b>Professionnel</b>
                    <span>Entreprise, syndic, bailleur, collectivité</span>
                  </div>
                </button>
              </div>
            </div>

            {!pro ? (
              <div className="carte bloc">
                <div className="bloc-titre">
                  <h2>Coordonnées du client</h2>
                  {lus.size > 0 && <span className="marque-ocr">Lu par OCR</span>}
                </div>
                <div className="champs">
                  <div>
                    <div className="etiq">Civilité</div>
                    <select className="saisie" value={cl.civ} onChange={(e) => majCl({ civ: e.target.value })}>
                      <option>Mme</option>
                      <option>M.</option>
                      <option>Mme et M.</option>
                    </select>
                  </div>
                  <div />
                  <div>
                    <div className="etiq">Nom</div>
                    <input className={`saisie ${lus.has('client') ? 'lu' : ''}`} value={cl.nom} onChange={(e) => majCl({ nom: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Prénom</div>
                    <input className="saisie" value={cl.prenom} onChange={(e) => majCl({ prenom: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Téléphone</div>
                    <input className={`saisie ${lus.has('telephone') ? 'lu' : ''}`} inputMode="tel" value={cl.tel} onChange={(e) => majCl({ tel: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">E-mail</div>
                    <input className="saisie" inputMode="email" value={cl.email} onChange={(e) => majCl({ email: e.target.value })} />
                  </div>
                  <div className="large">
                    <div className="etiq">Adresse de facturation</div>
                    <input className={`saisie ${lus.has('adresse') ? 'lu' : ''}`} value={cl.adresse} onChange={(e) => majCl({ adresse: e.target.value })} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="carte bloc">
                <div className="bloc-titre">
                  <h2>Entreprise cliente</h2>
                  <span className="surtitre">Annuaire des entreprises</span>
                </div>
                <div className="siret-zone">
                  <div className="etiq">SIRET, SIREN ou nom de l’entreprise</div>
                  <div className="siret-ligne">
                    <input
                      className="saisie"
                      placeholder="ex. 732 829 320 ou Syndic Auteuil"
                      aria-label="SIRET, SIREN ou nom"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          chercher();
                        }
                      }}
                    />
                    <button className="btn plein" type="button" onClick={chercher} disabled={cherche}>
                      {cherche && <Roue />}
                      Rechercher
                    </button>
                  </div>
                  <div className="siret-aide">{controle}</div>
                  {resultats && (
                    <div className="resultats">
                      {resultats.length ? (
                        resultats.map((e) => (
                          <div className="resultat" key={e.siren}>
                            <div>
                              <b>{e.nom}</b>
                              <span>
                                {e.forme_juridique ? `${e.forme_juridique} · ` : ''}SIRET{' '}
                                <span className="num" style={{ display: 'inline' }}>
                                  {formaterSiret(e.siret ?? e.siren)}
                                </span>{' '}
                                ·{' '}
                                <span className="actif" style={{ display: 'inline', color: e.fermee ? 'var(--rouge)' : undefined }}>
                                  {e.fermee ? 'Fermée' : 'En activité'}
                                </span>
                              </span>
                              <span>
                                {[e.activite, [e.adresse, e.code_postal, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                            <button className="btn petit plein" type="button" onClick={() => prendre(e)}>
                              Choisir
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="resultat">
                          <div>
                            <b>Aucune entreprise trouvée</b>
                            <span>Vérifiez le numéro, ou remplissez les champs à la main.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="champs">
                  <div className="large">
                    <div className="etiq">Raison sociale</div>
                    <input className="saisie" value={cl.raison} onChange={(e) => majCl({ raison: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">SIRET</div>
                    <input
                      className="saisie num"
                      value={cl.siret}
                      onChange={(e) => {
                        const v = e.target.value;
                        const n = v.replace(/\D/g, '');
                        majCl({ siret: v, ...(n.length >= 9 && luhn(n.slice(0, 9)) ? { tvaIntra: cleTva(n.slice(0, 9)) } : {}) });
                      }}
                    />
                  </div>
                  <div>
                    <div className="etiq">
                      TVA intracommunautaire <span className="marque-auto">Calculée</span>
                    </div>
                    <input className="saisie num" value={cl.tvaIntra} onChange={(e) => majCl({ tvaIntra: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Forme juridique</div>
                    <input className="saisie" value={cl.forme} onChange={(e) => majCl({ forme: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Code NAF</div>
                    <input className="saisie" value={cl.naf} onChange={(e) => majCl({ naf: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Interlocuteur</div>
                    <input className="saisie" value={cl.contact} onChange={(e) => majCl({ contact: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">E-mail de facturation</div>
                    <input className="saisie" inputMode="email" value={cl.email} onChange={(e) => majCl({ email: e.target.value })} />
                  </div>
                  <div className="large">
                    <div className="etiq">Adresse du siège</div>
                    <input className="saisie" value={cl.adresse} onChange={(e) => majCl({ adresse: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">N° de bon de commande ou de marché</div>
                    <input className="saisie" value={cl.bdc} onChange={(e) => majCl({ bdc: e.target.value })} />
                  </div>
                  <div>
                    <div className="etiq">Téléphone</div>
                    <input className="saisie" value={cl.tel} onChange={(e) => majCl({ tel: e.target.value })} />
                  </div>
                </div>
                <div className="etiq" style={{ marginTop: 14 }}>
                  Vous intervenez comme
                </div>
                <div className="radios">
                  {(
                    [
                      ['principal', 'Entreprise principale'],
                      ['sous-traitant', 'Sous-traitant'],
                    ] as const
                  ).map(([v, lib]) => (
                    <label key={v}>
                      <input
                        type="radio"
                        name="role"
                        checked={cl.role === v}
                        onChange={() => {
                          majCl({ role: v });
                          majC({ autoliq: v === 'sous-traitant' });
                        }}
                      />{' '}
                      {lib}
                    </label>
                  ))}
                </div>
                {cl.role === 'sous-traitant' && (
                  <div className="info">
                    Sous-traitance dans le BTP : la TVA est autoliquidée. Chantio facture sans TVA et ajoute la mention de l’article 283-2 nonies du CGI.
                  </div>
                )}
              </div>
            )}

            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Chantier</h2>
              </div>
              <div className="champs">
                <div className="large">
                  <div className="etiq">Objet des travaux {lus.has('objet') && <span className="marque-ocr">Lu par OCR</span>}</div>
                  <input className={`saisie ${lus.has('objet') ? 'lu' : ''}`} value={objet} onChange={(e) => (setObjet(e.target.value), toucher())} placeholder="ex. Salle de bain : douche à l’italienne" />
                </div>
                <div className="large">
                  <label className="coche-l">
                    <input type="checkbox" checked={cl.identique} onChange={(e) => majCl({ identique: e.target.checked })} />{' '}
                    <span>Le chantier est à l’adresse de facturation</span>
                  </label>
                </div>
                {!cl.identique && (
                  <div className="large">
                    <div className="etiq">Adresse du chantier</div>
                    <input className="saisie" value={cl.adresseChantier} onChange={(e) => majCl({ adresseChantier: e.target.value })} />
                  </div>
                )}
                {facture && !numero && !initial.devis_id && props.devisSignes.length > 0 && (
                  <div>
                    <div className="etiq">
                      Devis d’origine <span className="marque-auto">Reprend les lignes</span>
                    </div>
                    <select className="saisie" defaultValue="" onChange={(e) => lierDevis(e.target.value)} disabled={enCours}>
                      <option value="">Aucun</option>
                      {props.devisSignes.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.numero} · {d.client}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <div className="etiq">Date du document</div>
                  <input className="saisie" type="date" value={date} onChange={(e) => (setDate(e.target.value), toucher())} disabled={!!numero && facture} />
                </div>
              </div>
              {!pro && (
                <div className="coches">
                  <label className="coche-l">
                    <input
                      type="checkbox"
                      checked={cl.plus2ans}
                      onChange={(e) => {
                        majCl({ plus2ans: e.target.checked });
                        setLignes((ls) => ls.map((l) => (l.titre ? l : { ...l, tva: e.target.checked ? 10 : 20 })));
                      }}
                    />{' '}
                    <span>
                      Logement achevé depuis plus de 2 ans<small>Permet la TVA à 10 % (5,5 % en rénovation énergétique)</small>
                    </span>
                  </label>
                  <label className="coche-l">
                    <input
                      type="checkbox"
                      checked={cl.domicile}
                      onChange={(e) => {
                        majCl({ domicile: e.target.checked });
                        majC({ retract: e.target.checked });
                      }}
                    />{' '}
                    <span>
                      Devis signé au domicile du client<small>Ajoute le droit de rétractation de 14 jours et son formulaire</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* 2. Ouvrages */}
          <div className="panneau" hidden={etape !== 'ouvrages'}>
            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Ouvrages et fournitures</h2>
                <span className="surtitre">
                  {nbOuvrages} ligne{nbOuvrages > 1 ? 's' : ''}
                </span>
              </div>
              {facture && tf === 'acompte' && (
                <div className="cadre-fact">
                  <div className="ligne-range">
                    <span className="etiq" style={{ margin: 0 }}>
                      Acompte demandé
                    </span>
                    <input type="range" min="5" max="100" step="5" value={pourcentage} onChange={(e) => (setPourcentage(+e.target.value), toucher())} aria-label="Pourcentage d’acompte" />
                    <b className="gros">{pourcentage} %</b>
                  </div>
                  <p>
                    Calculé sur le montant {historique?.numero ? `du devis signé ${historique.numero}` : 'du marché'}. Au-delà de 30 %, pensez à justifier
                    l’achat de matériel.
                  </p>
                </div>
              )}
              {facture && tf === 'avancement' && (
                <div className="cadre-fact">
                  <div className="ligne-range">
                    <span className="etiq" style={{ margin: 0 }}>
                      Avancement global
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={avancement}
                      onChange={(e) => (setAvancement(Math.max(avPrec, +e.target.value)), toucher())}
                      aria-label="Avancement global"
                    />
                    <b className="gros">{avancement} %</b>
                  </div>
                  <p>Déjà facturé : {String(avPrec).replace('.', ',')} %. Cette facture porte sur la différence.</p>
                  {!historique && (
                    <div className="ligne-range">
                      <span className="etiq" style={{ margin: 0 }}>
                        Déjà facturé
                      </span>
                      <input type="range" min="0" max="100" step="5" value={avPrec} onChange={(e) => (setAvPrec(+e.target.value), toucher())} aria-label="Déjà facturé" />
                      <b className="gros">{avPrec} %</b>
                    </div>
                  )}
                </div>
              )}
              {facture && tf === 'situation' && (
                <div className="cadre-fact">
                  <p>
                    <b style={{ color: 'var(--encre)' }}>
                      Situation n° {situationNumero ?? 1}, travaux au {date.split('-').reverse().join('/')}.
                    </b>{' '}
                    Réglez l’avancement cumulé de chaque ligne. Chantio déduit ce qui a été facturé dans les situations précédentes.
                  </p>
                </div>
              )}
              {facture && tf === 'solde' && (
                <div className="cadre-fact">
                  <p>
                    <b style={{ color: 'var(--encre)' }}>Décompte final.</b> Marché et travaux supplémentaires, moins l’acompte et les situations déjà
                    facturés ({String(avPrec).replace('.', ',')} %). La retenue de garantie reste due jusqu’à la fin de la garantie de parfait achèvement.
                  </p>
                  {!historique && (
                    <div className="ligne-range">
                      <span className="etiq" style={{ margin: 0 }}>
                        Déjà facturé
                      </span>
                      <input type="range" min="0" max="100" step="5" value={avPrec} onChange={(e) => (setAvPrec(+e.target.value), toucher())} aria-label="Déjà facturé" />
                      <b className="gros">{avPrec} %</b>
                    </div>
                  )}
                </div>
              )}
              {facture && tf === 'avoir' && (
                <div className="cadre-fact">
                  <div className="ligne-range">
                    <span className="etiq" style={{ margin: 0 }}>
                      Facture corrigée
                    </span>
                    <select className="saisie" style={{ flex: 1, minWidth: 180 }} value={factureId ?? ''} onChange={(e) => (setFactureId(e.target.value || null), toucher())}>
                      <option value="">Choisir la facture…</option>
                      {props.facturesValidees.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.numero} · {f.client} · {euro(f.total)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p>Gardez seulement les lignes à annuler. Les montants passent en négatif.</p>
                </div>
              )}

              <div className="lignes-tete">
                <span>Qté</span>
                <span>Unité</span>
                <span>P.U. HT</span>
                <span>TVA</span>
                <span>Total</span>
                <span />
              </div>
              <div className={`lignes ${facture && tf === 'situation' ? 'mode-situation' : ''}`}>
                {lignes.map((l, n) =>
                  l.titre ? (
                    <div key={l.cle} className={`ligne titre ${l.neuve ? 'neuve' : ''}`}>
                      <input className="des" value={l.designation} aria-label="Titre du lot" onChange={(e) => majLigne(n, { designation: e.target.value })} />
                      <button className="suppr" type="button" aria-label="Supprimer le titre" onClick={() => (setLignes((ls) => ls.filter((_, j) => j !== n)), toucher())}>
                        <Picto nom="croix" taille={16} />
                      </button>
                    </div>
                  ) : (
                    <div key={l.cle} className={`ligne ${l.neuve ? 'neuve' : ''}`}>
                      <input className="des" value={l.designation} aria-label="Désignation" onChange={(e) => majLigne(n, { designation: e.target.value })} />
                      <ChampNombre className="chf" data-k="q" aria-label="Quantité" valeur={l.quantite} format={formatQte} onChange={(v) => majLigne(n, { quantite: v })} />
                      <select data-k="u" aria-label="Unité" value={l.unite} onChange={(e) => majLigne(n, { unite: e.target.value })}>
                        {[...new Set([...UNITES, l.unite])].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                      <ChampNombre className="chf" data-k="pu" aria-label="Prix unitaire HT" valeur={l.prix_unitaire} onChange={(v) => majLigne(n, { prix_unitaire: v })} />
                      <select data-k="tva" aria-label="TVA" value={l.tva} onChange={(e) => majLigne(n, { tva: +e.target.value })}>
                        {[5.5, 10, 20].map((t) => (
                          <option key={t} value={t}>
                            {String(t).replace('.', ',')} %
                          </option>
                        ))}
                      </select>
                      <span className="tot">{euro(l.quantite * l.prix_unitaire * (facture && tf === 'avoir' ? -1 : 1))}</span>
                      <button className="suppr" type="button" aria-label="Supprimer la ligne" onClick={() => (setLignes((ls) => ls.filter((_, j) => j !== n)), toucher())}>
                        <Picto nom="corbeille" taille={16} />
                      </button>
                      <div className="av">
                        <span>Avancement cumulé</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={l.avancement ?? 0}
                          aria-label="Avancement cumulé"
                          onChange={(e) => majLigne(n, { avancement: Math.max(l.avancement_precedent ?? 0, +e.target.value) })}
                        />
                        <b>{l.avancement ?? 0} %</b>
                        <span>
                          Déjà facturé {l.avancement_precedent ?? 0} % · ce mois{' '}
                          <b className="num" style={{ minWidth: 0 }}>
                            {euro((l.quantite * l.prix_unitaire * Math.max(0, (l.avancement ?? 0) - (l.avancement_precedent ?? 0))) / 100)}
                          </b>
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="ajouts" ref={choix}>
                <button className="btn petit plein" type="button" onClick={() => (setChoixOuvert((v) => !v), setTypesOuverts(false))}>
                  <Picto nom="plus" epaisseur={2.4} />
                  Depuis le catalogue
                </button>
                <button className="btn petit" type="button" onClick={() => ajouter([{ designation: 'Nouvelle ligne', quantite: 1, unite: 'u', prix_unitaire: 0, tva: tvaParDefaut(cl) }])}>
                  Ligne libre
                </button>
                <button className="btn petit" type="button" onClick={() => ajouter([{ titre: true, designation: 'Nouveau lot', quantite: 0, unite: 'u', prix_unitaire: 0, tva: 10 }])}>
                  Titre de lot
                </button>
                <button className="btn petit" type="button" onClick={() => (setTypesOuverts((v) => !v), setChoixOuvert(false))}>
                  Ouvrage type
                </button>
                {choixOuvert && (
                  <div className="carte choix-cat">
                    <input
                      type="search"
                      autoFocus
                      placeholder="Chercher un article : ballon, mitigeur, heure…"
                      aria-label="Chercher dans le catalogue"
                      value={rechercheCat}
                      onChange={(e) => setRechercheCat(e.target.value)}
                    />
                    <ul>
                      {catalogueFiltre.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => {
                              ajouter([
                                {
                                  designation: a.designation,
                                  quantite: 1,
                                  unite: a.unite,
                                  prix_unitaire: a.prix_vente,
                                  tva: pro ? 20 : a.tva,
                                  article_id: a.id,
                                },
                              ]);
                              setChoixOuvert(false);
                              setRechercheCat('');
                            }}
                          >
                            <div>
                              {a.designation}
                              <span>
                                {a.categorie} · {a.unite}
                              </span>
                            </div>
                            <em>{euro(a.prix_vente)}</em>
                          </button>
                        </li>
                      ))}
                      {!catalogueFiltre.length && (
                        <li style={{ padding: 10, color: 'var(--gris)' }}>
                          {articles.length ? 'Aucun article. Ajoutez une ligne libre.' : 'Catalogue vide. '}
                          {!articles.length && (
                            <Link href="/devis/catalogue" style={{ color: 'var(--cobalt)', fontWeight: 700 }}>
                              Remplir le catalogue
                            </Link>
                          )}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {typesOuverts && (
                  <div className="carte choix-cat">
                    <ul>
                      {OUVRAGES_TYPES.map((o) => (
                        <li key={o.nom}>
                          <button
                            type="button"
                            onClick={() => {
                              ajouter(o.lignes.map((l) => ({ ...l, tva: tvaParDefaut(cl) })));
                              setTypesOuverts(false);
                              annoncer(`Ouvrage ajouté : ${o.nom}`);
                            }}
                          >
                            <div>
                              {o.nom}
                              <span>{o.lignes.filter((l) => !l.titre).length} lignes</span>
                            </div>
                            <em>{euro(o.lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0))}</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="champs" style={{ marginTop: 14 }}>
                <div>
                  <div className="etiq">Remise commerciale</div>
                  <select className="saisie" value={remise} onChange={(e) => (setRemise(+e.target.value), toucher())}>
                    {[...new Set([0, 3, 5, 10, 15, remise])].map((r) => (
                      <option key={r} value={r}>
                        {r ? `${String(r).replace('.', ',')} %` : 'Aucune'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Conditions */}
          <div className="panneau" hidden={etape !== 'conditions'}>
            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Délais</h2>
              </div>
              <div className="champs">
                {!facture && (
                  <div>
                    <div className="etiq">Validité du devis</div>
                    <select className="saisie" value={c.validite} onChange={(e) => majC({ validite: e.target.value })}>
                      {[...new Set(['1 mois', '2 mois', '3 mois', c.validite])].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <div className="etiq">Début des travaux</div>
                  <input className="saisie" value={c.debut} onChange={(e) => majC({ debut: e.target.value })} />
                </div>
                <div>
                  <div className="etiq">Durée prévue</div>
                  <input className="saisie" value={c.duree} onChange={(e) => majC({ duree: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Paiement</h2>
              </div>
              <div className="champs">
                <div className="large">
                  <div className="etiq">Échéancier</div>
                  <select className="saisie" value={c.echeancier} onChange={(e) => majC({ echeancier: e.target.value as ConditionsDocument['echeancier'] })}>
                    <option value="acompte">Acompte à la commande, solde à la réception</option>
                    <option value="303040">30 % à la commande, 40 % à mi-chantier, 30 % à la réception</option>
                    <option value="situations">Situations mensuelles selon l’avancement</option>
                    <option value="fin">Totalité à la réception des travaux</option>
                  </select>
                </div>
                {c.echeancier === 'acompte' && (
                  <div>
                    <div className="etiq">Acompte à la commande</div>
                    <select className="saisie" value={c.acompte} onChange={(e) => majC({ acompte: e.target.value })}>
                      {['20', '30', '40', '50'].map((v) => (
                        <option key={v} value={v}>
                          {v} %
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <div className="etiq">Délai de paiement</div>
                  <select className="saisie" value={c.delai} onChange={(e) => majC({ delai: e.target.value })}>
                    {[...new Set(['À réception de facture', '30 jours date de facture', '45 jours fin de mois', '60 jours date de facture', c.delai])].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="etiq" style={{ marginTop: 14 }}>
                Moyens de paiement acceptés
              </div>
              <div className="radios">
                {(
                  [
                    ['virement', 'Virement'],
                    ['cheque', 'Chèque'],
                    ['carte', 'Carte par lien'],
                    ['especes', 'Espèces'],
                  ] as const
                ).map(([k, lib]) => (
                  <label key={k}>
                    <input type="checkbox" checked={c[k]} onChange={(e) => majC({ [k]: e.target.checked })} /> {lib}
                  </label>
                ))}
              </div>
              <div className="regles" style={{ marginTop: 12 }}>
                <Regle
                  titre="Escompte pour paiement anticipé"
                  texte="Sinon, la mention « pas d’escompte » est ajoutée, comme l’exige la loi."
                  interrupteur={<Interrupteur label="Escompte" coche={c.escompte} onChange={(v) => majC({ escompte: v })} />}
                >
                  {c.escompte && (
                    <div className="sous deux">
                      <div>
                        <div className="etiq">Taux</div>
                        <input className="saisie" value={c.escompteTaux} onChange={(e) => majC({ escompteTaux: e.target.value })} />
                      </div>
                    </div>
                  )}
                </Regle>
                <Regle
                  titre="Réserve de propriété"
                  texte="Le matériel fourni reste à vous jusqu’au paiement complet."
                  interrupteur={<Interrupteur label="Réserve de propriété" coche={c.reserve} onChange={(v) => majC({ reserve: v })} />}
                />
                <Regle
                  titre="Pénalités de retard"
                  badge="Toujours inclus"
                  texte="Trois fois le taux d’intérêt légal. Pour un client professionnel, Chantio ajoute l’indemnité forfaitaire de 40 € pour frais de recouvrement."
                />
              </div>
            </div>

            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Garanties et retenue</h2>
              </div>
              <div className="regles">
                <Regle
                  titre="Retenue de garantie de 5 %"
                  texte="Le client garde 5 % de chaque facture jusqu’à un an après la réception (loi du 16 juillet 1971). Surtout utilisée avec les professionnels."
                  interrupteur={<Interrupteur label="Retenue de garantie" coche={c.retenue} onChange={(v) => majC({ retenue: v })} />}
                >
                  {c.retenue && (
                    <div className="sous deux">
                      <label className="coche-l">
                        <input type="checkbox" checked={c.caution} onChange={(e) => majC({ caution: e.target.checked })} />{' '}
                        <span>
                          Remplacée par une caution bancaire<small>Vous êtes payé à 100 %</small>
                        </span>
                      </label>
                    </div>
                  )}
                </Regle>
                <Regle
                  titre="Assurance décennale"
                  badge="Obligatoire"
                  texte="Nom de l’assureur, numéro de contrat et zone couverte, à afficher sur chaque devis et facture."
                  interrupteur={<Interrupteur label="Assurance décennale" coche={c.decennale} onChange={(v) => majC({ decennale: v })} />}
                >
                  {c.decennale && (
                    <div className="sous">
                      <div>
                        <div className="etiq">Assureur</div>
                        <input className="saisie" value={c.assureur} onChange={(e) => majC({ assureur: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">N° de contrat</div>
                        <input className="saisie" value={c.contrat} onChange={(e) => majC({ contrat: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">Zone couverte</div>
                        <input className="saisie" value={c.zone} onChange={(e) => majC({ zone: e.target.value })} />
                      </div>
                    </div>
                  )}
                </Regle>
                <Regle
                  titre="Garanties légales"
                  texte="Parfait achèvement 1 an, bon fonctionnement 2 ans pour les équipements (robinetterie, ballon, chaudière), décennale 10 ans."
                />
              </div>
            </div>

            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>TVA et aides</h2>
              </div>
              <div className="regles">
                {!pro ? (
                  <Regle
                    titre="Attestation de TVA réduite"
                    texte="Le client la signe pour la TVA à 10 % ou 5,5 %. Chantio la joint au devis, préremplie."
                    interrupteur={<Interrupteur label="Attestation de TVA" coche={c.attTva} onChange={(v) => majC({ attTva: v })} />}
                  />
                ) : (
                  <Regle
                    titre="Autoliquidation de la TVA"
                    texte="Pour la sous-traitance : facture hors taxe, la TVA est déclarée par l’entreprise principale."
                    interrupteur={<Interrupteur label="Autoliquidation" coche={c.autoliq} onChange={(v) => majC({ autoliq: v })} />}
                  />
                )}
                <Regle
                  titre="Prime déduite (MaPrimeRénov’, CEE)"
                  texte="Affiche le montant de l’aide et le reste à payer par le client. Réservé aux entreprises RGE."
                  interrupteur={<Interrupteur label="Prime déduite" coche={c.aide} onChange={(v) => majC({ aide: v })} />}
                >
                  {c.aide && (
                    <div className="sous">
                      <div>
                        <div className="etiq">Montant de la prime</div>
                        <input className="saisie" inputMode="decimal" value={c.aideMontant} onChange={(e) => majC({ aideMontant: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">Organisme</div>
                        <input className="saisie" value={c.aideOrga} onChange={(e) => majC({ aideOrga: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">N° RGE</div>
                        <input className="saisie" value={c.rge} onChange={(e) => majC({ rge: e.target.value })} />
                      </div>
                    </div>
                  )}
                </Regle>
              </div>
            </div>

            <div className="carte bloc">
              <div className="bloc-titre">
                <h2>Prix et chantier</h2>
              </div>
              <div className="regles">
                <Regle
                  titre="Prix révisables"
                  texte="Les prix suivent un indice du bâtiment publié par l’Insee. Sinon, ils sont fermes et non révisables."
                  interrupteur={<Interrupteur label="Prix révisables" coche={c.revision} onChange={(v) => majC({ revision: v })} />}
                >
                  {c.revision && (
                    <div className="sous deux">
                      <div>
                        <div className="etiq">Indice</div>
                        <select className="saisie" value={c.indice} onChange={(e) => majC({ indice: e.target.value })}>
                          <option>BT38 Plomberie sanitaire</option>
                          <option>BT40 Chauffage central</option>
                          <option>BT41 Ventilation et climatisation</option>
                        </select>
                      </div>
                      <div>
                        <div className="etiq">Mois de référence</div>
                        <input className="saisie" value={c.moisRef} placeholder="ex. septembre 2026" onChange={(e) => majC({ moisRef: e.target.value })} />
                      </div>
                    </div>
                  )}
                </Regle>
                <Regle
                  titre="Gestion des déchets"
                  badge="Obligatoire sur le devis"
                  texte="Quantité estimée, lieu de dépôt et coût, depuis le 1er juillet 2021."
                  interrupteur={<Interrupteur label="Gestion des déchets" coche={c.dechets} onChange={(v) => majC({ dechets: v })} />}
                >
                  {c.dechets && (
                    <div className="sous">
                      <div>
                        <div className="etiq">Quantité estimée</div>
                        <input className="saisie" value={c.dechetsQte} onChange={(e) => majC({ dechetsQte: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">Point de collecte</div>
                        <input className="saisie" value={c.dechetsLieu} onChange={(e) => majC({ dechetsLieu: e.target.value })} />
                      </div>
                      <div>
                        <div className="etiq">Coût</div>
                        <input className="saisie" value={c.dechetsCout} onChange={(e) => majC({ dechetsCout: e.target.value })} />
                      </div>
                    </div>
                  )}
                </Regle>
                {pro && (
                  <>
                    <Regle
                      titre="Compte prorata"
                      texte="Partage des dépenses communes du chantier entre les entreprises (eau, électricité, nettoyage)."
                      interrupteur={<Interrupteur label="Compte prorata" coche={c.prorata} onChange={(v) => majC({ prorata: v })} />}
                    >
                      {c.prorata && (
                        <div className="sous deux">
                          <div>
                            <div className="etiq">Part retenue</div>
                            <input className="saisie" value={c.prorataTaux} onChange={(e) => majC({ prorataTaux: e.target.value })} />
                          </div>
                        </div>
                      )}
                    </Regle>
                    <Regle
                      titre="Pénalités de retard de chantier"
                      texte="Montant par jour de retard sur la date de fin, à la demande du maître d’ouvrage."
                      interrupteur={<Interrupteur label="Pénalités de chantier" coche={c.penExec} onChange={(v) => majC({ penExec: v })} />}
                    >
                      {c.penExec && (
                        <div className="sous deux">
                          <div>
                            <div className="etiq">Par jour calendaire</div>
                            <input className="saisie" value={c.penExecMontant} onChange={(e) => majC({ penExecMontant: e.target.value })} />
                          </div>
                        </div>
                      )}
                    </Regle>
                  </>
                )}
                {!pro && (
                  <>
                    <Regle
                      titre="Droit de rétractation de 14 jours"
                      texte="Obligatoire si le devis est signé chez le client. Les travaux ne commencent avant la fin du délai que sur sa demande écrite."
                      interrupteur={<Interrupteur label="Rétractation" coche={c.retract} onChange={(v) => majC({ retract: v })} />}
                    />
                    <Regle titre="Médiateur de la consommation" badge="Obligatoire" texte="Nom et site du médiateur auquel votre entreprise adhère.">
                      <div className="sous deux">
                        <div>
                          <div className="etiq">Médiateur</div>
                          <input className="saisie" value={c.mediateur} onChange={(e) => majC({ mediateur: e.target.value })} />
                        </div>
                      </div>
                    </Regle>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="barre-envoi">
            <div className="recap">
              <small>{facture ? (tf === 'avoir' ? 'Montant de l’avoir' : 'Net à payer') : T.aide ? 'Reste à payer' : 'Total TTC'}</small>
              <b className="num">{euro(T.net)}</b>
            </div>
            {i > 0 && (
              <button className="btn" type="button" onClick={() => montrer(ORDRE[i - 1])}>
                Précédent
              </button>
            )}
            <button className="btn" type="button" onClick={() => enregistrer(false)} disabled={enCours}>
              {enCours && <Roue />}
              Enregistrer
            </button>
            {i < 2 ? (
              <button className="btn plein" type="button" onClick={() => montrer(ORDRE[i + 1])}>
                Étape suivante
              </button>
            ) : (
              <button
                className="btn plein"
                type="button"
                disabled={enCours || !nbOuvrages}
                title={!nbOuvrages ? 'Ajoutez au moins une ligne' : numero ? 'Enregistre les modifications' : 'Donne un numéro définitif au document'}
                onClick={() => {
                  if (numero) return enregistrer(false);
                  const quoi = facture ? 'Une facture validée ne se modifie plus (on corrige par un avoir).' : 'Le devis reçoit son numéro définitif.';
                  if (window.confirm(`${libelleValider} pour ${nomClient(cl)} ? ${quoi}`)) enregistrer(true);
                }}
              >
                {enCours && <Roue />}
                {numero ? 'Enregistrer les modifications' : libelleValider}
              </button>
            )}
          </div>
        </form>

        <div className="apercu-zone">
          <div className="apercu-haut">
            <span className="direct">
              <i />
              Aperçu en direct
            </span>
            <span style={{ fontSize: 13, color: 'var(--gris)' }}>A4 · le PDF sera identique</span>
          </div>
          <div className="bureau-papier">
            <Papier d={papier} entreprise={entreprise} flash={flash} />
          </div>
        </div>
      </div>
    </Ecran>
  );
}
