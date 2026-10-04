-- Contrats d'entretien : préavis et reconduction, visites à planifier,
-- renouvellement par un devis ; équipements suivis à chaque adresse.
-- Le script ne supprime rien.

create table public.contrats (
  id                  uuid primary key default gen_random_uuid(),
  entreprise_id       uuid not null references public.entreprises (id) on delete cascade,
  client_id           uuid not null references public.clients (id) on delete cascade,
  site_id             uuid references public.sites (id) on delete set null,   -- l'immeuble ou l'adresse entretenue
  reference           text,                                                    -- CT-2026-0001
  objet               text not null check (length(trim(objet)) > 0),
  debut               date not null,
  fin                 date not null,
  preavis_mois        smallint not null default 3 check (preavis_mois between 0 and 24),
  tacite              boolean not null default true,                           -- reconduction tacite
  montant_ht          numeric(12, 2) not null default 0 check (montant_ht >= 0),  -- par an
  visites_par_an      smallint not null default 1 check (visites_par_an between 1 and 52),
  fournitures_visite  numeric(12, 2) not null default 0 check (fournitures_visite >= 0),
  heures_visite       numeric(6, 2) not null default 1 check (heures_visite >= 0),
  derniere_visite     date,
  renouvellement_id   uuid references public.documents (id) on delete set null,  -- devis de renouvellement
  notes               text,
  cree_le             timestamptz not null default now(),
  modifie_le          timestamptz not null default now(),
  constraint fin_apres_debut check (fin > debut)
);
create index on public.contrats (entreprise_id);
create index on public.contrats (client_id);
create unique index on public.contrats (entreprise_id, reference);

create trigger modifie_le before update on public.contrats
  for each row execute function prive.toucher_modifie_le();

-- Une visite créée depuis un contrat le garde, avec la date souhaitée tant
-- qu'elle n'est pas au planning.
alter table public.interventions
  add column contrat_id    uuid references public.contrats (id) on delete set null,
  add column souhaitee_le  date;
create index on public.interventions (contrat_id);

-- Équipements d'une adresse : dernier et prochain passage, obligation réglementaire.
alter table public.equipements
  add column dernier_passage   date,
  add column prochain_passage  date,
  add column obligation        text;

-- Numéro CT-2026-0001 par entreprise et par année, donné une fois pour toutes.
create function prive.referencer_contrat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cle text;
  v_n integer;
begin
  if tg_op = 'UPDATE' then
    new.reference := old.reference;
    return new;
  end if;
  v_cle := 'CT-' || to_char(now() at time zone 'Europe/Paris', 'YYYY');
  insert into prive.compteurs as c (entreprise_id, cle, valeur)
  values (new.entreprise_id, v_cle, 1)
  on conflict (entreprise_id, cle) do update set valeur = c.valeur + 1
  returning c.valeur into v_n;
  new.reference := v_cle || '-' || lpad(v_n::text, 4, '0');
  return new;
end $$;

create trigger referencer before insert or update of reference on public.contrats
  for each row execute function prive.referencer_contrat();

-- Le client, l'adresse et le devis d'un contrat sont de la même entreprise
-- (l'adresse est celle du client) ; le contrat d'une intervention aussi.
create function prive.verifier_contrat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'interventions' then
    if new.contrat_id is not null and not exists (
      select 1 from public.contrats where id = new.contrat_id and entreprise_id = new.entreprise_id
    ) then
      raise exception 'Contrat d''une autre entreprise';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.clients where id = new.client_id and entreprise_id = new.entreprise_id) then
    raise exception 'Le client n''appartient pas à cette entreprise';
  end if;
  if new.site_id is not null and not exists (
    select 1 from public.sites where id = new.site_id and client_id = new.client_id and entreprise_id = new.entreprise_id
  ) then
    raise exception 'Cette adresse n''est pas celle du client';
  end if;
  if new.renouvellement_id is not null and not exists (
    select 1 from public.documents where id = new.renouvellement_id and entreprise_id = new.entreprise_id and genre = 'devis'
  ) then
    raise exception 'Devis d''une autre entreprise';
  end if;
  return new;
end $$;

create trigger meme_entreprise before insert or update on public.contrats
  for each row execute function prive.verifier_contrat();
create trigger verifier_contrat before insert or update of contrat_id on public.interventions
  for each row execute function prive.verifier_contrat();

-- Les contrats (montants, préavis) restent au bureau.
alter table public.contrats enable row level security;
create policy lire on public.contrats for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy ecrire on public.contrats for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

revoke execute on function prive.referencer_contrat() from public, anon;
revoke execute on function prive.verifier_contrat() from public, anon;
