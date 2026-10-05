-- Pilotage de l'année (Chiffres › Mon année) : le budget de l'année (l'onglet
-- « Plan » d'un fichier de pilotage Excel) et la production des mois facturés
-- hors Chantio (OPERA, Batigest, fichier importé), année précédente comprise.
-- Réservé au dirigeant. Le script ne supprime rien.

create table public.budgets (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  annee                smallint not null check (annee between 2000 and 2100),
  objectif_depannage   numeric(12, 2) not null default 0 check (objectif_depannage >= 0),
  objectif_chantier    numeric(12, 2) not null default 0 check (objectif_chantier >= 0),
  achats_pc            numeric(5, 2) not null default 0 check (achats_pc between 0 and 100),   -- matières, en % du chiffre d'affaires
  sous_traitance       numeric(12, 2) not null default 0 check (sous_traitance >= 0),
  salaires             numeric(12, 2) not null default 0 check (salaires >= 0),
  charges_pc           numeric(5, 2) not null default 0 check (charges_pc between 0 and 200),  -- charges sociales, en % des salaires
  coef_depannage       numeric(6, 3) not null default 2 check (coef_depannage between 1 and 10),
  coef_chantier        numeric(6, 3) not null default 1.6 check (coef_chantier between 1 and 10),
  impot_pc             numeric(5, 2) not null default 25 check (impot_pc between 0 and 100),
  -- Aide au calcul de l'objectif dépannages : compagnons, heures, taux, part, fournitures.
  aide                 jsonb,
  -- Frais généraux hors salaires : [{ "libelle": "Assurances", "montant": 9991 }, …] (montants à l'année).
  frais                jsonb not null default '[]'::jsonb check (jsonb_typeof(frais) = 'array'),
  -- Carnet de commandes tenu hors Chantio (Batigest) : devis acceptés et déjà facturé, à une date.
  carnet_accepte       numeric(14, 2) check (carnet_accepte >= 0),
  carnet_facture       numeric(14, 2) check (carnet_facture >= 0),
  carnet_le            date,
  cree_le              timestamptz not null default now(),
  modifie_le           timestamptz not null default now(),
  unique (entreprise_id, annee)
);

create trigger modifie_le before update on public.budgets
  for each row execute function prive.toucher_modifie_le();

-- Un mois facturé hors Chantio. famille « total » : un montant sans détail
-- (l'année précédente d'un fichier qui ne sépare pas dépannages et chantiers).
create table public.production_importee (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  mois           date not null check (extract(day from mois) = 1),
  famille        text not null check (famille in ('depannage', 'chantier', 'total')),
  montant_ht     numeric(14, 2) not null,
  source         text not null default 'manuel' check (source in ('excel', 'opera', 'batigest', 'manuel')),
  importe_le     timestamptz not null default now(),
  unique (entreprise_id, mois, famille)
);
create index on public.production_importee (entreprise_id, mois);

alter table public.budgets enable row level security;
create policy dirigeant on public.budgets for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());

alter table public.production_importee enable row level security;
create policy dirigeant on public.production_importee for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());
