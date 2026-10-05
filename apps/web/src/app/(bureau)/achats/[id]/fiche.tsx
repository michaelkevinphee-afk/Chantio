'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  achatEchu,
  ajouterJours,
  arrondi,
  ecartJours,
  euro,
  euroAchat,
  jjmmaaaaBac,
  jourParis,
  LIBELLE_RECEPTION,
  LIBELLE_STATUT_ACHAT,
  MOYENS_PAIEMENT,
  nombre,
  resteAPayer,
  TAUX_TVA_ACHAT,
  TON_STATUT_ACHAT,
  type Achat,
  type Fournisseur,
  type PaiementAchat,
  type StatutAchat,
} from '@chantio/shared';
import { BarrePleine } from '@/components/barre-pleine';
import { Fenetre } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { classeBouton, Puce } from '@/components/ui';
import { supabaseNavigateur } from '@/lib/supabase/client';
import {
  ajouterCommentaire,
  annulerPlanification,
  approuverAchat,
  contesterAchat,
  declarerPaiement,
  enregistrerAchat,
  joindrePiece,
  leverContestation,
  lireFacture,
  modifierAchat,
  planifierPaiement,
  refuserAchat,
  rouvrirAchat,
  supprimerAchat,
} from '../actions';
import { extension, fichierAccepte, FORMATS_ACHAT, genreFichier, taille } from '../fichiers';
import { ChampAchat, FenetreFournisseur } from '../fournisseur';
import { IconeAchat, type NomIconeAchat } from '../icones';
import { useLecturesEnCours } from '../imports';
import { memoireAchats } from '../memoire';
import { FenetreChoixFournisseur } from './choix-fournisseur';
import { PapierAchat } from './papier';

export type FactureFournisseurCourte = {
  id: string;
  fournisseur_id: string;
  numero: string | null;
  date_facture: string;
  montant_ttc: number;
  statut: StatutAchat;
  avoir: boolean;
};

type Resultat = { ok: true } | { ok: false; erreur: string };
type Vue = 'facture' | 'commentaires' | 'paiement';
type FenetreOuverte = null | 'contester' | 'planifier' | 'refuser' | 'supprimer' | 'choix' | 'fournisseur' | 'nouveau';

/** Champs modifiables d'une facture « Reçu ». */
type Formulaire = {
  fournisseur_id: string;
  numero: string;
  delai_paiement: string;
  date_facture: string;
  echeance: string;
  montant_ht: string;
  taux_tva: string;
  montant_tva: string;
  responsable_id: string;
  intervention_id: string;
};

const RETOUR = '/achats';
const LIBELLE_FERMER = 'Fermer et revenir aux factures fournisseurs';
/** 76.92 → « 76,92 » ; vide à zéro (nbS() du bac). */
const prix = (n: number | null | undefined) => (n ? String(arrondi(Number(n))).replace('.', ',') : '');
const date = (iso: string | null | undefined) => (iso ? jjmmaaaaBac(iso.slice(0, 10)) : '—');
const initiales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?';
const heureParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function formulaireDe(a: Achat): Formulaire {
  return {
    fournisseur_id: a.fournisseur_id ?? '',
    numero: a.numero ?? '',
    delai_paiement: a.delai_paiement != null ? String(a.delai_paiement) : '',
    date_facture: a.date_facture,
    echeance: a.echeance ?? '',
    montant_ht: prix(a.montant_ht),
    taux_tva: String(Number(a.taux_tva)),
    montant_tva: prix(a.montant_tva),
    responsable_id: a.responsable_id ?? '',
    intervention_id: a.intervention_id ?? '',
  };
}

function donnees(f: Formulaire, avoir: boolean) {
  const d = new FormData();
  for (const [k, v] of Object.entries(f)) d.set(k, v);
  d.set('avoir', avoir ? 'on' : '');
  return d;
}

/** Carte blanche de la colonne de droite, titre avec picto. */
/** Bouton de la barre d'actions du bas ; le principal est en dernier. */
function BoutonBas({ children, onClick, principal, disabled }: { children: ReactNode; onClick: () => void; principal?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classeBouton(principal ? 'principal' : 'secondaire', 'px-4 py-2.5')}>
      {children}
    </button>
  );
}

