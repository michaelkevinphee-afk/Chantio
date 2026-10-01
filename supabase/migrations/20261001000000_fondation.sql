-- Chantio · fondation de la base de données
--
-- Une seule base pour toutes les entreprises clientes : chaque ligne porte
-- `entreprise_id`, et la sécurité au niveau des lignes (RLS) garantit qu'un
-- utilisateur ne voit jamais les données d'une autre entreprise.
--
-- Les changements d'état d'une intervention (démarrer, envoyer la fiche,
-- valider, facturer) passent par des fonctions dédiées plutôt que par des
-- écritures directes : les règles métier restent au même endroit.

create extension if not exists pgcrypto;

-- Schéma interne, non exposé par l'API Supabase.
create schema if not exists prive;
grant usage on schema prive to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.role_membre as enum (
  'dirigeant',      -- administrateur de l'entreprise
  'chef_chantier',  -- planifie, affecte, valide
  'assistant',      -- bureau : clients, planning, facturation
  'technicien',     -- remplit les fiches sur le terrain
  'apprenti',       -- aide un technicien
  'sous_traitant'   -- ne voit que ses affectations
);

create type public.statut_intervention as enum (
  'a_planifier',  -- créée, sans technicien ou sans date
  'planifiee',    -- technicien et date fixés
  'en_cours',     -- le technicien a démarré la fiche
  'terminee',     -- fiche envoyée, en attente de validation
  'a_reprendre',  -- fiche envoyée, travail à terminer lors d'un autre passage
  'validee',      -- validée par le bureau, prête à facturer
  'facturee'      -- facture émise
);

create type public.type_intervention as enum (
  'depannage', 'entretien', 'installation', 'mise_en_service',
  'sav', 'visite_technique', 'chantier'
);

create type public.urgence as enum ('normale', 'urgente', 'astreinte');

create type public.type_client as enum (
  'particulier', 'syndic', 'bailleur', 'entreprise', 'collectivite'
);

create type public.resultat_fiche as enum (
  'termine', 'a_reprendre', 'attente_piece', 'devis_a_etablir'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.entreprises (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null check (length(trim(nom)) > 0),
  siret            text,
  adresse          text,
  telephone        text,
  email            text,
  metiers          text[] not null default array['plomberie', 'chauffage'],
  logo_chemin      text,
  prochain_numero  integer not null default 1,
  cree_le          timestamptz not null default now()
);

create table public.membres (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  -- null tant que la personne invitée ne s'est pas encore connectée
  user_id        uuid unique references auth.users (id) on delete set null,
  email          text not null,
  prenom         text not null,
  nom            text,
  telephone      text,
  role           public.role_membre not null default 'technicien',
  actif          boolean not null default true,
  cree_le        timestamptz not null default now(),
  unique (entreprise_id, email)
);
create index on public.membres (entreprise_id);
create index on public.membres (lower(email));

create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  entreprise_id        uuid not null references public.entreprises (id) on delete cascade,
  nom                  text not null check (length(trim(nom)) > 0),
  type                 public.type_client not null default 'particulier',
  contact              text,
  telephone            text,
  email                text,
  adresse_facturation  text,
  notes                text,
  cree_le              timestamptz not null default now()
);
create index on public.clients (entreprise_id, nom);

create table public.sites (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  adresse        text not null,
  code_postal    text,
  ville          text,
  acces          text,   -- codes, étage, bâtiment
  consignes      text,   -- animaux, horaires, EPI
  latitude       double precision,
  longitude      double precision,
  cree_le        timestamptz not null default now()
);
create index on public.sites (entreprise_id);
create index on public.sites (client_id);

create table public.equipements (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  site_id        uuid not null references public.sites (id) on delete cascade,
  categorie      text not null,   -- chaudière gaz, PAC, ballon, climatisation…
  marque         text,
  modele         text,
  numero_serie   text,
  date_pose      date,
  cree_le        timestamptz not null default now()
);
create index on public.equipements (site_id);

