'use client';

// Barre du bas de l'éditeur, comme celle du bac : texte d'état, « Aperçu » (écran étroit), menu « ⋮ »
// et un seul bouton principal selon l'état du document (actionsDoc et actionDoc du bac).

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MODELES_MAIL, dateBac, euroBac, remplirModele, type ActionDocument, type CleAction } from '@chantio/shared';
import { FenetreConfirmation } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { Bouton, classeBouton } from '@/components/ui';
import { reporterRenouvellement } from '../clients/contrats/actions';
import { changerEtat, creerAvoir, dupliquer, marquerEnvoye, supprimerDocument } from './actions';
import { FenetreFacturer } from './facturer';

export interface InfosBarre {
  id: string;
  genre: 'devis' | 'facture';
  avoir: boolean;
  numero: string | null;
  ao: boolean;
  /** « Facture », « Devis »… pour les e-mails. */
  titre: string;
  objet: string;
  net: number;
  echeance: string | null;
  email: string;
  /** Copie cachée de chaque envoi (Paramètres › E-mails), sinon vide. */
  copie: string;
  nomClient: string;
  entreprise: string;
  modeles: { objet: string; texte: string };
  clientId: string | null;
  siteId: string | null;
  contrat: { id: string; reference: string } | null;
  /** Fenêtre « Facturer » : montant HT du devis, part déjà facturée, acompte proposé. */
  facturation: { ht: number; deja: number; acompte: number };
  /** Liste où revenir après la suppression du brouillon. */
  retour: string;
}

