'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EtatEnregistrement, useEnregistrement } from './enregistrement';
import { CHAMP, ETIQUETTE, PAYEUR, RANGEE_VOLET, SECTION, TITRE_SECTION } from './styles';

export type OccupantChoix = { id: string; nom: string; lot: string | null };

/** Choix « personne en particulier » d'un immeuble : « Parties communes », sauf si l'immeuble a déjà un occupant de ce nom. */
export function libelleSansOccupant(occupants: OccupantChoix[]) {
  return occupants.some((o) => /^parties communes/i.test(o.nom)) ? 'Personne en particulier' : 'Parties communes';
}

/**
 * Rubrique « Client et lieu » : le client (lien vers sa fiche), l'adresse, et pour un syndic ou un bailleur
 * l'occupant à appeler et le n° d'ordre de service (enregistrés dès qu'on les change), puis « Qui paie ».
 */
export function ClientLieu({
  id,
  reference,
  client,
  adresse,
  detailLieu,
  immeuble,
  occupants,
  occupantId,
  ordreService,
  payeur,
}: {
  id: string;
  reference: string;
  /** `lien` : la fiche du client, avec ?depuis= pour revenir à la page d'où l'on vient (sinon /clients/<id>). */
  client: { id: string; nom: string; initiales: string; contact: string; lien?: string } | null;
  adresse: string;
  detailLieu: string;
  /** Syndic ou bailleur, avec un immeuble : occupant, ordre de service et mentions de facture. */
  immeuble: boolean;
  occupants: OccupantChoix[];
  occupantId: string | null;
  ordreService: string | null;
  payeur: string;
}) {
  const { etat, enregistrer } = useEnregistrement(id);
  const [occupant, setOccupant] = useState(occupantId ?? '');
  const [os, setOs] = useState(ordreService ?? '');
  const [osEnregistre, setOsEnregistre] = useState(ordreService ?? '');
  const nomOccupant = occupants.find((o) => o.id === occupant)?.nom ?? '';

  const validerOs = async () => {
    const v = os.trim();
    if (v === osEnregistre) return;
    if (await enregistrer({ ordre_service: v })) setOsEnregistre(v);
  };

  return (
    <section className={SECTION}>
      <h3 className={TITRE_SECTION}>
        Client et lieu <EtatEnregistrement etat={etat} />
      </h3>
      <div className="flex items-center gap-2.5">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-doux text-[13px] font-extrabold text-cobalt">
          {client?.initiales ?? '?'}
        </span>
        <div className="flex min-w-0 flex-col">
          <b className="font-extrabold">{client?.nom ?? 'Client supprimé'}</b>
          {client?.contact && <small className="text-[12.5px] text-gris">{client.contact}</small>}
          {client && (
            <Link href={client.lien ?? `/clients/${client.id}`} className="self-start text-[14px] font-bold text-cobalt hover:underline">
              Voir la fiche client
            </Link>
          )}
        </div>
      </div>
      {adresse && (
        <div className="flex min-w-0 flex-col">
          <b className="font-extrabold">{adresse}</b>
          {detailLieu && <small className="text-[12.5px] text-gris">{detailLieu}</small>}
        </div>
      )}
      {immeuble && (
        <div className={RANGEE_VOLET}>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Occupant à appeler</span>
            <select
              className={CHAMP}
              value={occupant}
              onChange={(e) => {
                setOccupant(e.target.value);
                enregistrer({ occupant_id: e.target.value || null });
              }}
            >
              <option value="">{libelleSansOccupant(occupants)}</option>
              {occupants.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nom}
                  {o.lot ? ` · ${o.lot}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>N° d’ordre de service du syndic</span>
            <input
              type="text"
              className={CHAMP}
              value={os}
              maxLength={60}
              placeholder="ex. 55812"
              onChange={(e) => setOs(e.target.value)}
              onBlur={validerOs}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        </div>
      )}
      <div className={PAYEUR}>
        Qui paie : <b>{payeur}</b>
        {immeuble && (
          <>
            <br />
            <span className="text-[12.5px]">
              Mentions sur la facture : intervention <span className="font-mono">{reference}</span>
              {adresse && `, ${adresse}`}
              {nomOccupant && `, ${nomOccupant}`}
              {os.trim() ? (
                <>
                  , ordre de service <span className="font-mono">{os.trim()}</span>
                </>
              ) : (
                ', n° d’ordre de service à renseigner'
              )}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
