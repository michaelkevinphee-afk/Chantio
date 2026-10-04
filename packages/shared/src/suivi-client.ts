// « Mes clients » : ce qu'il reste à faire pour chaque client, son état
// (Urgent, N choses à faire, À jour) et ses chiffres de l'année.

import type { GenreDocument, StatutDocument, TypeFacture } from './devis.ts';
import { euro, joursAvantLimite } from './devis.ts';
import type { FacturationClient, ResultatFiche, StatutIntervention, TypeClient, TypeIntervention, Urgence } from './types.ts';

export type NiveauSuivi = 'urgent' | 'afaire' | 'attente';

export interface ChoseAFaire {
  niveau: NiveauSuivi;
  texte: string;
  /** Libellé du bouton, et page où il mène. */
  bouton: string;
  lien: string;
}

export interface ClientSuivi {
  id: string;
  type: TypeClient;
  facturation?: FacturationClient | null;
  /** Nombre d'immeubles (adresses) du client. */
  immeubles: number;
}

export interface InterventionSuivi {
  id: string;
  motif: string;
  type: TypeIntervention;
  statut: StatutIntervention;
  urgence: Urgence;
  date_prevue: string | null;
  cree_le: string;
  devis_id: string | null;
  /** Adresse de l'immeuble et occupant, pour les syndics et bailleurs. */
  adresse: string | null;
  occupant: string | null;
  /** Prénoms des techniciens affectés. */
  techniciens: string[];
  fiche: { resultat: ResultatFiche | null; fin: string | null } | null;
}

export interface DocumentSuivi {
  id: string;
  genre: GenreDocument;
  type_facture: TypeFacture | null;
  numero: string | null;
  statut: StatutDocument;
  objet: string;
  date_document: string;
  echeance: string | null;
  envoye_le: string | null;
  signe_le: string | null;
  paye_le: string | null;
  total_ht: number;
  net_a_payer: number;
  devis_id: string | null;
  conditions?: { ao?: boolean; aoLimite?: string; aoConsultation?: string } | null;
}

/** Syndics et bailleurs : on intervient dans leurs immeubles, chez leurs occupants. */
export function aDesImmeubles(type: TypeClient): boolean {
  return type === 'syndic' || type === 'bailleur';
}