function Carte({ icone, titre, action, children, className = '' }: { icone?: NomIconeAchat; titre?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`af-carte ${className}`}>
      {titre && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>
            {icone && <IconeAchat nom={icone} taille={22} className="shrink-0" />}
            {titre}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Bandeau({ ton, titre, children }: { ton: 'violet' | 'rouge' | 'vert' | 'gris'; titre: ReactNode; children?: ReactNode }) {
  return (
    <div className={`af-ban ${ton}`}>
      <b>{titre}</b>
      {children}
    </div>
  );
}

/** Fenêtre de confirmation du bac (« Supprimer cette facture ? », « Refuser cette facture ? »). */
function Confirmation({ titre, texte, bouton, onConfirmer, fermer, enCours }: { titre: string; texte: string; bouton: string; onConfirmer: () => void; fermer: () => void; enCours: boolean }) {
  return (
    <Fenetre
      titre={titre}
      fermer={fermer}
      sansCroix
      pied={
        <>
          <button type="button" data-fermer className={classeBouton('secondaire', 'px-4 py-2.5')}>
            Annuler
          </button>
          <button type="button" autoFocus onClick={onConfirmer} disabled={enCours} className={classeBouton('danger', 'px-4 py-2.5')}>
            {enCours && <Roue />}
            {bouton}
          </button>
        </>
      }
    >
      <p className="text-[15px]">{texte}</p>
    </Fenetre>
  );
}

/**
 * Fiche plein écran d'une facture fournisseur, comme le bac : le document à gauche, à droite les onglets
 * « Facture » et « Commentaires », et en bas la barre d'actions selon l'état de la facture
 * (Reçu → Approuver → À payer → Planifier le paiement → Payée ; Contester → En attente…).
 */
export function FicheAchat({
  achat,
  fournisseurs,
  factures,
  membres,
  chantiers,
  paiements,
  commentaires,
  doublon,
  lien,
  pieces,
  entreprise,
  lecture,
  jour,
  entrepriseId,
  payer,
}: {
  achat: Achat;
  fournisseurs: Fournisseur[];
  factures: FactureFournisseurCourte[];
  membres: { id: string; nom: string }[];
  chantiers: { id: string; libelle: string }[];
  paiements: PaiementAchat[];
  commentaires: { id: string; texte: string; cree_le: string; auteur: string }[];
  doublon: { id: string; texte: string } | null;
  lien: string | null;
  pieces: { chemin: string; nom: string; taille: number; lien: string | null }[];
  entreprise: { nom: string; adresse: string | null };
  lecture: boolean;
  jour: string;
  entrepriseId: string;
  payer: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const st = achat.statut;
  const paye = arrondi(paiements.reduce((s, p) => s + Number(p.montant), 0));
  const reste = resteAPayer(achat, paye);
  const peutPayer = reste > 0 && (st === 'a_payer' || st === 'planifie');

  const [vue, setVue] = useState<Vue>(payer && peutPayer ? 'paiement' : 'facture');
  const [fen, setFen] = useState<FenetreOuverte>(null);
  const [f, setF] = useState<Formulaire>(() => formulaireDe(achat));
  // Après une relecture, les champs reprennent les valeurs lues dès que la page revient.
  const [relecture, setRelecture] = useState<'non' | 'en_cours' | 'a_reprendre'>('non');
  const [achatVu, setAchatVu] = useState(achat);
  if (achat !== achatVu) {
    setAchatVu(achat);
    if (relecture === 'a_reprendre') {
      setRelecture('non');
      setF(formulaireDe(achat));
    }
  }
  const [motif, setMotif] = useState('');
  const [plan, setPlan] = useState({ date: achat.echeance && achat.echeance >= jour ? achat.echeance : jour, moyen: achat.moyen_prevu ?? 'Virement' });
  const [paiement, setPaiement] = useState({ moyen: achat.moyen_prevu ?? 'Virement', montant: prix(reste), date: jour });
  // Le formulaire repart à chaque ouverture du moyen prévu, du reste à payer et du jour, comme paiementA() du bac
  // (après un paiement partiel, le solde est proposé, pas le montant tapé la fois d'avant).
  const ouvrirPaiement = () => {
    setPaiement({ moyen: achat.moyen_prevu ?? 'Virement', montant: prix(reste), date: jour });
    setVue('paiement');
  };
  // Fenêtres « Contester » et « Planifier le paiement » : vides ou préremplies à neuf à chaque ouverture, comme le bac.
  const ouvrirContester = () => {
    setMotif('');
    setFen('contester');
  };
  const ouvrirPlanifier = () => {
    setPlan({ date: achat.echeance && achat.echeance >= jour ? achat.echeance : jour, moyen: achat.moyen_prevu ?? 'Virement' });
    setFen('planifier');
  };
  const [commentaire, setCommentaire] = useState('');
  const champPiece = useRef<HTMLInputElement>(null);
  const champCommentaire = useRef<HTMLTextAreaElement>(null);
  // Enregistrements automatiques, l'un après l'autre ; les actions attendent qu'ils soient finis.
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const dernier = useRef(JSON.stringify(formulaireDe(achat)));
  const lectures = useLecturesEnCours();

  const recu = st === 'recu';
  const fournisseur = fournisseurs.find((x) => x.id === (recu ? f.fournisseur_id : achat.fournisseur_id)) ?? null;
  const nomF = fournisseur?.nom ?? 'Fournisseur à vérifier';
  const numero = recu ? f.numero.trim() : (achat.numero ?? '');
  const ht = recu ? arrondi(nombre(f.montant_ht)) : Number(achat.montant_ht);
  const tva = recu ? arrondi(nombre(f.montant_tva)) : Number(achat.montant_tva);
  const ttc = arrondi(ht + tva);
  const ecartLu = achat.ttc_lu != null && Math.abs(Number(achat.ttc_lu) - ttc) > 0.05;
  const enLecture = relecture === 'en_cours' || lectures.has(achat.id);

  // « ?payer=1 » ne sert qu'à l'ouverture : on le retire de l'adresse.
  useEffect(() => {
    if (!payer) return;
    const u = new URL(window.location.href);
    u.searchParams.delete('payer');
    window.history.replaceState(null, '', u.searchParams.size ? `${u.pathname}?${u.searchParams}` : u.pathname);
  }, [payer]);

  const noterRetour = () => {
    memoireAchats.retour = true;
    memoireAchats.id = achat.id;
  };
  const fermer = () => {
    noterRetour();
    router.push(RETOUR);
  };
  // Échap referme la fiche (sauf quand une fenêtre est ouverte : elle se ferme d'abord).
  const fermerRef = useRef(fermer);
  useEffect(() => {
    fermerRef.current = fermer;
  });
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')) fermerRef.current();
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, []);

  // ---------- Enregistrement automatique (facture « Reçu ») ----------
  const enregistrer = (n: Formulaire, avoir = achat.avoir) => {
    const cle = JSON.stringify(n);
    if (cle === dernier.current && avoir === achat.avoir) return file.current;
    dernier.current = cle;
    file.current = file.current.then(async () => {
      const r = await enregistrerAchat(achat.id, donnees(n, avoir));
      if (!r.ok) annoncer(r.erreur, 'erreur');
      return r;
    });
    return file.current;
  };
  const changer = (p: Partial<Formulaire>, sauver = true) => {
    const n = { ...f, ...p };
    setF(n);
    if (sauver) enregistrer(n);
  };
  const tvaDe = (htTexte: string, taux: string) => prix(arrondi((nombre(htTexte) * Number(taux)) / 100));

  const lancer = (fn: () => Promise<Resultat>, message?: string, apres?: () => void) =>
    demarrer(async () => {
      await file.current;
      const r = await fn();
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      if (message) annoncer(message);
      setFen(null);
      if (apres) apres();
      else router.refresh();
    });

  const relire = () => {
    setRelecture('en_cours');
    demarrer(async () => {
      await file.current;
      const r = await lireFacture(achat.id);
      if (!r.ok) {
        setRelecture('non');
        return annoncer(r.erreur, 'erreur');
      }
      setRelecture('a_reprendre');
      router.refresh();
    });
  };

  const approuver = () => {
    const manque: [string, string] | null = !f.fournisseur_id
      ? ['af-fchoix', 'Choisissez le fournisseur.']
      : !f.numero.trim()
        ? ['af-num', 'Indiquez le numéro de la facture.']
        : !f.date_facture
          ? ['af-date', 'Indiquez la date de facturation.']
          : !(nombre(f.montant_ht) > 0)
            ? ['af-ht', 'Indiquez le total HT.']
            : null;
    if (manque) {
      annoncer(manque[1], 'erreur');
      document.getElementById(manque[0])?.focus();
      return;
    }
    lancer(() => approuverAchat(achat.id, donnees(f, achat.avoir)), 'Facture approuvée : elle passe dans « À payer »');
  };

  const choisirFournisseur = (id: string, delai: number) => {
    // Comme le bac : le délai habituel du fournisseur, sauf s'il a été lu sur la facture.
    const garderDelai = achat.lecture === 'ia' && f.delai_paiement !== '';
    const n: Formulaire = garderDelai
      ? { ...f, fournisseur_id: id }
      : { ...f, fournisseur_id: id, delai_paiement: String(delai), echeance: f.date_facture ? ajouterJours(f.date_facture, delai) : f.echeance };
    setF(n);
    setFen(null);
    demarrer(async () => {
      await enregistrer(n);
      annoncer('Fournisseur choisi');
      router.refresh();
    });
  };

  const declarer = () => {
    const m = arrondi(nombre(paiement.montant));
    if (!(m > 0)) {
      annoncer('Indiquez le montant payé.', 'erreur');
      document.getElementById('ap-mt')?.focus();
      return;
    }
    if (m > reste + 0.01) {
      annoncer(`Le montant dépasse le reste à payer (${euro(reste)}).`, 'erreur');
      document.getElementById('ap-mt')?.focus();
      return;
    }
    if (!paiement.date) {
      annoncer('Indiquez la date du paiement.', 'erreur');
      document.getElementById('ap-date')?.focus();
      return;
    }
    demarrer(async () => {
      const r = await declarerPaiement(achat.id, paiement.moyen, String(m), paiement.date);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(
        r.statut === 'payee'
          ? `${achat.avoir ? 'Avoir remboursé' : 'Facture payée'} : elle passe dans « Terminé »`
          : `Paiement partiel déclaré : il reste ${euro(arrondi(reste - m))} TTC`,
      );
      setVue('facture');
      router.refresh();
    });
  };

  const joindre = (liste: FileList | null) => {
    const tous = Array.from(liste ?? []);
    if (!tous.length) return;
    const valides = tous.filter(fichierAccepte);
    if (!valides.length) return annoncer('PDF ou photo, 20 Mo au plus', 'erreur');
    demarrer(async () => {
      for (const fichier of valides) {
        const chemin = `${entrepriseId}/achats/pieces/${crypto.randomUUID()}.${extension(fichier)}`;
        const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, fichier, { contentType: fichier.type || undefined });
        if (error) return annoncer('Envoi impossible, réessayez', 'erreur');
        const r = await joindrePiece(achat.id, { chemin, nom: fichier.name, taille: fichier.size });
        if (!r.ok) return annoncer(r.erreur, 'erreur');
      }
      annoncer(valides.length > 1 ? `${valides.length} fichiers liés à la facture` : 'Fichier lié à la facture');
      router.refresh();
    });
  };

  const commenter = () => {
    const t = commentaire.trim();
    if (!t) return champCommentaire.current?.focus();
    demarrer(async () => {
      const r = await ajouterCommentaire(achat.id, t);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setCommentaire('');
      router.refresh();
      champCommentaire.current?.focus();
    });
  };

  // ---------- Colonne du document ----------
  const pdf = /pdf/i.test(`${achat.fichier_type ?? ''}${achat.fichier_nom ?? ''}`);
  const tete = achat.fichier_nom ? (
    <div className="flex items-center gap-2.5 rounded-xl border border-trait bg-white px-3.5 py-2.5 text-sm">
      <IconeAchat nom="fic" taille={22} className="shrink-0 text-cobalt" />
      <span className="min-w-0">
        {lien ? (
          <a href={lien} target="_blank" rel="noreferrer" className="block truncate font-bold hover:underline">
            {achat.fichier_nom}
          </a>
        ) : (
          <b className="block truncate">{achat.fichier_nom}</b>
        )}
        <small className="text-gris">
          {genreFichier(achat.fichier_nom, achat.fichier_type)}
          {achat.fichier_taille ? ` · ${taille(achat.fichier_taille)}` : ''}
        </small>
      </span>
    </div>
  ) : achat.reception === 'electronique' ? (
    <div className="flex items-center gap-2.5 rounded-xl border border-trait bg-white px-3.5 py-2.5 text-sm">
      <IconeAchat nom="eclair" taille={22} className="shrink-0 text-cobalt" />
      <span className="min-w-0">
        <b className="block">Facture électronique (Factur-X)</b>
        <small className="text-gris">Reçue par Super PDP · données lues directement</small>
      </span>
    </div>
  ) : null;
  const papier = (
    <PapierAchat
      achat={{
        numero,
        date_facture: recu ? f.date_facture : achat.date_facture,
        echeance: recu ? f.echeance : (achat.echeance ?? ''),
        avoir: achat.avoir,
        montant_ht: ht,
        taux_tva: recu ? Number(f.taux_tva) : Number(achat.taux_tva),
        montant_tva: tva,
        reception: achat.reception,
        lignes: achat.lignes ?? [],
      }}
      fournisseur={fournisseur}
      entreprise={entreprise}
    />
  );
  const documentFacture = (
    <>
      {tete}
      {lien ? (
        pdf ? (
          <iframe src={`${lien}#toolbar=0&view=FitH`} title={`Facture ${numero} de ${nomF}`} className="min-h-[70vh] w-full flex-1 rounded border-0 bg-white max-[1100px]:min-h-[60vh]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lien} alt={`Facture ${numero} de ${nomF}`} className="block h-auto w-full rounded bg-white shadow-[0_12px_30px_-18px_rgb(16_26_61/0.5)]" />
        )
      ) : achat.fichier_chemin && !ht && !(achat.lignes ?? []).length ? (
        <div className="px-4 py-10 text-center text-gris">L’aperçu de ce document n’est pas disponible.</div>
      ) : (
        <>
          {achat.fichier_nom && <p className="text-[13.5px] text-gris">Aperçu reconstitué à partir des informations de la facture.</p>}
          {papier}
        </>
      )}
    </>
  );

  // ---------- Cartes de la colonne de droite ----------
  const carteFournisseur = (edit: boolean) => (
    <Carte icone="four" titre="Fournisseur">
      {fournisseur ? (
        <>
          <b className="text-lg">{fournisseur.nom}</b>
          <p className="text-gris">{fournisseur.adresse || 'Adresse à compléter'}</p>
          <p className="text-gris">
            SIRET : {fournisseur.siret || '—'} <span aria-hidden="true">|</span> TVA : {fournisseur.tva_intracom || '—'}
          </p>
        </>
      ) : (
        <p className="text-gris">Aucun fournisseur reconnu sur ce document.</p>
      )}
      {edit && (
        <div className="mt-1 flex flex-wrap gap-2.5">
          {fournisseur && (
            <button type="button" id="af-fmod" onClick={() => setFen('fournisseur')} className={classeBouton('secondaire', 'px-4 py-2.5')}>
              Modifier les informations
            </button>
          )}
          <button type="button" id="af-fchoix" onClick={() => setFen('choix')} className={classeBouton('secondaire', 'px-4 py-2.5')}>
            {fournisseur ? 'Choisir un autre fournisseur' : 'Choisir le fournisseur'}
          </button>
        </div>
      )}
    </Carte>
  );

  const banLecture = () => {
    const relancer =
      lecture && achat.fichier_chemin ? (
        <button type="button" onClick={relire} disabled={enCours} className="af-lien">
          {achat.lecture ? 'Relancer la lecture' : 'Lire la facture'}
        </button>
      ) : null;
    if (enLecture)
      return (
        <Bandeau
          ton="gris"
          titre={
            <>
              <span className="im-rond mr-1.5 inline-block !h-3.5 !w-3.5 !border-2 align-[-2px]" aria-hidden="true" /> Lecture de la facture en cours…
            </>
          }
        >
          Les champs se remplissent tout seuls dans un instant.
        </Bandeau>
      );
    if (achat.lecture === 'ia')
      return (
        <Bandeau ton="violet" titre="Lue automatiquement">
          Vérifiez le fournisseur, les montants et les dates avec le document avant d’approuver.
          {relancer}
        </Bandeau>
      );
    if (achat.reception === 'electronique')
      return (
        <Bandeau ton="vert" titre="Facture électronique">
          Les informations viennent directement du fournisseur, sans erreur de lecture possible.
        </Bandeau>
      );
    if (achat.lecture === 'pas_facture')
      return (
        <Bandeau ton="rouge" titre="Ce document ne ressemble pas à une facture">
          Vérifiez le fichier, ou supprimez-le avec la corbeille en haut.
          {relancer}
        </Bandeau>
      );
    if (achat.lecture === 'manuel')
      return (
        <Bandeau ton="gris" titre="Lecture automatique indisponible ici">
          Complétez les champs à partir du document.
          {relancer}
        </Bandeau>
      );
    if (relancer)
      return (
        <Bandeau ton="gris" titre="Facture pas encore lue">
          Lancez la lecture, ou complétez les champs à partir du document.
          {relancer}
        </Bandeau>
      );
    return null;
  };

  const formulaire = (
    <>
      {banLecture()}
      {doublon && (
        <Bandeau ton="rouge" titre="Doublon possible">
          <span>
            {doublon.texte}{' '}
            <Link href={`/achats/${doublon.id}`} className="font-extrabold text-cobalt hover:underline">
              La voir
            </Link>
          </span>
        </Bandeau>
      )}
      {carteFournisseur(true)}
      <Carte icone="doc" titre="Informations de la facture">
        <div className="af-g2">
          <ChampAchat libelle="Numéro de facture">
            <input id="af-num" type="text" autoComplete="off" value={f.numero} onChange={(e) => changer({ numero: e.target.value }, false)} onBlur={() => enregistrer(f)} />
          </ChampAchat>
          <ChampAchat libelle="Délai de paiement">
            <span className="af-suf">
              <input
                id="af-delai"
                type="number"
                min={0}
                max={365}
                step={1}
                inputMode="numeric"
                value={f.delai_paiement}
                onChange={(e) => {
                  const v = e.target.value;
                  const d = Math.max(0, Math.round(nombre(v)));
                  changer({ delai_paiement: v, ...(v !== '' && f.date_facture ? { echeance: ajouterJours(f.date_facture, d) } : {}) }, false);
                }}
                onBlur={() => enregistrer(f)}
              />
              <span>jours</span>
            </span>
          </ChampAchat>
          <ChampAchat libelle="Date de facturation">
            <input
              id="af-date"
              type="date"
              value={f.date_facture}
              onChange={(e) => {
                const v = e.target.value || f.date_facture;
                changer({ date_facture: v, ...(f.delai_paiement !== '' ? { echeance: ajouterJours(v, Math.max(0, Math.round(nombre(f.delai_paiement)))) } : {}) });
              }}
            />
          </ChampAchat>
          <ChampAchat libelle="Date d’échéance">
            <input
              id="af-ech"
              type="date"
              value={f.echeance}
              onChange={(e) => {
                const v = e.target.value;
                changer({ echeance: v, ...(v && f.date_facture ? { delai_paiement: String(Math.max(0, ecartJours(f.date_facture, v))) } : {}) });
              }}
            />
          </ChampAchat>
          <ChampAchat libelle="Total HT">
            <span className="af-suf">
              <input
                id="af-ht"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={f.montant_ht}
                onChange={(e) => changer({ montant_ht: e.target.value, montant_tva: tvaDe(e.target.value, f.taux_tva) }, false)}
                onBlur={() => enregistrer(f)}
              />
              <span>EUR</span>
            </span>
          </ChampAchat>
          <ChampAchat libelle="Taux de TVA">
            <select id="af-taux" value={f.taux_tva} onChange={(e) => changer({ taux_tva: e.target.value, montant_tva: tvaDe(f.montant_ht, e.target.value) })}>
              {TAUX_TVA_ACHAT.map(([t, l]) => (
                <option key={t} value={String(t)}>
                  {l}
                </option>
              ))}
            </select>
          </ChampAchat>
          <ChampAchat libelle="Montant de la TVA">
            <span className="af-suf">
              <input id="af-tva" type="text" inputMode="decimal" autoComplete="off" value={f.montant_tva} onChange={(e) => changer({ montant_tva: e.target.value }, false)} onBlur={() => enregistrer(f)} />
              <span>EUR</span>
            </span>
          </ChampAchat>
          <div className="flex flex-col gap-1 text-[13.5px] font-bold">
            <span>Total TTC</span>
            <b className="pt-1.5 text-xl font-extrabold tabular-nums" aria-live="polite">
              {euroAchat(achat, ttc)}
            </b>
          </div>
        </div>
        {ecartLu && (
          <p className="af-ban rouge">
            <b>À vérifier</b>
            Le total lu sur la facture est de {euro(Number(achat.ttc_lu))} TTC : il ne correspond pas au total HT plus la TVA.
          </p>
        )}
      </Carte>
      <Carte icone="lien" titre="Suivi">
        <div className="af-g2">
          <ChampAchat libelle="Responsable">
            <select id="af-resp" value={f.responsable_id} onChange={(e) => changer({ responsable_id: e.target.value })}>
              <option value="">Personne</option>
              {membres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </ChampAchat>
          <ChampAchat libelle="Chantier" aide="Pour suivre la marge réelle du chantier.">
            <select id="af-ch" value={f.intervention_id} onChange={(e) => changer({ intervention_id: e.target.value })}>
              <option value="">Aucun (frais généraux)</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </ChampAchat>
        </div>
      </Carte>
    </>
  );

  const barreReste = (
    <div className="flex flex-col gap-2.5 rounded-xl bg-fond px-4 py-3.5 text-[15px]">
      <span>
        {achat.avoir ? 'Reste à recevoir' : 'Reste à payer'} :{' '}
        <b className="font-extrabold">
          {euro(reste)} TTC · {ttc ? Math.round((reste / ttc) * 100) : 0} %
        </b>
      </span>
      <span className="af-barre" role="img" aria-label={`Payé à ${100 - (ttc ? Math.round((reste / ttc) * 100) : 0)} %`}>
        <i style={{ width: `${100 - (ttc ? Math.round((reste / ttc) * 100) : 0)}%` }} />
      </span>
    </div>
  );

  const responsable = membres.find((m) => m.id === achat.responsable_id)?.nom;
  const chantier = chantiers.find((c) => c.id === achat.intervention_id);
  const tard = achatEchu(achat, paye, jour);
  const resume = (
    <>
      {st === 'planifie' && (
        <Bandeau ton="violet" titre={`Paiement planifié le ${date(achat.planifie_le)}`}>
          {achat.moyen_prevu || 'Virement'} de {euro(reste)} TTC.
        </Bandeau>
      )}
      {st === 'suspendu' && (
        <Bandeau ton="rouge" titre="Facture contestée">
          {achat.motif ?? ''}
        </Bandeau>
      )}
      {st === 'refusee' && (
        <Bandeau ton="gris" titre="Facture refusée">
          {achat.motif ?? ''}
        </Bandeau>
      )}
      <Carte>
        <b className="text-lg">{nomF}</b>
        <div className="text-[30px] font-extrabold tracking-[-0.02em] tabular-nums">
          {euroAchat(achat, ttc)} <small className="text-base font-bold text-gris">TTC</small>
        </div>
        {st !== 'refusee' && st !== 'payee' && barreReste}
        <dl className="af-dl">
          <div>
            <dt>Montant HT</dt>
            <dd>{euroAchat(achat, ht)}</dd>
          </div>
          <div>
            <dt>Date de facturation</dt>
            <dd>{date(achat.date_facture)}</dd>
          </div>
          <div>
            <dt>Montant TVA</dt>
            <dd>
              {euroAchat(achat, tva)} ({String(Number(achat.taux_tva)).replace('.', ',')} %)
            </dd>
          </div>
          <div>
            <dt>Date d’échéance</dt>
            <dd className={tard ? 'text-[#B42318]' : ''}>
              {tard && <IconeAchat nom="horloge" taille={15} className="mr-1.5 inline align-[-2px]" />}
              {date(achat.echeance)}
            </dd>
          </div>
          <div>
            <dt>Type de facture</dt>
            <dd>{achat.avoir ? 'Avoir' : 'Standard'}</dd>
          </div>
          <div>
            <dt>Type de réception</dt>
            <dd>{LIBELLE_RECEPTION[achat.reception] ?? '—'}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{responsable ?? '—'}</dd>
          </div>
          <div>
            <dt>Chantier</dt>
            <dd>
              {chantier ? (
                <Link href={`/interventions?fiche=${chantier.id}`} className="font-extrabold text-cobalt hover:underline">
                  {chantier.libelle.replace(/ \([^)]*\)$/, '')}
                </Link>
              ) : (
                'Frais généraux'
              )}
            </dd>
          </div>
        </dl>
      </Carte>
      {carteFournisseur(false)}
      <Carte
        icone="lien"
        titre="Documents liés"
        action={
          <button type="button" onClick={() => champPiece.current?.click()} disabled={enCours} className="af-lien">
            + Ajouter un fichier
          </button>
        }
      >
        <input
          ref={champPiece}
          type="file"
          multiple
          accept={FORMATS_ACHAT}
          hidden
          onChange={(e) => {
            joindre(e.target.files);
            e.target.value = '';
          }}
        />
        {pieces.length ? (
          <ul className="flex flex-col">
            {pieces.map((p) => (
              <li key={p.chemin} className="flex items-center gap-3 border-t border-trait py-2.5 first:border-t-0">
                <IconeAchat nom="fic" taille={20} className="shrink-0 text-gris" />
                <span className="min-w-0 flex-1">
                  {p.lien ? (
                    <a href={p.lien} target="_blank" rel="noreferrer" className="break-words hover:underline">
                      {p.nom}
                    </a>
                  ) : (
                    <span className="break-words">{p.nom}</span>
                  )}
                  <small className="block text-gris">{taille(p.taille || 0)}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1.5 text-center text-gris">Ajoutez ici les fichiers que vous souhaitez associer à ce document.</p>
        )}
      </Carte>
      <Carte
        icone="histo"
        titre="Historique des paiements"
        action={
          peutPayer ? (
            <button type="button" onClick={ouvrirPaiement} className="af-lien">
              + Déclarer un paiement
            </button>
          ) : null
        }
      >
        {paiements.length ? (
          <ul className="flex flex-col">
            {paiements.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t border-trait py-2.5 first:border-t-0">
                <IconeAchat nom="vir" taille={20} className="shrink-0 text-gris" />
                <span className="min-w-0 flex-1">
                  <b>{p.moyen}</b>
                  <small className="block text-gris">
                    {achat.avoir ? 'Reçu le ' : 'Payé le '}
                    {date(p.date_paiement)}
                  </small>
                </span>
                <span className="shrink-0 rounded-[10px] bg-fond px-2.5 py-1 font-extrabold tabular-nums">{euro(Number(p.montant))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1.5 text-center text-gris">Vous n’avez pas encore déclaré de paiement pour cette facture.</p>
        )}
      </Carte>
    </>
  );

  const vuePaiement = (
    <>
      <button type="button" onClick={() => setVue('facture')} className="af-lien mt-4">
        ‹ Retour
      </button>
      <Carte icone="paie" titre="Déclarer un paiement sur cette facture">
        {barreReste}
        <ChampAchat libelle="Moyen de paiement">
          <select id="ap-moyen" autoFocus value={paiement.moyen} onChange={(e) => setPaiement({ ...paiement, moyen: e.target.value })}>
            {MOYENS_PAIEMENT.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </ChampAchat>
        <ChampAchat libelle="Montant déclaré">
          <span className="af-suf">
            <input id="ap-mt" type="text" inputMode="decimal" autoComplete="off" value={paiement.montant} onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })} />
            <span>€</span>
          </span>
        </ChampAchat>
        <ChampAchat libelle="Date de paiement">
          <input id="ap-date" type="date" value={paiement.date} onChange={(e) => setPaiement({ ...paiement, date: e.target.value })} />
        </ChampAchat>
        <button type="button" onClick={declarer} disabled={enCours} className={classeBouton('principal', 'min-h-12 w-full')}>
          {enCours && <Roue />}
          Déclarer ce paiement
        </button>
      </Carte>
    </>
  );

  const vueCommentaires = (
    <Carte icone="com" titre="Commentaires">
      {commentaires.length ? (
        <ul className="flex flex-col">
          {commentaires.map((c) => {
            const j = jourParis(c.cree_le);
            return (
              <li key={c.id} className="flex gap-2.5 border-t border-trait py-2.5 text-[14.5px] first:border-t-0">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-doux text-xs font-extrabold text-cobalt">
                  {initiales(c.auteur)}
                </span>
                <span className="min-w-0">
                  <b>{c.auteur}</b>{' '}
                  <small className="text-gris">
                    {j === jour ? 'aujourd’hui' : `le ${date(j)}`} à {heureParis.format(Date.parse(c.cree_le))}
                  </small>
                  <br />
                  <span className="break-words whitespace-pre-wrap">{c.texte}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-1.5 text-center text-gris">Aucun commentaire pour l’instant. Notez ici ce qu’il faut savoir sur cette facture.</p>
      )}
      <ChampAchat libelle="Votre commentaire">
        <textarea ref={champCommentaire} id="ac-txt" rows={3} placeholder="Ex. : livraison incomplète, voir avec le dépôt" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
      </ChampAchat>
      <button type="button" onClick={commenter} disabled={enCours} className={classeBouton('principal', 'w-full py-2.5')}>
        Ajouter le commentaire
      </button>
    </Carte>
  );

  // ---------- Barre d'actions du bas ----------
  let etat = '';
  let boutons: ReactNode = null;
  if (st === 'recu') {
    etat = `Reçue le ${date(jourParis(achat.cree_le))} · à vérifier`;
    boutons = (
      <>
        <BoutonBas
          disabled={enCours}
          onClick={() => lancer(async () => (await enregistrer(f, !achat.avoir)) as Resultat, achat.avoir ? 'Ce n’est plus un avoir' : 'Marquée comme un avoir')}
        >
          {achat.avoir ? 'Ce n’est pas un avoir' : 'Marquer comme un avoir'}
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={ouvrirContester}>
          Contester
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={approuver} principal>
          ✓ Approuver définitivement
        </BoutonBas>
      </>
    );
  } else if (st === 'a_payer') {
    etat = `Approuvée${achat.approuvee_le ? ` le ${date(achat.approuvee_le)}` : ''}`;
    boutons = (
      <>
        {!paye && (
          <BoutonBas disabled={enCours} onClick={() => lancer(() => modifierAchat(achat.id))}>
            Modifier
          </BoutonBas>
        )}
        <BoutonBas disabled={enCours} onClick={ouvrirContester}>
          Contester
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={ouvrirPlanifier}>
          Planifier le paiement
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={ouvrirPaiement} principal>
          + Déclarer un paiement
        </BoutonBas>
      </>
    );
  } else if (st === 'planifie') {
    etat = `Paiement planifié le ${date(achat.planifie_le)}`;
    boutons = (
      <>
        <BoutonBas disabled={enCours} onClick={() => lancer(() => annulerPlanification(achat.id), 'Planification annulée')}>
          Annuler la planification
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={ouvrirPaiement} principal>
          + Déclarer un paiement
        </BoutonBas>
      </>
    );
  } else if (st === 'suspendu') {
    etat = 'Contestée';
    boutons = (
      <>
        <BoutonBas disabled={enCours} onClick={() => setFen('refuser')}>
          Refuser la facture
        </BoutonBas>
        <BoutonBas disabled={enCours} onClick={() => lancer(() => leverContestation(achat.id), 'Contestation levée')} principal>
          Lever la contestation
        </BoutonBas>
      </>
    );
  } else if (st === 'refusee') {
    etat = 'Refusée';
    boutons = (
      <BoutonBas disabled={enCours} onClick={() => lancer(() => rouvrirAchat(achat.id), 'Facture rouverte : elle est de nouveau à vérifier')}>
        Rouvrir la facture
      </BoutonBas>
    );
  } else {
    const p = paiements.at(-1);
    etat = `Payée${p ? ` le ${date(p.date_paiement)}` : ''}`;
  }

  const contenu = vue === 'commentaires' ? vueCommentaires : vue === 'paiement' && peutPayer ? vuePaiement : recu ? formulaire : resume;
  const facturesDuFournisseur = (id: string | undefined) => (id ? factures.filter((x) => x.fournisseur_id === id) : []);

  return (
    <>
      {/* La croix ✕ de la barre ramène à la liste telle qu'on l'a laissée. */}
      <div className="contents" onClickCapture={(e) => (e.target as HTMLElement).closest(`a[href="${RETOUR}"]`) && noterRetour()}>
        <BarrePleine
          retour={RETOUR}
          libelleRetour={LIBELLE_FERMER}
          statut={<Puce ton={TON_STATUT_ACHAT[st]}>{LIBELLE_STATUT_ACHAT[st]}</Puce>}
          titre={
            <>
              {achat.avoir ? 'Avoir' : 'Facture'} n° {numero ? <span className="font-mono">{numero}</span> : <span className="text-gris">à compléter</span>}
            </>
          }
          gauche={
            st === 'recu' || st === 'refusee' ? (
              <button
                type="button"
                onClick={() => setFen('supprimer')}
                aria-label="Supprimer cette facture"
                title="Supprimer"
                className="grid h-10 w-10 place-items-center rounded-xl border border-trait bg-white text-cobalt transition hover:border-cobalt"
              >
                <IconeAchat nom="poub" taille={18} />
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="af-corps">
        <div className="af-doc" aria-label="Document de la facture">
          {documentFacture}
        </div>
        <div className="af-p">
          <div className="af-p-in">
            <div className="af-onglets" role="tablist" aria-label="Fiche de la facture">
              <button type="button" role="tab" aria-selected={vue !== 'commentaires'} onClick={() => setVue('facture')}>
                Facture
              </button>
              <button type="button" role="tab" aria-selected={vue === 'commentaires'} onClick={() => setVue('commentaires')}>
                Commentaires
                <span className="rounded-full bg-gris-doux px-2 py-0.5 text-xs font-extrabold text-gris tabular-nums">{commentaires.length}</span>
              </button>
            </div>
            {contenu}
          </div>
          {vue === 'facture' && (
            <div className="af-bas">
              <span className="af-etat">{etat}</span>
              {enCours && <Roue />}
              {boutons}
            </div>
          )}
        </div>
      </div>

      {fen === 'contester' && (
        <Fenetre
          titre="Contester la facture"
          texte={`Elle passe dans « En attente » le temps de régler le problème avec ${nomF}.`}
          fermer={() => setFen(null)}
          sansCroix
          pied={
            <>
              <button type="button" data-fermer className={classeBouton('secondaire', 'px-4 py-2.5')}>
                Annuler
              </button>
              <button
                type="button"
                disabled={enCours}
                className={classeBouton('principal', 'px-4 py-2.5')}
                onClick={() => {
                  if (!motif.trim()) return document.getElementById('ct-motif')?.focus();
                  lancer(() => contesterAchat(achat.id, motif), 'Facture contestée : elle passe dans « En attente »');
                }}
              >
                {enCours && <Roue />}
                Contester
              </button>
            </>
          }
        >
          <ChampAchat libelle="Ce qui ne va pas">
            <textarea id="ct-motif" rows={3} autoFocus placeholder="Ex. : un seul mitigeur livré sur les deux facturés" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </ChampAchat>
        </Fenetre>
      )}

      {fen === 'planifier' && (
        <Fenetre
          titre="Planifier le paiement"
          texte={`${euro(reste)} TTC à ${nomF}${achat.echeance ? `, échéance le ${date(achat.echeance)}` : ''}.`}
          fermer={() => setFen(null)}
          sansCroix
          pied={
            <>
              <button type="button" data-fermer className={classeBouton('secondaire', 'px-4 py-2.5')}>
                Annuler
              </button>
              <button
                type="button"
                disabled={enCours}
                className={classeBouton('principal', 'px-4 py-2.5')}
                onClick={() => {
                  if (!plan.date) return document.getElementById('pl-date')?.focus();
                  lancer(() => planifierPaiement(achat.id, plan.date, plan.moyen), `Paiement planifié le ${date(plan.date)} : la facture passe dans « En attente »`);
                }}
              >
                {enCours && <Roue />}
                Planifier
              </button>
            </>
          }
        >
          <ChampAchat libelle="Date du paiement">
            <input id="pl-date" type="date" autoFocus value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
          </ChampAchat>
          <ChampAchat libelle="Moyen de paiement">
            <select id="pl-moyen" value={plan.moyen} onChange={(e) => setPlan({ ...plan, moyen: e.target.value })}>
              {MOYENS_PAIEMENT.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </ChampAchat>
        </Fenetre>
      )}

      {fen === 'refuser' && (
        <Confirmation
          titre="Refuser cette facture ?"
          texte="Elle passe dans « Terminé », sans paiement à faire."
          bouton="Refuser la facture"
          enCours={enCours}
          fermer={() => setFen(null)}
          onConfirmer={() => lancer(() => refuserAchat(achat.id), 'Facture refusée')}
        />
      )}

      {fen === 'supprimer' && (
        <Confirmation
          titre="Supprimer cette facture ?"
          texte={`La facture ${numero} de ${nomF} sera retirée des dépenses fournisseurs.`}
          bouton="Supprimer"
          enCours={enCours}
          fermer={() => setFen(null)}
          onConfirmer={() =>
            lancer(
              () => supprimerAchat(achat.id),
              'Facture supprimée',
              () => {
                memoireAchats.retour = true;
                memoireAchats.id = null;
                router.push(RETOUR);
              },
            )
          }
        />
      )}

      {fen === 'choix' && (
        <FenetreChoixFournisseur
          fournisseurs={fournisseurs}
          actuel={f.fournisseur_id || null}
          fermer={() => setFen(null)}
          choisir={(x) => choisirFournisseur(x.id, x.delai_paiement)}
          nouveau={() => setFen('nouveau')}
        />
      )}

      {fen === 'fournisseur' && fournisseur && (
        <FenetreFournisseur fournisseur={fournisseur} factures={facturesDuFournisseur(fournisseur.id)} fermer={() => setFen(null)} />
      )}

      {fen === 'nouveau' && <FenetreFournisseur fournisseur={null} fermer={() => setFen(null)} apres={(id, delai) => choisirFournisseur(id, delai)} />}
    </>
  );
}
