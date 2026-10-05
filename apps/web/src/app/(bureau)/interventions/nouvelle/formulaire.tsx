'use client';

import { startTransition, useActionState, useState } from 'react';
import {
  LIBELLE_URGENCE,
  MOTIFS,
  aDesImmeubles,
  adresseComplete,
  initiales,
  nomCourt,
  payeurTexte,
  type FamilleIntervention,
  type TypeClient,
} from '@chantio/shared';
import { Roue } from '@/components/retour';
import { Avatar, Bouton } from '@/components/ui';
import type { ClientAdresses } from '@/lib/requetes';
import { creerIntervention } from '../actions';
import { libelleSansOccupant } from '../volet/client-lieu';
import type { Technicien } from '../volet/planification';
import { AIDE, CHAMP, ETIQUETTE, PAYEUR, PUCE_TECH, PUCE_TECH_OFF, PUCE_TECH_ON, RANGEE } from '../volet/styles';

export type ValeursInitiales = {
  type: FamilleIntervention;
  /** Donneur d'ordre déjà choisi (d'office le premier client, comme le bac ; '' : aucun client ; 'nouveau' : nouveau client). */
  client: string;
  site?: string;
  date: string;
  moment: 0 | 1;
  heure: string;
  techniciens: string[];
  motif?: string;
  description?: string;
  devis?: { id: string; numero: string | null };
  /** Ancienne fiche d'intervention importée (nom du fichier, message si la lecture n'a pas abouti). */
  importe?: { nom: string; message?: string };
  nouveauClient?: { nom: string; telephone: string; type: string };
  adresse?: { adresse: string; code_postal: string; ville: string };
};

const LIBELLE_FAMILLE_UNE: Record<FamilleIntervention, string> = { depannage: 'Dépannage', chantier: 'Chantier', entretien: 'Entretien' };

/**
 * Formulaire de la fenêtre « Nouvelle intervention », dans l'ordre du bac : numéro, Type · Donneur d'ordre · Urgence,
 * Immeuble · Occupant · N° d'ordre de service, contrat, motif, Date · Moment · Heure · Durée, techniciens,
 * mot du bureau, puis à qui partira la facture.
 */
