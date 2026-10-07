import Link from 'next/link';
import {
  depasseFormule,
  joursRestants,
  LIBELLE_FORMULE,
  LIBELLE_STATUT_ABONNEMENT,
  OPTIONS_ABONNEMENT,
  peutConsole,
  prixMensuel,
  type OptionAbonnement,
  type StatutAbonnement,
} from '@chantio/shared';
import { Icone } from '@/components/icones';
import { EnClair, Message, PuceAbonnement, Tableau } from '@/components/console/elements';
import { LienBouton, Puce, Titre } from '@/components/ui';
import { aujourdhuiParis, contexteConsole, euros, ilYa, jour } from '@/lib/console';
import { listeEntreprises } from '../donnees';

export const metadata = { title: 'Entreprises · Console Chantio' };

const ETATS: ('tous' | StatutAbonnement)[] = ['tous', 'essai', 'actif', 'offert', 'resilie'];

export default async function Entreprises({ searchParams }: PageProps<'/console/entreprises'>) {
  const sp = await searchParams;
  const { moi } = await contexteConsole();
  const toutes = await listeEntreprises();
  const q = (typeof sp.q === 'string' ? sp.q : '').trim();
  const etat = (typeof sp.etat === 'string' && (ETATS as string[]).includes(sp.etat) ? sp.etat : 'tous') as (typeof ETATS)[number];
  const cherche = q.toLowerCase();
  const liste = toutes
    .filter((e) => etat === 'tous' || e.statut === etat)
    .filter((e) => !cherche || [e.nom, e.ville, e.code_postal, e.dirigeant, e.dirigeant_email, e.siren].some((x) => x?.toLowerCase().includes(cherche)));
  const auj = aujourdhuiParis();
  const lien = (p: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(etat !== 'tous' ? { etat } : {}), ...p });
    for (const [k, v] of [...u]) if (!v || v === 'tous') u.delete(k);
    return `/console/entreprises${u.size ? `?${u}` : ''}`;
  };

  return (
    <>
      <Titre
        texte={`${toutes.length} entreprise${toutes.length > 1 ? 's' : ''} inscrite${toutes.length > 1 ? 's' : ''} sur Chantio.`}
        actions={
          <>
            <a href="/console/export" download className="inline-flex items-center gap-2 rounded-[14px] bg-white px-4 py-2.5 text-sm font-extrabold shadow-[inset_0_0_0_2px_var(--color-trait)] transition hover:shadow-[inset_0_0_0_2px_var(--color-cobalt)]">
              <Icone nom="telecharger" taille={18} /> Exporter (Excel)
            </a>
            {peutConsole(moi.role, 'abonnement') && (
              <LienBouton href="/console/entreprises/nouvelle" className="!px-4 !py-2.5 text-sm">
                <Icone nom="plus" taille={18} /> Créer une entreprise
              </LienBouton>
            )}
          </>
        }
      >
        Entreprises clientes
      </Titre>
      <Message sp={sp} />
      <EnClair>
        Le répertoire de vos clients : formule, utilisateurs, options et état du compte. Vous voyez les comptes, jamais le contenu (clients, fiches, factures) sans une
        session d’assistance acceptée par le dirigeant.
      </EnClair>

      <form className="mb-4 flex flex-wrap items-center gap-2.5" action="/console/entreprises">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Nom, ville, dirigeant, SIREN"
          aria-label="Rechercher une entreprise"
          className="champ max-w-sm !py-2.5"
        />
        {etat !== 'tous' && <input type="hidden" name="etat" value={etat} />}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par état">
          {ETATS.map((s) => {
            const n = s === 'tous' ? toutes.length : toutes.filter((e) => e.statut === s).length;
            const on = etat === s;
            return (
              <Link
                key={s}
                href={lien({ etat: s })}
                aria-current={on ? 'true' : undefined}
                className={`rounded-full px-3 py-1.5 text-[13.5px] font-bold transition ${on ? 'bg-encre text-white' : 'bg-white text-gris shadow-[inset_0_0_0_1px_var(--color-trait)] hover:text-encre'}`}
              >
                {s === 'tous' ? 'Toutes' : LIBELLE_STATUT_ABONNEMENT[s]} <span className="tabular-nums opacity-70">{n}</span>
              </Link>
            );
          })}
        </div>
      </form>

      <Tableau
        entetes={['Entreprise', 'Formule', { t: 'Utilisateurs', droite: true }, 'Options', 'Inscrite le', 'Dernière connexion', 'État', { t: 'Par mois HT', droite: true }]}
        vide={liste.length ? undefined : q || etat !== 'tous' ? 'Aucune entreprise ne correspond.' : 'Aucune entreprise pour l’instant.'}
      >
        {liste.map((e) => {
          const prix = prixMensuel(e);
          return (
            <tr key={e.id} className="transition hover:bg-fond">
              <td className="px-4 py-3">
                <Link href={`/console/entreprises/${e.id}`} className="font-extrabold text-encre hover:text-cobalt hover:underline">
                  {e.nom}
                </Link>
                <small className="block text-[13px] text-gris">
                  {[e.ville, e.dirigeant].filter(Boolean).join(' · ') || '—'}
                  {e.assistance_ouverte && <span className="ml-1.5 font-bold text-violet">· assistance ouverte</span>}
                </small>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{LIBELLE_FORMULE[e.formule]}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {e.utilisateurs}
                {e.invitations > 0 && <small className="block text-xs text-gris">+{e.invitations} invité{e.invitations > 1 ? 's' : ''}</small>}
                {depasseFormule(e.formule, e.utilisateurs) && <small className="block text-xs font-bold text-rouge">au-delà de la formule</small>}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {e.options.length ? e.options.map((o) => <Puce key={o}>{OPTIONS_ABONNEMENT[o as OptionAbonnement]?.libelle ?? o}</Puce>) : <span className="text-gris">—</span>}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{jour(e.cree_le)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gris">{ilYa(e.derniere_connexion)}</td>
              <td className="px-4 py-3">
                <PuceAbonnement statut={e.statut} jours={e.essai_fin ? joursRestants(e.essai_fin, auj) : null} />
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                {e.statut === 'actif' ? euros(prix) : <span className="text-gris">{e.statut === 'resilie' ? '—' : `(${euros(prix)})`}</span>}
              </td>
            </tr>
          );
        })}
      </Tableau>
      <p className="mt-3 text-[13px] text-gris">Entre parenthèses : ce que paierait l’entreprise si elle était payante (formule, utilisateurs en plus et options).</p>
    </>
  );
}
