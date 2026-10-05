'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LIBELLE_URGENCE, type Urgence } from '@chantio/shared';
import { EtatEnregistrement, useEnregistrement } from './enregistrement';
import { CHAMP, ETIQUETTE, RANGEE_VOLET, SECTION, TITRE_SECTION } from './styles';

/** Rubrique « Demande » : motif et urgence, enregistrés dès qu'on les change ; lien vers le contrat d'entretien. */
export function Demande({
  id,
  motif: motifInitial,
  urgence: urgenceInitiale,
  contrat,
}: {
  id: string;
  motif: string;
  urgence: Urgence;
  contrat: { lien: string; texte: string } | null;
}) {
  const { etat, enregistrer } = useEnregistrement(id);
  const [motif, setMotif] = useState(motifInitial);
  const [enregistre, setEnregistre] = useState(motifInitial);
  const [urgence, setUrgence] = useState(urgenceInitiale);

  const validerMotif = async () => {
    const m = motif.trim();
    if (m === enregistre) return;
    if (!m) {
      setMotif(enregistre);
      return;
    }
    if (await enregistrer({ motif: m })) setEnregistre(m);
  };

  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>
        Demande <EtatEnregistrement etat={etat} />
      </h3>
      <label className="block">
        <span className={ETIQUETTE}>Motif</span>
        <input
          type="text"
          className={CHAMP}
          value={motif}
          maxLength={300}
          onChange={(e) => setMotif(e.target.value)}
          onBlur={validerMotif}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <div className={RANGEE_VOLET}>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Urgence</span>
          <select
            className={CHAMP}
            value={urgence}
            onChange={(e) => {
              const u = e.target.value as Urgence;
              setUrgence(u);
              enregistrer({ urgence: u });
            }}
          >
            {(Object.keys(LIBELLE_URGENCE) as Urgence[]).map((u) => (
              <option key={u} value={u}>
                {LIBELLE_URGENCE[u]}
              </option>
            ))}
          </select>
        </label>
        {contrat && (
          <div className="min-w-0">
            <span className={ETIQUETTE}>Contrat d’entretien</span>
            <Link href={contrat.lien} className="text-[14px] font-bold text-cobalt hover:underline">
              {contrat.texte}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
