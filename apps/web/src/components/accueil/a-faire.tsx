import Link from 'next/link';
import type { AttenteAFaire, ElementAFaire } from '@chantio/shared';
import { planifierVisites, preparerRenouvellement } from '@/app/(bureau)/clients/contrats/actions';
import { AnnonceRenouvellement } from '@/app/(bureau)/clients/fenetres';
import { devisDepuisIntervention, facturerIntervention } from '@/app/(bureau)/interventions/actions';
import { BoutonEnvoi } from '@/components/retour';
import { LienBouton } from '@/components/ui';
import { ListeAFaire } from './liste-a-faire';

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
function lienAccueil(lien: string): string {
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
 * Section « À faire » de l'Accueil (vAujourdhui du bac) : une ligne par chose à faire, tous clients confondus
 * (pastille Urgent / À faire, à qui c'est, la phrase, le bouton qui le règle), 10 lignes puis
 * « Afficher les N autres », et la phrase « On attend aussi … » avec ses liens.
 */
export function AFaireAccueil({ liste, attente }: { liste: ElementAFaire[]; attente: AttenteAFaire | null }) {
  const faire = liste.filter((x) => x.niveau !== 'attente');
  return (
    <section aria-labelledby="aj-t" className="carte flex min-w-0 flex-col gap-3 p-4">
      <h2 id="aj-t" className="text-[19px] font-extrabold max-[700px]:text-lg">
        À faire
      </h2>
      {faire.length ? (
        <ListeAFaire>
          {faire.map((x) => (
            <div
              key={x.cle}
              className={`grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-3.5 py-3 text-[14.5px] max-[900px]:grid-cols-1 max-[900px]:gap-2 max-[700px]:text-[15px] ${
                x.niveau === 'urgent' ? 'bg-rouge-doux' : 'bg-fond'
              }`}
            >
              <span className={`justify-self-start rounded-full px-2.5 py-[3px] text-xs font-extrabold whitespace-nowrap ${NIVEAU[x.niveau].classe}`}>
                {NIVEAU[x.niveau].libelle}
              </span>
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
        </ListeAFaire>
      ) : (
        <div className="flex flex-col gap-1 rounded-[12px] bg-vert-doux px-3.5 py-3 text-[15px]">
          <b className="text-[17.5px] leading-snug font-extrabold text-vert max-[700px]:text-[17px]">Tout est à jour : rien à faire pour l’instant.</b>
        </div>
      )}
      {attente && (
        <p className="mt-1 text-[14.5px] text-gris">
          <b className="font-extrabold text-encre">On attend aussi</b> {attente.texte}{' '}
          {attente.liens.map((l) => (
            <Link key={l.lien} href={l.lien} className="mr-4 inline-block font-extrabold text-cobalt hover:underline max-[700px]:py-2">
              {l.libelle}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}
