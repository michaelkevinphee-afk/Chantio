import Link from 'next/link';
import type { ReactNode } from 'react';
import { euroBac, nombreBac, pourcentBac, type FamilleIntervention, type PrevuRealise } from '@chantio/shared';

// Les blocs de l'écran Chiffres, disposés comme vChiffres() du bac à sable :
// quatre tuiles, « Charge de la semaine » et « Facturé depuis janvier, par type » côte à côte,
// puis « Prévu au devis contre réalisé ».

const eur0 = (n: number) => euroBac(n, 0);
const heures = (n: number) => `${nombreBac(n)} h`;

/** Couleur de chaque famille dans les barres (cobalt, rouge, menthe, comme le bac). */
const COULEUR: Record<FamilleIntervention, string> = { chantier: 'bg-cobalt', depannage: 'bg-rouge', entretien: 'bg-menthe' };
const ORDRE: FamilleIntervention[] = ['chantier', 'depannage', 'entretien'];

/** Une tuile : libellé, montant, petit texte. Avec `href`, toute la tuile est un lien. */
export function Tuile({ libelle, valeur, aide, href, rouge = false }: { libelle: string; valeur: string; aide: string; href?: string; rouge?: boolean }) {
  const contenu = (
    <>
      <span className="text-[12.5px] text-gris">{libelle}</span>
      <b className={`text-[26px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums ${rouge ? 'text-rouge' : 'text-encre'}`}>{valeur}</b>
      <span className="text-[12.5px] text-gris">{aide}</span>
    </>
  );
  const classe = 'carte flex min-w-0 flex-col gap-1 p-3.5 sm:px-4';
  return href ? (
    <Link href={href} className={`${classe} carte-lien`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

function Carte({ id, titre, droite, children }: { id: string; titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="carte flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id={id} className="text-[17px] font-extrabold">
          {titre}
        </h2>
        {droite}
      </div>
      {children}
    </section>
  );
}

/** Une rangée de barre : nom, piste, valeur (110 px · reste · 70 px, comme .barres du bac). */
function Rangee({ nom, valeur, rouge = false, titre, children }: { nom: string; valeur: string; rouge?: boolean; titre?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_70px] items-center gap-2.5 text-[13.5px]">
      <span className="truncate">{nom}</span>
      <span className="flex h-3.5 overflow-hidden rounded-full bg-fond" title={titre}>
        {children}
      </span>
      <span className={`text-right whitespace-nowrap tabular-nums ${rouge ? 'font-bold text-rouge' : ''}`}>{valeur}</span>
    </div>
  );
}

export type LigneChargeAffichee = { id: string; nom: string; heures: Record<FamilleIntervention, number>; total: number; dispo: number; taux: number };

/** « Charge de la semaine » : un membre de terrain par rangée, ses heures prévues par famille sur ses heures par semaine. */
export function CarteCharge({ lignes }: { lignes: LigneChargeAffichee[] }) {
  return (
    <Carte id="ch-charge" titre="Charge de la semaine">
      <div className="flex flex-col gap-2.5">
        {lignes.length ? (
          lignes.map((c) => (
            <Rangee key={c.id} nom={c.nom} valeur={`${Math.round(c.taux)} %`} rouge={c.taux > 95} titre={`${heures(c.total)} prévues sur ${heures(c.dispo)}`}>
              {ORDRE.map((f) => (
                <i key={f} className={`block h-full ${COULEUR[f]}`} style={{ width: `${c.dispo ? Math.min(100, (c.heures[f] / c.dispo) * 100) : 0}%` }} />
              ))}
            </Rangee>
          ))
        ) : (
          <p className="py-4 text-center text-[15px] text-gris">Aucun technicien actif.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-gris">
        {(
          [
            ['chantier', 'Chantier'],
            ['depannage', 'Dépannage'],
            ['entretien', 'Entretien'],
          ] as const
        ).map(([f, libelle]) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className={`inline-block h-2.5 w-3.5 rounded-[3px] ${COULEUR[f]}`} />
            {libelle}
          </span>
        ))}
      </div>
    </Carte>
  );
}

/** « Facturé depuis janvier, par type » : Chantiers, Dépannages, Entretien (HT, avoirs déduits). */
export function CarteParType({ parType }: { parType: Record<FamilleIntervention, number> }) {
  const max = Math.max(1, ...ORDRE.map((f) => parType[f]));
  const libelles: Record<FamilleIntervention, string> = { chantier: 'Chantiers', depannage: 'Dépannages', entretien: 'Entretien' };
  return (
    <Carte id="ch-type" titre="Facturé depuis janvier, par type">
      <div className="flex flex-col gap-2.5">
        {ORDRE.map((f) => (
          <Rangee key={f} nom={libelles[f]} valeur={eur0(parType[f])}>
            <i className={`block h-full ${COULEUR[f]}`} style={{ width: `${Math.max(0, (parType[f] / max) * 100)}%` }} />
          </Rangee>
        ))}
      </div>
      <p className="text-[12.5px] text-gris">Montants hors taxes des factures émises cette année.</p>
    </Carte>
  );
}

export type LignePrevu = { id: string; numero: string; motif: string; lien: string; pr: PrevuRealise };

// En-têtes du bac (thead th) : petites capitales grises sur fond pâle.
const TH = 'bg-fond px-2.5 py-3 align-middle text-[11.5px] leading-snug font-bold tracking-[0.05em] text-gris uppercase first:rounded-l-xl last:rounded-r-xl';
const TD = 'px-2.5 py-3.5 align-middle';

/** « Prévu au devis contre réalisé » : une ligne par intervention terminée qui a un devis signé ou un contrat. */
export function CartePrevu({ lignes, coutHoraire, fraisGeneraux }: { lignes: LignePrevu[]; coutHoraire: number; fraisGeneraux: number }) {
  return (
    <Carte
      id="ch-prevu"
      titre="Prévu au devis contre réalisé"
      droite={<span className="rounded-full bg-violet-doux px-2 py-0.5 text-[11px] font-extrabold text-violet">Calculé avec les fiches des techniciens</span>}
    >
      <p className="text-[12.5px] text-gris">
        Heures et fournitures prévues au devis (ou au contrat), comparées à la durée et aux pièces notées sur la fiche. Coût horaire {nombreBac(coutHoraire)}
        {' '}€, frais généraux {nombreBac(fraisGeneraux)} %.
      </p>
      <div className="overflow-x-auto">
        <table aria-labelledby="ch-prevu" className="w-full min-w-[680px] border-collapse text-[14px] tabular-nums">
          <thead>
            <tr>
              <th className={`${TH} text-left`}>Dossier</th>
              <th className={`${TH} text-right`}>Heures prévues</th>
              <th className={`${TH} text-right`}>Heures réelles</th>
              <th className={`${TH} text-right`}>Fournitures prévues</th>
              <th className={`${TH} text-right`}>Fournitures réelles</th>
              <th className={`${TH} text-right`}>Marge nette prévue</th>
              <th className={`${TH} text-right`}>Marge nette réelle</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length ? (
              lignes.map(({ id, numero, motif, lien, pr }) => {
                const ecart = pr.heuresPassees - pr.heuresPrevues;
                return (
                  // Toute la ligne ouvre l'intervention : le lien du dossier s'étend sur la rangée.
                  <tr key={id} className="relative cursor-pointer border-b border-trait transition-colors hover:bg-[#F9FAFF]">
                    <td className={TD}>
                      <Link href={lien} scroll={false} className="block rounded-md after:absolute after:inset-0 after:content-[''] hover:[&>span:last-child]:underline">
                        <span className="block font-mono text-[12.5px]">{numero}</span>
                        <span className="block">{motif}</span>
                      </Link>
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{heures(pr.heuresPrevues)}</td>
                    <td className={`${TD} text-right`}>
                      <span className="whitespace-nowrap">{heures(pr.heuresPassees)}</span>{' '}
                      <b className={`font-bold whitespace-nowrap ${ecart > 0 ? 'text-rouge' : 'text-vert'}`}>
                        {ecart > 0 ? '+' : ''}
                        {nombreBac(ecart)}
                      </b>
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{eur0(pr.fournituresPrevues)}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {eur0(pr.fournituresUtilisees)}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{pourcentBac(pr.tauxPrevu)}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <b className={`font-bold ${pr.margeNetteReelle < pr.margeNettePrevue ? 'text-rouge' : 'text-vert'}`}>{pourcentBac(pr.tauxReel)}</b>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[15px] text-gris">
                  Les comparaisons apparaissent quand une fiche est envoyée sur une intervention qui a un devis ou un contrat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Carte>
  );
}