create table public.interventions (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  numero         integer not null,
  client_id      uuid not null references public.clients (id),
  site_id        uuid references public.sites (id),
  equipement_id  uuid references public.equipements (id) on delete set null,
  type           public.type_intervention not null default 'depannage',
  urgence        public.urgence not null default 'normale',
  motif          text not null check (length(trim(motif)) > 0),
  description    text,
  date_prevue    date,
  heure_prevue   time,
  statut         public.statut_intervention not null default 'a_planifier',
  cree_par       uuid references public.membres (id) on delete set null,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  validee_par    uuid references public.membres (id) on delete set null,
  validee_le     timestamptz,
  facturee_le    timestamptz,
  unique (entreprise_id, numero)
);
create index on public.interventions (entreprise_id, date_prevue);
create index on public.interventions (entreprise_id, statut);

create table public.affectations (
  intervention_id  uuid not null references public.interventions (id) on delete cascade,
  membre_id        uuid not null references public.membres (id) on delete cascade,
  entreprise_id    uuid not null references public.entreprises (id) on delete cascade,
  primary key (intervention_id, membre_id)
);
create index on public.affectations (membre_id);

-- Une fiche = un passage sur place. Une intervention peut en avoir plusieurs
-- (par exemple un chantier sur plusieurs jours, ou une reprise).
create table public.fiches (
  -- l'identifiant est créé par le téléphone, pour pouvoir envoyer
  -- la même fiche plusieurs fois sans doublon (mode hors ligne)
  id                     uuid primary key,
  entreprise_id          uuid not null references public.entreprises (id) on delete cascade,
  intervention_id        uuid not null references public.interventions (id) on delete cascade,
  auteur_id              uuid references public.membres (id) on delete set null,
  debut                  timestamptz,
  fin                    timestamptz,
  duree_minutes          integer check (duree_minutes is null or duree_minutes >= 0),
  -- contenu du gabarit : constat, travaux, mesures, sécurité…
  valeurs                jsonb not null default '{}'::jsonb,
  resultat               public.resultat_fiche,
  reserves               text,
  recommandations        text,
  signature_client       text,   -- tracé SVG de la signature
  signataire_nom         text,
  signee_le              timestamptz,
  refus_signature        text,
  envoyee_le             timestamptz,
  cree_le                timestamptz not null default now(),
  modifie_le             timestamptz not null default now()
);
create index on public.fiches (intervention_id);

create table public.fournitures (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  fiche_id       uuid not null references public.fiches (id) on delete cascade,
  designation    text not null,
  reference      text,
  quantite       numeric(10, 2) not null default 1 check (quantite > 0),
  unite          text not null default 'u',
  provenance     text   -- stock véhicule, dépôt, achat direct
);
create index on public.fournitures (fiche_id);

create table public.medias (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  fiche_id       uuid not null references public.fiches (id) on delete cascade,
  chemin         text not null unique,   -- chemin dans le stockage « medias »
  type           text not null default 'photo',
  categorie      text check (categorie in ('avant', 'apres')),
  legende        text,
  cree_le        timestamptz not null default now()
);
create index on public.medias (fiche_id);

-- Journal d'audit : qui a fait quoi, quand, avant / après.
create table public.journal (
  id             bigint generated always as identity primary key,
  entreprise_id  uuid not null,  -- pas de clé étrangère : le journal survit aux suppressions
  membre_id      uuid references public.membres (id) on delete set null,
  action         text not null,
  table_cible    text not null,
  cible_id       uuid,
  avant          jsonb,
  apres          jsonb,
  le             timestamptz not null default now()
);
create index on public.journal (entreprise_id, le desc);

-- ---------------------------------------------------------------------------
-- Qui est connecté ?
-- ---------------------------------------------------------------------------

create function prive.membre_courant() returns public.membres
language sql stable security definer set search_path = '' as $$
  select m.* from public.membres m
  where m.user_id = auth.uid() and m.actif
  limit 1
$$;

create function prive.entreprise_courante() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.entreprise_id from public.membres m
  where m.user_id = auth.uid() and m.actif
  limit 1
$$;

create function prive.membre_id_courant() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.membres m
  where m.user_id = auth.uid() and m.actif
  limit 1
$$;

-- Le « bureau » voit et gère toute l'entreprise.
create function prive.est_bureau() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role in ('dirigeant', 'chef_chantier', 'assistant')
    from public.membres m where m.user_id = auth.uid() and m.actif limit 1
  ), false)
$$;

create function prive.est_dirigeant() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role = 'dirigeant'
    from public.membres m where m.user_id = auth.uid() and m.actif limit 1
  ), false)
$$;

create function prive.peut_valider() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role in ('dirigeant', 'chef_chantier')
    from public.membres m where m.user_id = auth.uid() and m.actif limit 1
  ), false)
