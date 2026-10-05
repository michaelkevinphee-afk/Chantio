'use client';

// Section « Client » de l'éditeur, comme secClient() du bac : la carte du client (crayon « Changer de client »),
// pour un syndic ou un bailleur l'immeuble, l'occupant et le n° d'ordre de service, puis « Devis pour : … ».

import { useState } from 'react';
import Link from 'next/link';
import { aDesImmeubles, dateBac, euroBac, nomClient, payeurTexte, pourcentBac, type ClientDocument, type ClientSource, type TypeClient } from '@chantio/shared';
import { Icone } from '@/components/icones';
import type { LiensDocument } from './charger';

export interface SiteConnu {
  id: string;
  adresse: string;
  code_postal: string | null;
  ville: string | null;
  copropriete: string | null;
  occupants: string[];
}

/** Client proposé dans l'éditeur (fiche, immeubles et occupants). */
export interface ClientConnu {
  id: string;
  nom: string;
  type: TypeClient;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  contact: string | null;
  siren: string | null;
  source: ClientSource;
  sites: SiteConnu[];
}

export const adresseSite = (s: SiteConnu | null | undefined) =>
  s ? [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

export function SectionClient({
  modifiable,
  genre,
  clientId,
  clientDoc,
  clients,
  siteId,
  occupant,
  ordreService,
  contrat,
  totalHT,
  choisirClient,
  choisirSite,
  changerOccupant,
  changerOrdreService,
}: {
  modifiable: boolean;
  genre: 'devis' | 'facture';
  clientId: string | null;
  clientDoc: ClientDocument;
  clients: ClientConnu[];
  siteId: string | null;
  occupant: string | null;
  ordreService: string | null;
  contrat: LiensDocument['contrat'] | null;
  totalHT: number;
  choisirClient: (id: string) => void;
  choisirSite: (id: string) => void;
  changerOccupant: (nom: string | null) => void;
  changerOrdreService: (v: string) => void;
}) {
  const [edClient, setEdClient] = useState(false);
  const c = clients.find((x) => x.id === clientId) ?? null;
  const syndic = !!c && aDesImmeubles(c.type) && c.sites.length > 0;
  const imm = syndic ? (c.sites.find((s) => s.id === siteId) ?? c.sites[0]) : null;
  const sansClient = !c && !clientDoc.nom && !clientDoc.raison;
  const payeur = c ? payeurTexte(c.source, imm) : nomClient(clientDoc);
  const occupants = imm ? [...imm.occupants, ...(occupant && !imm.occupants.includes(occupant) ? [occupant] : [])] : [];

  // Carte du client : la fiche, sinon le client tel qu'il est écrit sur le document (import).
  const lignes = c
    ? [c.adresse, c.contact, c.telephone, c.email, c.siren ? `SIREN ${c.siren}` : '']
    : [clientDoc.adresse, clientDoc.contact, clientDoc.tel, clientDoc.email, clientDoc.siret ? `SIRET ${clientDoc.siret}` : ''];

  return (
    <section className="ed-sec">
      <h2>Client</h2>
      {modifiable && (edClient || sansClient) ? (
        <div className="ed-carte">
          <label className="champ">
            Client
            <select
              autoFocus={edClient}
              value={clientId ?? ''}
              onChange={(e) => {
                if (!e.target.value) return;
                setEdClient(false);
                choisirClient(e.target.value);
              }}
            >
              {!c && <option value="">Choisir un client</option>}
              {clients.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </label>
          {!clients.length && (
            <p className="gris petit-txt">
              Créez d’abord un client dans <Link href="/clients" className="lien">« Mes clients »</Link>
            </p>
          )}
        </div>
      ) : (
        <div className="ed-carte ed-client">
          <div className="ed-cl-tete">
            <b>{c ? c.nom : nomClient(clientDoc)}</b>
            {modifiable && (
              <button type="button" className="icone" onClick={() => setEdClient(true)} aria-label="Changer de client" title="Changer de client">
                <Icone nom="crayon" taille={18} />
              </button>
            )}
          </div>
          {lignes.some(Boolean) && (
            <div className="gris">
              {lignes.filter(Boolean).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {syndic &&
        imm &&
        (modifiable ? (
          <div className="ligne-champs">
            <label className="champ">
              Immeuble
              <select value={imm.id} onChange={(e) => choisirSite(e.target.value)}>
                {c.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.copropriete ? `${s.copropriete} · ${s.adresse}` : adresseSite(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              Occupant
              <select value={occupant ?? ''} onChange={(e) => changerOccupant(e.target.value || null)}>
                <option value="">Parties communes</option>
                {occupants.map((o) => (
                  <option key={o} value={o}>
                    {o}
                    {imm.occupants.includes(o) ? '' : ' (ancien occupant)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ">
              N° d’ordre de service du syndic
              <input type="text" defaultValue={ordreService ?? ''} placeholder="ex. 55812" onBlur={(e) => changerOrdreService(e.target.value.trim())} />
            </label>
          </div>
        ) : (
          <p className="ed-lu">
            {adresseSite(imm)}
            {occupant ? `, ${occupant}` : ''}
            {ordreService && (
              <>
                {' '}
                · ordre de service <span className="mono">{ordreService}</span>
              </>
            )}
          </p>
        ))}
      <div className="payeur">
        {genre === 'devis' ? 'Devis pour' : 'Facturé à'} : <b>{payeur}</b>
      </div>
      {contrat && contrat.montant_ht > 0 && (
        <ContratActuel contrat={contrat} totalHT={totalHT} />
      )}
    </section>
  );
}

function ContratActuel({ contrat, totalHT }: { contrat: NonNullable<LiensDocument['contrat']>; totalHT: number }) {
  const ecart = (totalHT / contrat.montant_ht - 1) * 100;
  return (
    <div className="payeur">
      Contrat actuel <b className="mono">{contrat.reference}</b> : {euroBac(contrat.montant_ht, 0)} HT par an, {contrat.visites_par_an} visite
      {contrat.visites_par_an > 1 ? 's' : ''}, fin le {dateBac(contrat.fin)}. Proposition : <b>{euroBac(totalHT, 0)} HT par an</b>, soit{' '}
      <b className={ecart < 0 ? 'ecart-n' : 'ecart-p'}>
        {ecart >= 0 ? '+' : ''}
        {pourcentBac(ecart)}
      </b>
      .
    </div>
  );
}
