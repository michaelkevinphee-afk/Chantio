-- Syndics et numéros d'intervention par type.
--
-- 1. Un immeuble de syndic ou de bailleur est une adresse (site) du client,
--    avec son gardien et le nom de la copropriété. Chaque immeuble a ses
--    occupants (appartement, local, parties communes) : on intervient chez
--    l'occupant, on facture le syndic.
-- 2. Une intervention garde l'occupant, le n° d'ordre de service du syndic
--    et le devis d'où elle vient.
-- 3. Chaque intervention reçoit un numéro par type et par année :
--    DEP-2026-0001 (dépannage, SAV), CH-2026-0001 (chantier, installation,
--    mise en service, visite technique), ENT-2026-0001 (entretien).
--    Les interventions déjà créées sont numérotées dans leur ordre de création.
-- Le script ne supprime rien.

alter table public.sites
  add column gardien      text,   -- nom et téléphone du gardien
  add column copropriete  text;   -- syndicat des copropriétaires

-- Syndics et bailleurs : une facture par intervention, ou un relevé par mois.
alter table public.clients
  add column facturation text not null default 'intervention'
    check (facturation in ('intervention', 'mensuel'));

create table public.occupants (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  site_id        uuid not null references public.sites (id) on delete cascade,
  nom            text not null check (length(trim(nom)) > 0),
  lot            text,   -- étage, porte, n° de lot
  telephone      text,
  email          text,
  cree_le        timestamptz not null default now()
);
create index on public.occupants (entreprise_id);
create index on public.occupants (site_id);

alter table public.interventions
  add column occupant_id    uuid references public.occupants (id) on delete set null,
  add column ordre_service  text,
  add column devis_id       uuid references public.documents (id) on delete set null,
  add column reference      text;
create unique index on public.interventions (entreprise_id, reference);
create index on public.interventions (occupant_id);
create index on public.interventions (devis_id);

-- Un occupant appartient à un immeuble de la même entreprise ; l'occupant et
-- le devis d'une intervention aussi (et l'occupant habite à son adresse).
create function prive.verifier_occupant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid;
  v_site uuid;
begin
  if tg_table_name = 'occupants' then
    select entreprise_id into v_entreprise from public.sites where id = new.site_id;
    if v_entreprise is distinct from new.entreprise_id then
      raise exception 'Immeuble d''une autre entreprise';
    end if;
    return new;
  end if;
  if new.occupant_id is not null then
    select site_id into v_site from public.occupants
     where id = new.occupant_id and entreprise_id = new.entreprise_id;
    if v_site is null or v_site is distinct from new.site_id then
      raise exception 'Cet occupant n''habite pas à l''adresse de l''intervention';
    end if;
  end if;
  if new.devis_id is not null and not exists (
    select 1 from public.documents
     where id = new.devis_id and entreprise_id = new.entreprise_id and genre = 'devis'
  ) then
    raise exception 'Devis d''une autre entreprise';
  end if;
  return new;
end $$;

create trigger meme_entreprise before insert or update on public.occupants
  for each row execute function prive.verifier_occupant();
create trigger verifier_occupant before insert or update of occupant_id, site_id, devis_id on public.interventions
  for each row execute function prive.verifier_occupant();

-- Numéros par type : un compteur par entreprise, préfixe et année. Un numéro
-- attribué n'est jamais réutilisé, même si l'intervention est supprimée.
create table prive.compteurs (
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  cle            text not null,   -- « DEP-2026 »
  valeur         integer not null default 0,
  primary key (entreprise_id, cle)
);
alter table prive.compteurs enable row level security;

create function prive.prefixe_intervention(p_type public.type_intervention) returns text
language sql immutable set search_path = '' as $$
  select case p_type
    when 'depannage' then 'DEP'
    when 'sav' then 'DEP'
    when 'entretien' then 'ENT'
    else 'CH'
  end
$$;

create function prive.referencer_intervention() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cle text;
  v_n integer;
begin
  -- Le numéro ne change plus une fois donné.
  if tg_op = 'UPDATE' then
    if old.reference is not null then
      new.reference := old.reference;
    end if;
    return new;
  end if;
  v_cle := prive.prefixe_intervention(new.type) || '-' || to_char(now() at time zone 'Europe/Paris', 'YYYY');
  insert into prive.compteurs as c (entreprise_id, cle, valeur)
  values (new.entreprise_id, v_cle, 1)
  on conflict (entreprise_id, cle) do update set valeur = c.valeur + 1
  returning c.valeur into v_n;
  new.reference := v_cle || '-' || lpad(v_n::text, 4, '0');
  return new;
end $$;

create trigger referencer before insert or update of reference on public.interventions
  for each row execute function prive.referencer_intervention();

-- Les interventions déjà créées, dans leur ordre de création (sans toucher
-- à leur date de modification).
alter table public.interventions disable trigger modifie_le;
with r as (
  select id,
         prive.prefixe_intervention(type) || '-' || to_char(cree_le at time zone 'Europe/Paris', 'YYYY') as cle,
         row_number() over (
           partition by entreprise_id, prive.prefixe_intervention(type), to_char(cree_le at time zone 'Europe/Paris', 'YYYY')
           order by cree_le, numero
         ) as n
    from public.interventions
   where reference is null
)
update public.interventions i
   set reference = r.cle || '-' || lpad(r.n::text, 4, '0')
  from r
 where i.id = r.id;
alter table public.interventions enable trigger modifie_le;

insert into prive.compteurs (entreprise_id, cle, valeur)
select entreprise_id,
       split_part(reference, '-', 1) || '-' || split_part(reference, '-', 2),
       max(split_part(reference, '-', 3)::integer)
  from public.interventions
 where reference is not null
 group by 1, 2
on conflict (entreprise_id, cle) do update set valeur = greatest(prive.compteurs.valeur, excluded.valeur);

-- Lecture : toute l'équipe (un sous-traitant, seulement les occupants de ses
-- interventions). Écriture : le bureau.
alter table public.occupants enable row level security;
create policy lire on public.occupants for select to authenticated
  using (
    entreprise_id = prive.entreprise_courante()
    and ((prive.membre_courant()).role <> 'sous_traitant'
         or exists (select 1 from public.interventions i
                    where i.occupant_id = occupants.id and prive.est_affecte(i.id)))
  );
create policy ecrire on public.occupants for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

revoke execute on function prive.verifier_occupant() from public, anon;
revoke execute on function prive.referencer_intervention() from public, anon;