$$;

create function prive.est_affecte(p_intervention uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.affectations a
    join public.membres m on m.id = a.membre_id
    where a.intervention_id = p_intervention
      and m.user_id = auth.uid() and m.actif
  )
$$;

-- Peut voir l'intervention : le bureau, ou un intervenant affecté.
create function prive.voit_intervention(p_intervention uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.interventions i
    where i.id = p_intervention
      and i.entreprise_id = prive.entreprise_courante()
      and (prive.est_bureau() or prive.est_affecte(i.id))
  )
$$;

grant execute on all functions in schema prive to authenticated;

-- ---------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------

-- Numéro d'intervention : 1, 2, 3… propre à chaque entreprise.
create function prive.numeroter_intervention() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.entreprises
     set prochain_numero = prochain_numero + 1
   where id = new.entreprise_id
  returning prochain_numero - 1 into new.numero;
  return new;
end $$;

create trigger numeroter before insert on public.interventions
  for each row execute function prive.numeroter_intervention();

create function prive.toucher_modifie_le() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

create trigger modifie_le before update on public.interventions
  for each row execute function prive.toucher_modifie_le();
create trigger modifie_le before update on public.fiches
  for each row execute function prive.toucher_modifie_le();

-- Une ligne liée (site, affectation, fiche…) doit appartenir à la même
-- entreprise que l'intervention ou le client auquel elle se rattache.
create function prive.verifier_meme_entreprise() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_autre uuid;
begin
  if tg_table_name = 'sites' then
    select entreprise_id into v_autre from public.clients where id = new.client_id;
  elsif tg_table_name = 'equipements' then
    select entreprise_id into v_autre from public.sites where id = new.site_id;
  elsif tg_table_name = 'interventions' then
    select entreprise_id into v_autre from public.clients where id = new.client_id;
    if v_autre is distinct from new.entreprise_id then
      raise exception 'Le client n''appartient pas à cette entreprise';
    end if;
    if new.site_id is not null then
      select entreprise_id into v_autre from public.sites
       where id = new.site_id and client_id = new.client_id;
    end if;
  elsif tg_table_name = 'affectations' then
    select entreprise_id into v_autre from public.interventions where id = new.intervention_id;
    if v_autre is distinct from new.entreprise_id then
      raise exception 'Intervention d''une autre entreprise';
    end if;
    select entreprise_id into v_autre from public.membres where id = new.membre_id;
  elsif tg_table_name = 'fiches' then
    select entreprise_id into v_autre from public.interventions where id = new.intervention_id;
  elsif tg_table_name in ('fournitures', 'medias') then
    select entreprise_id into v_autre from public.fiches where id = new.fiche_id;
  end if;
  if v_autre is distinct from new.entreprise_id then
    raise exception 'Donnée rattachée à une autre entreprise (%)', tg_table_name;
  end if;
  return new;
end $$;

create trigger meme_entreprise before insert or update on public.sites
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.equipements
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.interventions
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.affectations
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.fiches
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.fournitures
  for each row execute function prive.verifier_meme_entreprise();
create trigger meme_entreprise before insert or update on public.medias
  for each row execute function prive.verifier_meme_entreprise();

