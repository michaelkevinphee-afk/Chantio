'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lireFichierPilotage, type LecturePilotage } from '@chantio/shared';
import { lireClasseur } from '@/lib/tableur';
import { importerPilotage } from './actions';
import { c } from './outils';

/**
 * La case d'import : on dépose le fichier de pilotage Excel, Chantio dit ce qu'il y a lu
 * (mois, année précédente, objectifs, frais généraux…), puis l'enregistre et affiche le tableau.
 */
export function CaseImport({ annee, titre = 'Importer votre fichier de pilotage' }: { annee: number; titre?: string }) {
  const router = useRouter();
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [nom, setNom] = useState('');
  const [lu, setLu] = useState<LecturePilotage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [enCours, demarrer] = useTransition();

  const lire = async (f: File | undefined) => {
    if (!f) return;
    setErreur(null);
    setFait(false);
    setNom(f.name);
    try {
      const L = lireFichierPilotage(await lireClasseur(f));
      if (!L.lu.length) {
        setLu(null);
        setErreur('Aucun chiffre reconnu dans ce fichier. Il faut une ligne avec les mois (janvier à décembre) et une ligne par type de travaux.');
        return;
      }
      setLu(L);
    } catch (e) {
      setLu(null);
      setErreur(e instanceof Error ? e.message : 'Ce fichier est illisible.');
    }
  };

  const anneeFichier = lu?.annee ?? annee;
  const enregistrer = () =>
    lu &&
    demarrer(async () => {
      const r = await importerPilotage(anneeFichier, { budget: lu.budget, dep: lu.dep, cha: lu.cha, n1: lu.n1 });
      if (!r.ok) return setErreur(r.erreur);
      setLu(null);
      setFait(true);
      router.refresh();
    });

  return (
    <section className={c('carte')} aria-labelledby="t-import">
      <div className={c('tete')}>
        <div>
          <h2 id="t-import">{titre}</h2>
          <p>Le fichier Excel tenu jusqu’ici : Chantio lit les mois, l’année précédente, les objectifs et le budget, puis affiche le tableau.</p>
        </div>
      </div>

      {!lu && (
        <div
          className={c('depot', survol && 'survol')}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            lire(e.dataTransfer.files[0]);
          }}
        >
          <span className={c('ic')} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
          </span>
          <b>Déposez le fichier ici</b>
          <span className={c('gris')}>Excel (.xlsx) ou CSV. Rien n’est enregistré avant votre accord.</span>
          <button type="button" className={c('btn principal')} onClick={() => entree.current?.click()}>
            Choisir le fichier
          </button>
          <input
            ref={entree}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={(e) => {
              lire(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {lu && (
        <>
          <p>
            <b>{nom}</b> · voici ce que Chantio a lu{lu.annee ? ` pour ${lu.annee}` : ''} :
          </p>
          <ul className={c('lu')}>
            {lu.lu.map((t) => (
              <li key={t}>{t}</li>
            ))}
            {lu.manque.map((t) => (
              <li key={t} className={c('manque')}>
                Pas trouvé : {t.replace(/ : aucun mois trouvé$/, '')}
              </li>
            ))}
          </ul>
          {anneeFichier !== annee && (
            <p className={c('note alerte')}>
              Ce fichier est celui de {anneeFichier}. Ses chiffres seront rangés en {anneeFichier} ; Mon année affiche {annee}.
            </p>
          )}
          <p className={c('note')}>
            Les mois du fichier remplacent ceux déjà saisis ; un mois vide ne change rien. Le budget ne reprend que ce qui a été trouvé. Tout reste modifiable dans
            Paramètres › Pilotage.
          </p>
          <div className={c('actions')}>
            <button type="button" className={c('btn principal')} onClick={enregistrer} disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Enregistrer et afficher le tableau'}
            </button>
            <button type="button" className={c('btn')} onClick={() => setLu(null)} disabled={enCours}>
              Choisir un autre fichier
            </button>
          </div>
        </>
      )}

      {erreur && (
        <p className={c('erreur')} role="alert">
          {erreur}
        </p>
      )}
      {fait && (
        <p className={c('note')} role="status">
          C’est enregistré. Le tableau se met à jour.
        </p>
      )}
    </section>
  );
}
