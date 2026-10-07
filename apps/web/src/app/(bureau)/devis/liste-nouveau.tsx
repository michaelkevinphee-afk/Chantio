'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { aDesImmeubles, DESCRIPTION_PARCOURS, euroBac, LIBELLE_PARCOURS, nombreBac, type Parcours, type TypeClient } from '@chantio/shared';
import { Fenetre } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { Bouton, Puce } from '@/components/ui';
import { creerBrouillon, devisAFacturer } from './actions';
import type { ClientFenetre } from './liste-donnees';
import type { GenreListe } from './liste-regles';

// Fenêtre « Nouveau devis » / « Nouvelle facture » du bac (fenetreNouveauDoc) : le type, le client
// (avec l'immeuble et l'occupant pour un syndic ou un bailleur), l'objet, et pour un devis de chantier
// la réponse à un appel d'offres. « Créer le brouillon » ouvre l'éditeur sur le brouillon prérempli.
// Pour une facture, les devis signés du client restent à facturer : acompte, avancement, situation ou solde
// se préparent depuis le devis (fenêtre « Facturer le devis », ouverte d'emblée avec ?facturer=1).

const ETIQUETTE = 'mb-1 block text-[13px] font-bold text-gris';
const CHAMP = 'champ rounded-[12px] px-3 py-2.5 text-[15px]';
const RANGEE = 'grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5';
const PARCOURS: Parcours[] = ['depannage', 'chantier', 'contrat'];
const TON: Record<Parcours, 'rouge' | 'bleu' | 'vert'> = { depannage: 'rouge', chantier: 'bleu', contrat: 'vert' };

