'use client';

import { useState } from 'react';
import { euro, pourcent, reglagesDepannage, reglagesPrix, type ReglagesFacturation } from '@chantio/shared';
import { ChampAuto } from './champ-auto';
import { Section } from './elements';
import { nombreAffiche } from './valeurs';

const lire = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/**
 * Paramètres › Prix et coefficients : coûts de l'entreprise, prix de vente (avec les réglages de dépannage),
 * ce que donne le coefficient (recalculé à chaque enregistrement), puis l'objectif du mois.
 */
export function RubriquePrix({ r }: { r: ReglagesFacturation }) {
  const rp = reglagesPrix(r);
  const rd = reglagesDepannage(r);
  const [calcul, setCalcul] = useState({ fg: rp.frais_generaux, coef: rp.coefficient, marge: rp.marge_min });
  const suivre = (k: keyof typeof calcul) => (s: string) => Number.isFinite(lire(s)) && setCalcul((c) => ({ ...c, [k]: lire(s) }));

  const pv = 100 * calcul.coef;
  const pr = 100 * (1 + calcul.fg / 100);
  const margeNette = pv ? ((pv - pr) / pv) * 100 : 0;
  const plancher = Math.ceil(((1 + calcul.fg / 100) / (1 - calcul.marge / 100)) * 100) / 100;

  return (
    <>
      <Section titre="Coûts de l’entreprise">
        <ChampAuto
          cle="frais_generaux"
          libelle="Frais généraux"
          valeur={nombreAffiche(rp.frais_generaux)}
          unite="% du déboursé"
          aide="Loyer, véhicules, assurances, comptable, temps au bureau"
          onEnregistre={suivre('fg')}
        />
        <ChampAuto cle="cout_horaire" libelle="Coût horaire chargé" valeur={nombreAffiche(rp.cout_horaire)} unite="€ / h" aide="Salaire + charges, divisé par les heures productives" />
        <ChampAuto
          cle="marge_min"
          libelle="Marge nette minimale"
          valeur={nombreAffiche(rp.marge_min)}
          unite="%"
          aide="En dessous, le devis affiche une alerte"
          onEnregistre={suivre('marge')}
        />
      </Section>
      <Section titre="Prix de vente">
        <ChampAuto
          cle="coefficient"
          libelle="Coefficient global par défaut"
          valeur={nombreAffiche(rp.coefficient)}
          unite="×"
          aide="Modifiable sur chaque devis et chaque ligne"
          onEnregistre={suivre('coef')}
        />
        <ChampAuto cle="taux_depannage" libelle="Taux horaire dépannage" valeur={nombreAffiche(rd.taux_depannage)} unite="€ HT / h" aide="Utilisé par les forfaits dépannage" />
        <ChampAuto cle="deplacement" libelle="Forfait déplacement" valeur={nombreAffiche(rd.deplacement)} unite="€ HT" aide="Paris intra-muros" />
        <ChampAuto cle="maj_soir" libelle="Majoration soir" valeur={nombreAffiche(rd.maj_soir)} unite="%" aide="Après 19 h" />
        <ChampAuto cle="maj_we" libelle="Majoration week-end" valeur={nombreAffiche(rd.maj_we)} unite="%" aide="Samedi, dimanche, jours fériés" />
        <ChampAuto cle="chute" libelle="Chute par défaut (m²)" valeur={nombreAffiche(rp.chute)} unite="%" aide="Ajoutée dans le métré" />
      </Section>
      <Section titre="Ce que donne votre coefficient" grille={false}>
        <div aria-live="polite" className="space-y-1">
          <p>
            Pour <b>100 €</b> de déboursé sec, avec un coefficient de <b className="tabular-nums">{nombreAffiche(calcul.coef)}</b> : prix de vente{' '}
            <b className="tabular-nums">{euro(pv)}</b>, prix de revient <b className="tabular-nums">{euro(pr)}</b>, marge nette{' '}
            <b className={`tabular-nums ${margeNette < calcul.marge ? 'text-rouge' : 'text-vert'}`}>
              {euro(pv - pr)} ({pourcent(margeNette)})
            </b>
            .
          </p>
          <p className="text-[13px] text-gris">
            Coefficient minimum pour atteindre {nombreAffiche(calcul.marge)} % de marge nette avec {nombreAffiche(calcul.fg)} % de frais généraux :{' '}
            <b className="text-encre tabular-nums">{nombreAffiche(plancher)}</b>.
          </p>
        </div>
      </Section>
      <Section titre="Objectif du mois">
        <ChampAuto
          cle="objectif_mensuel"
          libelle="Chiffre d’affaires visé chaque mois"
          valeur={r.objectif_mensuel ? String(r.objectif_mensuel) : ''}
          unite="€ HT"
          inputMode="numeric"
          aide="Sert à l’anneau « Ce mois-ci » du tableau de bord des devis."
        />
      </Section>
    </>
  );
}
