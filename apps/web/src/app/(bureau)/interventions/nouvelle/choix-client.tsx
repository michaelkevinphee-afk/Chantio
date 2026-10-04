'use client';

import { useState } from 'react';
import { aDesImmeubles, adresseComplete, type TypeClient } from '@chantio/shared';
import type { ClientAdresses } from '@/lib/requetes';

type AdresseInitiale = { adresse?: string; code_postal?: string; ville?: string };

const memeAdresse = (a: string, b?: string) => !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Le client, puis l'adresse d'intervention : une adresse déjà connue du client
 * (l'immeuble, pour un syndic ou un bailleur, avec l'occupant à appeler et
 * l'ordre de service) ou une nouvelle adresse.
 */
export function ChoixClient({
  clients,
  types,
  initial,
  nouveau,
  adresse,
}: {
  clients: ClientAdresses[];
  /** Client déjà choisi (depuis sa fiche). */
  initial?: string;
  types: { valeur: string; libelle: string }[];
  /** Nouveau client pré-rempli (depuis un devis). */
  nouveau?: { nom: string; telephone: string; type: string };
  /** Adresse du chantier (depuis un devis). */
  adresse?: AdresseInitiale;
}) {
  const sitesDe = (id: string) => [...(clients.find((c) => c.id === id)?.sites ?? [])].sort((a, b) => a.adresse.localeCompare(b.adresse));
  // Depuis un devis : son adresse si le client la connaît déjà ; sinon la première adresse du client.
  const siteParDefaut = (id: string) => {
    const sites = sitesDe(id);
    if (!sites.length) return 'autre';
    if (adresse?.adresse) return sites.find((s) => memeAdresse(s.adresse, adresse.adresse))?.id ?? 'autre';
    return sites[0].id;
  };

  const [choix, setChoix] = useState(initial ?? (clients.length ? '' : 'nouveau'));
  const [typeNouveau, setTypeNouveau] = useState(nouveau?.type ?? 'particulier');
  const [siteId, setSiteId] = useState(() => siteParDefaut(choix));
  const [occupant, setOccupant] = useState('');

  const client = clients.find((c) => c.id === choix);
  const sites = sitesDe(choix);
  const site = sites.find((s) => s.id === siteId);
  const immeubles = aDesImmeubles((client?.type ?? (choix === 'nouveau' ? typeNouveau : 'particulier')) as TypeClient);
  const occupants = [...(site?.occupants ?? [])].sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <>
      <fieldset className="carte space-y-4 p-6">
        <legend className="px-1 text-xl font-extrabold">Client</legend>
        <div>
          <label className="etiquette" htmlFor="client_id">Client</label>
          <select
            id="client_id"
            name="client_id"
            className="champ"
            required
            value={choix}
            onChange={(e) => {
              setChoix(e.target.value);
              setSiteId(siteParDefaut(e.target.value));
              setOccupant('');
            }}
          >
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
              <select id="client_type" name="client_type" className="champ" value={typeNouveau} onChange={(e) => setTypeNouveau(e.target.value)}>
                {types.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
              </select>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="carte grid gap-4 p-6 sm:grid-cols-6">
        <legend className="px-1 text-xl font-extrabold">Adresse d’intervention</legend>
        {sites.length > 0 && (
          <div className="sm:col-span-6">
            <label className="etiquette" htmlFor="site_id">{immeubles ? 'Immeuble' : 'Adresse'}</label>
            <select
              id="site_id"
              name="site_id"
              className="champ"
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setOccupant((o) => (o === 'nouveau' ? o : ''));
              }}
            >
              {sites.map((s) => <option key={s.id} value={s.id}>{adresseComplete(s)}</option>)}
              <option value="autre">+ Autre adresse</option>
            </select>
            {site && (site.acces || site.gardien) && (
              <p className="mt-2 text-sm text-gris">
                {[site.acces && `Accès : ${site.acces}`, site.gardien && `Gardien : ${site.gardien}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
        {!site && (
          <>
            <div className="sm:col-span-6">
              <label className="etiquette" htmlFor="adresse">Adresse</label>
              <input id="adresse" name="adresse" className="champ" defaultValue={adresse?.adresse} required placeholder="12 rue des Tilleuls" />
            </div>
            <div className="sm:col-span-2">
              <label className="etiquette" htmlFor="code_postal">Code postal</label>
              <input id="code_postal" name="code_postal" className="champ" defaultValue={adresse?.code_postal} inputMode="numeric" />
            </div>
            <div className="sm:col-span-4">
              <label className="etiquette" htmlFor="ville">Ville</label>
              <input id="ville" name="ville" className="champ" defaultValue={adresse?.ville} />
            </div>
            <div className="sm:col-span-6">
              <label className="etiquette" htmlFor="acces">Accès (code, étage, consignes)</label>
              <input id="acces" name="acces" className="champ" placeholder="Code 4512B · 3e étage" />
            </div>
          </>
        )}
        {immeubles && (
          <>
            <div className="sm:col-span-3">
              <label className="etiquette" htmlFor="occupant_id">Occupant à appeler</label>
              <select id="occupant_id" name="occupant_id" className="champ" value={occupant} onChange={(e) => setOccupant(e.target.value)}>
                <option value="">Personne en particulier (parties communes)</option>
                {occupants.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nom}
                    {o.lot ? ` · ${o.lot}` : ''}
                  </option>
                ))}
                <option value="nouveau">+ Nouvel occupant</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="etiquette" htmlFor="ordre_service">N° d’ordre de service</label>
              <input id="ordre_service" name="ordre_service" className="champ" placeholder="ex. 55812" />
            </div>
            {occupant === 'nouveau' && (
              <>
                <div className="sm:col-span-2">
                  <label className="etiquette" htmlFor="occupant_nom">Nom de l’occupant</label>
                  <input id="occupant_nom" name="occupant_nom" className="champ" required placeholder="Mme Royer" />
                </div>
                <div className="sm:col-span-2">
                  <label className="etiquette" htmlFor="occupant_lot">Étage, porte ou lot</label>
                  <input id="occupant_lot" name="occupant_lot" className="champ" placeholder="4e droite" />
                </div>
                <div className="sm:col-span-2">
                  <label className="etiquette" htmlFor="occupant_telephone">Téléphone</label>
                  <input id="occupant_telephone" name="occupant_telephone" className="champ" type="tel" />
                </div>
              </>
            )}
          </>
        )}
      </fieldset>
    </>
  );
}
