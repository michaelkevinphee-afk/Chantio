-- Plusieurs entreprises par compte.
--
-- • Un même compte peut être membre de plusieurs entreprises (un dirigeant qui
--   gère deux sociétés, un technicien qui travaille pour deux patrons).
--   L'« entreprise active » est retenue par compte ; toutes les règles de
--   sécurité existantes s'appuient sur prive.entreprise_courante(), qui la
--   renvoie désormais.
-- • Fiche entreprise complète (SIREN, forme juridique, adresse) et formule
--   propre à chaque entreprise.
-- • Vérification d'identité du dirigeant : au registre (nom présent parmi
--   les dirigeants publiés) ou par justificatifs (pièce d'identité + Kbis ou
--   pouvoir), contrôlés par Chantio.
-- • Demandes d'accès : une personne qui trouve son entreprise déjà inscrite
--   demande à la rejoindre ; un dirigeant accepte ou refuse.

-- ---------------------------------------------------------------------------
-- Un compte, plusieurs entreprises
-- ---------------------------------------------------------------------------

alter table public.membres drop constraint membres_user_id_key;
alter table public.membres add constraint membres_entreprise_compte_unique unique (entreprise_id, user_id);
create index on public.membres (user_id);

create table prive.entreprise_active (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  le             timestamptz not null default now()
);

-- L'entreprise choisie si le compte en est toujours membre, sinon la plus ancienne.
create or replace function prive.entreprise_courante() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.entreprise_id from public.membres m
  left join prive.entreprise_active a on a.user_id = m.user_id
  where m.user_id = auth.uid() and m.actif
  order by (m.entreprise_id = a.entreprise_id) desc nulls last, m.cree_le, m.id
  limit 1
$$;

create or replace function prive.membre_courant() returns public.membres
language sql stable security definer set search_path = '' as $$
  select m.* from public.membres m
  where m.user_id = auth.uid() and m.actif and m.entreprise_id = prive.entreprise_courante()
  limit 1
$$;

create or replace function prive.membre_id_courant() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.membres m
  where m.user_id = auth.uid() and m.actif and m.entreprise_id = prive.entreprise_courante()
  limit 1
$$;

create or replace function prive.est_bureau() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role in ('dirigeant', 'chef_chantier', 'assistant')
    from public.membres m
    where m.user_id = auth.uid() and m.actif and m.entreprise_id = prive.entreprise_courante()
    limit 1
  ), false)
$$;

create or replace function prive.est_dirigeant() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role = 'dirigeant'
    from public.membres m
    where m.user_id = auth.uid() and m.actif and m.entreprise_id = prive.entreprise_courante()
    limit 1
  ), false)
$$;

create or replace function prive.peut_valider() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.role in ('dirigeant', 'chef_chantier')
    from public.membres m
    where m.user_id = auth.uid() and m.actif and m.entreprise_id = prive.entreprise_courante()
    limit 1
  ), false)
$$;

-- Dirigeant de cette entreprise-là (active ou non).
create function prive.est_dirigeant_de(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.entreprise_id = p_entreprise and m.user_id = auth.uid()
      and m.actif and m.role = 'dirigeant'
  )
$$;
grant execute on function prive.est_dirigeant_de(uuid) to authenticated;
revoke execute on function prive.est_dirigeant_de(uuid) from public, anon;

-- La fiche du compte connecté dans l'entreprise active (lisible avec ses liens).
create function public.membre_actif() returns setof public.membres
language sql stable set search_path = '' as $$
  select * from public.membres
  where user_id = auth.uid() and actif and entreprise_id = prive.entreprise_courante()
  limit 1
$$;

-- Change d'entreprise active.
create function public.choisir_entreprise(p_entreprise uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membres
                 where user_id = auth.uid() and entreprise_id = p_entreprise and actif) then
    raise exception 'Entreprise introuvable';
  end if;
  insert into prive.entreprise_active (user_id, entreprise_id) values (auth.uid(), p_entreprise)
  on conflict (user_id) do update set entreprise_id = excluded.entreprise_id, le = now();
end $$;

-- ---------------------------------------------------------------------------
-- Fiche entreprise, formule et identité du dirigeant
-- ---------------------------------------------------------------------------