const jour = (iso: string | null | undefined) => (iso ?? '').slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ecart = (de: string, a: string) => Math.round((Date.parse(a) - Date.parse(de)) / 86_400_000);
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const guillemets = (s: string) => `« ${s} »`;
const sansPoint = (s: string) => s.trim().replace(/[.\s]+$/, '');
/** 1234.5 → « 1 235 € » */
export function euroRond(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} €`;
}
const objet = (d: DocumentSuivi) => (d.objet.trim() ? guillemets(d.objet.trim()) : 'sans titre');
const facture = (d: DocumentSuivi) => d.genre === 'facture' && d.type_facture !== 'avoir';
const laFacture = (d: DocumentSuivi) => (d.numero ? `La facture ${d.numero}` : 'La facture');
const aEncaisser = (d: DocumentSuivi) => facture(d) && d.statut === 'a_encaisser' && d.net_a_payer > 0.005;

function qui(i: InterventionSuivi): { texte: string; n: number } {
  const n = i.techniciens.length;
  if (!n) return { texte: 'Le technicien', n: 1 };
  return { texte: n === 1 ? i.techniciens[0] : `${i.techniciens.slice(0, -1).join(', ')} et ${i.techniciens[n - 1]}`, n };
}

function pasDeDate(i: InterventionSuivi): string {
  if (i.date_prevue) return ` n’a pas encore de technicien (date prévue : ${ddmm(i.date_prevue)}).`;
  return ` n’a pas encore de date${i.techniciens.length ? '.' : ' ni de technicien.'}`;
}

/** Ce qu'il reste à faire pour un client, du plus urgent au moins pressé. */
export function chosesAFaire(
  c: ClientSuivi,
  interventions: InterventionSuivi[],
  documents: DocumentSuivi[],
  aujourdhui: string,
): ChoseAFaire[] {
  const liste: ChoseAFaire[] = [];
  const ajoute = (niveau: NiveauSuivi, texte: string, bouton: string, lien: string) => liste.push({ niveau, texte, bouton, lien });
  const immeubles = aDesImmeubles(c.type);
  const lieu = (i: InterventionSuivi) =>
    immeubles && i.adresse ? ` au ${i.adresse}${i.occupant ? `, chez ${i.occupant}` : ''}` : '';
  const voir = (i: InterventionSuivi) => `/interventions/${i.id}`;
  const doc = (d: DocumentSuivi) => `/devis/${d.id}`;
  const parDate = <T>(cle: (x: T) => string | null) => (a: T, b: T) => (cle(a) ?? '9999').localeCompare(cle(b) ?? '9999');
  const envoyeLe = (d: DocumentSuivi) => jour(d.envoye_le) || d.date_document;
  const appelsOffres = documents
    .filter((d) => d.genre === 'devis' && d.statut === 'brouillon' && d.conditions?.ao)
    .sort(parDate((d) => d.conditions?.aoLimite ?? null));

  // Urgent
  documents
    .filter((d) => aEncaisser(d) && !!d.echeance && d.echeance < aujourdhui)
    .sort(parDate((d) => d.echeance))
    .forEach((d) => {
      const retard = ecart(d.echeance!, aujourdhui);
      ajoute(
        'urgent',
        `${laFacture(d)} de ${euro(d.net_a_payer)} TTC devait être payée le ${ddmm(d.echeance!)} : ${pluriel(retard, 'jour', 'jours')} de retard.`,
        'Voir la facture',
        doc(d),
      );
    });
  interventions
    .filter((i) => i.statut === 'a_planifier' && i.urgence !== 'normale')
    .forEach((i) => {
      const quoi = i.urgence === 'astreinte' ? 'Intervention d’astreinte' : 'Intervention urgente';
      const reste = i.date_prevue
        ? `prévue le ${ddmm(i.date_prevue)}, pas encore de technicien.`
        : `pas encore de date${i.techniciens.length ? '.' : ' ni de technicien.'}`;
      ajoute('urgent', `${quoi} ${guillemets(i.motif)}${lieu(i)} : ${reste}`, i.date_prevue ? 'Choisir un technicien' : 'Choisir une date', voir(i));
    });

  // À faire
  if (immeubles && c.immeubles === 0) {
    ajoute('afaire', 'Ajoutez ses immeubles pour pouvoir y créer des interventions.', 'Ajouter un immeuble', `/clients?fiche=${c.id}#immeubles`);
  }
  interventions
    .filter((i) => i.statut === 'terminee')
    .forEach((i) => {
      const q = qui(i);
      ajoute(
        'afaire',
        `${q.texte} ${q.n > 1 ? 'ont' : 'a'} terminé ${guillemets(i.motif)}${lieu(i)}. La fiche attend votre validation.`,
        'Voir et valider',
        voir(i),
      );
    });
  interventions
    .filter((i) => i.statut === 'validee')
    .forEach((i) => {
      const fait = i.fiche?.fin ? `, fait le ${ddmm(jour(i.fiche.fin))},` : i.date_prevue ? `, fait le ${ddmm(i.date_prevue)},` : '';
      const mensuel = immeubles && c.facturation === 'mensuel';
      ajoute(
        'afaire',
        `${guillemets(i.motif)}${lieu(i)}${fait} est validé : il reste à ${mensuel ? 'le mettre sur le relevé du mois' : 'le facturer'}.`,
        'Voir l’intervention',
        voir(i),
      );
    });
  // Le technicien demande un devis : tant qu'aucun devis n'a été fait pour ce client depuis son passage.
  interventions
    .filter((i) => i.fiche?.resultat === 'devis_a_etablir' && !['terminee', 'a_reprendre'].includes(i.statut))
    .forEach((i) => {
      const passage = jour(i.fiche?.fin) || i.date_prevue || jour(i.cree_le);
      if (documents.some((d) => d.genre === 'devis' && d.date_document >= passage)) return;
      const q = qui(i);
      ajoute(
        'afaire',
        `${q.texte} ${q.n > 1 ? 'demandent un devis après leur passage' : 'demande un devis après son passage'}${passage ? ` du ${ddmm(passage)}` : ''} : ${sansPoint(i.motif)}.`,
        'Préparer le devis',
        '/devis/nouveau',
      );
    });
  documents
    .filter((d) => d.genre === 'devis' && d.statut === 'brouillon' && !d.conditions?.ao)
    .forEach((d) => ajoute('afaire', `Le devis ${objet(d)} est commencé mais pas encore envoyé.`, 'Terminer le devis', doc(d)));
  documents
    .filter((d) => d.genre === 'facture' && d.statut === 'brouillon')
    .forEach((d) =>
      d.type_facture === 'avoir'
        ? ajoute('afaire', `L’avoir ${objet(d)} est préparé mais pas encore validé.`, 'Terminer l’avoir', doc(d))
        : ajoute('afaire', `La facture ${objet(d)} est préparée mais pas encore envoyée.`, 'Terminer la facture', doc(d)),
    );
  documents
    .filter((d) => d.genre === 'devis' && d.statut === 'envoye' && !d.conditions?.ao && ecart(envoyeLe(d), aujourdhui) > 15)
    .forEach((d) =>
      ajoute(
        'afaire',
        `Le devis ${objet(d)} (${euroRond(d.total_ht)} HT) a été envoyé le ${ddmm(envoyeLe(d))} : pas encore de réponse. Pensez à relancer.`,
        'Voir le devis',
        doc(d),
      ),
    );
  documents
    .filter((d) => d.genre === 'devis' && d.statut === 'signe')
    .forEach((d) => {
      const signe = jour(d.signe_le) || d.date_document;
      const prevue = interventions.some((i) => i.devis_id === d.id || jour(i.cree_le) >= signe);
      const facturee = documents.some((f) => f.genre === 'facture' && f.devis_id === d.id && ['a_encaisser', 'payee'].includes(f.statut));
      if (prevue || facturee) return;
      ajoute('afaire', `Le devis ${objet(d)} (${euroRond(d.total_ht)} HT) est signé, mais aucune intervention n’est encore prévue.`, 'Voir le devis', doc(d));
    });
  interventions
    .filter((i) => i.statut === 'a_planifier' && i.urgence === 'normale')
    .sort(parDate((i) => i.date_prevue))
    .forEach((i) =>
      ajoute('afaire', `${guillemets(i.motif)}${lieu(i)}${pasDeDate(i)}`, i.date_prevue ? 'Choisir un technicien' : 'Choisir une date', voir(i)),
    );
  appelsOffres.forEach((d) => {
    const j = joursAvantLimite(d.conditions?.aoLimite, aujourdhui);
    const nom = guillemets(d.conditions?.aoConsultation || d.objet || 'sans titre');
    const texte =
      j === null
        ? `Appel d’offres ${nom} : réponse à préparer.`
        : j < 0
          ? `Appel d’offres ${nom} : la date limite du ${ddmm(d.conditions!.aoLimite!)} est passée.`
          : `Appel d’offres ${nom} : réponse à rendre avant le ${ddmm(d.conditions!.aoLimite!)}.`;
    ajoute(j !== null && j <= 3 ? 'urgent' : 'afaire', texte, 'Préparer la réponse', doc(d));
  });

  // On attend (ne compte pas dans les choses à faire)
  documents
    .filter((d) => aEncaisser(d) && !(d.echeance && d.echeance < aujourdhui))
    .sort(parDate((d) => d.echeance))
    .forEach((d) =>
      ajoute(
        'attente',
        `${laFacture(d)} de ${euro(d.net_a_payer)} TTC ${d.echeance ? `est à payer avant le ${ddmm(d.echeance)}.` : 'attend son paiement.'}`,
        'Voir la facture',
        doc(d),
      ),
    );
  documents
    .filter((d) => d.genre === 'devis' && d.statut === 'envoye' && !d.conditions?.ao && ecart(envoyeLe(d), aujourdhui) <= 15)
    .forEach((d) =>
      ajoute('attente', `Le devis ${objet(d)} (${euroRond(d.total_ht)} HT) a été envoyé le ${ddmm(envoyeLe(d))} : pas encore de réponse.`, 'Voir le devis', doc(d)),
    );
  interventions
    .filter((i) => i.statut === 'a_reprendre')
    .forEach((i) =>
      ajoute(
        'attente',
        `La fiche ${guillemets(i.motif)}${lieu(i)} a été renvoyée à ${i.techniciens.length ? qui(i).texte : 'son technicien'} pour être complétée.`,
        'Voir l’intervention',
        voir(i),
      ),
    );

  // Les urgences d'abord, dans l'ordre où on les a trouvées.
  const rang: Record<NiveauSuivi, number> = { urgent: 0, afaire: 1, attente: 2 };
  return liste.map((x, n) => ({ x, n })).sort((a, b) => rang[a.x.niveau] - rang[b.x.niveau] || a.n - b.n).map(({ x }) => x);
}

