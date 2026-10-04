import Link from 'next/link';
import {
  ajouterJours,
  aujourdhui,
  chiffresClient,
  euroRond,
  heuresSur,
  lundiDe,
  numeroIntervention,
  pourcent,
  prevuRealise,
  reglagesPrix,
  type DocumentSuivi,
  type LigneDocument,
  type PrevuRealise,
  type StatutIntervention,
  type TypeIntervention,
} from '@chantio/shared';
import { Panneau, Titre } from '@/components/ui';
import { normaliserLigne } from '@/lib/devis';
import { listerEquipe } from '@/lib/requetes';
import { contexteBureau } from '@/lib/session';

export const metadata = { title: 'Chiffres · Chantio' };

type Groupe = 'chantier' | 'depannage' | 'entretien';
const GROUPES: { cle: Groupe; libelle: string; couleur: string; types: TypeIntervention[] }[] = [
  { cle: 'chantier', libelle: 'Chantiers', couleur: 'bg-cobalt', types: ['chantier', 'installation', 'mise_en_service'] },
  { cle: 'depannage', libelle: 'Dépannages', couleur: 'bg-rouge', types: ['depannage', 'sav'] },
  { cle: 'entretien', libelle: 'Entretien', couleur: 'bg-menthe', types: ['entretien'] },
];
const groupeDe = (t: TypeIntervention): Groupe => GROUPES.find((g) => g.types.includes(t))?.cle ?? 'chantier';

type InterventionSemaine = {
  type: TypeIntervention;
  date_prevue: string | null;
  heure_prevue: string | null;
  date_fin: string | null;
  fin_midi: boolean;
  duree_prevue: number | null;
  affectations: { membre_id: string }[];
};
type Dossier = {
  id: string;
  reference: string | null;
  numero: number;
  motif: string;
  type: TypeIntervention;
  statut: StatutIntervention;
  devis_id: string | null;
  contrat_id: string | null;
  client: { nom: string } | null;
  fiches: { envoyee_le: string | null; duree_minutes: number | null; fournitures: { designation: string; reference: string | null; quantite: number }[] }[];
  contrat: { reference: string | null; heures_visite: number; fournitures_visite: number; montant_ht: number; visites_par_an: number } | null;
};

