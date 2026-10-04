-- Achats : factures fournisseurs (« Dépenses fournisseurs ») et fournisseurs.
--
-- Une facture arrive (PDF importé ou photo), elle est lue automatiquement,
-- on la vérifie et on l'approuve, puis on déclare son paiement :
--   recu → a_payer → (planifie) → payee
--   recu / a_payer / planifie → suspendu (contestée) → refusee, ou retour
-- Tout est réservé au bureau (dirigeant, chef de chantier, assistant).
-- Les fichiers vont dans le stockage privé « documents » :
--   documents/<entreprise_id>/achats/<fichier>

create type public.statut_achat as enum ('recu', 'planifie', 'suspendu', 'a_payer', 'payee', 'refusee');

create table public.fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  entreprise_id   uuid not null references public.entreprises (id) on delete cascade,
  nom             text not null check (length(trim(nom)) > 0),
  categorie       text not null default 'Autre',
  siret           text,
  tva_intracom    text,
  adresse         text,
  email           text,
  telephone       text,
  iban            text,
  delai_paiement  integer not null default 30 check (delai_paiement between 0 and 365),
  -- Créé tout seul à la lecture d'une facture (à vérifier).
  lu_sur_facture  boolean not null default false,
  cree_le         timestamptz not null default now()
);
create index on public.fournisseurs (entreprise_id, lower(nom));

create table public.achats (
  id               uuid primary key default gen_random_uuid(),
  entreprise_id    uuid not null references public.entreprises (id) on delete cascade,
  fournisseur_id   uuid references public.fournisseurs (id) on delete set null,
  numero           text,
  date_facture     date not null default current_date,
  delai_paiement   integer check (delai_paiement between 0 and 365),
  echeance         date,
  montant_ht       numeric(12, 2) not null default 0 check (montant_ht >= 0),
  taux_tva         numeric(4, 1) not null default 20 check (taux_tva in (0, 2.1, 5.5, 10, 20)),
  montant_tva      numeric(12, 2) not null default 0 check (montant_tva >= 0),
  montant_ttc      numeric(12, 2) generated always as (montant_ht + montant_tva) stored,
  -- Total TTC imprimé sur la facture, pour signaler un écart après lecture.
  ttc_lu           numeric(12, 2),
  avoir            boolean not null default false,
  statut           public.statut_achat not null default 'recu',
  reception        text not null default 'import' check (reception in ('import', 'photo', 'electronique', 'email')),
  responsable_id   uuid references public.membres (id) on delete set null,
  -- Chantier (intervention) auquel la dépense est rattachée, pour suivre sa marge.
  intervention_id  uuid references public.interventions (id) on delete set null,
  fichier_chemin   text,
  fichier_nom      text,
  fichier_type     text,
  fichier_taille   integer,
  -- Lignes lues : [{ designation, quantite, prix_unitaire_ht, total_ht }]
  lignes           jsonb not null default '[]'::jsonb,
  -- Documents liés (bon de livraison…) : [{ chemin, nom, taille }]
  pieces           jsonb not null default '[]'::jsonb,
  -- Résultat de la lecture automatique : ia (lue), pas_facture, manuel (à compléter).
  lecture          text check (lecture in ('ia', 'pas_facture', 'manuel')),
  lecture_message  text,
  motif            text,
  avant_contestation public.statut_achat,
  approuvee_le     date,
  planifie_le      date,
  moyen_prevu      text,
  cree_par         uuid references public.membres (id) on delete set null,
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now()
);
create index on public.achats (entreprise_id, date_facture desc);
create index on public.achats (fournisseur_id);
create index on public.achats (intervention_id);

create table public.paiements_achats (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  achat_id       uuid not null references public.achats (id) on delete cascade,
  moyen          text not null default 'Virement',
  montant        numeric(12, 2) not null check (montant > 0),
  date_paiement  date not null default current_date,
  cree_par       uuid references public.membres (id) on delete set null,
  cree_le        timestamptz not null default now()
);
create index on public.paiements_achats (achat_id);

create table public.commentaires_achats (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  achat_id       uuid not null references public.achats (id) on delete cascade,
  membre_id      uuid references public.membres (id) on delete set null,
  texte          text not null check (length(trim(texte)) > 0),
  cree_le        timestamptz not null default now()
);
create index on public.commentaires_achats (achat_id, cree_le);

