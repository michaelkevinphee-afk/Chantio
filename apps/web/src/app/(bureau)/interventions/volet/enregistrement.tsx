'use client';

import { useRef, useState } from 'react';
import { annoncer, Coche, Roue } from '@/components/retour';
import { modifierIntervention, type ChampsModifiables } from '../actions';

export type EtatEnvoi = '' | 'envoi' | 'ok' | 'erreur';

/**
 * Enregistrement automatique d'une rubrique du volet : chaque changement part tout seul ;
 * seul le dernier envoi compte pour l'indicateur « Enregistré ».
 */
export function useEnregistrement(id: string) {
  const [etat, setEtat] = useState<EtatEnvoi>('');
  const envois = useRef(0);
  async function enregistrer(champs: ChampsModifiables) {
    const n = ++envois.current;
    setEtat('envoi');
    const { erreur } = await modifierIntervention(id, champs).catch(() => ({ erreur: 'Pas de réseau : réessayez.' }));
    if (n !== envois.current) return !erreur;
    setEtat(erreur ? 'erreur' : 'ok');
    if (erreur) annoncer(erreur, 'erreur');
    return !erreur;
  }
  return { etat, setEtat, enregistrer, envois };
}

/** « Enregistrement… », « Enregistré » ou « Non enregistré », à droite du titre de la rubrique. */
export function EtatEnregistrement({ etat }: { etat: EtatEnvoi }) {
  return (
    <span
      key={etat}
      aria-live="polite"
      className={`ml-auto flex items-center gap-1.5 text-[12.5px] font-bold ${etat === 'erreur' ? 'text-rouge' : etat === 'ok' ? 'apparition text-vert' : 'text-gris'}`}
    >
      {etat === 'envoi' && (
        <>
          <Roue taille={13} /> Enregistrement…
        </>
      )}
      {etat === 'ok' && (
        <>
          <Coche taille={15} /> Enregistré
        </>
      )}
      {etat === 'erreur' && 'Non enregistré'}
    </span>
  );
}