alter table public.entreprises
  add column siren            text check (siren ~ '^[0-9]{9}$'),
  add column forme_juridique  text,
  add column code_postal      text,
  add column ville            text,
  add column tva_intracom     text,
  add column activite         text,
  add column formule          text not null default 'equipe' check (formule in ('solo', 'equipe', 'entreprise')),
  -- Nom de la personne qui a attesté être représentant légal, à la création.
  add column representant     text,
  add column atteste_le       timestamptz,
  -- a_verifier → en_attente (contrôle Chantio) → verifiee | refusee
  add column identite_statut  text not null default 'a_verifier'
    check (identite_statut in ('a_verifier', 'en_attente', 'verifiee', 'refusee')),
  add column identite_mode    text check (identite_mode in ('registre', 'documents')),
  add column identite_documents text[],
  add column identite_le      timestamptz,
  add column identite_motif   text;

create unique index entreprises_siren_unique on public.entreprises (siren) where siren is not null;

-- L'identité ne se change que par les fonctions prévues (ou par Chantio).
create function prive.proteger_identite() returns trigger
language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon')
     or current_setting('chantio.identite', true) = 'oui' then
    return new;
  end if;
  if (new.identite_statut, new.identite_mode, new.identite_documents, new.identite_le, new.identite_motif,
      new.representant, new.atteste_le)
     is distinct from
     (old.identite_statut, old.identite_mode, old.identite_documents, old.identite_le, old.identite_motif,
      old.representant, old.atteste_le) then
    raise exception 'La vérification d''identité passe par les fonctions dédiées';
  end if;
  if new.siren is distinct from old.siren and old.identite_statut in ('en_attente', 'verifiee') then
    raise exception 'Le SIREN d''une entreprise vérifiée ne se modifie pas';
  end if;
  return new;
end $$;

create trigger proteger_identite before update on public.entreprises
  for each row execute function prive.proteger_identite();