export function FormulaireIntervention({
  retour,
  clients,
  numeros,
  typesClient,
  techniciens,
  initial,
}: {
  /** Adresse de la page sous la fenêtre : on y revient avec le volet de l'intervention créée. */
  retour: string;
  clients: ClientAdresses[];
  /** Numéro qui sera attribué, pour chaque type. */
  numeros: Record<FamilleIntervention, string>;
  typesClient: { valeur: string; libelle: string }[];
  techniciens: Technicien[];
  initial: ValeursInitiales;
}) {
  const [etat, envoyer, enCours] = useActionState(creerIntervention, null);
  const tries = [...clients].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const sitesDe = (id: string) => [...(clients.find((c) => c.id === id)?.sites ?? [])].sort((a, b) => a.adresse.localeCompare(b.adresse, 'fr'));
  // Premier occupant de l'immeuble choisi d'office, comme le bac (sinon les parties communes).
  const premierOccupant = (siteId: string, clientId: string) =>
    [...(sitesDe(clientId).find((s) => s.id === siteId)?.occupants ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))[0]?.id ?? '';
  const siteParDefaut = (clientId: string) => sitesDe(clientId)[0]?.id ?? 'autre';

  const [type, setType] = useState<FamilleIntervention>(initial.type);
  const [clientId, setClientId] = useState(initial.client);
  const [nouveauNom, setNouveauNom] = useState(initial.nouveauClient?.nom ?? '');
  const [nouveauType, setNouveauType] = useState(initial.nouveauClient?.type ?? 'particulier');
  const [siteId, setSiteId] = useState(() => initial.site ?? (initial.adresse ? 'autre' : siteParDefaut(initial.client)));
  const [adresseSaisie, setAdresseSaisie] = useState(initial.adresse?.adresse ?? '');
  const [occupant, setOccupant] = useState(() => premierOccupant(initial.site ?? siteParDefaut(initial.client), initial.client));
  const [os, setOs] = useState('');
  const [contrat, setContrat] = useState('');
  const [date, setDate] = useState(initial.date);
  const [moment, setMoment] = useState<0 | 1>(initial.moment);
  const [techs, setTechs] = useState(initial.techniciens);

  const client = clients.find((c) => c.id === clientId);
  const typeClient = (client?.type ?? (clientId === 'nouveau' ? nouveauType : 'particulier')) as TypeClient;
  const immeubles = aDesImmeubles(typeClient);
  const sites = sitesDe(clientId);
  const site = sites.find((s) => s.id === siteId);
  const occupants = [...(site?.occupants ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const nomOccupant = occupants.find((o) => o.id === occupant)?.nom ?? '';
  const contrats = (client?.contrats ?? []).filter((c) => !c.site_id || c.site_id === site?.id);
  const numero = numeros[type];
  const chantier = type === 'chantier';
  // Liste des adresses : l'immeuble d'un syndic ; pour les autres, seulement s'il y a le choix.
  const choixAdresse = !!clientId && sites.length > 0 && (immeubles || sites.length > 1);
  const saisieAdresse = !!clientId && !site;
  const payeur = payeurTexte(
    client ?? (clientId === 'nouveau' ? { nom: nouveauNom.trim() || 'le nouveau client', type: nouveauType } : null),
    site ?? (adresseSaisie.trim() ? { adresse: adresseSaisie.trim() } : null),
  );
  const lieu = site?.adresse ?? adresseSaisie.trim();

  function choisirClient(id: string) {
    const s = siteParDefaut(id);
    setClientId(id);
    setSiteId(s);
    setOccupant(premierOccupant(s, id));
    setContrat('');
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        // Envoi manuel : les champs gardent leur contenu si la création échoue.
        const donnees = new FormData(e.currentTarget);
        startTransition(() => envoyer(donnees));
      }}
    >
      <input type="hidden" name="retour" value={retour} />
      {initial.devis && <input type="hidden" name="devis" value={initial.devis.id} />}

      {initial.devis && (
        <p className="rounded-[10px] bg-doux px-3 py-2.5 text-[13px] font-semibold text-cobalt">
          Pré-remplie d’après le devis {initial.devis.numero ?? '(brouillon)'}. Vérifiez, choisissez la date et le technicien, puis créez l’intervention.
        </p>
      )}

      {initial.importe && (
        <p className="rounded-[10px] bg-doux px-3 py-2.5 text-[13px] font-semibold text-cobalt">
          {initial.importe.message
            ? `${initial.importe.message} (fiche ${initial.importe.nom})`
            : `Pré-remplie d’après la fiche ${initial.importe.nom}. Vérifiez le client, l’adresse et la date, puis créez l’intervention.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-live="polite" className="self-start rounded-[10px] bg-doux px-3.5 py-2 font-mono text-[22px] font-semibold text-cobalt">
          {numero}
        </span>
        <span className="text-[13px] text-gris">Numéro attribué automatiquement à la création</span>
      </div>

      <div className={RANGEE}>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Type</span>
          <select name="type" className={CHAMP} value={type} onChange={(e) => setType(e.target.value as FamilleIntervention)}>
            {(Object.keys(LIBELLE_FAMILLE_UNE) as FamilleIntervention[]).map((t) => (
              <option key={t} value={t}>
                {LIBELLE_FAMILLE_UNE[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Donneur d’ordre</span>
          <select name="client_id" className={CHAMP} required value={clientId} onChange={(e) => choisirClient(e.target.value)}>
            {!clientId && (
              <option value="" disabled>
                Choisir le donneur d’ordre…
              </option>
            )}
            {tries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({typesClient.find((t) => t.valeur === c.type)?.libelle ?? c.type})
              </option>
            ))}
            <option value="nouveau">+ Nouveau client</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Urgence</span>
          <select name="urgence" className={CHAMP} defaultValue="normale">
            {Object.entries(LIBELLE_URGENCE).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {clientId === 'nouveau' && (
        <div className={RANGEE}>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Nom ou raison sociale</span>
            <input
              name="client_nom"
              className={CHAMP}
              required
              maxLength={200}
              placeholder="ex. Mme Laurent"
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Téléphone</span>
            <input name="client_telephone" type="tel" className={CHAMP} defaultValue={initial.nouveauClient?.telephone} />
          </label>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Type de client</span>
            <select name="client_type" className={CHAMP} value={nouveauType} onChange={(e) => setNouveauType(e.target.value)}>
              {typesClient.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {client && immeubles && !sites.length && (
        <p className="rounded-[10px] bg-rouge-doux px-3 py-2.5 text-[13px] font-semibold text-rouge">
          Ce client n’a pas encore d’immeuble. Ajoutez-en un depuis sa fiche dans « Mes clients », section « Ses immeubles ».
        </p>
      )}

      {/* Une seule adresse connue (particulier, entreprise) : elle est prise d'office, comme dans le bac. */}
      {!choixAdresse && site && <input type="hidden" name="site_id" value={site.id} />}

      {(choixAdresse || (immeubles && !!clientId)) && (
        <div className={RANGEE}>
          {choixAdresse && (
            <label className="block min-w-0">
              <span className={ETIQUETTE}>{immeubles ? 'Immeuble' : 'Adresse'}</span>
              <select
                name="site_id"
                className={CHAMP}
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setOccupant(premierOccupant(e.target.value, clientId));
                  setContrat('');
                }}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {immeubles ? s.adresse : adresseComplete(s)}
                  </option>
                ))}
                <option value="autre">+ Autre adresse</option>
              </select>
            </label>
          )}
          {immeubles && (
            <>
              <label className="block min-w-0">
                <span className={ETIQUETTE}>Occupant à appeler</span>
                <select name="occupant_id" className={CHAMP} value={occupant} onChange={(e) => setOccupant(e.target.value)}>
                  {occupants.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nom}
                      {o.lot ? ` · ${o.lot}` : ''}
                    </option>
                  ))}
                  <option value="">{libelleSansOccupant(occupants)}</option>
                  <option value="nouveau">+ Nouvel occupant</option>
                </select>
              </label>
              <label className="block min-w-0">
                <span className={ETIQUETTE}>N° d’ordre de service</span>
                <input name="ordre_service" className={CHAMP} maxLength={60} placeholder="ex. 55812" value={os} onChange={(e) => setOs(e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}

      {saisieAdresse && (
        <>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Adresse de l’intervention</span>
            <input
              name="adresse"
              className={CHAMP}
              required
              maxLength={200}
              placeholder="ex. 12 rue des Tilleuls"
              value={adresseSaisie}
              onChange={(e) => setAdresseSaisie(e.target.value)}
            />
          </label>
          <div className={RANGEE}>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Code postal</span>
              <input name="code_postal" className={CHAMP} inputMode="numeric" maxLength={10} defaultValue={initial.adresse?.code_postal} />
            </label>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Ville</span>
              <input name="ville" className={CHAMP} maxLength={100} defaultValue={initial.adresse?.ville} />
            </label>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Accès</span>
              <input name="acces" className={CHAMP} maxLength={200} placeholder="Code, étage, consignes" />
            </label>
          </div>
        </>
      )}

      {immeubles && occupant === 'nouveau' && (
        <div className={RANGEE}>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Nom de l’occupant</span>
            <input name="occupant_nom" className={CHAMP} required maxLength={200} placeholder="ex. Mme Royer" />
          </label>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Étage, porte ou lot</span>
            <input name="occupant_lot" className={CHAMP} maxLength={100} placeholder="ex. 4e droite" />
          </label>
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Téléphone</span>
            <input name="occupant_telephone" type="tel" className={CHAMP} />
          </label>
        </div>
      )}

      {contrats.length > 0 && (
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Contrat d’entretien</span>
          <select
            name="contrat_id"
            className={CHAMP}
            value={contrat}
            onChange={(e) => {
              setContrat(e.target.value);
              // Une visite de contrat est un entretien.
              if (e.target.value) setType('entretien');
            }}
          >
            <option value="">Aucun</option>
            {contrats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference ?? 'Contrat'} · {c.objet}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block min-w-0">
        <span className={ETIQUETTE}>Motif</span>
        <input
          name="motif"
          className={`${CHAMP} iv-sans-fleche`}
          autoFocus
          maxLength={300}
          list="motifs-intervention"
          placeholder="ex. Fuite sur nourrice"
          defaultValue={initial.motif}
        />
        <datalist id="motifs-intervention">
          {MOTIFS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>

      <div className={RANGEE}>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>{chantier ? 'Début' : 'Date'}</span>
          <input name="date_prevue" type="date" className={CHAMP} value={date} onChange={(e) => setDate(e.target.value)} />
          <span className={AIDE}>Laissez vide pour la mettre « À placer »</span>
        </label>
        <label className="block min-w-0">
          <span className={ETIQUETTE}>Moment</span>
          <select name="moment" className={CHAMP} value={moment} onChange={(e) => setMoment(e.target.value === '1' ? 1 : 0)}>
            <option value={0}>Matin</option>
            <option value={1}>Après-midi</option>
          </select>
        </label>
        {chantier ? (
          <label className="block min-w-0">
            <span className={ETIQUETTE}>Fin</span>
            <input name="date_fin" type="date" className={CHAMP} min={date || undefined} disabled={!date} />
          </label>
        ) : (
          <>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Heure</span>
              <input name="heure_prevue" type="time" className={CHAMP} defaultValue={initial.heure} />
            </label>
            <label className="block min-w-0">
              <span className={ETIQUETTE}>Durée prévue (h)</span>
              <input name="duree_prevue" className={CHAMP} inputMode="decimal" maxLength={5} defaultValue="1" />
            </label>
          </>
        )}
      </div>

      <div>
        <span className={ETIQUETTE}>Techniciens</span>
        <div className="flex flex-wrap gap-1.5">
          {techniciens.map((m) => {
            const on = techs.includes(m.id);
            return (
              <label key={m.id} className={`${PUCE_TECH} ${on ? PUCE_TECH_ON : PUCE_TECH_OFF}`}>
                <input
                  type="checkbox"
                  name="techniciens"
                  value={m.id}
                  className="pointer-events-none absolute opacity-0"
                  checked={on}
                  onChange={() => setTechs(on ? techs.filter((t) => t !== m.id) : [...techs, m.id])}
                />
                <Avatar url={m.photo} initiales={initiales(m.prenom, m.nom)} taille={22} />
                {nomCourt(m.prenom, m.nom)}
                {m.invite && <small className="font-medium text-gris">(invité)</small>}
              </label>
            );
          })}
        </div>
      </div>

      <label className="block min-w-0">
        <span className={ETIQUETTE}>Mot du bureau pour le technicien</span>
        <textarea
          name="description"
          rows={initial.description ? 5 : 2}
          maxLength={4000}
          className={`${CHAMP} resize-y`}
          placeholder="Code, clé chez la gardienne, pièce à prévoir…"
          defaultValue={initial.description}
        />
      </label>

      {(client || clientId === 'nouveau') && (
        <div className={PAYEUR}>
          La facture partira à : <b>{payeur}</b>
          {immeubles && lieu && (
            <>
              <br />
              <span className="text-[12.5px]">
                Avec les mentions : intervention <span className="font-mono">{numero}</span>, {lieu}
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
      )}

      {etat?.erreur && (
        <p role="alert" className="rounded-[10px] bg-rouge-doux px-3 py-2.5 text-[13px] font-semibold text-rouge">
          {etat.erreur}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Bouton type="button" variante="secondaire" data-fermer>
          Annuler
        </Bouton>
        <Bouton type="submit" disabled={enCours} aria-busy={enCours}>
          {enCours && <Roue />}
          {enCours ? 'Numérotation…' : 'Créer l’intervention'}
        </Bouton>
      </div>
    </form>
  );
}