-- Une intervention avec un technicien et une date passe en « planifiée »,
-- et revient « à planifier » si on lui retire son technicien.
create function prive.recalculer_planification(p_intervention uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.interventions i
     set statut = case
       when i.date_prevue is not null
        and exists (select 1 from public.affectations a where a.intervention_id = i.id)
       then 'planifiee'::public.statut_intervention
       else 'a_planifier'::public.statut_intervention end
   where i.id = p_intervention
     and i.statut in ('a_planifier', 'planifiee');
end $$;

create function prive.apres_affectation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.recalculer_planification(coalesce(new.intervention_id, old.intervention_id));
  return null;
end $$;

create trigger planification after insert or delete on public.affectations
  for each row execute function prive.apres_affectation();

create function prive.apres_date_prevue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.recalculer_planification(new.id);
  return null;
end $$;

create trigger planification after insert or update of date_prevue on public.interventions
  for each row execute function prive.apres_date_prevue();

-- Journal d'audit.
create function prive.journaliser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.journal (entreprise_id, membre_id, action, table_cible, cible_id, avant, apres)
  values (
    (v_ligne ->> 'entreprise_id')::uuid,
    prive.membre_id_courant(),
    lower(tg_op),
    tg_table_name,
    (v_ligne ->> 'id')::uuid,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

create trigger journal after insert or update or delete on public.interventions
  for each row execute function prive.journaliser();
create trigger journal after insert or update or delete on public.fiches
  for each row execute function prive.journaliser();
create trigger journal after insert or update or delete on public.membres
  for each row execute function prive.journaliser();

-- À la création d'un compte, on le relie à son invitation (même e-mail).
create function prive.relier_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.membres m
     set user_id = new.id
   where m.user_id is null
     and lower(m.email) = lower(new.email)
     and m.id = (
       select m2.id from public.membres m2
       where m2.user_id is null and lower(m2.email) = lower(new.email)
       order by m2.cree_le limit 1
     );
  return new;
end $$;

create trigger relier_invitation after insert on auth.users
  for each row execute function prive.relier_invitation();

-- ---------------------------------------------------------------------------
-- Sécurité au niveau des lignes
-- ---------------------------------------------------------------------------

alter table public.entreprises  enable row level security;
alter table public.membres      enable row level security;
alter table public.clients      enable row level security;
alter table public.sites        enable row level security;
alter table public.equipements  enable row level security;
alter table public.interventions enable row level security;
alter table public.affectations enable row level security;
alter table public.fiches       enable row level security;
alter table public.fournitures  enable row level security;
alter table public.medias       enable row level security;
alter table public.journal      enable row level security;

-- Entreprise : chacun voit la sienne, seul le dirigeant la modifie.
create policy lire on public.entreprises for select to authenticated
  using (id = prive.entreprise_courante());
create policy modifier on public.entreprises for update to authenticated
  using (id = prive.entreprise_courante() and prive.est_dirigeant())
  with check (id = prive.entreprise_courante());

-- Équipe : visible de tous les membres, gérée par le dirigeant.
create policy lire on public.membres for select to authenticated
  using (entreprise_id = prive.entreprise_courante());
create policy ajouter on public.membres for insert to authenticated
  with check (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant() and user_id is null);
create policy modifier on public.membres for update to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant())
  with check (entreprise_id = prive.entreprise_courante());
create policy supprimer on public.membres for delete to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant() and user_id is distinct from auth.uid());

-- Clients, sites, équipements : lus par l'équipe (un sous-traitant ne voit
-- que ceux de ses interventions), gérés par le bureau.
create policy lire on public.clients for select to authenticated
  using (
    entreprise_id = prive.entreprise_courante()
    and ((prive.membre_courant()).role <> 'sous_traitant'
         or exists (select 1 from public.interventions i
                    where i.client_id = clients.id and prive.est_affecte(i.id)))
  );
create policy ecrire on public.clients for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

create policy lire on public.sites for select to authenticated
  using (
    entreprise_id = prive.entreprise_courante()
    and ((prive.membre_courant()).role <> 'sous_traitant'
         or exists (select 1 from public.interventions i
                    where i.site_id = sites.id and prive.est_affecte(i.id)))
  );
create policy ecrire on public.sites for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

create policy lire on public.equipements for select to authenticated
  using (
    entreprise_id = prive.entreprise_courante()
    and ((prive.membre_courant()).role <> 'sous_traitant'
         or exists (select 1 from public.interventions i
                    where i.site_id = equipements.site_id and prive.est_affecte(i.id)))
  );
create policy ecrire on public.equipements for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

-- Interventions : le bureau voit tout, les intervenants leurs affectations.
-- Les intervenants changent l'état uniquement via les fonctions plus bas.
create policy lire on public.interventions for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and (prive.est_bureau() or prive.est_affecte(id)));
create policy ajouter on public.interventions for insert to authenticated
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau()
              and statut in ('a_planifier', 'planifiee'));
create policy modifier on public.interventions for update to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante());
create policy supprimer on public.interventions for delete to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant()
         and statut not in ('validee', 'facturee'));

