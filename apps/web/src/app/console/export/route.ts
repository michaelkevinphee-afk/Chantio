import { LIBELLE_FORMULE, LIBELLE_STATUT_ABONNEMENT, OPTIONS_ABONNEMENT, prixMensuel, type OptionAbonnement } from '@chantio/shared';
import { supabaseServeur } from '@/lib/supabase/server';
import type { LigneEntreprise } from '../(espace)/donnees';

// Liste des entreprises au format CSV (point-virgule, ouvert tel quel par Excel).
// La base refuse la lecture à qui n'est pas de l'équipe Chantio avec la double vérification.

const cellule = (v: unknown) => {
  // Un texte saisi par un client qui commence par = + - @ deviendrait une formule dans Excel.
  const t = v == null ? '' : typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export async function GET() {
  const supabase = await supabaseServeur();
  const { data, error } = await supabase.rpc('console_entreprises');
  if (error) return new Response('Réservé à l’équipe Chantio.', { status: 403 });
  const lignes = ((data ?? []) as LigneEntreprise[]).map((e) => {
    const u = Number(e.utilisateurs) || 0;
    return [
      e.nom,
      e.siren,
      e.code_postal,
      e.ville,
      e.dirigeant,
      e.dirigeant_email,
      LIBELLE_FORMULE[e.formule],
      LIBELLE_STATUT_ABONNEMENT[e.statut],
      e.essai_fin,
      u,
      Number(e.invitations) || 0,
      (e.options ?? []).map((o) => OPTIONS_ABONNEMENT[o as OptionAbonnement]?.libelle ?? o).join(', '),
      String(prixMensuel({ ...e, options: e.options ?? [], utilisateurs: u })).replace('.', ','),
      e.cree_le?.slice(0, 10),
      e.derniere_connexion?.slice(0, 10),
      Number(e.interventions) || 0,
    ];
  });
  const entete = [
    'Entreprise',
    'SIREN',
    'Code postal',
    'Ville',
    'Dirigeant',
    'E-mail du dirigeant',
    'Formule',
    'État',
    'Fin de l’essai',
    'Utilisateurs',
    'Invités',
    'Options',
    'Prix mensuel HT',
    'Inscrite le',
    'Dernière connexion',
    'Interventions',
  ];
  const csv = '﻿' + [entete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="chantio-entreprises-${date}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
