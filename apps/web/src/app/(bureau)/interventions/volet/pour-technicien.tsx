'use client';

import { useState } from 'react';
import { EtatEnregistrement, useEnregistrement } from './enregistrement';
import { AIDE, CHAMP, ETIQUETTE, RANGEE_VOLET, SECTION, TITRE_SECTION } from './styles';

/**
 * Rubrique « Pour le technicien » : le mot du bureau (enregistré dès qu'on quitte le champ), et le contact
 * sur place, repris de l'occupant ou du client (la base n'a pas encore de contact propre à l'intervention).
 */
export function PourTechnicien({
  id,
  description,
  contact,
}: {
  id: string;
  description: string | null;
  contact: { nom: string; telephone: string; source: string };
}) {
  const { etat, enregistrer } = useEnregistrement(id);
  const [mot, setMot] = useState(description ?? '');
  const [enregistre, setEnregistre] = useState(description ?? '');

  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>
        Pour le technicien <EtatEnregistrement etat={etat} />
      </h3>
      <label className="block">
        <span className={ETIQUETTE}>Mot du bureau</span>
        <textarea
          rows={2}
          className={`${CHAMP} resize-y`}
          value={mot}
          maxLength={4000}
          placeholder="Ce que le technicien doit savoir avant d’y aller"
          onChange={(e) => setMot(e.target.value)}
          onBlur={async () => {
            if (mot.trim() === enregistre.trim()) return;
            if (await enregistrer({ description: mot })) setEnregistre(mot);
          }}
        />
      </label>
      <div className={RANGEE_VOLET}>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Contact sur place</span>
          <input type="text" readOnly className={`${CHAMP} bg-fond`} value={contact.nom} placeholder="Nom" />
        </label>
        <div className="min-w-0">
          <span className={ETIQUETTE}>Téléphone</span>
          {contact.telephone ? (
            <a href={`tel:${contact.telephone.replace(/\s/g, '')}`} className={`${CHAMP} block bg-fond font-semibold text-cobalt hover:underline`}>
              {contact.telephone}
            </a>
          ) : (
            <input type="tel" readOnly className={`${CHAMP} bg-fond`} value="" placeholder="06…" />
          )}
        </div>
      </div>
      {contact.source && <span className={`${AIDE} -mt-1`}>{contact.source}</span>}
    </section>
  );
}