export type TonSuivi = 'rouge' | 'bleu' | 'vert' | 'gris';

/** Le même résumé sert à la liste « Mes clients » et à la fiche. */
export function resumeClient(liste: ChoseAFaire[], actif: boolean): { urgent: number; afaire: number; ton: TonSuivi; etiquette: string } {
  const urgent = liste.filter((x) => x.niveau === 'urgent').length;
  const afaire = liste.filter((x) => x.niveau === 'afaire').length;
  const total = urgent + afaire;
  if (urgent) return { urgent, afaire, ton: 'rouge', etiquette: `Urgent · ${pluriel(total, 'chose', 'choses')} à faire` };
  if (afaire) return { urgent, afaire, ton: 'bleu', etiquette: `${pluriel(afaire, 'chose', 'choses')} à faire` };
  return { urgent, afaire, ton: actif ? 'vert' : 'gris', etiquette: actif ? 'À jour' : 'Rien encore' };
}

/** Chiffres de l'année pour un client : facturé, encaissé, reste à encaisser. */
export function chiffresClient(documents: DocumentSuivi[], interventions: InterventionSuivi[], aujourdhui: string) {
  const debut = `${aujourdhui.slice(0, 4)}-01-01`;
  const emises = documents.filter((d) => d.genre === 'facture' && ['a_encaisser', 'payee'].includes(d.statut));
  const ouvertes = emises.filter(aEncaisser);
  return {
    // Les avoirs sont déjà comptés en négatif.
    factureHT: emises.filter((d) => d.date_document >= debut).reduce((s, d) => s + d.total_ht, 0),
    encaisse: emises
      .filter((d) => facture(d) && d.statut === 'payee' && jour(d.paye_le || d.date_document) >= debut)
      .reduce((s, d) => s + d.net_a_payer, 0),
    aEncaisser: ouvertes.reduce((s, d) => s + d.net_a_payer, 0),
    enRetard: ouvertes.filter((d) => d.echeance && d.echeance < aujourdhui).reduce((s, d) => s + d.net_a_payer, 0),
    interventions: interventions.filter((i) => (i.date_prevue ?? jour(i.cree_le)) >= debut).length,
  };
}
