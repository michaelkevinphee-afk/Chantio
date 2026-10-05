'use client';

import { Fenetre } from '@/components/fenetre';
import { classeBouton } from '@/components/ui';
import { IconeAchat, type NomIconeAchat } from './icones';

const Bientot = () => <span className="ml-1.5 rounded-full bg-violet-doux px-2 py-0.5 text-xs font-extrabold text-violet">Bientôt</span>;

function Option({ icone, titre, children }: { icone: NomIconeAchat; titre: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 rounded-[14px] border border-trait p-4">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-doux text-cobalt">
        <IconeAchat nom={icone} taille={20} />
      </span>
      <div className="min-w-0">
        <b>{titre}</b> <Bientot />
        <p className="mt-1.5 text-sm text-gris">{children}</p>
      </div>
    </div>
  );
}

/** Fenêtre « Collecte automatique » du bac : factures électroniques (Super PDP) et e-mail, tous deux à venir. */
export function FenetreCollecte({ fermer }: { fermer: () => void }) {
  return (
    <Fenetre
      titre="Collecte automatique"
      texte="Vos factures fournisseurs arrivent toutes seules dans « Reçu », prêtes à vérifier."
      fermer={fermer}
      large
      sansCroix
      pied={
        <button type="button" data-fermer autoFocus className={classeBouton('principal', 'px-4 py-2.5')}>
          Fermer
        </button>
      }
    >
      <Option icone="eclair" titre="Factures électroniques, par Super PDP">
        Depuis le 1<sup>er</sup> septembre 2026, toute entreprise doit pouvoir recevoir des factures électroniques. Chantio les recevra par Super PDP,
        plateforme agréée : les montants, les dates et le fournisseur arrivent déjà lus, sans erreur possible.
      </Option>
      <Option icone="com" titre="Par e-mail">
        Une adresse e-mail propre à votre entreprise : il suffira d’y transférer les factures reçues par e-mail, elles seront lues automatiquement.
      </Option>
    </Fenetre>
  );
}