export function BarreActions({
  infos,
  etat,
  principal,
  menu,
  apercu,
  basculerApercu,
  valider,
  avantAction,
  arreter,
  ouvrirFacturer = false,
}: {
  infos: InfosBarre;
  etat: string;
  principal: ActionDocument | null;
  menu: ActionDocument[];
  apercu: boolean;
  basculerApercu: () => void;
  /** Validation (numéro définitif), faite par l'éditeur qui a le document en main. */
  valider: () => Promise<void>;
  /** Enregistre ce qui attend avant une action ; false si l'enregistrement a échoué. */
  avantAction: () => Promise<boolean>;
  /** Plus d'enregistrement automatique (brouillon supprimé). */
  arreter: () => void;
  /** Ouvert avec ?facturer=1 (depuis « Nouvelle facture ») : la fenêtre « Facturer » s'ouvre d'emblée. */
  ouvrirFacturer?: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [facturer, setFacturer] = useState(() => ouvrirFacturer && [principal, ...menu].some((a) => a?.cle === 'facturer'));
  const [confirmer, setConfirmer] = useState(false);
  const plus = useRef<HTMLDetailsElement>(null);
  const d = infos;

  // Le menu « ⋮ » se ferme d'un clic ailleurs ou avec Échap.
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (plus.current?.open && !plus.current.contains(e.target as Node)) plus.current.open = false;
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && plus.current?.open) {
        plus.current.open = false;
        plus.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('click', clic);
      document.removeEventListener('keydown', touche);
    };
  }, []);

  const lancer = (fn: () => Promise<{ ok: boolean; erreur?: string; id?: string }>, message: string, ouvrir?: (id: string) => string) =>
    demarrer(async () => {
      if (!(await avantAction())) return;
      const r = await fn();
      if (!r.ok) return annoncer(r.erreur ?? 'Action impossible', 'erreur');
      annoncer(message);
      if (ouvrir && r.id) router.push(ouvrir(r.id));
      else router.refresh();
    });

  const courriel = (relance: boolean) => {
    const valeurs = {
      titre: d.titre,
      numero: d.numero ?? '',
      client: d.nomClient,
      objet: d.objet,
      montant: euroBac(d.net),
      echeance: dateBac(d.echeance),
      entreprise: d.entreprise,
    };
    const facture = d.genre === 'facture';
    const sujet = remplirModele(d.modeles.objet || MODELES_MAIL[facture ? 'mail_facture_objet' : 'mail_devis_objet'], valeurs).trim();
    const corps = relance
      ? facture
        ? `Bonjour,\n\nSauf erreur de notre part, la facture ${d.numero} (${euroBac(d.net)}) reste à régler. Vous la trouverez en pièce jointe.\n\nBien cordialement`
        : `Bonjour,\n\nJe me permets de revenir vers vous au sujet du devis ${d.numero} (${d.objet}). Avez-vous pu en prendre connaissance ?\n\nBien cordialement`
      : remplirModele(d.modeles.texte || MODELES_MAIL[facture ? 'mail_facture_texte' : 'mail_devis_texte'], valeurs);
    const bcc = d.copie ? `&bcc=${encodeURIComponent(d.copie)}` : '';
    window.open(`mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent(sujet)}${bcc}&body=${encodeURIComponent(corps)}`, '_self');
  };

  const action = (cle: CleAction) => {
    if (plus.current) plus.current.open = false;
    const n = d.numero ?? '';
    switch (cle) {
      case 'valider':
        return demarrer(valider);
      case 'signe':
        return lancer(() => changerEtat(d.id, 'signe'), d.ao ? `Appel d’offres gagné : le devis ${n} passe en signé` : `Devis ${n} signé`);
      case 'refuse':
        return lancer(() => changerEtat(d.id, 'refuse'), d.ao ? 'Appel d’offres marqué perdu' : `Devis ${n} refusé`);
      case 'payee':
        return lancer(() => changerEtat(d.id, 'payee'), `Facture ${n} payée`);
      case 'attente':
        return lancer(() => changerEtat(d.id, 'envoye'), d.ao ? 'Réponse remise en attente' : 'Devis remis en attente');
      case 'encaissement':
        return lancer(() => changerEtat(d.id, 'a_encaisser'), 'Encaissement annulé');
      case 'facturer':
        return void avantAction().then((ok) => ok && setFacturer(true));
      case 'intervention': {
        const p = new URLSearchParams({ nouvelle: '1', devis: d.id });
        if (d.clientId) p.set('client', d.clientId);
        if (d.siteId) p.set('site', d.siteId);
        return void avantAction().then((ok) => ok && router.push(`/interventions?${p}`));
      }
      case 'appliquer':
        if (!d.contrat) return;
        return demarrer(async () => {
          annoncer(`Contrat ${d.contrat!.reference} renouvelé`);
          await reporterRenouvellement(d.contrat!.id);
        });
      case 'avoir':
        return lancer(() => creerAvoir(d.id), 'Avoir préparé : ajustez les lignes puis finalisez', (id) => `/devis/${id}`);
      case 'envoyer':
        courriel(false);
        return lancer(() => marquerEnvoye(d.id), 'Pensez à joindre le PDF (menu ⋮, « Télécharger le PDF »)');
      case 'relancer':
        courriel(true);
        return lancer(() => changerEtat(d.id, 'relance'), 'Relance préparée dans votre messagerie');
      case 'pdf':
        return void avantAction().then(() => window.open(`/impression/${d.id}`, '_blank', 'noopener'));
      case 'dupliquer':
        return lancer(() => dupliquer(d.id), 'Copie en brouillon', (id) => `/devis/${id}`);
      case 'supprimer':
        return setConfirmer(true);
    }
  };

  return (
    <div className="ed-bas">
      <span className="ed-etat" aria-live="polite">
        {etat}
      </span>
      {enCours && <Roue />}
      <Bouton type="button" variante="secondaire" className="ed-bascule" onClick={basculerApercu}>
        {apercu ? 'Modifier' : 'Aperçu'}
      </Bouton>
      <details className="ed-plus" ref={plus}>
        <summary className={classeBouton('secondaire', 'ed-plus-b')} aria-label="Autres actions" title="Autres actions">
          ⋮
        </summary>
        <div className="ed-menu">
          {menu.map((x) => (
            <button key={x.cle} type="button" className={x.danger ? 'danger-t' : undefined} disabled={enCours} onClick={() => action(x.cle)}>
              {x.libelle}
            </button>
          ))}
        </div>
      </details>
      {principal && (
        <Bouton type="button" className="ed-principal" disabled={enCours} onClick={() => action(principal.cle)}>
          <span aria-hidden="true">✓</span> {principal.libelle}
        </Bouton>
      )}
      {facturer && <FenetreFacturer devis={{ id: d.id, numero: d.numero }} {...d.facturation} fermer={() => setFacturer(false)} />}
      {confirmer && (
        <FenetreConfirmation
          titre="Supprimer ce brouillon ?"
          texte="Il n’a pas de numéro : rien ne manque dans la numérotation."
          bouton="Supprimer"
          danger
          enCours={enCours}
          fermer={() => setConfirmer(false)}
          onConfirmer={() =>
            demarrer(async () => {
              arreter();
              const r = await supprimerDocument(d.id);
              if (!r.ok) return annoncer(r.erreur, 'erreur');
              setConfirmer(false);
              annoncer('Brouillon supprimé');
              router.push(d.retour);
            })
          }
        />
      )}
    </div>
  );
}
