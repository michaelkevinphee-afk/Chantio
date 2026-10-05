'use client';

import { useRef, useState } from 'react';
import { ajouterJours, demiDebut, HEURE_CHANTIER, HEURE_DEMI, initiales, nomCourt, type Demi } from '@chantio/shared';
import { Icone } from '@/components/icones';
import { annoncer } from '@/components/retour';
import { Avatar } from '@/components/ui';
import { planifier, type Planning } from '../actions';
import { EtatEnregistrement, type EtatEnvoi } from './enregistrement';
import { CHAMP, ETIQUETTE, PUCE_TECH, PUCE_TECH_OFF, PUCE_TECH_ON, RANGEE_VOLET, SECTION, TITRE_SECTION } from './styles';

export type Technicien = { id: string; prenom: string; nom: string | null; photo: string | null; invite: boolean };

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Rubrique « Planification » du volet, comme le bac : Date · Moment · Heure · Durée prévue
 * (Début · Moment · Fin · Fin le pour un chantier), puis les techniciens en puces.
 * Chaque changement s'enregistre tout seul ; l'état passe seul de « À planifier » à « Planifiée ».
 */
export function Planification({
  interventionId,
  equipe,
  initial,
  chantier,
  modifiable,
}: {
  interventionId: string;
  equipe: Technicien[];
  initial: Planning;
  /** Chantier (ou intervention sur plusieurs jours) : début et fin au lieu de l'heure et de la durée. */
  chantier: boolean;
  /** Fiche envoyée, validée ou facturée : la planification ne se change plus. */
  modifiable: boolean;
}) {
  const [valeurs, setValeurs] = useState(initial);
  const [duree, setDuree] = useState(String(initial.duree_prevue ?? 1).replace('.', ','));
  const [demi, setDemi] = useState<Demi>(demiDebut(initial));
  const [etat, setEtat] = useState<EtatEnvoi>('');
  const envois = useRef(0);
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = (n: string) => `${n}-${interventionId}`;

  async function enregistrer(v: Planning, attendre = 0) {
    clearTimeout(minuteur.current);
    setEtat('envoi');
    const partir = async () => {
      const n = ++envois.current;
      const { erreur, invites } = await planifier(interventionId, v).catch(() => ({ erreur: 'Pas de réseau : réessayez.', invites: [] }));
      if (n !== envois.current) return; // un changement plus récent est parti entre-temps
      setEtat(erreur ? 'erreur' : 'ok');
      if (erreur) annoncer(erreur, 'erreur');
      if (invites?.length) annoncer(`Invitation agenda envoyée à ${invites.join(', ')}`);
    };
    if (attendre) minuteur.current = setTimeout(partir, attendre);
    else partir();
  }

  function changer(v: Planning, attendre = 0) {
    setValeurs(v);
    enregistrer(v, attendre);
  }

  const heures = chantier ? HEURE_CHANTIER : HEURE_DEMI;
  const finAffichee = valeurs.date_fin ?? (chantier ? valeurs.date_prevue : null) ?? '';

  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>
        Planification <EtatEnregistrement etat={etat} />
      </h3>
      <div className={RANGEE_VOLET}>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>{chantier ? 'Début' : 'Date'}</span>
          <input
            type="date"
            className={CHAMP}
            disabled={!modifiable}
            value={valeurs.date_prevue ?? ''}
            onChange={(e) => {
              const date_prevue = e.target.value || null;
              // Le chantier garde son nombre de jours quand on change son premier jour.
              const date_fin =
                date_prevue && valeurs.date_prevue && valeurs.date_fin ? ajouterJours(date_prevue, ecart(valeurs.date_prevue, valeurs.date_fin)) : null;
              changer({ ...valeurs, date_prevue, date_fin, fin_midi: !!date_fin && !!valeurs.fin_midi }, 700);
            }}
          />
        </label>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Moment</span>
          <select
            className={CHAMP}
            disabled={!modifiable}
            value={valeurs.heure_prevue ? demiDebut(valeurs) : demi}
            onChange={(e) => {
              const m = Number(e.target.value) as Demi;
              setDemi(m);
              // L'heure suit le moment choisi (08:30 ou 14:00 ; 08:00 ou 13:30 pour un chantier).
              if (valeurs.heure_prevue ? demiDebut(valeurs) !== m : m === 1) changer({ ...valeurs, heure_prevue: heures[m] });
            }}
          >
            <option value={0}>Matin</option>
            <option value={1}>Après-midi</option>
          </select>
        </label>
        {chantier ? (
          <>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Fin</span>
              <input
                type="date"
                className={CHAMP}
                disabled={!modifiable || !valeurs.date_prevue}
                min={valeurs.date_prevue ?? undefined}
                value={finAffichee}
                onChange={(e) => {
                  const date_fin = e.target.value && valeurs.date_prevue && e.target.value > valeurs.date_prevue ? e.target.value : null;
                  changer({ ...valeurs, date_fin, fin_midi: !!date_fin && !!valeurs.fin_midi }, 700);
                }}
              />
            </label>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Fin le</span>
              <select
                className={CHAMP}
                disabled={!modifiable || !valeurs.date_fin}
                value={valeurs.fin_midi ? 0 : 1}
                onChange={(e) => changer({ ...valeurs, fin_midi: e.target.value === '0' })}
              >
                <option value={0}>Matin</option>
                <option value={1}>Soir</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Heure</span>
              <input
                type="time"
                className={CHAMP}
                disabled={!modifiable}
                value={valeurs.heure_prevue ?? ''}
                onChange={(e) => changer({ ...valeurs, heure_prevue: e.target.value || null }, 900)}
              />
            </label>
            <label className="block min-w-0" htmlFor={id('duree')}>
              <span className={ETIQUETTE}>Durée prévue</span>
              <span className="flex items-center gap-1.5">
                <input
                  id={id('duree')}
                  className={`${CHAMP} w-[90px] tabular-nums`}
                  inputMode="decimal"
                  disabled={!modifiable}
                  value={duree}
                  onChange={(e) => {
                    setDuree(e.target.value);
                    const h = Number(e.target.value.replace(',', '.'));
                    if (e.target.value.trim() && h > 0 && h <= 24) changer({ ...valeurs, duree_prevue: Math.max(0.25, h) }, 900);
                  }}
                />
                <i className="font-medium text-gris not-italic">h</i>
              </span>
            </label>
          </>
        )}
      </div>
      {valeurs.date_prevue && (
        <a href={`/interventions/${interventionId}/agenda`} className="inline-flex items-center gap-1.5 self-start text-[13px] font-bold text-cobalt hover:underline">
          <Icone nom="calendrier" taille={15} /> Ajouter à mon agenda
        </a>
      )}
      <div>
        <span className={ETIQUETTE}>Techniciens</span>
        <div className="flex flex-wrap gap-1.5">
          {equipe.map((m) => {
            const on = valeurs.techniciens.includes(m.id);
            return (
              <label key={m.id} className={`${PUCE_TECH} ${on ? PUCE_TECH_ON : PUCE_TECH_OFF} ${modifiable ? '' : 'cursor-default opacity-70'}`}>
                <input
                  type="checkbox"
                  className="pointer-events-none absolute opacity-0"
                  checked={on}
                  disabled={!modifiable}
                  onChange={() => {
                    const techniciens = on ? valeurs.techniciens.filter((t) => t !== m.id) : [...valeurs.techniciens, m.id];
                    changer({ ...valeurs, techniciens });
                  }}
                />
                <Avatar url={m.photo} initiales={initiales(m.prenom, m.nom)} taille={22} />
                {nomCourt(m.prenom, m.nom)}
                {m.invite && <small className="font-medium text-gris">(invité)</small>}
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}
