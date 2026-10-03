'use client';

import { useState } from 'react';

export function ChoixClient({
  clients,
  types,
  initial,
  nouveau,
}: {
  clients: { id: string; nom: string }[];
  /** Client déjà choisi (depuis sa fiche). */
  initial?: string;
  types: { valeur: string; libelle: string }[];
  /** Nouveau client pré-rempli (depuis un devis). */
  nouveau?: { nom: string; telephone: string; type: string };
}) {
  const [choix, setChoix] = useState(initial ?? (clients.length ? '' : 'nouveau'));
  return (
    <>
      <div>
        <label className="etiquette" htmlFor="client_id">Client</label>
        <select id="client_id" name="client_id" className="champ" required value={choix} onChange={(e) => setChoix(e.target.value)}>
          <option value="" disabled>Choisir un client…</option>
          <option value="nouveau">+ Nouveau client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      {choix === 'nouveau' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="etiquette" htmlFor="client_nom">Nom ou raison sociale</label>
            <input id="client_nom" name="client_nom" className="champ" required placeholder="Mme Laurent" defaultValue={nouveau?.nom} />
          </div>
          <div className="sm:col-span-2">
            <label className="etiquette" htmlFor="client_telephone">Téléphone</label>
            <input id="client_telephone" name="client_telephone" className="champ" type="tel" defaultValue={nouveau?.telephone} />
          </div>
          <div>
            <label className="etiquette" htmlFor="client_type">Type</label>
            <select id="client_type" name="client_type" className="champ" defaultValue={nouveau?.type ?? 'particulier'}>
              {types.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
            </select>
          </div>
        </div>
      )}
    </>
  );
}
