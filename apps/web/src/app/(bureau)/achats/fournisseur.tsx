'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type FormEvent, type InputHTMLAttributes } from 'react';
import { CATEGORIES_FOURNISSEUR, euro, LIBELLE_STATUT_ACHAT, TON_STATUT_ACHAT, type Fournisseur, type StatutAchat } from '@chantio/shared';
import { annoncer, Roue } from '@/components/retour';
import { Picto } from '../devis/composants';
import { enregistrerFournisseur } from './actions';

export type FactureDuFournisseur = { id: string; numero: string | null; date_facture: string; montant_ttc: number; statut: StatutAchat; avoir: boolean };

const dateFr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Volet de création ou de modification d'un fournisseur (depuis la liste ou depuis une facture). */
export function VoletFournisseur({
  fournisseur,
  factures,
  onFermer,
  onEnregistre,
}: {
  fournisseur: Fournisseur | null;
  factures?: FactureDuFournisseur[];
  onFermer: () => void;
  onEnregistre?: (id: string, delai: number) => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const envoyer = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget);
    demarrer(async () => {
      const r = await enregistrerFournisseur(null, donnees);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer('Fournisseur enregistré');
      onEnregistre?.(r.id, Math.min(365, Math.max(0, Math.round(Number(donnees.get('delai_paiement')) || 0))));
      onFermer();
      router.refresh();
    });
  };

  const champ = (nom: keyof Fournisseur, libelle: string, props: InputHTMLAttributes<HTMLInputElement> = {}, large = false) => (
    <div className={large ? 'large' : undefined}>
      <label className="etiq" htmlFor={`f-${nom}`}>
        {libelle}
      </label>
      <input id={`f-${nom}`} name={nom} className="saisie" defaultValue={String(fournisseur?.[nom] ?? '')} {...props} />
    </div>
  );

  return (
    <>
      <div className="voile ouvert" onClick={onFermer} />
      <aside className="volet ouvert" aria-label="Fournisseur">
        <form onSubmit={envoyer} style={{ display: 'contents' }}>
          <input type="hidden" name="id" value={fournisseur?.id ?? ''} />
          <div className="volet-haut">
            <div>
              <div className="surtitre" style={{ color: 'var(--cobalt)' }}>
                Fournisseur
              </div>
              <h2>{fournisseur ? fournisseur.nom : 'Nouveau fournisseur'}</h2>
            </div>
            <button className="fermer" type="button" aria-label="Fermer" onClick={onFermer}>
              <Picto nom="croix" taille={18} epaisseur={2.4} />
            </button>
          </div>
          <div className="volet-corps">
            {fournisseur?.lu_sur_facture && (
              <div className="info violet" style={{ marginTop: 0, marginBottom: 14 }}>
                Créé automatiquement à la lecture d’une facture : vérifiez ses informations, puis enregistrez.
              </div>
            )}
            <div className="champs">
              <div className="large">
                <label className="etiq" htmlFor="f-nom">
                  Nom
                </label>
                <input id="f-nom" name="nom" className="saisie" required defaultValue={fournisseur?.nom ?? ''} placeholder="ex. Thermo Négoce IDF" />
              </div>
              <div>
                <label className="etiq" htmlFor="f-categorie">
                  Catégorie
                </label>
                <select id="f-categorie" name="categorie" className="saisie" defaultValue={fournisseur?.categorie ?? 'Négoce et fournitures'}>
                  {CATEGORIES_FOURNISSEUR.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {champ('delai_paiement', 'Délai de paiement (jours)', { inputMode: 'numeric', defaultValue: String(fournisseur?.delai_paiement ?? 30) })}
              {champ('siret', 'SIRET', { inputMode: 'numeric', placeholder: '14 chiffres' })}
              {champ('tva_intracom', 'N° de TVA intracommunautaire')}
              {champ('adresse', 'Adresse', {}, true)}
              {champ('email', 'E-mail', { type: 'email' })}
              {champ('telephone', 'Téléphone', { type: 'tel' })}
              {champ('iban', 'IBAN', { placeholder: 'FR76 …' }, true)}
            </div>
            {factures && (
              <div style={{ marginTop: 22 }}>
                <div className="surtitre" style={{ marginBottom: 8 }}>
                  Ses factures
                </div>
                {factures.length ? (
                  <div className="carte">
                    {factures.map((a) => (
                      <Link key={a.id} href={`/achats/${a.id}`} className="paiement" style={{ color: 'inherit', textDecoration: 'none' }}>
                        <div>
                          {a.numero ?? 'Sans numéro'}
                          <span>{dateFr(a.date_facture)}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <b>{euro((a.avoir ? -1 : 1) * a.montant_ttc)}</b>
                          <span className={`pastille p-${TON_STATUT_ACHAT[a.statut]}`} style={{ marginLeft: 8 }}>
                            {LIBELLE_STATUT_ACHAT[a.statut]}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="note-tva" style={{ marginTop: 0 }}>
                    Aucune facture de ce fournisseur pour l’instant.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="volet-pied">
            <button className="btn" type="button" onClick={onFermer}>
              Annuler
            </button>
            <button className="btn plein" type="submit" disabled={enCours}>
              {enCours && <Roue />}
              Enregistrer le fournisseur
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
