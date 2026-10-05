'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIBELLE_ROLE, type RoleMembre } from '@chantio/shared';
import { Fenetre, FenetreConfirmation } from '@/components/fenetre';
import { annoncer, BoutonEnvoi } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { changerActif, inviter, modifierMembre, renvoyer } from '../equipe/actions';

export const ADRESSE_MEMBRES = '/parametres?rubrique=membres';
const ROLES = Object.keys(LIBELLE_ROLE) as RoleMembre[];
const PETIT = '!rounded-[10px] !px-3 !py-1.5 !text-[13px]';

export interface FicheMembre {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  role: RoleMembre;
  metier: string;
  heures: number;
  /** A déjà un compte : l'e-mail de connexion ne se change pas ici. */
  compte: boolean;
  /** C'est la fiche de la personne connectée : son rôle ne se change pas. */
  moi: boolean;
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="etiquette">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-xs font-medium text-gris">{aide}</span>}
    </label>
  );
}

/** Fenêtre « Nouveau collaborateur » ou « Modifier Prénom Nom » (champs du bac). */
export function FenetreMembre({ membre, erreur }: { membre?: FicheMembre; erreur?: string }) {
  const nouveau = !membre;
  const [role, setRole] = useState<RoleMembre>(membre?.role ?? 'technicien');
  const action = nouveau ? inviter : modifierMembre.bind(null, membre.id);
  return (
    <Fenetre titre={nouveau ? 'Nouveau collaborateur' : `Modifier ${[membre.prenom, membre.nom].filter(Boolean).join(' ')}`} fermer={ADRESSE_MEMBRES} large sansCroix>
      <form action={action} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Prénom">
            <input name="prenom" className="champ" defaultValue={membre?.prenom} required maxLength={80} autoFocus autoComplete="off" />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom" className="champ" defaultValue={membre?.nom} maxLength={80} autoComplete="off" />
          </Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="E-mail" aide={nouveau ? 'Un code part par e-mail' : membre.compte ? 'Elle sert à se connecter : seule la personne peut la changer.' : undefined}>
            <input
              name="email"
              type="email"
              className={`champ ${membre?.compte ? '!bg-gris-doux text-gris' : ''}`}
              defaultValue={membre?.email}
              required={nouveau}
              readOnly={membre?.compte}
              maxLength={200}
              autoComplete="off"
            />
          </Champ>
          <Champ libelle="Téléphone">
            <input name="telephone" type="tel" className="champ" defaultValue={membre?.telephone} maxLength={30} autoComplete="off" />
          </Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Rôle" aide={membre?.moi ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}>
            <select name="role" className="champ" value={role} onChange={(e) => setRole(e.target.value as RoleMembre)} disabled={membre?.moi}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {LIBELLE_ROLE[r]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Métier">
            <input name="metier" className="champ" defaultValue={membre?.metier} placeholder="ex. Plombier chauffagiste" maxLength={80} />
          </Champ>
          <Champ libelle="Heures par semaine" aide="Sert au calcul de la charge">
            <input name="heures" className="champ tabular-nums" inputMode="decimal" defaultValue={String(membre?.heures ?? 39).replace('.', ',')} />
          </Champ>
        </div>
        <label className="flex items-start gap-2 text-[14px] font-bold">
          <input type="checkbox" checked={role !== 'assistant'} disabled readOnly className="mt-0.5 h-4 w-4 shrink-0 accent-cobalt" />
          <span>
            Va sur le terrain : apparaît au planning et utilise l’appli technicien
            <span className="mt-0.5 block text-xs font-medium text-gris">Selon le rôle : seuls les assistant(e)s restent au bureau.</span>
          </span>
        </label>
        {erreur && <p className="rounded-xl bg-rouge-doux px-4 py-3 text-sm font-semibold text-rouge">{erreur}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Bouton type="button" variante="secondaire" data-fermer>
            Annuler
          </Bouton>
          <BoutonEnvoi enCours={nouveau ? 'Envoi de l’invitation…' : 'Enregistrement…'}>{nouveau ? 'Envoyer l’invitation' : 'Enregistrer'}</BoutonEnvoi>
        </div>
      </form>
    </Fenetre>
  );
}

/** Boutons sous un membre : Modifier, Désactiver (avec confirmation), Renvoyer l'invitation, Réactiver. */
export function ActionsMembre({ id, nom, prenom, etat, dirigeant, moi }: { id: string; nom: string; prenom: string; etat: 'actif' | 'invite' | 'desactive'; dirigeant: boolean; moi: boolean }) {
  const router = useRouter();
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function basculer(actif: boolean) {
    setEnCours(true);
    const r = await changerActif(id, actif).catch(() => ({ erreur: 'Le changement n’a pas pu être enregistré.' }));
    setEnCours(false);
    setConfirmer(false);
    if (r?.erreur) return annoncer(r.erreur, 'erreur');
    annoncer(`${prenom} ${actif ? 'réactivé' : 'désactivé'}`);
    router.refresh();
  }

  if (etat === 'invite')
    return (
      <form action={renvoyer.bind(null, id)}>
        <BoutonEnvoi variante="secondaire" className={PETIT} enCours="Envoi…">
          Renvoyer l’invitation
        </BoutonEnvoi>
      </form>
    );
  if (etat === 'desactive')
    return (
      <Bouton type="button" variante="secondaire" className={PETIT} disabled={enCours} onClick={() => basculer(true)}>
        Réactiver
      </Bouton>
    );
  return (
    <>
      <Bouton type="button" variante="secondaire" className={PETIT} onClick={() => router.push(`${ADRESSE_MEMBRES}&modifier=${id}`, { scroll: false })}>
        Modifier
      </Bouton>
      {!dirigeant && !moi && (
        <Bouton type="button" variante="secondaire" className={PETIT} onClick={() => setConfirmer(true)}>
          Désactiver
        </Bouton>
      )}
      {confirmer && (
        <FenetreConfirmation
          titre={`Désactiver ${nom} ?`}
          texte="Cette personne ne pourra plus se connecter. Ses interventions passées restent visibles."
          bouton="Désactiver"
          danger
          enCours={enCours}
          onConfirmer={() => basculer(false)}
          fermer={() => setConfirmer(false)}
        />
      )}
    </>
  );
}

/** Annonce une fois un retour passé dans l'adresse (« Enregistré » après la fenêtre Modifier), puis le retire de l'adresse. */
export function AnnonceRetour({ message, adresse }: { message: string; adresse: string }) {
  const router = useRouter();
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    annoncer(message);
    router.replace(adresse, { scroll: false });
  }, [message, adresse, router]);
  return null;
}
