'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { aujourdhui, estAppelOffres, etatDocument, euro, nomClient, titreDocument, type TypeFacture } from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import type { DocumentLu, HistoriqueDevis } from '@/lib/devis';
import { changerEtat, creerAvoir, dupliquer, facturerDevis, supprimerDocument } from './actions';
import { Picto } from './composants';

const TYPES: { tf: TypeFacture; libelle: string }[] = [
  { tf: 'acompte', libelle: 'Facture d’acompte' },
  { tf: 'situation', libelle: 'Situation de travaux' },
  { tf: 'avancement', libelle: 'Facture d’avancement' },
  { tf: 'solde', libelle: 'Solde et décompte final' },
  { tf: 'totale', libelle: 'Facture unique' },
];

const dateFr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Bandeau d'un document enregistré : état, envoi, signature, encaissement, facturation. */
export function SuiviDocument({ document: d, historique }: { document: DocumentLu; historique: HistoriqueDevis | null }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [menu, setMenu] = useState(false);
  const zoneMenu = useRef<HTMLDivElement>(null);
  const etat = etatDocument(d, aujourdhui());
  const facture = d.genre === 'facture';
  const ao = estAppelOffres(d);
  const titre = titreDocument(d.genre, d.type_facture, d.situation_numero);

  useEffect(() => {
    const fermer = (e: MouseEvent) => {
      if (zoneMenu.current && !zoneMenu.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('click', fermer);
    return () => document.removeEventListener('click', fermer);
  }, []);

  const lancer = (fn: () => Promise<{ ok: boolean; erreur?: string; id?: string }>, message: string, ouvrir?: (id: string) => string) =>
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) return annoncer(r.erreur ?? 'Action impossible', 'erreur');
      annoncer(message);
      if (ouvrir && r.id) router.push(ouvrir(r.id));
      else router.refresh();
    });

  const envoyerParMail = (relance = false) => {
    const qui = nomClient(d.client);
    const sujet = `${titre} ${d.numero ?? ''} · ${d.objet}`.trim();
    const corps = relance
      ? facture
        ? `Bonjour,\n\nSauf erreur de notre part, la facture ${d.numero} (${euro(d.net_a_payer)}) reste à régler. Vous la trouverez en pièce jointe.\n\nBien cordialement`
        : `Bonjour,\n\nJe me permets de revenir vers vous au sujet du devis ${d.numero} (${d.objet}). Avez-vous pu en prendre connaissance ?\n\nBien cordialement`
      : `Bonjour ${qui},\n\nVeuillez trouver ci-joint ${facture ? 'la facture' : 'le devis'} ${d.numero ?? ''} pour : ${d.objet}.\nMontant : ${euro(d.net_a_payer)}.\n\nBien cordialement`;
    window.open(`mailto:${encodeURIComponent(d.client.email || '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`, '_self');
    if (relance) lancer(() => changerEtat(d.id, 'relance'), 'Relance préparée dans votre messagerie');
    else annoncer('Pensez à joindre le PDF (bouton Aperçu PDF)');
  };

  return (
    <div className="carte bloc suivi" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{ display: 'grid', gap: 4, marginRight: 'auto', minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 17 }}>
            {titre} {d.numero ?? '(brouillon)'}
          </b>
          <span className={`pastille p-${etat.ton}`}>{etat.libelle}</span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--gris)' }}>
          {nomClient(d.client)} · {euro(d.net_a_payer)}
          {ao && ` · appel d’offres${d.conditions.aoConsultation ? ` « ${d.conditions.aoConsultation} »` : ''}`}
          {ao && d.conditions.aoLimite && ` · réponse avant le ${dateFr(d.conditions.aoLimite)}`}
          {d.finalise_le && ` · validé le ${dateFr(d.finalise_le)}`}
          {d.signe_le && ` · ${ao ? 'gagné' : 'signé'} le ${dateFr(d.signe_le)}`}
          {d.paye_le && ` · encaissé le ${dateFr(d.paye_le)}`}
          {d.relances > 0 && ` · ${d.relances} relance${d.relances > 1 ? 's' : ''}`}
          {facture && d.echeance && d.statut === 'a_encaisser' && ` · échéance ${dateFr(d.echeance)}`}
        </span>
        {historique && historique.factures.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--gris)' }}>
            Déjà facturé {String(historique.dejaPct).replace('.', ',')} % :{' '}
            {historique.factures.map((f, i) => (
              <span key={f.id}>
                {i > 0 && ', '}
                <Link href={`/devis/${f.id}`} style={{ color: 'var(--cobalt)', fontWeight: 700 }}>
                  {f.numero}
                </Link>
              </span>
            ))}
          </span>
        )}
      </div>

      {enCours && <Roue />}
      {d.numero && (
        <Link className="btn petit" href={`/impression/${d.id}`} target="_blank">
          <Picto nom="imprimer" />
          Aperçu PDF
        </Link>
      )}
      {d.numero && d.statut !== 'payee' && (
        <button className="btn petit" type="button" onClick={() => envoyerParMail(false)}>
          <Picto nom="envoyer" />
          Envoyer
        </button>
      )}

      {!facture && d.statut === 'envoye' && (
        <>
          <button className="btn petit" type="button" onClick={() => envoyerParMail(true)}>
            Relancer
          </button>
          <button
            className="btn petit"
            type="button"
            onClick={() => lancer(() => changerEtat(d.id, 'refuse'), ao ? 'Appel d’offres marqué perdu' : 'Devis marqué refusé')}
          >
            {ao ? 'Perdu' : 'Refusé'}
          </button>
          <button
            className="btn petit plein"
            type="button"
            onClick={() => lancer(() => changerEtat(d.id, 'signe'), ao ? `Appel d’offres gagné : le devis ${d.numero} passe en signé` : 'Devis signé, bravo !')}
          >
            <Picto nom="coche" />
            {ao ? 'Gagné' : 'Signé'}
          </button>
        </>
      )}
      {!facture && d.statut === 'refuse' && (
        <button className="btn petit" type="button" onClick={() => lancer(() => changerEtat(d.id, 'envoye'), ao ? 'Réponse remise en attente' : 'Devis remis en attente')}>
          Remettre en attente
        </button>
      )}
      {!facture && (d.statut === 'signe' || d.statut === 'envoye') && (
        <div style={{ position: 'relative' }} ref={zoneMenu}>
          <button className={`btn petit ${d.statut === 'signe' ? 'plein' : ''}`} type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            Facturer
          </button>
          {menu && (
            <div className="carte choix-cat" style={{ left: 'auto', right: 0, width: 260 }}>
              <ul>
                {TYPES.map((t) => (
                  <li key={t.tf}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        lancer(() => facturerDevis(d.id, t.tf), `${t.libelle} préparée`, (id) => `/devis/${id}?etape=ouvrages`);
                      }}
                    >
                      <div>{t.libelle}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {facture && d.statut === 'a_encaisser' && (
        <>
          <button className="btn petit" type="button" onClick={() => envoyerParMail(true)}>
            Relancer
          </button>
          {d.type_facture !== 'avoir' && (
            <button className="btn petit" type="button" onClick={() => lancer(() => creerAvoir(d.id), 'Avoir préparé', (id) => `/devis/${id}?etape=ouvrages`)}>
              Faire un avoir
            </button>
          )}
          <button className="btn petit plein" type="button" onClick={() => lancer(() => changerEtat(d.id, 'payee'), 'Paiement enregistré')}>
            <Picto nom="coche" />
            {d.type_facture === 'avoir' ? 'Remboursé' : 'Encaisser'}
          </button>
        </>
      )}
      {facture && d.statut === 'payee' && (
        <>
          {d.type_facture !== 'avoir' && (
            <button className="btn petit" type="button" onClick={() => lancer(() => creerAvoir(d.id), 'Avoir préparé', (id) => `/devis/${id}?etape=ouvrages`)}>
              Faire un avoir
            </button>
          )}
          <button className="btn petit" type="button" onClick={() => lancer(() => changerEtat(d.id, 'a_encaisser'), 'Encaissement annulé')}>
            Annuler l’encaissement
          </button>
        </>
      )}

      {/* Un appel d'offres ne devient un chantier qu'une fois gagné. */}
      {!facture && d.statut !== 'refuse' && d.statut !== 'annule' && (!ao || d.statut === 'signe') && (
        <Link className={`btn petit ${d.statut === 'signe' ? '' : 'plein'}`} href={`/interventions/nouvelle?devis=${d.id}`}>
          <Picto nom="camion" />
          Créer l’intervention
        </Link>
      )}
      <button className="btn petit" type="button" onClick={() => lancer(() => dupliquer(d.id), 'Copie créée', (id) => `/devis/${id}`)}>
        Dupliquer
      </button>
      {!(facture && d.numero) && (
        <button
          className="btn petit fantome"
          type="button"
          style={{ color: 'var(--rouge)' }}
          onClick={() => {
            if (!window.confirm(`Supprimer ${d.numero ? `le devis ${d.numero}` : 'ce brouillon'} ?`)) return;
            demarrer(async () => {
              const r = await supprimerDocument(d.id);
              if (!r.ok) return annoncer(r.erreur, 'erreur');
              annoncer('Supprimé');
              router.push('/devis');
            });
          }}
        >
          <Picto nom="corbeille" />
          Supprimer
        </button>
      )}
    </div>
  );
}