export function FenetreNouveauDocument({
  genre,
  clients,
  clientInitial,
  retourClient,
  fermer,
}: {
  genre: GenreListe;
  clients: ClientFenetre[];
  clientInitial?: string;
  /** Ouverte depuis une liste filtrée sur un client : l'éditeur gardera le retour à sa fiche. */
  retourClient: boolean;
  fermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const devis = genre === 'devis';
  const titre = devis ? 'Nouveau devis' : 'Nouvelle facture';

  const premier = clients.find((k) => k.id === clientInitial) ?? clients[0];
  const [parcours, setParcours] = useState<Parcours>('depannage');
  const [clientId, setClientId] = useState(premier?.id ?? '');
  const [siteId, setSiteId] = useState('');
  const [occupant, setOccupant] = useState('');
  const [objet, setObjet] = useState('');
  const [ao, setAo] = useState(false);
  const [aoLimite, setAoLimite] = useState('');
  const [aoRef, setAoRef] = useState('');
  const [aFacturer, setAFacturer] = useState<Awaited<ReturnType<typeof devisAFacturer>> | null>(null);
  useEffect(() => {
    if (!devis) devisAFacturer().then(setAFacturer, () => setAFacturer([]));
  }, [devis]);

  // Sans client, le bac renvoie d'abord vers « Mes clients ».
  if (!premier)
    return (
      <Fenetre
        titre={titre}
        fermer={fermer}
        pied={
          <>
            <Bouton type="button" variante="secondaire" data-fermer className="px-4 py-2.5 !text-cobalt">
              Annuler
            </Bouton>
            <Link href="/clients?nouveau=1" className="degrade inline-flex items-center justify-center rounded-[14px] px-4 py-2.5 text-[15px] font-extrabold text-white">
              Créer un client
            </Link>
          </>
        }
      >
        <p className="text-[15px]">Créez d’abord un client dans « Mes clients ».</p>
      </Fenetre>
    );

  const client = clients.find((k) => k.id === clientId) ?? premier;
  const immeubles = aDesImmeubles(client.type as TypeClient) ? client.sites : [];
  const immeuble = immeubles.find((s) => s.id === siteId) ?? immeubles[0] ?? null;
  const occupants = immeuble?.occupants ?? [];
  const occupantChoisi = occupants.includes(occupant) ? occupant : (occupants[0] ?? '');
  const reponseAO = devis && parcours === 'chantier' && ao;

  const creer = () =>
    demarrer(async () => {
      const r = await creerBrouillon({
        genre,
        parcours,
        client_id: client.id,
        site_id: immeuble?.id ?? null,
        occupant: immeuble ? occupantChoisi || null : null,
        objet: objet.trim(),
        ao: reponseAO ? { limite: aoLimite || null, consultation: aoRef.trim() } : null,
      });
      if (!r.ok) {
        annoncer(r.erreur ?? 'Le brouillon n’a pas pu être créé.', 'erreur');
        return;
      }
      annoncer(r.message);
      router.push(`/devis/${r.id}${retourClient ? '?retour=client' : ''}`);
    });

  return (
    <Fenetre
      titre={titre}
      fermer={fermer}
      large
      pied={
        <>
          <Bouton type="button" variante="secondaire" data-fermer className="px-4 py-2.5 !text-cobalt">
            Annuler
          </Bouton>
          <Bouton type="button" className="px-4 py-2.5" onClick={creer} disabled={enCours} aria-busy={enCours}>
            {enCours && <Roue />}
            Créer le brouillon
          </Bouton>
        </>
      }
    >
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5 max-[560px]:grid-cols-1">
        {PARCOURS.map((p) => {
          const on = parcours === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setParcours(p)}
              className={`flex flex-col items-start gap-1 rounded-[12px] border bg-white text-left transition hover:border-pervenche ${
                on ? 'border-2 border-cobalt bg-[#F7F8FF] p-[11px]' : 'border-trait p-3'
              }`}
            >
              <Puce ton={TON[p]}>{LIBELLE_PARCOURS[p]}</Puce>
              <b className="text-sm font-extrabold">{LIBELLE_PARCOURS[p]}</b>
              <small className="text-xs leading-snug text-gris">{DESCRIPTION_PARCOURS[p]}</small>
            </button>
          );
        })}
      </div>

      <div className={RANGEE}>
        <label>
          <span className={ETIQUETTE}>Client</span>
          <select
            className={CHAMP}
            value={client.id}
            onChange={(e) => {
              setClientId(e.target.value);
              setSiteId('');
              setOccupant('');
            }}
          >
            {clients.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nom}
              </option>
            ))}
          </select>
        </label>
        {immeuble && (
          <>
            <label>
              <span className={ETIQUETTE}>Immeuble</span>
              <select
                className={CHAMP}
                value={immeuble.id}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setOccupant('');
                }}
              >
                {immeubles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={ETIQUETTE}>Occupant</span>
              <select className={CHAMP} value={occupantChoisi} onChange={(e) => setOccupant(e.target.value)}>
                {occupants.length ? (
                  occupants.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))
                ) : (
                  <option value="">Parties communes</option>
                )}
              </select>
            </label>
          </>
        )}
      </div>

      <label>
        <span className={ETIQUETTE}>Objet</span>
        <input
          type="text"
          className={CHAMP}
          value={objet}
          onChange={(e) => setObjet(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !enCours && creer()}
          placeholder="ex. Remplacement du chauffe-eau"
          autoFocus
        />
      </label>

      {devis && parcours === 'chantier' && (
        <>
          <label className="inline-flex cursor-pointer items-center gap-2.5 self-start text-[15px] font-bold">
            <input type="checkbox" className="h-4 w-4 accent-cobalt" checked={ao} onChange={(e) => setAo(e.target.checked)} />
            C’est une réponse à un appel d’offres
          </label>
          {ao && (
            <div className={RANGEE}>
              <label>
                <span className={ETIQUETTE}>Date limite de réponse</span>
                <input type="date" className={CHAMP} value={aoLimite} onChange={(e) => setAoLimite(e.target.value)} />
              </label>
              <label>
                <span className={ETIQUETTE}>Consultation</span>
                <input type="text" className={CHAMP} value={aoRef} onChange={(e) => setAoRef(e.target.value)} placeholder="ex. Marché public, lot 11 plomberie" />
              </label>
            </div>
          )}
        </>
      )}

      {!devis && aFacturer && (
        <section aria-labelledby="nf-devis" className="rounded-[12px] border border-trait bg-[#F7F8FF] p-3">
          <h3 id="nf-devis" className="text-sm font-extrabold">
            Acompte, avancement, situation ou solde d’un devis signé
          </h3>
          {aFacturer.filter((v) => v.clientId === client.id).length ? (
            <ul className="mt-2 grid gap-2">
              {aFacturer
                .filter((v) => v.clientId === client.id)
                .map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-trait bg-white px-3 py-2">
                    <span className="text-[14px]">
                      <b>{v.numero ?? 'Devis'}</b> · {v.objet || 'Sans objet'}
                      <small className="block text-xs text-gris">
                        {euroBac(v.ht)} HT · déjà facturé {nombreBac(v.facturePct)} %
                      </small>
                    </span>
                    <Link href={`/devis/${v.id}?facturer=1`} className="rounded-[10px] border border-cobalt px-3 py-1.5 text-sm font-extrabold text-cobalt hover:bg-white">
                      Facturer ce devis
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-gris">Ce client n’a pas de devis signé à facturer. Une facture d’acompte, d’avancement ou de situation part toujours d’un devis signé.</p>
          )}
        </section>
      )}
    </Fenetre>
  );
}