const s = (n: number) => (n > 1 ? 's' : '');
const h = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} h`;

/** Pour faire le point : facturé et encaissé, charge de l'équipe, et marges réelles des dossiers. */
export default async function Chiffres() {
  const { supabase, entreprise } = await contexteBureau();
  const jour = aujourdhui();
  const debutAnnee = `${jour.slice(0, 4)}-01-01`;
  const lundi = lundiDe(jour);
  const semaine = Array.from({ length: 7 }, (_, k) => ajouterJours(lundi, k));
  const rp = reglagesPrix(entreprise.facturation);

  const [{ data: docs }, equipe, { data: planifiees }, { data: faites }, { data: catalogue }, { data: entretiens }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, genre, type_facture, numero, statut, objet, date_document, echeance, envoye_le, signe_le, paye_le, total_ht, net_a_payer, devis_id')
      .neq('statut', 'annule')
      .or(`date_document.gte.${debutAnnee},statut.in.(envoye,a_encaisser)`)
      .limit(5000),
    listerEquipe(supabase),
    supabase
      .from('interventions')
      .select('type, date_prevue, heure_prevue, date_fin, fin_midi, duree_prevue, affectations(membre_id)')
      .lte('date_prevue', semaine[6])
      .or(`date_prevue.gte.${lundi},date_fin.gte.${lundi}`),
    // Dossiers terminés avec une fiche envoyée, venus d'un devis ou d'un contrat d'entretien.
    supabase
      .from('interventions')
      .select(
        'id, reference, numero, motif, type, statut, devis_id, contrat_id, client:clients(nom), fiches(envoyee_le, duree_minutes, fournitures(designation, reference, quantite)), contrat:contrats(reference, heures_visite, fournitures_visite, montant_ht, visites_par_an)',
      )
      .in('statut', ['terminee', 'validee', 'facturee'])
      .or('devis_id.not.is.null,contrat_id.not.is.null')
      .order('modifie_le', { ascending: false })
      .limit(200),
    supabase.from('articles').select('designation, reference, prix_achat'),
    // Devis liés à des visites d'entretien : leurs factures comptent dans « Entretien ».
    supabase.from('interventions').select('devis_id, type').not('devis_id', 'is', null),
  ]);

  // --- Facturé, encaissé, à encaisser (mêmes règles que la fiche client : avoirs déduits).
  const documents = (docs ?? []).map((d) => ({ ...d, total_ht: Number(d.total_ht) || 0, net_a_payer: Number(d.net_a_payer) || 0 })) as DocumentSuivi[];
  const chiffres = chiffresClient(documents, [], jour);
  const ouvertes = documents.filter((d) => d.genre === 'facture' && d.statut === 'a_encaisser' && d.type_facture !== 'avoir');
  const enRetard = ouvertes.filter((d) => d.echeance && d.echeance < jour);
  const enAttente = documents.filter((d) => d.genre === 'devis' && d.statut === 'envoye');

  // --- Facturé par type : une facture sans devis est un dépannage, une facture d'un devis
  //     un chantier, sauf si le devis vient d'un contrat ou de visites d'entretien.
  const devisEntretien = new Set((entretiens ?? []).filter((i) => i.type === 'entretien').map((i) => i.devis_id as string));
  const objets = new Map(documents.filter((d) => d.genre === 'devis').map((d) => [d.id, d.objet]));
  const parType: Record<Groupe, number> = { chantier: 0, depannage: 0, entretien: 0 };
  for (const d of documents) {
    if (d.genre !== 'facture' || !['a_encaisser', 'payee'].includes(d.statut) || d.date_document < debutAnnee) continue;
    const contrat = /^Renouvellement du contrat/.test(d.objet) || (d.devis_id && /^Renouvellement du contrat/.test(objets.get(d.devis_id) ?? ''));
    const g: Groupe = contrat || (d.devis_id && devisEntretien.has(d.devis_id)) ? 'entretien' : d.devis_id ? 'chantier' : 'depannage';
    parType[g] += d.total_ht;
  }
  const maxType = Math.max(1, ...Object.values(parType));

  // --- Charge de la semaine, par technicien et par type.
  const terrain = equipe.filter((m) => ['technicien', 'chef_chantier', 'apprenti', 'sous_traitant'].includes(m.role));
  const rdv = (planifiees ?? []) as InterventionSemaine[];
  const charge = terrain.map((m) => {
    const parGroupe: Record<Groupe, number> = { chantier: 0, depannage: 0, entretien: 0 };
    for (const i of rdv) if (i.affectations.some((a) => a.membre_id === m.id)) parGroupe[groupeDe(i.type)] += heuresSur(i, semaine);
    const total = parGroupe.chantier + parGroupe.depannage + parGroupe.entretien;
    const dispo = Number(m.heures_semaine ?? 35);
    return { m, parGroupe, total, dispo, taux: dispo ? (total / dispo) * 100 : 0 };
  });

  // --- Prévu contre réalisé : un dossier par devis (toutes ses interventions), une ligne par visite de contrat.
  const liste = ((faites ?? []) as unknown as Dossier[]).filter((i) => i.fiches.some((f) => f.envoyee_le));
  const devisIds = [...new Set(liste.flatMap((i) => (i.devis_id ? [i.devis_id] : [])))];
  const { data: devisLus } = devisIds.length
    ? await supabase.from('documents').select('id, numero, objet, remise, lignes:lignes_document(*)').in('id', devisIds)
    : { data: [] };
  const devis = new Map(
    (devisLus ?? []).map((d) => [
      d.id as string,
      {
        numero: d.numero as string | null,
        objet: d.objet as string,
        remise: Number(d.remise) || 0,
        lignes: ((d.lignes ?? []) as Record<string, unknown>[]).map(normaliserLigne).sort((a, b) => a.position - b.position) as LigneDocument[],
      },
    ]),
  );
  const prix = (catalogue ?? []) as { designation: string; reference: string | null; prix_achat: number | null }[];
  const regroupes = new Map<string, { lien: string; titre: string; detail: string; base: { lignes: LigneDocument[]; remise: number }; minutes: number; pieces: Dossier['fiches'][number]['fournitures'] }>();
  for (const i of liste) {
    const envoyees = i.fiches.filter((f) => f.envoyee_le);
    const minutes = envoyees.reduce((t, f) => t + (f.duree_minutes ?? 0), 0);
    const pieces = envoyees.flatMap((f) => f.fournitures);
    const dv = i.devis_id ? devis.get(i.devis_id) : null;
    if (dv) {
      const deja = regroupes.get(i.devis_id!);
      if (deja) {
        deja.minutes += minutes;
        deja.pieces.push(...pieces);
      } else {
        regroupes.set(i.devis_id!, { lien: `/devis/${i.devis_id}`, titre: dv.objet || i.motif, detail: `${dv.numero ?? 'Devis brouillon'} · ${i.client?.nom ?? ''}`, base: dv, minutes, pieces: [...pieces] });
      }
    } else if (i.contrat) {
      // Une visite de contrat : prévu = heures et fournitures d'une visite, vendu = montant annuel ÷ visites.
      const c = i.contrat;
      const ligne: LigneDocument = {
        designation: 'Visite d’entretien',
        quantite: 1,
        unite: 'visite',
        prix_unitaire: (Number(c.montant_ht) || 0) / Math.max(1, c.visites_par_an),
        tva: 20,
        achat: Number(c.fournitures_visite) || 0,
        heures: Number(c.heures_visite) || 0,
      };
      regroupes.set(i.id, { lien: `/interventions/${i.id}`, titre: i.motif, detail: `${numeroIntervention(i)} · contrat ${c.reference ?? ''} · ${i.client?.nom ?? ''}`, base: { lignes: [ligne], remise: 0 }, minutes, pieces });
    }
  }
  const comparaisons = [...regroupes.values()].map((d) => ({
    ...d,
    pr: prevuRealise(d.base, { minutes: d.minutes, pieces: d.pieces.map((p) => ({ ...p, quantite: Number(p.quantite) })) }, prix, rp) as PrevuRealise,
  }));
  const totalPrevu = comparaisons.reduce((t, c) => t + c.pr.margeNettePrevue, 0);
  const totalReel = comparaisons.reduce((t, c) => t + c.pr.margeNetteReelle, 0);

  const tuiles = [
    { libelle: 'Facturé depuis janvier', valeur: euroRond(chiffres.factureHT), aide: 'hors taxes, avoirs déduits', href: '/devis?onglet=factures', couleur: 'text-encre' },
    { libelle: 'Encaissé depuis janvier', valeur: euroRond(chiffres.encaisse), aide: 'TTC', href: null, couleur: 'text-vert' },
    {
      libelle: 'Reste à encaisser',
      valeur: euroRond(chiffres.aEncaisser),
      aide: `TTC · ${ouvertes.length} facture${s(ouvertes.length)}${enRetard.length ? `, dont ${enRetard.length} en retard` : ''}`,
      href: `/devis?onglet=factures&filtre=${enRetard.length ? 'retard' : 'a_encaisser'}`,
      couleur: enRetard.length ? 'text-rouge' : 'text-encre',
    },
    {
      libelle: 'Devis en attente de réponse',
      valeur: euroRond(enAttente.reduce((t, d) => t + d.total_ht, 0)),
      aide: `hors taxes · ${enAttente.length} devis`,
      href: '/devis?filtre=envoye',
      couleur: 'text-cobalt',
    },
  ];

  return (
    <>
      <Titre sous="Facturé et encaissé, charge de l’équipe et marges réelles des dossiers">Chiffres</Titre>

      <section className="carte apparition mb-6 grid grid-cols-2 divide-trait max-md:divide-y md:grid-cols-4 md:divide-x">
        {tuiles.map((t) => {
          const contenu = (
            <>
              <p className="text-[13px] font-bold text-gris">{t.libelle}</p>
              <p className={`mt-1.5 text-3xl font-extrabold leading-none tracking-[-0.03em] tabular-nums ${t.couleur}`}>{t.valeur}</p>
              <p className="mt-1 text-xs text-gris">{t.aide}</p>
            </>
          );
          return t.href ? (
            <Link key={t.libelle} href={t.href} className="px-5 py-4 transition hover:bg-fond">
              {contenu}
            </Link>
          ) : (
            <div key={t.libelle} className="px-5 py-4">
              {contenu}
            </div>
          );
        })}
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panneau titre="Charge de la semaine" action={<Link href="/planning">Planning</Link>}>
          <div className="space-y-3 px-5 py-4">
            {charge.length ? (
              charge.map((c) => (
                <div key={c.m.id} className="grid grid-cols-[110px_minmax(0,1fr)_56px] items-center gap-3 text-sm">
                  <span className="truncate font-bold">{c.m.prenom}</span>
                  <span className="flex h-3 overflow-hidden rounded-full bg-doux" title={`${h(c.total)} prévues sur ${h(c.dispo)}`}>
                    {GROUPES.map((g) => (
                      <i key={g.cle} className={g.couleur} style={{ width: `${c.dispo ? Math.min(100, (c.parGroupe[g.cle] / c.dispo) * 100) : 0}%` }} />
                    ))}
                  </span>
                  <span className={`text-right font-extrabold tabular-nums ${c.taux > 95 ? 'text-rouge' : ''}`}>{Math.round(c.taux)} %</span>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-gris">Aucun technicien actif.</p>
            )}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-trait px-5 py-2.5 text-xs text-gris">
            {GROUPES.map((g) => (
              <span key={g.cle} className="inline-flex items-center gap-1.5">
                <i className={`inline-block h-2.5 w-2.5 rounded-full ${g.couleur}`} /> {g.libelle}
              </span>
            ))}
            <span>Sur les heures par semaine de chacun.</span>
          </p>
        </Panneau>

        <Panneau titre="Facturé depuis janvier, par type">
          <div className="space-y-3 px-5 py-4">
            {GROUPES.map((g) => (
              <div key={g.cle} className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-3 text-sm">
                <span className="font-bold">{g.libelle}</span>
                <span className="h-3 overflow-hidden rounded-full bg-doux">
                  <i className={`block h-full rounded-full ${g.couleur}`} style={{ width: `${Math.max(0, (parType[g.cle] / maxType) * 100)}%` }} />
                </span>
                <span className="text-right font-extrabold tabular-nums">{euroRond(parType[g.cle])}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-trait px-5 py-2.5 text-xs text-gris">
            Hors taxes. Une facture tirée d’un devis compte en chantier, sans devis en dépannage, et en entretien si elle vient d’un contrat.
          </p>
        </Panneau>
      </div>

      <Panneau titre="Prévu au devis contre réalisé" nombre={comparaisons.length}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-trait bg-fond/60 text-left text-xs text-gris">
                <th className="px-5 py-2.5 font-bold">Dossier</th>
                <th className="px-3 py-2.5 text-right font-bold">Heures prévues</th>
                <th className="px-3 py-2.5 text-right font-bold">Heures passées</th>
                <th className="px-3 py-2.5 text-right font-bold">Fournitures prévues</th>
                <th className="px-3 py-2.5 text-right font-bold">Fournitures posées</th>
                <th className="px-3 py-2.5 text-right font-bold">Marge nette prévue</th>
                <th className="px-5 py-2.5 text-right font-bold">Marge nette réelle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {comparaisons.length ? (
                comparaisons.map((c) => {
                  const ecart = c.pr.heuresPassees - c.pr.heuresPrevues;
                  return (
                    <tr key={c.lien} className="transition hover:bg-fond">
                      <td className="max-w-[320px] px-5 py-3">
                        <Link href={c.lien} className="block truncate font-bold hover:text-cobalt">
                          {c.titre}
                        </Link>
                        <span className="block truncate text-xs text-gris">{c.detail}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{h(c.pr.heuresPrevues)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {h(c.pr.heuresPassees)}{' '}
                        {Math.abs(ecart) >= 0.05 && (
                          <span className={`text-xs font-bold ${ecart > 0 ? 'text-rouge' : 'text-vert'}`}>
                            {ecart > 0 ? '+' : '−'}
                            {h(Math.abs(ecart))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{euroRond(c.pr.fournituresPrevues)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${c.pr.fournituresUtilisees > c.pr.fournituresPrevues ? 'text-rouge' : ''}`}>
                        {euroRond(c.pr.fournituresUtilisees)}
                        {c.pr.piecesSansPrix > 0 && (
                          <span className="block text-[11px] text-gris">
                            {c.pr.piecesSansPrix} pièce{s(c.pr.piecesSansPrix)} sans prix
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{pourcent(c.pr.tauxPrevu)}</td>
                      <td className={`px-5 py-3 text-right font-extrabold tabular-nums ${c.pr.margeNetteReelle < c.pr.margeNettePrevue ? 'text-rouge' : 'text-vert'}`}>
                        {pourcent(c.pr.tauxReel)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gris">
                    Les comparaisons apparaissent quand un technicien envoie la fiche d’une intervention qui vient d’un devis ou d’un contrat d’entretien.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-trait px-5 py-2.5 text-xs text-gris">
          <span>
            Heures et fournitures prévues au devis (ou au contrat), comparées au temps et aux pièces notés sur les fiches. Coût horaire {euroRond(rp.cout_horaire)}, frais
            généraux {pourcent(rp.frais_generaux)}.
          </span>
          {comparaisons.length > 0 && (
            <span className="font-bold text-encre">
              Marge nette : {euroRond(totalReel)} réalisés pour {euroRond(totalPrevu)} prévus
            </span>
          )}
        </p>
      </Panneau>
    </>
  );
}
