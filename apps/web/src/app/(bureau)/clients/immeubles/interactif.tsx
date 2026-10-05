'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { annoncer } from '@/components/retour';
import { Bouton, Puce } from '@/components/ui';
import type { EtatFenetre } from '../actions';
import { Champ, FormulaireFenetre, LigneChamps, SAISIE } from '../fenetres';

// Parties interactives de « Immeubles et contrats » : la liste des bâtiments (qui fait défiler jusqu'à la fiche
// sur téléphone), le contrat mis en avant, et la fenêtre « Équipement ».

export type ItemBatiment = {
  cle: string;
  href: string;
  initiales: string;
  nom: string;
  client: string;
  etat: { ton: 'rouge' | 'violet' | 'vert'; etiquette: string } | null;
};

/** Liste des bâtiments (listeBats du bac) : colonne collante sur ordinateur, bandeau qui défile sous 901 px. */
export function ListeBatiments({ items, actif }: { items: ItemBatiment[]; actif: string }) {
  const defiler = useRef(false);
  useEffect(() => {
    if (!defiler.current) return;
    defiler.current = false;
    document.getElementById('fiche-batiment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [actif]);
  return (
    <div
      role="list"
      aria-label="Bâtiments"
      className="sticky top-4 flex min-w-0 flex-col gap-1.5 max-[900px]:static max-[900px]:flex-row max-[900px]:overflow-x-auto max-[900px]:pb-1"
    >
      {items.map((b) => {
        const oui = b.cle === actif;
        return (
          <Link
            key={b.cle}
            role="listitem"
            href={b.href}
            scroll={false}
            aria-current={oui ? 'true' : undefined}
            onClick={() => {
              if (window.innerWidth < 901) defiler.current = true;
            }}
            className={`grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-[12px] bg-white text-left transition max-[900px]:min-w-[220px] ${
              oui ? 'border-2 border-cobalt bg-[#F7F8FF] p-[9px]' : 'border border-trait p-2.5 hover:border-lavande'
            }`}
          >
            <span aria-hidden="true" className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-doux text-[13px] font-extrabold text-cobalt">
              {b.initiales}
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="text-[15px] leading-snug font-extrabold [overflow-wrap:anywhere]">{b.nom}</b>
              <small className="truncate text-xs text-gris">{b.client}</small>
            </span>
            {b.etat && (
              <span className="col-start-2 justify-self-start">
                <Puce ton={b.etat.ton}>{b.etat.etiquette}</Puce>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** Fait défiler jusqu'au contrat mis en avant (?contrat=…), une fois. */
export function DefilerVers({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [id]);
  return null;
}

/** Fenêtre « Nouvel équipement · <bâtiment> » / « Modifier l’équipement » (fenetreEquipement du bac). */
export function FormulaireEquipement({
  action,
  fermer,
  valeurs,
  retirer,
}: {
  action: (etat: EtatFenetre, d: FormData) => Promise<EtatFenetre>;
  fermer: string;
  valeurs: { categorie: string; detail: string; dernier: string; prochain: string; obligation: string };
  retirer?: () => Promise<EtatFenetre>;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  return (
    <FormulaireFenetre
      action={action}
      fermer={fermer}
      valider="Enregistrer"
      gauche={
        retirer && (
          <Bouton
            type="button"
            variante="danger"
            className="!px-4 !py-2.5"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const r = await retirer();
                if (r?.erreur) annoncer(r.erreur, 'erreur');
                else if (r?.ok) annoncer(r.ok);
                router.push(r?.aller ?? fermer, { scroll: false });
              })
            }
          >
            Retirer
          </Bouton>
        )
      }
    >
      <input type="hidden" name="detail_avant" value={valeurs.detail} />
      <Champ libelle="Équipement">
        <input name="categorie" defaultValue={valeurs.categorie} className={SAISIE} placeholder="ex. Chaudière gaz 35 kW" autoFocus required />
      </Champ>
      <Champ libelle="Détail">
        <input name="detail" defaultValue={valeurs.detail} className={SAISIE} placeholder="Marque, année de pose…" />
      </Champ>
      <LigneChamps>
        <Champ libelle="Dernier passage">
          <input name="dernier_passage" type="date" defaultValue={valeurs.dernier} className={SAISIE} />
        </Champ>
        <Champ libelle="Prochain passage">
          <input name="prochain_passage" type="date" defaultValue={valeurs.prochain} className={SAISIE} />
        </Champ>
      </LigneChamps>
      <Champ libelle="Obligation réglementaire">
        <input name="obligation" defaultValue={valeurs.obligation} className={SAISIE} placeholder="ex. Entretien annuel obligatoire" />
      </Champ>
    </FormulaireFenetre>
  );
}
