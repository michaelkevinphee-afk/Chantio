'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import {
  achatEchu,
  ajouterJours,
  arrondi,
  ecartJours,
  euro,
  LIBELLE_STATUT_ACHAT,
  MOYENS_PAIEMENT,
  nombre,
  resteAPayer,
  TAUX_TVA_ACHAT,
  TON_STATUT_ACHAT,
  type Achat,
  type Fournisseur,
  type PaiementAchat,
  type ReceptionAchat,
} from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import { supabaseNavigateur } from '@/lib/supabase/client';
import { Ecran, Picto } from '../../devis/composants';
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
import { VoletFournisseur } from '../fournisseur';
import { extension, fichierAccepte, FORMATS_ACHAT } from '../liste';

type Resultat = { ok: true } | { ok: false; erreur: string };
type Panneau = 'contester' | 'planifier' | 'payer' | null;

const RECUE: Record<ReceptionAchat, string> = {
  import: 'importée',
  photo: 'prise en photo',
  electronique: 'reçue en facture électronique',
  email: 'reçue par e-mail',
};

const dateFr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const prix = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v ? String(v).replace('.', ',') : '';
};
const initiales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase() || '?';

export function FicheAchat({
  achat,
  fournisseurs,
  membres,
  chantiers,
  paiements,
  commentaires,
  suivant,
  doublon,
  lien,
  pieces,
  lecture,
  jour,
  entrepriseId,
}: {
  achat: Achat;
  fournisseurs: Fournisseur[];
  membres: { id: string; prenom: string; nom: string }[];
  chantiers: { id: string; libelle: string }[];
  paiements: PaiementAchat[];
  commentaires: { id: string; texte: string; cree_le: string; auteur: string }[];
  suivant: string | null;
  doublon: { id: string; date_facture: string } | null;
  lien: string | null;
  pieces: { chemin: string; nom: string; taille: number; lien: string | null }[];
  lecture: boolean;
  jour: string;
  entrepriseId: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [panneau, setPanneau] = useState<Panneau>(null);
  const [volet, setVolet] = useState<'nouveau' | 'fiche' | null>(null);
  const [balayage, setBalayage] = useState(0);
  const [f, setF] = useState(() => ({
    fournisseur_id: achat.fournisseur_id ?? '',
    numero: achat.numero ?? '',
    date_facture: achat.date_facture,
    delai_paiement: String(achat.delai_paiement ?? 30),
    echeance: achat.echeance ?? '',
    montant_ht: prix(achat.montant_ht),
    taux_tva: String(Number(achat.taux_tva)),
    montant_tva: prix(achat.montant_tva),
    avoir: achat.avoir,
    responsable_id: achat.responsable_id ?? '',
    intervention_id: achat.intervention_id ?? '',
  }));
  const paye = paiements.reduce((s, p) => s + Number(p.montant), 0);
  const reste = resteAPayer(achat, paye);
  const [motif, setMotif] = useState('');
  const [plan, setPlan] = useState({ date: achat.echeance && achat.echeance >= jour ? achat.echeance : jour, moyen: achat.moyen_prevu ?? 'Virement' });
  const [paiement, setPaiement] = useState({ montant: prix(reste), moyen: achat.moyen_prevu ?? 'Virement', date: jour });
  const [commentaire, setCommentaire] = useState('');
  const champPiece = useRef<HTMLInputElement>(null);

  const modifiable = achat.statut === 'recu';
  const bloque = !modifiable || enCours;
  const fournisseur = fournisseurs.find((x) => x.id === (modifiable ? f.fournisseur_id : achat.fournisseur_id)) ?? null;
  const ttc = arrondi(nombre(f.montant_ht) + nombre(f.montant_tva));
  const ecartTTC = achat.ttc_lu != null && Math.abs(Number(achat.ttc_lu) - ttc) > 0.05;
  const pdf = /pdf/i.test(achat.fichier_type ?? '') || /\.pdf$/i.test(achat.fichier_nom ?? '');
  const libelle = achat.avoir ? 'Avoir' : 'Facture';
  const echue = achatEchu(achat, paye, jour);

  // Calculs automatiques : TVA d'après le HT et le taux, échéance d'après la date et le délai.
  const tva = (ht: string, taux: string) => prix(arrondi((nombre(ht) * Number(taux)) / 100));
  const majHT = (v: string) => setF((x) => ({ ...x, montant_ht: v, montant_tva: tva(v, x.taux_tva) }));
  const majTaux = (v: string) => setF((x) => ({ ...x, taux_tva: v, montant_tva: tva(x.montant_ht, v) }));
  const majDate = (v: string) => setF((x) => ({ ...x, date_facture: v, echeance: v ? ajouterJours(v, Math.round(nombre(x.delai_paiement))) : x.echeance }));
  const majDelai = (v: string) => setF((x) => ({ ...x, delai_paiement: v, echeance: x.date_facture ? ajouterJours(x.date_facture, Math.round(nombre(v))) : x.echeance }));
  const majEcheance = (v: string) =>
    setF((x) => ({ ...x, echeance: v, delai_paiement: v && x.date_facture ? String(Math.max(0, ecartJours(x.date_facture, v))) : x.delai_paiement }));
  const majFournisseur = (id: string) => {
    const choisi = fournisseurs.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      fournisseur_id: id,
      ...(choisi ? { delai_paiement: String(choisi.delai_paiement), echeance: ajouterJours(x.date_facture, choisi.delai_paiement) } : {}),
    }));
  };

  const donnees = () => {
    const d = new FormData();
    for (const [k, v] of Object.entries(f)) d.set(k, typeof v === 'boolean' ? (v ? 'on' : '') : v);
    return d;
  };

  const lancer = (fn: () => Promise<Resultat>, message: string, apres?: () => void) =>
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(message);
      setPanneau(null);
      if (apres) apres();
      else router.refresh();
    });

  const relire = () => {
    setBalayage((b) => b + 1);
    lancer(() => lireFacture(achat.id), 'Facture relue');
  };

  const supprimer = () => {
    if (!window.confirm(`Supprimer ${achat.numero ? `la facture ${achat.numero}` : 'cette facture'} ?`)) return;
    lancer(() => supprimerAchat(achat.id), 'Facture supprimée', () => router.push('/achats'));
  };

  const joindre = (liste: FileList | null) => {
    const fichier = liste?.[0];
    if (!fichier) return;
    if (!fichierAccepte(fichier)) return annoncer('PDF ou photo, 20 Mo au plus', 'erreur');
    demarrer(async () => {
      // Les champs en cours de saisie sont enregistrés d'abord (la fiche se recharge ensuite).
      if (modifiable) {
        const r = await enregistrerAchat(achat.id, donnees());
        if (!r.ok) return annoncer(r.erreur, 'erreur');
      }
      const chemin = `${entrepriseId}/achats/pieces/${crypto.randomUUID()}.${extension(fichier)}`;
      const { error } = await supabaseNavigateur().storage.from('documents').upload(chemin, fichier, { contentType: fichier.type || undefined });
      if (error) return annoncer('Envoi impossible, réessayez', 'erreur');
      const r = await joindrePiece(achat.id, { chemin, nom: fichier.name, taille: fichier.size });
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer('Document joint');
      router.refresh();
    });
  };

  const envoyerCommentaire = (e: FormEvent) => {
    e.preventDefault();
    demarrer(async () => {
      const r = await ajouterCommentaire(achat.id, commentaire);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      setCommentaire('');
      router.refresh();
    });
  };

  return (
    <Ecran label="Facture fournisseur">
      <div className="entete">
        <div>
          <div className="sur">
            <Link href="/achats" style={{ color: 'inherit' }}>
              Achats
            </Link>
            {achat.fichier_nom && ` · ${achat.fichier_nom}`}
          </div>
          <h1>{modifiable ? 'Vérifier la facture' : `${libelle} ${achat.numero ?? ''}`.trim()}</h1>
        </div>
        <div className="actions">
          {suivant && (
            <Link className="btn" href={`/achats/${suivant}`}>
              Facture suivante
            </Link>
          )}
          {modifiable && (
            <button className="btn plein" type="button" onClick={() => lancer(() => approuverAchat(achat.id, donnees()), 'Facture approuvée : elle est à payer')} disabled={enCours}>
              {enCours ? <Roue /> : <Picto nom="coche" />}
              Approuver
            </button>
          )}
        </div>
      </div>

      <div className="carte bloc" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 4, marginRight: 'auto', minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 17 }}>
              {libelle} {achat.numero ?? '(sans numéro)'}
            </b>
            <span className={`pastille p-${TON_STATUT_ACHAT[achat.statut]}`}>{LIBELLE_STATUT_ACHAT[achat.statut]}</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--gris)' }}>
            {fournisseur?.nom ?? 'Fournisseur à compléter'} · {euro(Number(achat.montant_ttc))} TTC · {RECUE[achat.reception]} le {dateFr(achat.cree_le)}
            {achat.approuvee_le && ` · approuvée le ${dateFr(achat.approuvee_le)}`}
            {achat.statut === 'planifie' && achat.planifie_le && ` · paiement prévu le ${dateFr(achat.planifie_le)} (${(achat.moyen_prevu ?? 'Virement').toLowerCase()})`}
            {(achat.statut === 'a_payer' || achat.statut === 'planifie') && achat.echeance && ` · échéance ${dateFr(achat.echeance)}`}
          </span>
          {achat.statut === 'suspendu' && achat.motif && <span style={{ fontSize: 13, color: 'var(--rouge)', fontWeight: 600 }}>Contestée : {achat.motif}</span>}
        </div>

        {enCours && <Roue />}
        {achat.statut === 'recu' && (
          <button className="btn petit" type="button" onClick={() => setPanneau(panneau === 'contester' ? null : 'contester')}>
            Contester
          </button>
        )}
        {achat.statut === 'a_payer' && (
          <>
            {!paiements.length && (
              <button className="btn petit" type="button" onClick={() => lancer(() => modifierAchat(achat.id), 'La facture repasse en « Reçu »')}>
                Modifier
              </button>
            )}
            <button className="btn petit" type="button" onClick={() => setPanneau(panneau === 'contester' ? null : 'contester')}>
              Contester
            </button>
            <button className="btn petit" type="button" onClick={() => setPanneau(panneau === 'planifier' ? null : 'planifier')}>
              Planifier le paiement
            </button>
          </>
        )}
        {achat.statut === 'planifie' && (
          <>
            <button className="btn petit" type="button" onClick={() => lancer(() => annulerPlanification(achat.id), 'Planification annulée')}>
              Annuler la planification
            </button>
            <button className="btn petit" type="button" onClick={() => setPanneau(panneau === 'contester' ? null : 'contester')}>
              Contester
            </button>
          </>
        )}
        {(achat.statut === 'a_payer' || achat.statut === 'planifie') && (
          <button className="btn petit plein" type="button" onClick={() => setPanneau(panneau === 'payer' ? null : 'payer')}>
            <Picto nom="coche" />
            {achat.avoir ? 'Remboursement reçu' : 'Déclarer un paiement'}
          </button>
        )}
        {achat.statut === 'suspendu' && (
          <>
            <button className="btn petit" type="button" onClick={() => lancer(() => leverContestation(achat.id), 'Contestation levée')}>
              Lever la contestation
            </button>
            <button
              className="btn petit"
              type="button"
              style={{ color: 'var(--rouge)' }}
              onClick={() => window.confirm('Refuser définitivement cette facture ?') && lancer(() => refuserAchat(achat.id), 'Facture refusée')}
            >
              Refuser
            </button>
          </>
        )}
        {achat.statut === 'refusee' && (
          <button className="btn petit" type="button" onClick={() => lancer(() => rouvrirAchat(achat.id), 'Facture rouverte')}>
            Rouvrir
          </button>
        )}
        {(achat.statut === 'recu' || achat.statut === 'refusee') && (
          <button className="btn petit fantome" type="button" style={{ color: 'var(--rouge)' }} onClick={supprimer}>
            <Picto nom="corbeille" />
            Supprimer
          </button>
        )}
      </div>

      {panneau === 'contester' && (
        <div className="carte panneau-achat">
          <h2>Contester la facture</h2>
          <div>
            <label className="etiq" htmlFor="c-motif">
              Ce qui ne va pas
            </label>
            <textarea
              id="c-motif"
              className="saisie"
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="ex. Livraison incomplète : il manque 2 radiateurs"
            />
          </div>
          <div className="pied">
            <button className="btn" type="button" onClick={() => setPanneau(null)}>
              Annuler
            </button>
            <button className="btn plein" type="button" disabled={enCours} onClick={() => lancer(() => contesterAchat(achat.id, motif), 'Facture contestée')}>
              {enCours && <Roue />}
              Contester
            </button>
          </div>
        </div>
      )}
      {panneau === 'planifier' && (
        <div className="carte panneau-achat">
          <h2>Planifier le paiement</h2>
          <div className="champs" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div>
              <label className="etiq" htmlFor="p-date">
                Date prévue
              </label>
              <input id="p-date" type="date" className="saisie" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
            </div>
            <div>
              <label className="etiq" htmlFor="p-moyen">
                Moyen de paiement
              </label>
              <select id="p-moyen" className="saisie" value={plan.moyen} onChange={(e) => setPlan({ ...plan, moyen: e.target.value })}>
                {MOYENS_PAIEMENT.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          {fournisseur?.iban && <div className="note-tva" style={{ marginTop: 0 }}>IBAN du fournisseur : {fournisseur.iban}</div>}
          <div className="pied">
            <button className="btn" type="button" onClick={() => setPanneau(null)}>
              Annuler
            </button>
            <button className="btn plein" type="button" disabled={enCours} onClick={() => lancer(() => planifierPaiement(achat.id, plan.date, plan.moyen), 'Paiement planifié')}>
              {enCours && <Roue />}
              Planifier
            </button>
          </div>
        </div>
      )}
      {panneau === 'payer' && (
        <div className="carte panneau-achat">
          <h2>{achat.avoir ? 'Remboursement reçu' : 'Déclarer un paiement'}</h2>
          <div className="champs">
            <div>
              <label className="etiq" htmlFor="r-montant">
                Montant
              </label>
              <input id="r-montant" className="saisie" inputMode="decimal" value={paiement.montant} onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })} />
            </div>
            <div>
              <label className="etiq" htmlFor="r-moyen">
                Moyen
              </label>
              <select id="r-moyen" className="saisie" value={paiement.moyen} onChange={(e) => setPaiement({ ...paiement, moyen: e.target.value })}>
                {MOYENS_PAIEMENT.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="etiq" htmlFor="r-date">
                Date
              </label>
              <input id="r-date" type="date" className="saisie" value={paiement.date} onChange={(e) => setPaiement({ ...paiement, date: e.target.value })} />
            </div>
          </div>
          <div className="note-tva" style={{ marginTop: 0 }}>
            Reste à payer : {euro(reste)}. Un paiement partiel laisse la facture dans « À payer ».
          </div>
          <div className="pied">
            <button className="btn" type="button" onClick={() => setPanneau(null)}>
              Annuler
            </button>
            <button
              className="btn plein"
              type="button"
              disabled={enCours}
              onClick={() =>
                lancer(
                  () => declarerPaiement(achat.id, paiement.moyen, paiement.montant, paiement.date),
                  nombre(paiement.montant) >= reste - 0.005 ? 'Facture payée' : 'Paiement partiel enregistré',
                )
              }
            >
              {enCours && <Roue />}
              Enregistrer le paiement
            </button>
          </div>
        </div>
      )}

      <div className="grille-ocr">
        <div className="carte visionneuse">
          <div className="visionneuse-haut">
            <div>
              <b>Document reçu</b> <span>{achat.fichier_taille ? `${Math.round(achat.fichier_taille / 1024)} Ko` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {lien && (
                <a className="btn petit" href={lien} target="_blank" rel="noreferrer">
                  Ouvrir
                </a>
              )}
              {lecture && modifiable && achat.fichier_chemin && (
                <button className="btn petit" type="button" onClick={relire} disabled={enCours}>
                  {achat.lecture ? 'Relancer la lecture' : 'Lire la facture'}
                </button>
              )}
            </div>
          </div>
          <div className="table-lumineuse">
            <div className="scan" style={{ padding: 0, aspectRatio: '1 / 1.3', overflow: 'hidden' }}>
              {lien ? (
                pdf ? (
                  <iframe src={`${lien}#toolbar=0&view=FitH`} title={achat.fichier_nom ?? 'Facture'} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lien} alt={achat.fichier_nom ?? 'Facture'} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
                )
              ) : (
                <div className="vide-doc">Aperçu indisponible.</div>
              )}
              {balayage > 0 && <div className="balayage joue" key={balayage} />}
            </div>
          </div>
        </div>

        <div>
          {(doublon || ecartTTC || (modifiable && fournisseur?.lu_sur_facture) || echue) && (
            <div className="bandeaux">
              {doublon && (
                <div className="info rouge">
                  Doublon possible : une autre facture n° {achat.numero} de ce fournisseur existe déjà (du {dateFr(doublon.date_facture)}).{' '}
                  <Link href={`/achats/${doublon.id}`}>La voir</Link>
                </div>
              )}
              {echue && <div className="info rouge">Échéance dépassée depuis le {dateFr(achat.echeance)} : reste {euro(reste)} à payer.</div>}
              {ecartTTC && (
                <div className="info violet">
                  Le total TTC imprimé sur la facture ({euro(Number(achat.ttc_lu))}) ne correspond pas au HT + TVA ({euro(ttc)}). Vérifiez les montants.
                </div>
              )}
              {modifiable && fournisseur?.lu_sur_facture && (
                <div className="info">
                  Nouveau fournisseur créé à la lecture : {fournisseur.nom}.{' '}
                  <button type="button" onClick={() => setVolet('fiche')}>
                    Vérifier sa fiche
                  </button>
                </div>
              )}
            </div>
          )}

          {modifiable && (
            <div className="carte resume-ocr">
              <div
                className="jauge"
                style={{
                  background:
                    achat.lecture === 'ia'
                      ? 'var(--degrade)'
                      : achat.lecture === 'pas_facture'
                        ? 'var(--rouge)'
                        : achat.lecture === 'manuel'
                          ? 'var(--violet)'
                          : 'var(--doux)',
                }}
              >
                <b>{achat.lecture === 'ia' ? '✓' : achat.lecture === 'pas_facture' ? '!' : '…'}</b>
              </div>
              <div className="txt">
                {achat.lecture === 'ia' ? (
                  <>
                    <b>Facture lue automatiquement</b>
                    <span>Vérifiez le fournisseur, le numéro et les montants, puis approuvez la facture.</span>
                  </>
                ) : achat.lecture === 'pas_facture' ? (
                  <>
                    <b>Ce document ne ressemble pas à une facture</b>
                    <span>Supprimez-le, ou complétez les champs si c’est bien une facture.</span>
                  </>
                ) : achat.lecture === 'manuel' ? (
                  <>
                    <b>À compléter</b>
                    <span>{achat.lecture_message ?? 'Recopiez les informations de la facture, puis approuvez-la.'}</span>
                  </>
                ) : (
                  <>
                    <b>{lecture && achat.fichier_chemin ? 'Lecture en attente' : 'Saisie à la main'}</b>
                    <span>
                      {lecture && achat.fichier_chemin
                        ? 'Lancez la lecture, ou recopiez les informations de la facture.'
                        : 'Recopiez les informations de la facture, puis approuvez-la.'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="carte groupe">
            <h3>Fournisseur et facture</h3>
            <div className="champ-ocr">
              <label htmlFor="a-fournisseur">Fournisseur</label>
              <div className="avec-bouton">
                <select id="a-fournisseur" value={modifiable ? f.fournisseur_id : (achat.fournisseur_id ?? '')} onChange={(e) => majFournisseur(e.target.value)} disabled={bloque}>
                  <option value="">Choisir…</option>
                  {fournisseurs.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nom}
                    </option>
                  ))}
                </select>
                {modifiable && (
                  <button className="btn petit" type="button" onClick={() => setVolet('nouveau')} aria-label="Nouveau fournisseur" title="Nouveau fournisseur">
                    <Picto nom="plus" taille={16} />
                  </button>
                )}
              </div>
              {fournisseur ? (
                <button className="btn petit fantome" type="button" onClick={() => setVolet('fiche')}>
                  Fiche
                </button>
              ) : (
                <span />
              )}
            </div>
            <div className={`champ-ocr ${doublon ? 'doute' : ''}`}>
              <label htmlFor="a-numero">N° de facture</label>
              <input id="a-numero" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} disabled={bloque} />
              {doublon ? <span className="fiab doute">Doublon ?</span> : <span />}
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-date">Date</label>
              <input id="a-date" type="date" value={f.date_facture} onChange={(e) => majDate(e.target.value)} disabled={bloque} />
              <span />
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-delai">Délai (jours)</label>
              <input id="a-delai" inputMode="numeric" value={f.delai_paiement} onChange={(e) => majDelai(e.target.value)} disabled={bloque} />
              <span />
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-echeance">Échéance</label>
              <input id="a-echeance" type="date" value={f.echeance} onChange={(e) => majEcheance(e.target.value)} disabled={bloque} />
              {echue ? <span className="fiab doute">Dépassée</span> : <span />}
            </div>
            <div className="champ-ocr">
              <span style={{ fontSize: 14, color: 'var(--gris)', fontWeight: 600 }}>Type</span>
              <label className="coche-l">
                <input type="checkbox" checked={f.avoir} onChange={(e) => setF({ ...f, avoir: e.target.checked })} disabled={bloque} />
                <span>
                  C’est un avoir
                  <small>Le fournisseur vous rembourse ou réduit ce que vous lui devez</small>
                </span>
              </label>
              <span />
            </div>
          </div>

          <div className="carte groupe">
            <h3>Montants</h3>
            <div className="champ-ocr">
              <label htmlFor="a-ht">Total HT</label>
              <input id="a-ht" inputMode="decimal" placeholder="0,00" value={f.montant_ht} onChange={(e) => majHT(e.target.value)} disabled={bloque} />
              <span />
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-taux">Taux de TVA</label>
              <select id="a-taux" value={f.taux_tva} onChange={(e) => majTaux(e.target.value)} disabled={bloque}>
                {TAUX_TVA_ACHAT.map(([t, lib]) => (
                  <option key={t} value={String(t)}>
                    {lib}
                  </option>
                ))}
              </select>
              <span />
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-tva">TVA</label>
              <input id="a-tva" inputMode="decimal" placeholder="0,00" value={f.montant_tva} onChange={(e) => setF({ ...f, montant_tva: e.target.value })} disabled={bloque} />
              <span />
            </div>
            <div className={`champ-ocr ${ecartTTC ? 'doute' : ''}`}>
              <span style={{ fontSize: 14, color: 'var(--gris)', fontWeight: 600 }}>Total TTC</span>
              <span className="ttc">{euro((f.avoir ? -1 : 1) * ttc)}</span>
              {achat.ttc_lu != null ? (
                <span className={`fiab ${ecartTTC ? 'doute' : 'sur'}`}>{ecartTTC ? `Facture : ${euro(Number(achat.ttc_lu))}` : 'Identique à la facture'}</span>
              ) : (
                <span />
              )}
            </div>
          </div>

          <div className="carte groupe">
            <h3>Suivi</h3>
            <div className="champ-ocr">
              <label htmlFor="a-responsable">Responsable</label>
              <select id="a-responsable" value={f.responsable_id} onChange={(e) => setF({ ...f, responsable_id: e.target.value })} disabled={bloque}>
                <option value="">Personne</option>
                {membres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                  </option>
                ))}
              </select>
              <span />
            </div>
            <div className="champ-ocr">
              <label htmlFor="a-chantier">Chantier</label>
              <select id="a-chantier" value={f.intervention_id} onChange={(e) => setF({ ...f, intervention_id: e.target.value })} disabled={bloque}>
                <option value="">Aucun</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.libelle}
                  </option>
                ))}
              </select>
              {achat.intervention_id && !modifiable ? (
                <Link className="btn petit fantome" href={`/interventions/${achat.intervention_id}`}>
                  Voir
                </Link>
              ) : (
                <span />
              )}
            </div>
            {modifiable && (
              <div className="pied-ocr">
                <p>Une fois approuvée, la facture passe dans « À payer ». Rattachée à un chantier, elle compte dans ses dépenses.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" type="button" onClick={() => lancer(() => enregistrerAchat(achat.id, donnees()), 'Enregistré')} disabled={enCours}>
                    Enregistrer
                  </button>
                  <button className="btn plein" type="button" onClick={() => lancer(() => approuverAchat(achat.id, donnees()), 'Facture approuvée : elle est à payer')} disabled={enCours}>
                    {enCours && <Roue />}
                    Approuver
                  </button>
                </div>
              </div>
            )}
          </div>

          {achat.lignes?.length > 0 && (
            <div className="carte groupe">
              <h3>Lignes lues sur la facture</h3>
              <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                <table className="lignes-lues">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th className="droite">Qté</th>
                      <th className="droite">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {achat.lignes.map((l, i) => (
                      <tr key={i}>
                        <td>{l.designation}</td>
                        <td className="droite">{l.quantite != null ? String(l.quantite).replace('.', ',') : ''}</td>
                        <td className="droite">{l.total_ht != null ? euro(Number(l.total_ht)) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(paiements.length > 0 || ['a_payer', 'planifie', 'payee'].includes(achat.statut)) && (
            <div className="carte groupe">
              <h3>Paiements</h3>
              {paiements.map((p) => (
                <div className="paiement" key={p.id}>
                  <div>
                    {p.moyen}
                    <span>{dateFr(p.date_paiement)}</span>
                  </div>
                  <b>{euro(Number(p.montant))}</b>
                </div>
              ))}
              {!paiements.length && (
                <div className="paiement">
                  <span>Aucun paiement déclaré pour l’instant.</span>
                </div>
              )}
              <div className="reste">
                <span>Reste à payer</span>
                <b>{euro(reste)}</b>
              </div>
            </div>
          )}

          <div className="carte groupe">
            <h3>Documents liés</h3>
            {pieces.map((p) => (
              <div className="piece" key={p.chemin}>
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {p.nom}
                  <span>{Math.max(1, Math.round(p.taille / 1024))} Ko</span>
                </div>
                {p.lien ? (
                  <a className="btn petit" href={p.lien} target="_blank" rel="noreferrer">
                    Ouvrir
                  </a>
                ) : (
                  <span />
                )}
              </div>
            ))}
            <div className="pied-ocr">
              <p>Bon de livraison, bon de commande, photo du matériel reçu…</p>
              <button className="btn petit" type="button" onClick={() => champPiece.current?.click()} disabled={enCours}>
                <Picto nom="importer" />
                Joindre un document
              </button>
              <input
                ref={champPiece}
                type="file"
                accept={FORMATS_ACHAT}
                hidden
                onChange={(e) => {
                  joindre(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="carte groupe">
            <h3>Commentaires</h3>
            {commentaires.map((c) => (
              <div className="commentaire" key={c.id}>
                <span className="rond">{initiales(c.auteur)}</span>
                <div style={{ minWidth: 0 }}>
                  <b>{c.auteur}</b>
                  <span>
                    {new Date(c.cree_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}
                  </span>
                  <p>{c.texte}</p>
                </div>
              </div>
            ))}
            <form className="ajout-commentaire" onSubmit={envoyerCommentaire}>
              <textarea
                className="saisie"
                rows={2}
                aria-label="Votre commentaire"
                placeholder="Une précision pour l’équipe…"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
              />
              <button className="btn petit plein" type="submit" disabled={enCours || !commentaire.trim()}>
                Ajouter
              </button>
            </form>
          </div>
        </div>
      </div>

      {volet && (
        <VoletFournisseur
          fournisseur={volet === 'fiche' ? fournisseur : null}
          onFermer={() => setVolet(null)}
          onEnregistre={(id, delai) => {
            if (volet === 'nouveau') setF((x) => ({ ...x, fournisseur_id: id, delai_paiement: String(delai), echeance: ajouterJours(x.date_facture, delai) }));
          }}
        />
      )}
    </Ecran>
  );
}