-- On interdit au bureau de « sauter » des étapes par une écriture directe :
-- validation et facturation passent par les fonctions dédiées.
create function prive.proteger_statut() returns trigger
language plpgsql as $$
begin
  if current_setting('chantio.transition', true) = 'oui' then
    return new;
  end if;
  if new.statut is distinct from old.statut
     and (new.statut not in ('a_planifier', 'planifiee')
          or old.statut not in ('a_planifier', 'planifiee')) then
    raise exception 'Changement de statut interdit ici (% → %)', old.statut, new.statut;
  end if;
  if new.validee_le is distinct from old.validee_le
     or new.validee_par is distinct from old.validee_par
     or new.facturee_le is distinct from old.facturee_le then
    raise exception 'Validation et facturation passent par les fonctions dédiées';
  end if;
  return new;
end $$;

create trigger proteger_statut before update on public.interventions
  for each row when (pg_trigger_depth() = 0)
  execute function prive.proteger_statut();

-- Garde-fous sur l'équipe : le lien vers un compte ne se change pas à la
-- main, et le dirigeant ne peut ni se rétrograder ni se désactiver.
create function prive.proteger_membre() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'Le compte lié à un membre ne se modifie pas';
  end if;
  if old.user_id = auth.uid() and (new.role <> old.role or not new.actif) then
    raise exception 'Vous ne pouvez pas changer votre propre rôle';
  end if;
  return new;
end $$;

create trigger proteger_membre before update on public.membres
  for each row execute function prive.proteger_membre();

create policy lire on public.affectations for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and (prive.est_bureau() or prive.est_affecte(intervention_id)));
create policy ecrire on public.affectations for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

-- Fiches et leur contenu : lecture si l'on voit l'intervention.
-- L'écriture passe par la fonction envoyer_fiche().
create policy lire on public.fiches for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.voit_intervention(intervention_id));

create policy lire on public.fournitures for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and exists (select 1 from public.fiches f
                     where f.id = fiche_id and prive.voit_intervention(f.intervention_id)));

create policy lire on public.medias for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and exists (select 1 from public.fiches f
                     where f.id = fiche_id and prive.voit_intervention(f.intervention_id)));

create policy lire on public.journal for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());

-- ---------------------------------------------------------------------------
-- Fonctions appelées par les applications
-- ---------------------------------------------------------------------------

