import Link from 'next/link';
import { LIBELLE_STATUT, type FamilleIntervention, type StatutIntervention } from '@chantio/shared';
import { AvatarTechnicien } from './techniciens';

/** Une intervention du jour, telle que l'Accueil l'affiche (carte du jour et « Qui est où »). */
export interface InterventionDuJour {
  id: string;
  reference: string;
  /** « 08:30 », ou vide sans heure. */
  heure: string;
  motif: string;
  famille: FamilleIntervention;
  /** État affiché (une fiche renvoyée au technicien compte « à reprendre »). */
  etat: StatutIntervention;
  /** L'adresse (« 12 rue de la Pompe »), sinon le nom du client. */
  lieu: string;
  /** Ids des techniciens, le premier donne la couleur. */
  membres: string[];
  /** Heure d'arrivée sur place (« 09:05 ») quand elle est en cours. */
  depuis: string | null;
}

export interface TechnicienQuiEstOu {
  id: string;
  prenom: string;
  nom: string | null;
  couleur: string;
  photo: string | null;
}

export const FAITES: StatutIntervention[] = ['terminee', 'validee', 'facturee'];

// Couleurs des cases par type, comme le bac : chantier bleu, dépannage rouge, entretien vert.
const FAMILLE: Record<FamilleIntervention, string> = {
  chantier: 'bg-doux text-cobalt',
  depannage: 'bg-rouge-doux text-[#912018]',
  entretien: 'bg-vert-doux text-vert',
};

const PUCE = {
  cobalt: 'degrade text-white shadow-none',
  bleu: 'bg-bleu-doux text-bleu',
  vert: 'bg-vert-doux text-vert',
  gris: 'bg-gris-doux text-gris ring-1 ring-inset ring-trait',
} as const;

/**
 * « Qui est où » (equipeEnDirect du bac) : chaque technicien, où il en est (« Sur place · … depuis 09:05 »,
 * « Prochaine : 11:00 · … », « Journée terminée », « Rien de prévu aujourd’hui »), ses interventions du jour
 * (un clic ouvre le volet de l'intervention) et le lien « Son appli ».
 */
export function QuiEstOu({ techniciens, interventions }: { techniciens: TechnicienQuiEstOu[]; interventions: InterventionDuJour[] }) {
  if (!techniciens.length) {
    return <p className="p-2.5 text-center text-[13px] text-gris">Ajoutez des techniciens dans « Paramètres », puis « Membres ».</p>;
  }
  return (
    <div className="flex flex-col">
      {techniciens.map((t) => {
        const j = interventions.filter((i) => i.membres.includes(t.id));
        const ec = j.find((i) => i.etat === 'en_cours');
        const proch = j.find((i) => i.etat === 'planifiee' || i.etat === 'a_reprendre');
        const [texte, ton]: [string, keyof typeof PUCE] = ec
          ? [`Sur place · ${ec.lieu}${ec.depuis ? ` depuis ${ec.depuis}` : ''}`, 'cobalt']
          : proch
            ? [`Prochaine : ${proch.heure || 'matin'} · ${proch.lieu}`, 'bleu']
            : j.length
              ? ['Journée terminée', 'vert']
              : ['Rien de prévu aujourd’hui', 'gris'];
        return (
          <div key={t.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-trait py-2.5 last:border-b-0">
            <AvatarTechnicien prenom={t.prenom} nom={t.nom} couleur={t.couleur} photo={t.photo} />
            <div className="flex min-w-0 flex-col gap-[5px]">
              <b className="font-extrabold [overflow-wrap:anywhere]">{[t.prenom, t.nom].filter(Boolean).join(' ')}</b>
              <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold [overflow-wrap:anywhere] ${PUCE[ton]}`}>{texte}</span>
              <div className="flex flex-wrap gap-1">
                {j.length ? (
                  j.map((i) => (
                    <Link
                      key={i.id}
                      href={`/?fiche=${i.id}`}
                      scroll={false}
                      title={`${i.reference} · ${i.motif} · ${LIBELLE_STATUT[i.etat]}`}
                      className={`flex min-h-[84px] max-w-full min-w-0 flex-col justify-center gap-1.5 rounded-[13px] px-[18px] py-2.5 text-left text-[14px] transition hover:brightness-[0.97] max-[1100px]:px-3 max-[900px]:min-h-[68px] ${FAMILLE[i.famille]} ${
                        i.etat === 'en_cours' ? 'ring-2 ring-cobalt ring-inset' : i.etat === 'a_reprendre' ? 'ring-2 ring-rouge ring-inset' : ''
                      } ${FAITES.includes(i.etat) ? 'opacity-55' : ''}`}
                    >
                      <span className="font-mono text-[13px]">{i.heure}</span>
                      <span className="truncate">{i.motif}</span>
                    </Link>
                  ))
                ) : (
                  <span className="text-[12.5px] text-gris">—</span>
                )}
              </div>
            </div>
            <Link
              href={`/?appli=${t.id}`}
              scroll={false}
              title="Voir sa journée dans l’appli technicien"
              className="py-0.5 text-[13px] font-extrabold whitespace-nowrap text-cobalt hover:underline"
            >
              Son appli
            </Link>
          </div>
        );
      })}
    </div>
  );
}
