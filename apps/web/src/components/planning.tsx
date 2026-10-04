'use client';

import { useRef, useState } from 'react';
import { ajouterJours, initiales } from '@chantio/shared';
import { planifier, type Planning as ValeursPlanning } from '@/app/(bureau)/interventions/actions';
import { annoncer, Coche, Roue } from './retour';
import { Icone } from './icones';
import { Avatar } from './ui';

type Personne = { id: string; prenom: string; nom: string | null };

/** Nombre de jours entre deux dates AAAA-MM-JJ. */
const ecart = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Bloc « Planning » d'une intervention : chaque changement (date, heure, dernier jour, technicien)
 * s'affiche tout de suite et s'enregistre tout seul, avec une confirmation animée.
 */
export function Planning({
  interventionId,
  equipe,
  initial,
}: {
  interventionId: string;
  equipe: Personne[];
  initial: ValeursPlanning;
}) {
  const [valeurs, setValeurs] = useState(initial);
  const [duree, setDuree] = useState(initial.duree_prevue ? String(initial.duree_prevue).replace('.', ',') : '');
  const plusieursJours = !!valeurs.date_prevue && !!valeurs.date_fin && valeurs.date_fin > valeurs.date_prevue;
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok' | 'erreur'>('');
  const [dernier, setDernier] = useState<string | null>(null);
  const envois = useRef(0);
  const minuteur = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function enregistrer(v: ValeursPlanning, message: string) {
    const n = ++envois.current;
    setEtat('envoi');
    const { erreur, invites } = await planifier(interventionId, v).catch(() => ({ erreur: 'Pas de réseau : réessaie.', invites: [] }));
    if (n !== envois.current) return; // un changement plus récent est parti entre-temps
    setEtat(erreur ? 'erreur' : 'ok');
    annoncer(erreur ?? message, erreur ? 'erreur' : 'ok');
    if (invites?.length) annoncer(`Invitation agenda envoyée à ${invites.join(', ')}`);
  }

  function changer(v: ValeursPlanning, message: string, attendre = 0) {
    setValeurs(v);
    clearTimeout(minuteur.current);
    if (attendre) {
      setEtat('envoi');
      minuteur.current = setTimeout(() => enregistrer(v, message), attendre);
    } else enregistrer(v, message);
  }

  function basculer(p: Personne) {
    const retire = valeurs.techniciens.includes(p.id);
    const techniciens = retire ? valeurs.techniciens.filter((id) => id !== p.id) : [...valeurs.techniciens, p.id];
    setDernier(p.id);
    changer({ ...valeurs, techniciens }, retire ? `${p.prenom} retiré de l’intervention` : `${p.prenom} affecté à l’intervention`);
  }

  return (
    <section className="carte p-5 text-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Planning</h2>
        <p
          key={etat}
          className={`flex items-center gap-1.5 text-[13px] font-bold ${
            etat === 'erreur' ? 'text-rouge' : etat === 'ok' ? 'apparition text-vert' : 'text-gris'
          }`}
          aria-live="polite"
        >
          {etat === 'envoi' && (
            <>
              <Roue taille={14} /> Enregistrement…
            </>
          )}
          {etat === 'ok' && (
            <>
              <Coche taille={16} /> Enregistré
            </>
          )}
          {etat === 'erreur' && 'Non enregistré'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="champ"
          value={valeurs.date_prevue ?? ''}
          aria-label="Date"
          onChange={(e) => {
            const date_prevue = e.target.value || null;
            // Le chantier garde son nombre de jours quand on change son premier jour.
            const date_fin =
              date_prevue && valeurs.date_prevue && valeurs.date_fin ? ajouterJours(date_prevue, ecart(valeurs.date_prevue, valeurs.date_fin)) : null;
            changer({ ...valeurs, date_prevue, date_fin, fin_midi: !!date_fin && !!valeurs.fin_midi }, 'Date enregistrée', 700);
          }}
        />
        <input
          type="time"
          className="champ"
          value={valeurs.heure_prevue ?? ''}
          aria-label="Heure"
          onChange={(e) => changer({ ...valeurs, heure_prevue: e.target.value || null }, 'Heure enregistrée', 900)}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="etiquette" htmlFor={`fin-${interventionId}`}>
            Dernier jour
          </label>
          <input
            id={`fin-${interventionId}`}
            type="date"
            className="champ"
            min={valeurs.date_prevue ? ajouterJours(valeurs.date_prevue, 1) : undefined}
            disabled={!valeurs.date_prevue}
            value={valeurs.date_fin ?? ''}
            onChange={(e) => {
              const date_fin = e.target.value && valeurs.date_prevue && e.target.value > valeurs.date_prevue ? e.target.value : null;
              changer({ ...valeurs, date_fin, fin_midi: !!date_fin && !!valeurs.fin_midi }, date_fin ? 'Dernier jour enregistré' : 'Sur une seule journée', 700);
            }}
          />
        </div>
        {plusieursJours ? (
          <label className="flex items-end gap-2 pb-3 font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 accent-cobalt"
              checked={!!valeurs.fin_midi}
              onChange={(e) => changer({ ...valeurs, fin_midi: e.target.checked }, e.target.checked ? 'Finit à midi le dernier jour' : 'Finit le soir du dernier jour')}
            />
            Finit à midi
          </label>
        ) : (
          <div>
            <label className="etiquette" htmlFor={`duree-${interventionId}`}>
              Durée prévue (h)
            </label>
            <input
              id={`duree-${interventionId}`}
              className="champ"
              inputMode="decimal"
              placeholder="1"
              value={duree}
              onChange={(e) => {
                setDuree(e.target.value);
                const h = Number(e.target.value.replace(',', '.'));
                changer({ ...valeurs, duree_prevue: e.target.value.trim() && h > 0 && h <= 24 ? h : null }, 'Durée enregistrée', 900);
              }}
            />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gris">
        {plusieursJours
          ? 'Le chantier occupe toutes ses demi-journées au planning, week-ends sautés.'
          : 'Un chantier sur plusieurs jours : indiquez son dernier jour.'}
      </p>

      {valeurs.date_prevue && (
        <a
          href={`/interventions/${interventionId}/agenda`}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-cobalt hover:underline"
        >
          <Icone nom="calendrier" taille={16} /> Ajouter à mon agenda
        </a>
      )}

      <p className="mt-5 mb-2 text-xs font-bold tracking-wide text-gris uppercase">Technicien</p>
      <div className="space-y-1.5">
        {equipe.map((p) => {
          const choisi = valeurs.techniciens.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={choisi}
              onClick={() => basculer(p)}
              className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-2 text-left font-bold transition active:scale-[0.98] ${
                choisi ? 'border-cobalt bg-doux text-encre' : 'border-trait bg-white text-gris hover:border-pervenche'
              } ${dernier === p.id ? 'rebond' : ''}`}
            >
              <Avatar initiales={initiales(p.prenom, p.nom)} taille={30} />
              <span className="min-w-0 flex-1 truncate">
                {p.prenom} {p.nom}
              </span>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full transition ${
                  choisi ? 'bg-cobalt text-white' : 'border-2 border-trait'
                }`}
              >
                {choisi && (
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