-- Premier lancement : crée l'entreprise et son dirigeant (mode solo possible).
create function public.creer_entreprise(p_nom text, p_prenom text, p_nom_famille text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if exists (select 1 from public.membres where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à une entreprise';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  insert into public.entreprises (nom) values (trim(p_nom)) returning id into v_entreprise;
  insert into public.membres (entreprise_id, user_id, email, prenom, nom, role)
  values (v_entreprise, auth.uid(), coalesce(v_email, ''), trim(p_prenom), nullif(trim(p_nom_famille), ''), 'dirigeant');
  return v_entreprise;
end $$;

-- Pour un compte créé avant son invitation : relie le compte à l'invitation.
create function public.rejoindre_entreprise() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membre public.membres;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  select * into v_membre from public.membres where user_id = auth.uid();
  if found then
    return v_membre.entreprise_id;
  end if;
  update public.membres m
     set user_id = auth.uid()
   where m.id = (
     select m2.id from public.membres m2
     join auth.users u on lower(u.email) = lower(m2.email)
     where u.id = auth.uid() and m2.user_id is null
     order by m2.cree_le limit 1
   )
  returning * into v_membre;
  return v_membre.entreprise_id;
end $$;

-- Le technicien démarre l'intervention sur place.
create function public.demarrer_intervention(p_intervention uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_statut public.statut_intervention;
begin
  if not prive.voit_intervention(p_intervention) then
    raise exception 'Intervention introuvable';
  end if;
  if not (prive.est_affecte(p_intervention) or prive.est_bureau()) then
    raise exception 'Vous n''êtes pas affecté à cette intervention';
  end if;
  select statut into v_statut from public.interventions where id = p_intervention;
  if v_statut in ('validee', 'facturee') then
    raise exception 'Intervention déjà validée';
  end if;
  perform set_config('chantio.transition', 'oui', true);
  update public.interventions set statut = 'en_cours'
   where id = p_intervention and statut <> 'en_cours';
  -- Celui qui démarre sans être affecté (le dirigeant en mode solo) le devient.
  insert into public.affectations (intervention_id, membre_id, entreprise_id)
  select p_intervention, prive.membre_id_courant(), prive.entreprise_courante()
  on conflict do nothing;
end $$;

-- Le technicien envoie sa fiche. Peut être rappelée sans risque (même id) :
-- c'est ce qui permet de remplir hors ligne et d'envoyer plus tard.
--
-- p_fiche : {
--   id, intervention_id, debut, fin, duree_minutes, valeurs, resultat,
--   reserves, recommandations, signature_client, signataire_nom, signee_le,
--   refus_signature,
--   fournitures: [{ designation, reference, quantite, unite, provenance }],
--   medias:      [{ chemin, categorie, legende }]
-- }
create function public.envoyer_fiche(p_fiche jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_fiche ->> 'id')::uuid;
  v_intervention uuid := (p_fiche ->> 'intervention_id')::uuid;
  v_entreprise uuid := prive.entreprise_courante();
  v_statut public.statut_intervention;
  v_resultat public.resultat_fiche := coalesce((p_fiche ->> 'resultat')::public.resultat_fiche, 'termine');
  v_existante public.fiches;
  v_media jsonb;
  v_fourniture jsonb;
begin
  if v_id is null or v_intervention is null then
    raise exception 'Fiche incomplète';
  end if;
  if not prive.voit_intervention(v_intervention) then
    raise exception 'Intervention introuvable';
  end if;
  if not (prive.est_affecte(v_intervention) or prive.est_bureau())
     or (prive.membre_courant()).role = 'apprenti' then
    raise exception 'Vous ne pouvez pas clôturer cette fiche';
  end if;

  select statut into v_statut from public.interventions where id = v_intervention;
  select * into v_existante from public.fiches where id = v_id;
  if found and v_existante.intervention_id <> v_intervention then
    raise exception 'Fiche rattachée à une autre intervention';
  end if;
  if v_statut in ('validee', 'facturee') then
    -- Déjà envoyée et validée : un renvoi (réseau capricieux) ne change rien.
    if found then
      return v_id;
    end if;
    raise exception 'Intervention déjà validée';
  end if;

  insert into public.fiches as f (
    id, entreprise_id, intervention_id, auteur_id, debut, fin, duree_minutes,
    valeurs, resultat, reserves, recommandations, signature_client,
    signataire_nom, signee_le, refus_signature, envoyee_le
  ) values (
    v_id, v_entreprise, v_intervention, prive.membre_id_courant(),
    (p_fiche ->> 'debut')::timestamptz,
    coalesce((p_fiche ->> 'fin')::timestamptz, now()),
    (p_fiche ->> 'duree_minutes')::integer,
    coalesce(p_fiche -> 'valeurs', '{}'::jsonb),
    v_resultat,
    p_fiche ->> 'reserves',
    p_fiche ->> 'recommandations',
    p_fiche ->> 'signature_client',
    p_fiche ->> 'signataire_nom',
    (p_fiche ->> 'signee_le')::timestamptz,
    p_fiche ->> 'refus_signature',
    now()
  )
  on conflict (id) do update set
    debut = excluded.debut, fin = excluded.fin, duree_minutes = excluded.duree_minutes,
    valeurs = excluded.valeurs, resultat = excluded.resultat, reserves = excluded.reserves,
    recommandations = excluded.recommandations, signature_client = excluded.signature_client,
    signataire_nom = excluded.signataire_nom, signee_le = excluded.signee_le,
    refus_signature = excluded.refus_signature, envoyee_le = now();

  delete from public.fournitures where fiche_id = v_id;
  for v_fourniture in select * from jsonb_array_elements(coalesce(p_fiche -> 'fournitures', '[]'::jsonb)) loop
    insert into public.fournitures (entreprise_id, fiche_id, designation, reference, quantite, unite, provenance)
    values (
      v_entreprise, v_id,
      v_fourniture ->> 'designation',
      v_fourniture ->> 'reference',
      coalesce((v_fourniture ->> 'quantite')::numeric, 1),
      coalesce(v_fourniture ->> 'unite', 'u'),
      v_fourniture ->> 'provenance'
    );
  end loop;

  for v_media in select * from jsonb_array_elements(coalesce(p_fiche -> 'medias', '[]'::jsonb)) loop
    -- Les photos sont rangées dans le dossier de l'entreprise et de la fiche.
    if split_part(v_media ->> 'chemin', '/', 1) <> v_entreprise::text
       or split_part(v_media ->> 'chemin', '/', 2) <> v_id::text then
      raise exception 'Chemin de photo invalide';
    end if;
    insert into public.medias (entreprise_id, fiche_id, chemin, categorie, legende)
    values (v_entreprise, v_id, v_media ->> 'chemin', v_media ->> 'categorie', v_media ->> 'legende')
    on conflict (chemin) do nothing;
  end loop;

  perform set_config('chantio.transition', 'oui', true);
  update public.interventions
     set statut = case when v_resultat = 'termine' then 'terminee'::public.statut_intervention
                       else 'a_reprendre'::public.statut_intervention end
   where id = v_intervention;

  return v_id;
end $$;

-- Le chef de chantier ou le dirigeant valide : la fiche part en facturation.
create function public.valider_intervention(p_intervention uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.peut_valider() or not prive.voit_intervention(p_intervention) then
    raise exception 'Validation réservée au dirigeant et au chef de chantier';
  end if;
  perform set_config('chantio.transition', 'oui', true);
  update public.interventions
     set statut = 'validee', validee_par = prive.membre_id_courant(), validee_le = now()
   where id = p_intervention and statut in ('terminee', 'a_reprendre');
  if not found then
    raise exception 'Seule une intervention terminée peut être validée';
  end if;
end $$;

-- Renvoie la fiche au technicien (correction, ou travail à reprendre).
create function public.renvoyer_intervention(p_intervention uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.peut_valider() or not prive.voit_intervention(p_intervention) then
    raise exception 'Réservé au dirigeant et au chef de chantier';
  end if;
  perform set_config('chantio.transition', 'oui', true);
  update public.interventions
     set statut = 'a_planifier', validee_par = null, validee_le = null
   where id = p_intervention and statut in ('terminee', 'a_reprendre', 'validee');
  if not found then
    raise exception 'Cette intervention ne peut pas être renvoyée';
  end if;
  perform prive.recalculer_planification(p_intervention);
end $$;

create function public.marquer_facturee(p_intervention uuid, p_facturee boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.est_bureau() or not prive.voit_intervention(p_intervention) then
    raise exception 'Réservé au bureau';
  end if;
  perform set_config('chantio.transition', 'oui', true);
  if p_facturee then
    update public.interventions set statut = 'facturee', facturee_le = now()
     where id = p_intervention and statut = 'validee';
  else
    update public.interventions set statut = 'validee', facturee_le = null
     where id = p_intervention and statut = 'facturee';
  end if;
  if not found then
    raise exception 'Seule une intervention validée peut être facturée';
  end if;
end $$;

-- Les fonctions internes ne sont pas appelables depuis l'API.
revoke execute on all functions in schema prive from public, anon;
revoke execute on function public.creer_entreprise(text, text, text) from public, anon;
revoke execute on function public.rejoindre_entreprise() from public, anon;
revoke execute on function public.demarrer_intervention(uuid) from public, anon;
revoke execute on function public.envoyer_fiche(jsonb) from public, anon;
revoke execute on function public.valider_intervention(uuid) from public, anon;
revoke execute on function public.renvoyer_intervention(uuid) from public, anon;
revoke execute on function public.marquer_facturee(uuid, boolean) from public, anon;
grant execute on function public.creer_entreprise(text, text, text) to authenticated;
grant execute on function public.rejoindre_entreprise() to authenticated;
grant execute on function public.demarrer_intervention(uuid) to authenticated;
grant execute on function public.envoyer_fiche(jsonb) to authenticated;
grant execute on function public.valider_intervention(uuid) to authenticated;
grant execute on function public.renvoyer_intervention(uuid) to authenticated;
grant execute on function public.marquer_facturee(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Photos : stockage privé, rangé par entreprise
--   medias/<entreprise_id>/<fiche_id>/<fichier>.jpg
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('medias', 'medias', false)
on conflict (id) do nothing;

create function prive.peut_lire_media(p_chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(p_chemin))[1] = prive.entreprise_courante()::text
     and (prive.est_bureau() or exists (
       select 1 from public.fiches f
       where f.id::text = (storage.foldername(p_chemin))[2]
         and prive.voit_intervention(f.intervention_id)))
$$;
grant execute on function prive.peut_lire_media(text) to authenticated;
revoke execute on function prive.peut_lire_media(text) from public, anon;

create policy "medias : lire" on storage.objects for select to authenticated
  using (bucket_id = 'medias' and prive.peut_lire_media(name));

create policy "medias : déposer" on storage.objects for insert to authenticated
  with check (bucket_id = 'medias'
              and (storage.foldername(name))[1] = prive.entreprise_courante()::text);