-- Les entreprises du compte connecté (sélecteur et page « Vos entreprises »).
create function public.mes_entreprises()
returns table (
  id uuid, nom text, siren text, siret text, forme_juridique text, adresse text, code_postal text,
  ville text, logo_chemin text, formule text, identite_statut text, identite_mode text,
  identite_motif text, role public.role_membre, active boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nom, e.siren, e.siret, e.forme_juridique, e.adresse, e.code_postal, e.ville,
         e.logo_chemin, e.formule, e.identite_statut, e.identite_mode, e.identite_motif,
         m.role, e.id = prive.entreprise_courante()
  from public.membres m
  join public.entreprises e on e.id = m.entreprise_id
  where m.user_id = auth.uid() and m.actif
  order by lower(e.nom)
$$;

-- Parmi ces SIREN, ceux déjà inscrits sur Chantio (recherche d'entreprise).
create function public.sirens_inscrits(p_sirens text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(siren), '{}') from public.entreprises
  where auth.uid() is not null and siren = any (p_sirens)
$$;

-- Crée une entreprise dont le compte connecté devient dirigeant, et l'active.
-- Le compte peut déjà appartenir à d'autres entreprises.
drop function public.creer_entreprise(text, text, text);
create function public.creer_entreprise(
  p_nom             text,
  p_prenom          text default null,
  p_nom_famille     text default null,
  p_siren           text default null,
  p_siret           text default null,
  p_forme_juridique text default null,
  p_adresse         text default null,
  p_code_postal     text default null,
  p_ville           text default null,
  p_tva_intracom    text default null,
  p_activite        text default null,
  p_representant    text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid;
  v_email text;
  v_prenom text := nullif(trim(p_prenom), '');
  v_nom text := nullif(trim(p_nom_famille), '');
  v_siren text := nullif(regexp_replace(coalesce(p_siren, ''), '\s', '', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if v_siren is not null and exists (select 1 from public.entreprises where siren = v_siren) then
    raise exception 'Cette entreprise est déjà inscrite sur Chantio'
      using errcode = 'unique_violation', hint = 'demander_acces';
  end if;
  -- Déjà membre ailleurs : on reprend son prénom et son nom s'ils manquent.
  if v_prenom is null then
    select m.prenom, coalesce(v_nom, m.nom) into v_prenom, v_nom
    from public.membres m where m.user_id = auth.uid() order by m.cree_le limit 1;
  end if;
  if v_prenom is null then
    raise exception 'Votre prénom est obligatoire';
  end if;
  select email into v_email from auth.users where id = auth.uid();

  insert into public.entreprises (nom, siren, siret, forme_juridique, adresse, code_postal, ville,
                                  tva_intracom, activite, representant, atteste_le)
  values (trim(p_nom), v_siren, nullif(regexp_replace(coalesce(p_siret, ''), '\s', '', 'g'), ''),
          nullif(trim(p_forme_juridique), ''), nullif(trim(p_adresse), ''), nullif(trim(p_code_postal), ''),
          nullif(trim(p_ville), ''), nullif(trim(p_tva_intracom), ''), nullif(trim(p_activite), ''),
          nullif(trim(p_representant), ''), case when nullif(trim(p_representant), '') is not null then now() end)
  returning id into v_entreprise;
  insert into public.membres (entreprise_id, user_id, email, prenom, nom, role)
  values (v_entreprise, auth.uid(), coalesce(v_email, ''), v_prenom, v_nom, 'dirigeant');
  insert into prive.entreprise_active (user_id, entreprise_id) values (auth.uid(), v_entreprise)
  on conflict (user_id) do update set entreprise_id = excluded.entreprise_id, le = now();
  return v_entreprise;
end $$;

-- Le dirigeant renseigne le SIREN d'une entreprise créée sans (avant cette version).
create function public.definir_siren(
  p_entreprise uuid, p_siren text, p_siret text default null, p_forme_juridique text default null,
  p_adresse text default null, p_code_postal text default null, p_ville text default null,
  p_tva_intracom text default null, p_activite text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_siren text := regexp_replace(coalesce(p_siren, ''), '\s', '', 'g');
begin
  if not prive.est_dirigeant_de(p_entreprise) then
    raise exception 'Réservé au dirigeant';
  end if;
  if exists (select 1 from public.entreprises where id = p_entreprise and identite_statut in ('en_attente', 'verifiee')) then
    raise exception 'Le SIREN d''une entreprise vérifiée ne se modifie pas';
  end if;
  if exists (select 1 from public.entreprises where siren = v_siren and id <> p_entreprise) then
    raise exception 'Cette entreprise est déjà inscrite sur Chantio' using errcode = 'unique_violation';
  end if;
  update public.entreprises set
    siren = v_siren,
    siret = coalesce(nullif(regexp_replace(coalesce(p_siret, ''), '\s', '', 'g'), ''), siret),
    forme_juridique = coalesce(nullif(trim(p_forme_juridique), ''), forme_juridique),
    adresse = coalesce(nullif(trim(p_adresse), ''), adresse),
    code_postal = coalesce(nullif(trim(p_code_postal), ''), code_postal),
    ville = coalesce(nullif(trim(p_ville), ''), ville),
    tva_intracom = coalesce(nullif(trim(p_tva_intracom), ''), tva_intracom),
    activite = coalesce(nullif(trim(p_activite), ''), activite)
  where id = p_entreprise;
end $$;

-- Le nom du dirigeant figure au registre : la demande part en contrôle chez Chantio.
-- (Le site la confirme lui-même quand il dispose de la clé de service.)
create function public.demander_verification_registre(p_entreprise uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.est_dirigeant_de(p_entreprise) then
    raise exception 'Réservé au dirigeant';
  end if;
  if not exists (select 1 from public.entreprises where id = p_entreprise and siren is not null) then
    raise exception 'Renseignez d''abord le SIREN';
  end if;
  perform set_config('chantio.identite', 'oui', true);
  update public.entreprises
     set identite_statut = 'en_attente', identite_mode = 'registre', identite_le = now(), identite_motif = null
   where id = p_entreprise and identite_statut in ('a_verifier', 'refusee');
end $$;

-- Pièce d'identité et Kbis (ou pouvoir) déposés : contrôle par Chantio.
create function public.envoyer_justificatifs(p_entreprise uuid, p_chemins text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_chemin text;
begin
  if not prive.est_dirigeant_de(p_entreprise) then
    raise exception 'Réservé au dirigeant';
  end if;
  if coalesce(array_length(p_chemins, 1), 0) < 2 then
    raise exception 'Il faut la pièce d''identité et le Kbis (ou le pouvoir)';
  end if;
  foreach v_chemin in array p_chemins loop
    if v_chemin not like p_entreprise::text || '/%' then
      raise exception 'Fichier d''une autre entreprise';
    end if;
  end loop;
  perform set_config('chantio.identite', 'oui', true);
  update public.entreprises
     set identite_statut = 'en_attente', identite_mode = 'documents', identite_documents = p_chemins,
         identite_le = now(), identite_motif = null
   where id = p_entreprise and identite_statut in ('a_verifier', 'refusee');
end $$;

-- Justificatifs : stockage privé, lisible par les seuls dirigeants de l'entreprise.
--   justificatifs/<entreprise_id>/<fichier>
insert into storage.buckets (id, name, public)
values ('justificatifs', 'justificatifs', false)
on conflict (id) do nothing;

create function prive.peut_gerer_justificatif(p_chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.entreprise_id::text = (storage.foldername(p_chemin))[1]
      and m.user_id = auth.uid() and m.actif and m.role = 'dirigeant'
  )
$$;
grant execute on function prive.peut_gerer_justificatif(text) to authenticated;
revoke execute on function prive.peut_gerer_justificatif(text) from public, anon;

create policy "justificatifs : lire" on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and prive.peut_gerer_justificatif(name));
create policy "justificatifs : déposer" on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and prive.peut_gerer_justificatif(name));

-- ---------------------------------------------------------------------------
-- Invitations : un compte existant peut en recevoir de plusieurs entreprises
-- ---------------------------------------------------------------------------

-- À la création d'un compte, on le relie à toutes ses invitations (même e-mail).
create or replace function prive.relier_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.membres m
     set user_id = new.id
   where m.user_id is null
     and lower(m.email) = lower(new.email)
     and not exists (select 1 from public.membres m2
                     where m2.entreprise_id = m.entreprise_id and m2.user_id = new.id);
  return new;
end $$;

-- Invitations reçues par le compte connecté et pas encore acceptées.
create function public.invitations_recues()
returns table (membre_id uuid, entreprise_id uuid, entreprise text, role public.role_membre, cree_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, e.id, e.nom, m.role, m.cree_le
  from public.membres m
  join public.entreprises e on e.id = m.entreprise_id
  join auth.users u on u.id = auth.uid()
  where m.user_id is null and m.actif and lower(m.email) = lower(u.email)
    and not exists (select 1 from public.membres m2
                    where m2.entreprise_id = m.entreprise_id and m2.user_id = auth.uid())
  order by m.cree_le
$$;

-- Accepte une invitation (ou, sans argument, toutes : premier lancement).
-- Renvoie l'entreprise rejointe, qui devient l'entreprise active.
drop function public.rejoindre_entreprise();
create function public.rejoindre_entreprise(p_membre uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  update public.membres m
     set user_id = auth.uid()
    from auth.users u
   where u.id = auth.uid()
     and m.user_id is null and m.actif
     and lower(m.email) = lower(u.email)
     and (p_membre is null or m.id = p_membre)
     and not exists (select 1 from public.membres m2
                     where m2.entreprise_id = m.entreprise_id and m2.user_id = auth.uid());
  if p_membre is not null then
    select entreprise_id into v_entreprise from public.membres where id = p_membre and user_id = auth.uid();
    if v_entreprise is null then
      raise exception 'Invitation introuvable';
    end if;
    perform public.choisir_entreprise(v_entreprise);
  else
    v_entreprise := prive.entreprise_courante();
  end if;
  return v_entreprise;
end $$;

-- ---------------------------------------------------------------------------
-- Demandes d'accès à une entreprise déjà inscrite
-- ---------------------------------------------------------------------------

create table public.demandes_acces (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  email          text not null,
  prenom         text not null,
  nom            text,
  message        text,
  statut         text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee')),
  cree_le        timestamptz not null default now(),
  traitee_le     timestamptz,
  traitee_par    uuid references public.membres (id) on delete set null,
  unique (entreprise_id, user_id)
);
create index on public.demandes_acces (entreprise_id, statut);

alter table public.demandes_acces enable row level security;

-- Le demandeur voit ses demandes ; les dirigeants voient celles de leurs entreprises.
-- Tout passe par les fonctions ci-dessous (aucune écriture directe).
create policy lire on public.demandes_acces for select to authenticated
  using (user_id = auth.uid() or prive.est_dirigeant_de(entreprise_id));

create function public.demander_acces(p_siren text, p_prenom text, p_nom text default null, p_message text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise public.entreprises;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if nullif(trim(p_prenom), '') is null then
    raise exception 'Votre prénom est obligatoire';
  end if;
  select * into v_entreprise from public.entreprises
   where siren = regexp_replace(coalesce(p_siren, ''), '\s', '', 'g');
  if not found then
    raise exception 'Entreprise introuvable';
  end if;
  if exists (select 1 from public.membres where entreprise_id = v_entreprise.id and user_id = auth.uid()) then
    raise exception 'Vous faites déjà partie de cette entreprise';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.demandes_acces (entreprise_id, user_id, email, prenom, nom, message)
  values (v_entreprise.id, auth.uid(), coalesce(v_email, ''), trim(p_prenom), nullif(trim(p_nom), ''), nullif(trim(p_message), ''))
  on conflict (entreprise_id, user_id) do update
    set statut = 'en_attente', prenom = excluded.prenom, nom = excluded.nom, message = excluded.message,
        cree_le = now(), traitee_le = null, traitee_par = null;
  return v_entreprise.nom;
end $$;

create function public.traiter_demande(p_demande uuid, p_accepter boolean, p_role public.role_membre default 'technicien')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_demande public.demandes_acces;
  v_par uuid;
begin
  select * into v_demande from public.demandes_acces where id = p_demande and statut = 'en_attente';
  if not found or not prive.est_dirigeant_de(v_demande.entreprise_id) then
    raise exception 'Demande introuvable';
  end if;
  select id into v_par from public.membres
   where entreprise_id = v_demande.entreprise_id and user_id = auth.uid();
  if p_accepter then
    insert into public.membres (entreprise_id, user_id, email, prenom, nom, role)
    values (v_demande.entreprise_id, v_demande.user_id, v_demande.email, v_demande.prenom, v_demande.nom, p_role)
    on conflict (entreprise_id, email) do update
      set user_id = excluded.user_id, role = excluded.role, actif = true
      where public.membres.user_id is null or public.membres.user_id = excluded.user_id;
  end if;
  update public.demandes_acces
     set statut = case when p_accepter then 'acceptee' else 'refusee' end,
         traitee_le = now(), traitee_par = v_par
   where id = p_demande;
end $$;

revoke execute on function public.creer_entreprise(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.rejoindre_entreprise(uuid) from public, anon;
revoke execute on function public.choisir_entreprise(uuid) from public, anon;
revoke execute on function public.mes_entreprises() from public, anon;
revoke execute on function public.sirens_inscrits(text[]) from public, anon;
revoke execute on function public.definir_siren(uuid, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.demander_verification_registre(uuid) from public, anon;
revoke execute on function public.envoyer_justificatifs(uuid, text[]) from public, anon;
revoke execute on function public.invitations_recues() from public, anon;
revoke execute on function public.demander_acces(text, text, text, text) from public, anon;
revoke execute on function public.traiter_demande(uuid, boolean, public.role_membre) from public, anon;
grant execute on function public.creer_entreprise(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.rejoindre_entreprise(uuid) to authenticated;
grant execute on function public.choisir_entreprise(uuid) to authenticated;
grant execute on function public.mes_entreprises() to authenticated;
grant execute on function public.sirens_inscrits(text[]) to authenticated;
grant execute on function public.definir_siren(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.demander_verification_registre(uuid) to authenticated;
grant execute on function public.envoyer_justificatifs(uuid, text[]) to authenticated;
grant execute on function public.invitations_recues() to authenticated;
grant execute on function public.demander_acces(text, text, text, text) to authenticated;
grant execute on function public.traiter_demande(uuid, boolean, public.role_membre) to authenticated;
grant execute on function public.membre_actif() to authenticated;
