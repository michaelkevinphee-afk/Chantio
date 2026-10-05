'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useTransition, type ReactNode } from 'react';
import {
  CATEGORIES_FOURNISSEUR,
  euroAchat,
  jjmmaaaaBac,
  LIBELLE_STATUT_ACHAT,
  TON_STATUT_ACHAT,
  type Fournisseur,
  type StatutAchat,
} from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { classeBouton, Puce } from '@/components/ui';
import { enregistrerFournisseur } from './actions';

export type FactureDuFournisseur = { id: string; numero: string | null; date_facture: string; montant_ttc: number; statut: StatutAchat; avoir: boolean };

/** Champ de la fenêtre : libellé au-dessus, aide grise dessous (champ() du bac). */
export function ChampAchat({ libelle, aide, children, htmlFor }: { libelle: ReactNode; aide?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="af-champ" htmlFor={htmlFor}>
      {libelle}
      {children}
      {aide && <span className="aide">{aide}</span>}
    </label>
  );
}

/**
 * Fenêtre d'un fournisseur (création ou modification), comme fenetreFournisseur() du bac :
 * champs sur deux colonnes, « Ses factures » (les 8 plus récentes), Annuler / Enregistrer.
 * `apres(id, delai)` est appelé une fois le fournisseur enregistré (ex. le choisir sur la facture).
 */
export function FenetreFournisseur({
  fournisseur,
  factures = [],
  fermer,
  apres,
}: {
  fournisseur: Fournisseur | null;
  factures?: FactureDuFournisseur[];
  fermer: () => void;
  apres?: (id: string, delai: number) => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const f = fournisseur;
  const recentes = [...factures].sort((a, b) => b.date_facture.localeCompare(a.date_facture)).slice(0, 8);

  const enregistrer = () => {
    const form = formulaire.current;
    if (!form) return;
    const d = new FormData(form);
    const nom = String(d.get('nom') ?? '').trim();
    const siret = String(d.get('siret') ?? '').replace(/\s/g, '');
    if (!nom) {
      annoncer('Indiquez le nom du fournisseur.', 'erreur');
      form.querySelector<HTMLInputElement>('[name="nom"]')?.focus();
      return;
    }
    if (siret && !/^\d{14}$/.test(siret)) {
      annoncer('Le SIRET compte 14 chiffres.', 'erreur');
      form.querySelector<HTMLInputElement>('[name="siret"]')?.focus();
      return;
    }
    demarrer(async () => {
      const r = await enregistrerFournisseur(null, d);
      if (!r.ok) return annoncer(r.erreur, 'erreur');
      annoncer(f ? 'Fournisseur enregistré' : 'Fournisseur créé');
      fermer();
      apres?.(r.id, Math.min(365, Math.max(0, Math.round(Number(d.get('delai_paiement')) || 0))));
      router.refresh();
    });
  };

  const saisie = (nom: keyof Fournisseur, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input name={nom} defaultValue={String(f?.[nom] ?? '')} autoComplete="off" {...props} />
  );

  return (
    <Fenetre
      titre={f ? f.nom : 'Nouveau fournisseur'}
      fermer={fermer}
      large
      sansCroix
      pied={
        <>
          <button type="button" data-fermer className={classeBouton('secondaire', 'px-4 py-2.5')}>
            Annuler
          </button>
          <button type="button" onClick={enregistrer} disabled={enCours} className={classeBouton('principal', 'px-4 py-2.5')}>
            {enCours && <Roue />}
            Enregistrer
          </button>
        </>
      }
    >
      <form
        ref={formulaire}
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer();
        }}
      >
        <input type="hidden" name="id" value={f?.id ?? ''} />
        <div className="af-g2">
          <ChampAchat libelle="Nom *">{saisie('nom', { autoFocus: true })}</ChampAchat>
          <ChampAchat libelle="Catégorie">
            <select name="categorie" defaultValue={f?.categorie ?? 'Négoce et fournitures'}>
              {CATEGORIES_FOURNISSEUR.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </ChampAchat>
          <ChampAchat libelle="SIRET" aide="14 chiffres">
            {saisie('siret', { inputMode: 'numeric' })}
          </ChampAchat>
          <ChampAchat libelle="N° de TVA intracommunautaire">{saisie('tva_intracom')}</ChampAchat>
          <ChampAchat libelle="Adresse">{saisie('adresse')}</ChampAchat>
          <ChampAchat libelle="Délai de paiement habituel">
            <span className="af-suf">
              <input name="delai_paiement" type="number" min={0} max={365} defaultValue={String(f?.delai_paiement ?? 30)} />
              <span>jours</span>
            </span>
          </ChampAchat>
          <ChampAchat libelle="E-mail">{saisie('email', { type: 'email', autoComplete: 'email' })}</ChampAchat>
          <ChampAchat libelle="Téléphone">{saisie('telephone', { type: 'tel', autoComplete: 'tel' })}</ChampAchat>
          <ChampAchat libelle="IBAN">{saisie('iban')}</ChampAchat>
        </div>
        {/* Entrée valide le formulaire. */}
        <button type="submit" hidden />
      </form>
      {recentes.length > 0 && (
        <div>
          <h3 className="mt-1 mb-1.5 text-base font-extrabold">Ses factures</h3>
          <ul className="flex flex-col">
            {recentes.map((a) => (
              <li key={a.id} className="py-1.5 text-sm">
                <Link href={`/achats/${a.id}`} onClick={fermer} className="font-bold text-cobalt hover:underline">
                  {a.numero || 'n° à compléter'}
                </Link>{' '}
                · {jjmmaaaaBac(a.date_facture)} · {euroAchat(a, a.montant_ttc)} TTC <Puce ton={TON_STATUT_ACHAT[a.statut]}>{LIBELLE_STATUT_ACHAT[a.statut]}</Puce>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Fenetre>
  );
}