create trigger modifie_le before update on public.achats
  for each row execute function prive.toucher_modifie_le();

-- Fournisseur, responsable, chantier et paiements : de la même entreprise.
create function prive.verifier_entreprise_achat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'achats' then
    if new.fournisseur_id is not null and not exists (
      select 1 from public.fournisseurs where id = new.fournisseur_id and entreprise_id = new.entreprise_id) then
      raise exception 'Fournisseur d''une autre entreprise';
    end if;
    if new.responsable_id is not null and not exists (
      select 1 from public.membres where id = new.responsable_id and entreprise_id = new.entreprise_id) then
      raise exception 'Responsable d''une autre entreprise';
    end if;
    if new.intervention_id is not null and not exists (
      select 1 from public.interventions where id = new.intervention_id and entreprise_id = new.entreprise_id) then
      raise exception 'Chantier d''une autre entreprise';
    end if;
  elsif not exists (select 1 from public.achats where id = new.achat_id and entreprise_id = new.entreprise_id) then
    raise exception 'Facture d''une autre entreprise';
  end if;
  return new;
end $$;

create trigger meme_entreprise before insert or update on public.achats
  for each row execute function prive.verifier_entreprise_achat();
create trigger meme_entreprise before insert or update on public.paiements_achats
  for each row execute function prive.verifier_entreprise_achat();
create trigger meme_entreprise before insert or update on public.commentaires_achats
  for each row execute function prive.verifier_entreprise_achat();

alter table public.fournisseurs        enable row level security;
alter table public.achats              enable row level security;
alter table public.paiements_achats    enable row level security;
alter table public.commentaires_achats enable row level security;

create policy bureau on public.fournisseurs for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy bureau on public.achats for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
-- Paiements et commentaires : on ajoute, on ne réécrit pas l'historique.
create policy lire on public.paiements_achats for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy lire on public.commentaires_achats for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy ajouter on public.commentaires_achats for insert to authenticated
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau()
              and membre_id = prive.membre_id_courant());

-- Déclare un paiement (partiel ou total) et met la facture à jour :
-- payée quand il ne reste rien, sinon « à payer » (la planification est consommée).
create function public.declarer_paiement_achat(p_achat uuid, p_moyen text, p_montant numeric, p_date date)
returns public.statut_achat
language plpgsql security definer set search_path = '' as $$
declare
  v_achat public.achats;
  v_paye numeric;
  v_reste numeric;
  v_statut public.statut_achat;
begin
  if not prive.est_bureau() then
    raise exception 'Réservé au bureau';
  end if;
  select * into v_achat from public.achats
   where id = p_achat and entreprise_id = prive.entreprise_courante()
   for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if v_achat.statut not in ('a_payer', 'planifie') then
    raise exception 'Approuvez la facture avant de déclarer un paiement';
  end if;
  select coalesce(sum(montant), 0) into v_paye from public.paiements_achats where achat_id = p_achat;
  v_reste := v_achat.montant_ttc - v_paye;
  if p_montant is null or p_montant <= 0 then
    raise exception 'Indiquez le montant payé';
  end if;
  if p_montant > v_reste + 0.01 then
    raise exception 'Le montant dépasse le reste à payer (% €)', to_char(v_reste, 'FM999G999G990D00');
  end if;
  insert into public.paiements_achats (entreprise_id, achat_id, moyen, montant, date_paiement, cree_par)
  values (v_achat.entreprise_id, p_achat, coalesce(nullif(trim(p_moyen), ''), 'Virement'), round(p_montant, 2),
          coalesce(p_date, current_date), prive.membre_id_courant());
  v_statut := case when v_reste - p_montant <= 0.005 then 'payee'::public.statut_achat else 'a_payer'::public.statut_achat end;
  update public.achats
     set statut = v_statut,
         planifie_le = case when v_statut = 'payee' then planifie_le end
   where id = p_achat;
  return v_statut;
end $$;

revoke execute on function public.declarer_paiement_achat(uuid, text, numeric, date) from public, anon;
grant execute on function public.declarer_paiement_achat(uuid, text, numeric, date) to authenticated;
revoke execute on function prive.verifier_entreprise_achat() from public, anon;
