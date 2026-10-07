'use client';

// Fenêtre « Facturer le devis … », comme fenetreFacturer() du bac : facture totale (rien de facturé),
// facture d'acompte (pourcentage), facture d'avancement ou situation de travaux (avancement cumulé),
// facture de solde (le reste).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { euroBac, nombre, nombreBac, type TypeFacture } from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { facturerDevis } from './actions';

export function FenetreFacturer({
  devis,
  ht,
  deja,
  acompte,
  fermer,
}: {
  devis: { id: string; numero: string | null };
  /** Montant HT du devis (remise déduite). */
  ht: number;
  /** Part déjà facturée (%), brouillons compris, avoirs déduits. */
  deja: number;
  /** Acompte proposé (%). */
  acompte: number;
  fermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const reste = Math.round((100 - deja) * 1000) / 1000;
  const [choix, setChoix] = useState<TypeFacture>(deja ? 'solde' : 'acompte');
  const [pct, setPct] = useState(() => ({ acompte: nombreBac(Math.min(reste, acompte || 30)), situation: nombreBac(Math.min(100, deja + 30)) }));
  const options = [
    deja ? null : (['totale', 'Facture totale', 'Toutes les lignes du devis, en une fois'] as const),
    ['acompte', 'Facture d’acompte', 'Un pourcentage du devis, avant les travaux'] as const,
    ['avancement', 'Facture d’avancement', 'Un pourcentage global d’avancement du chantier'] as const,
    ['situation', 'Situation de travaux', 'Numérotée (n° 1, 2, 3…), selon l’avancement cumulé du chantier'] as const,
    deja ? (['solde', 'Facture de solde', `Le reste (${nombreBac(reste)} %), avec le détail et la déduction des acomptes`] as const) : null,
  ].filter((o) => o !== null);

  const cumulatif = choix === 'situation' || choix === 'avancement';
  const preparer = () => {
    const p = choix === 'acompte' ? nombre(pct.acompte) : cumulatif ? nombre(pct.situation) : 0;
    const part = choix === 'totale' ? 100 : choix === 'solde' ? reste : choix === 'acompte' ? p : p - deja;
    if (!(part > 0) || deja + part > 100.001) {
      annoncer(cumulatif ? `L’avancement doit être entre ${nombreBac(deja)} et 100 %` : `Pourcentage entre 0 et ${nombreBac(reste)} %`, 'erreur');
      return;
    }
    demarrer(async () => {
      const r = await facturerDevis(devis.id, choix, choix === 'acompte' || cumulatif ? p : undefined);
      if (!r.ok) {
        annoncer(r.erreur, 'erreur');
        return;
      }
      fermer();
      router.push(`/devis/${r.id}`);
      annoncer(r.message);
    });
  };

  return (
    <Fenetre
      titre={`Facturer le devis ${devis.numero ?? ''}`.trim()}
      texte={
        <>
          Devis de {euroBac(ht)}&nbsp;HT. Déjà facturé : <b>{nombreBac(deja)} %</b> ({euroBac((ht * deja) / 100)}).
        </>
      }
      fermer={fermer}
      pied={
        <>
          <Bouton type="button" variante="secondaire" data-fermer>
            Annuler
          </Bouton>
          <Bouton type="button" onClick={preparer} disabled={enCours} aria-busy={enCours}>
            {enCours && <Roue />}
            Préparer la facture
          </Bouton>
        </>
      }
    >
      <div className="ed-fen">
        <div className="choix-f" role="radiogroup" aria-label="Type de facture">
          {options.map(([cle, titre, aide]) => (
            <label key={cle} className={`choix${choix === cle ? ' on' : ''}`}>
              <input type="radio" name="tf" value={cle} checked={choix === cle} onChange={() => setChoix(cle)} />
              <span>
                <b>{titre}</b>
                <small>{aide}</small>
              </span>
            </label>
          ))}
        </div>
        {choix === 'acompte' && (
          <label className="champ">
            Pourcentage de l’acompte
            <span className="saisie-u">
              <input type="text" inputMode="decimal" autoFocus value={pct.acompte} onChange={(e) => setPct({ ...pct, acompte: e.target.value })} />
              <i>%</i>
            </span>
          </label>
        )}
        {cumulatif && (
          <label className="champ">
            Avancement cumulé du chantier
            <span className="saisie-u">
              <input type="text" inputMode="decimal" autoFocus value={pct.situation} onChange={(e) => setPct({ ...pct, situation: e.target.value })} />
              <i>%</i>
            </span>
            <span className="aide">Doit dépasser les {nombreBac(deja)} % déjà facturés</span>
          </label>
        )}
      </div>
    </Fenetre>
  );
}
