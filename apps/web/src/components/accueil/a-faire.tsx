import Link from 'next/link';
import type { AttenteAFaire, ElementAFaire } from '@chantio/shared';
import { planifierVisites, preparerRenouvellement } from '@/app/(bureau)/clients/contrats/actions';
import { AnnonceRenouvellement } from '@/app/(bureau)/clients/fenetres';
import { devisDepuisIntervention, facturerIntervention } from '@/app/(bureau)/interventions/actions';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton } from '@/components/ui';

const NIVEAU = {
  urgent: { libelle: 'Urgent', classe: 'bg-rouge text-white' },
  afaire: { libelle: 'À faire', classe: 'bg-cobalt text-white' },
  attente: { libelle: 'On attend', classe: 'bg-white text-gris ring-1 ring-trait ring-inset' },
} as const;

const BOUTON = '!px-3 !py-2 !text-[13px] min-h-10 max-[900px]:w-full max-[900px]:min-h-12 max-[700px]:!text-[15px]';

/**
 * Les boutons qui ouvrent une intervention l'ouvrent par-dessus l'Accueil (son volet, ?fiche=),
 * comme le bac qui ouvre le volet sur la page en cours.
 */
export function lienAccueil(lien: string): string {
  const m = /^\/interventions\?fiche=([^&]+)$/.exec(lien);
  return m ? `/?fiche=${m[1]}` : lien;
}

/** Le bouton d'une ligne : une action serveur qui crée quelque chose (geste), sinon un lien. */
function Action({ x }: { x: ElementAFaire }) {
  const g = x.geste;
  if (g) {
    const action =
      g.action === 'renouveler'
        ? preparerRenouvellement.bind(null, g.id)
        : g.action === 'planifier-visites'
          ? planifierVisites.bind(null, g.id)
          : g.action === 'facturer-intervention'
            ? facturerIntervention.bind(null, g.id)
            : devisDepuisIntervention.bind(null, g.id);
    return (
      <form action={action} data-geste={g.action} className="max-[900px]:w-full">
        {/* Après « Planifier les visites », retour sur l'Accueil avec la bulle « N visites créées … » ;
            après « Préparer le renouvellement », l'éditeur du devis (sa croix ramène ici) et la bulle du bac. */}
        {(g.action === 'planifier-visites' || g.action === 'renouveler') && <input type="hidden" name="retour" value="/" />}
        {g.action === 'renouveler' && <AnnonceRenouvellement />}
        <BoutonEnvoi variante="secondaire" className={BOUTON} data-action enCours={g.action === 'planifier-visites' ? 'Création…' : 'Préparation…'}>
          {x.bouton}
        </BoutonEnvoi>
      </form>
    );
  }
  const lien = lienAccueil(x.lien);
  return (
    <LienBouton variante="secondaire" href={lien} scroll={!lien.startsWith('/?')} className={BOUTON} data-action>
      {x.bouton}
    </LienBouton>
  );
}

/**
 * Les lignes d'une case « En un coup d'œil » (rendues par le serveur, montrées par CoupDOeil) :
 * pastille Urgent / À faire, à qui c'est (le client mène à sa fiche), la phrase et le bouton qui la règle.
 */
export function LignesAFaire({ lignes }: { lignes: ElementAFaire[] }) {
  return (
    <div className="flex flex-col gap-2">
      {lignes.map((x) => (
        <div
          key={x.cle}
          className={`grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-3.5 py-3 text-[14.5px] max-[900px]:grid-cols-1 max-[900px]:gap-2 max-[700px]:text-[15px] ${
            x.niveau === 'urgent' ? 'bg-rouge-doux' : 'bg-fond'
          }`}
        >
          <span className={`justify-self-start rounded-full px-2.5 py-[3px] text-xs font-extrabold whitespace-nowrap ${NIVEAU[x.niveau].classe}`}>{NIVEAU[x.niveau].libelle}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {x.client ? (
              <Link href={`/clients/${x.client.id}?depuis=accueil`} className="mb-0.5 block text-[13.5px] font-extrabold text-cobalt hover:underline">
                {x.client.nom}
              </Link>
            ) : (
              <b className="mb-0.5 block text-[13.5px] font-extrabold">{x.module}</b>
            )}
            {x.texte}
          </span>
          <Action x={x} />
        </div>
      ))}
    </div>
  );
}

/** La phrase « On attend aussi … » et ses liens, sous les cases. */
export function AttenteAccueil({ attente }: { attente: AttenteAFaire }) {
  return (
    <p className="text-[14.5px] text-gris">
      <b className="font-extrabold text-encre">On attend aussi</b> {attente.texte}{' '}
      {attente.liens.map((l) => (
        <Link key={l.lien} href={l.lien} className="mr-4 inline-block font-extrabold text-cobalt hover:underline max-[700px]:py-2">
          {l.libelle}
        </Link>
      ))}
    </p>
  );
}
