'use client';

import { useRef, useState } from 'react';
import { Fenetre } from '@/components/fenetre';
import { annoncer, Roue } from '@/components/retour';
import { Bouton } from '@/components/ui';
import { changerMotDePasse, modifierProfil } from './actions';
import { ChampAuto } from './champ-auto';

/** Mon profil › Mes informations : prénom, nom, e-mail (lecture seule), téléphone. */
export function ChampsProfil({
  prenom,
  nom,
  email,
  telephone,
  valideLe,
  modifiable,
}: {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  valideLe: string | null;
  modifiable: boolean;
}) {
  const aide = modifiable ? undefined : 'Demandez à votre dirigeant de modifier vos informations dans Membres.';
  return (
    <>
      <ChampAuto cle="prenom" libelle="Prénom" valeur={prenom} envoi={(k, v) => modifierProfil(k, String(v))} desactive={!modifiable} aide={aide} autoComplete="given-name" />
      <ChampAuto cle="nom" libelle="Nom" valeur={nom} envoi={(k, v) => modifierProfil(k, String(v))} desactive={!modifiable} autoComplete="family-name" />
      <ChampAuto
        cle="email_compte"
        libelle="E-mail"
        valeur={email}
        type="email"
        lectureSeule
        aide={`Adresse validée${valideLe ? ` le ${valideLe}` : ''}. Elle sert à vous connecter.`}
      />
      <ChampAuto
        cle="telephone"
        libelle="Téléphone"
        valeur={telephone}
        type="tel"
        envoi={(k, v) => modifierProfil(k, String(v))}
        desactive={!modifiable}
        autoComplete="tel"
      />
    </>
  );
}

const reglesOk = (m: string) => m.length >= 8 && /\d/.test(m) && /[a-zA-Z]/.test(m);

/** Bouton « Changer le mot de passe » et sa fenêtre (mot de passe actuel, nouveau). */
export function ChangerMotDePasse() {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const actuel = useRef<HTMLInputElement>(null);
  const nouveau = useRef<HTMLInputElement>(null);

  async function enregistrer() {
    const a = actuel.current!.value;
    const n = nouveau.current!.value;
    if (!a) {
      annoncer('Le mot de passe actuel n’est pas le bon', 'erreur');
      actuel.current!.focus();
      return;
    }
    if (!reglesOk(n)) {
      annoncer('8 caractères minimum, dont un chiffre et une lettre', 'erreur');
      nouveau.current!.focus();
      return;
    }
    setEnCours(true);
    let r;
    try {
      r = await changerMotDePasse(a, n);
    } catch {
      r = { ok: false as const, erreur: 'Le mot de passe n’a pas pu être changé. Réessayez.' };
    }
    setEnCours(false);
    if (r.ok) {
      setOuvert(false);
      annoncer('Mot de passe changé');
    } else {
      annoncer(r.erreur, 'erreur');
      (r.erreur.includes('actuel') ? actuel : nouveau).current?.focus();
    }
  }

  return (
    <>
      <Bouton type="button" variante="secondaire" className="!px-4 !py-2.5 text-sm" onClick={() => setOuvert(true)}>
        Changer le mot de passe
      </Bouton>
      {ouvert && (
        <Fenetre
          titre="Changer le mot de passe"
          fermer={() => setOuvert(false)}
          sansCroix
          pied={
            <>
              <Bouton type="button" variante="secondaire" data-fermer>
                Annuler
              </Bouton>
              <Bouton type="submit" form="mot-de-passe" disabled={enCours} aria-busy={enCours}>
                {enCours && <Roue />} Enregistrer
              </Bouton>
            </>
          }
        >
          <form
            id="mot-de-passe"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              enregistrer();
            }}
          >
            <label className="block">
              <span className="etiquette">Mot de passe actuel</span>
              <input ref={actuel} type="password" autoComplete="current-password" className="champ" autoFocus />
            </label>
            <label className="block">
              <span className="etiquette">Nouveau mot de passe</span>
              <input ref={nouveau} type="password" autoComplete="new-password" className="champ" aria-describedby="mdp-aide" />
              <span id="mdp-aide" className="mt-1 block text-xs font-medium text-gris">
                8 caractères minimum, dont un chiffre et une lettre
              </span>
            </label>
          </form>
        </Fenetre>
      )}
    </>
  );
}
