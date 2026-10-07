-- Console Chantio : l'espace de l'équipe Chantio pour suivre ses entreprises clientes
-- (adresse /console du site). Les clients ne la voient jamais.
--
-- Trois règles, vérifiées par la base elle-même (pas seulement par le site) :
-- • Seules les personnes inscrites dans prive.equipe_chantio y entrent, et
--   seulement après la double vérification (code à 6 chiffres d'une appli
--   d'authentification : niveau « aal2 » du jeton Supabase).
-- • Sans session d'assistance acceptée par le dirigeant, la console ne voit que
--   le compte (identité, formule, utilisateurs, volumes), jamais le contenu
--   (clients, interventions, fiches, devis, factures, achats). Une session a une
--   durée limitée (15 min à 24 h) et le dirigeant peut la couper à tout moment.
-- • Chaque action de l'équipe Chantio sur une entreprise est inscrite dans
--   public.acces_chantio, que le dirigeant lit dans Paramètres › Accès de Chantio.
--
-- Aucune règle de cloisonnement existante n'est modifiée : tout passe par des
-- fonctions « console_… » qui contrôlent le rôle avant de lire quoi que ce soit.
-- Le script ne supprime rien.

-- ---------------------------------------------------------------------------
-- Équipe Chantio
-- ---------------------------------------------------------------------------

create table prive.equipe_chantio (
  id          uuid primary key default gen_random_uuid(),
  -- null tant que la personne invitée n'a pas ouvert la console
  user_id     uuid unique references auth.users (id) on delete set null,
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  prenom      text not null check (length(trim(prenom)) > 0),
  nom         text,
  -- proprietaire : tout ; support : aide les clients, sans l'argent ;
  -- commercial : abonnements, sans le contenu ni l'assistance.
  role        text not null check (role in ('proprietaire', 'support', 'commercial')),
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  vu_le       timestamptz
);
create unique index equipe_chantio_email_unique on prive.equipe_chantio (lower(email));

-- Fermée aux comptes : seules les fonctions ci-dessous la lisent.
alter table prive.equipe_chantio enable row level security;
revoke all on prive.equipe_chantio from public, anon, authenticated;

-- L'équipier connecté, s'il est actif ET passé par la double vérification.
create function prive.equipier() returns prive.equipe_chantio
language sql stable security definer set search_path = '' as $$
  select e.* from prive.equipe_chantio e
  where e.user_id = auth.uid() and e.actif
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Ce que chaque rôle peut faire (tableau de l'écran « Équipe Chantio ») :
--   voir        entreprises, vue d'ensemble, formules, packs, équipe
--   abonnement  formule, état du compte, essai, prix, options, créer une entreprise
--   assistance  demander une session et consulter le compte pendant la session
--   identite    valider ou refuser la vérification d'identité d'un dirigeant
--   idees       suivre les idées envoyées par les clients
--   equipe      inviter, changer le rôle ou retirer un équipier
create function prive.console_peut(p_droit text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case (prive.equipier()).role
      when 'proprietaire' then true
      when 'support' then p_droit in ('voir', 'assistance', 'identite', 'idees')
      when 'commercial' then p_droit in ('voir', 'abonnement', 'idees')
    end, false)
$$;

-- Arrête tout si l'équipier n'a pas ce droit ; renvoie l'équipier sinon.
create function prive.console_exiger(p_droit text) returns prive.equipe_chantio
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.equipier();
begin
  if v.id is null or not prive.console_peut(p_droit) then
    raise exception 'Réservé à l''équipe Chantio' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Abonnement de chaque entreprise (lu par le dirigeant, modifié par Chantio)
-- ---------------------------------------------------------------------------

create table public.abonnements (
  entreprise_id  uuid primary key references public.entreprises (id) on delete cascade,
  -- essai : période d'essai ; actif : client payant ; offert : gratuit (client
  -- pilote, partenaire) ; resilie : contrat terminé.
  statut         text not null default 'essai' check (statut in ('essai', 'actif', 'offert', 'resilie')),
  essai_fin      date,
  -- Prix mensuel HT négocié ; null = prix de la formule.
  prix_special   numeric(10, 2) check (prix_special is null or prix_special >= 0),
  options        text[] not null default '{}' check (options <@ array['compta', 'entreprise_sup']::text[]),
  modifie_le     timestamptz not null default now()
);

alter table public.abonnements enable row level security;
create policy lire on public.abonnements for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());
revoke all on public.abonnements from anon, authenticated;
grant select on public.abonnements to authenticated;

-- Aujourd'hui personne ne paie : les entreprises déjà inscrites sont « offertes ».
insert into public.abonnements (entreprise_id, statut)
select id, 'offert' from public.entreprises
on conflict (entreprise_id) do nothing;

-- Chaque nouvelle entreprise démarre un essai de 30 jours.
create function prive.creer_abonnement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.abonnements (entreprise_id, statut, essai_fin)
  values (new.id, 'essai', (now() at time zone 'Europe/Paris')::date + 30)
  on conflict (entreprise_id) do nothing;
  return null;
end $$;

create trigger abonnement after insert on public.entreprises
  for each row execute function prive.creer_abonnement();

-- ---------------------------------------------------------------------------
-- Journal des accès de Chantio (lu par le dirigeant)
-- ---------------------------------------------------------------------------

create table public.acces_chantio (
  id             bigint generated always as identity primary key,
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  equipier_id    uuid references prive.equipe_chantio (id) on delete set null,
  -- Qui : « Michael de Chantio », ou le dirigeant qui ouvre ou coupe l'accès.
  qui            text not null,
  action         text not null,
  assistance_id  uuid,
  le             timestamptz not null default now()
);
create index on public.acces_chantio (entreprise_id, le desc);

-- Le dirigeant lit le journal de son entreprise ; personne ne le modifie ni ne l'efface.
alter table public.acces_chantio enable row level security;
create policy lire on public.acces_chantio for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());
revoke all on public.acces_chantio from anon, authenticated;
grant select on public.acces_chantio to authenticated;

create function prive.noter_acces(p_entreprise uuid, p_equipier prive.equipe_chantio, p_action text, p_assistance uuid default null)
returns void
language sql security definer set search_path = '' as $$
  insert into public.acces_chantio (entreprise_id, equipier_id, qui, action, assistance_id)
  values (p_entreprise, p_equipier.id, p_equipier.prenom || ' de Chantio', p_action, p_assistance)
$$;

create function prive.duree_lisible(p_minutes integer) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_minutes < 60 then p_minutes || ' min'
    when p_minutes % 60 = 0 then (p_minutes / 60) || ' h'
    else (p_minutes / 60) || ' h ' || lpad((p_minutes % 60)::text, 2, '0')
  end
$$;

create function prive.libelle_formule(p text) returns text
language sql immutable set search_path = '' as $$
  select case p when 'solo' then 'Artisan' when 'equipe' then 'Équipe' when 'entreprise' then 'Entreprise' else p end
$$;

create function prive.libelle_statut_abonnement(p text) returns text
language sql immutable set search_path = '' as $$
  select case p when 'essai' then 'en essai' when 'actif' then 'payant' when 'offert' then 'offert' when 'resilie' then 'résilié' else p end
$$;

-- ---------------------------------------------------------------------------
-- Sessions d'assistance : l'accord du dirigeant, pour une durée limitée
-- ---------------------------------------------------------------------------

create table public.assistances (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  -- chantio : demandée par l'équipe, à accepter ; client : ouverte par le dirigeant.
  origine        text not null check (origine in ('chantio', 'client')),
  equipier_id    uuid references prive.equipe_chantio (id) on delete set null,
  demandeur      text not null,
  motif          text not null check (length(trim(motif)) between 1 and 300),
  duree_minutes  integer not null check (duree_minutes between 15 and 1440),
  statut         text not null default 'demandee'
                 check (statut in ('demandee', 'acceptee', 'refusee', 'terminee', 'annulee')),
  cree_le        timestamptz not null default now(),
  repondu_le     timestamptz,
  repondu_par    text,
  -- Ouverte de debut à fin ; à l'heure de fin, l'accès se coupe seul.
  debut          timestamptz,
  fin            timestamptz,
  termine_par    text,
  check (statut <> 'acceptee' or (debut is not null and fin is not null and fin > debut))
);
create index on public.assistances (entreprise_id, cree_le desc);

alter table public.assistances enable row level security;
create policy lire on public.assistances for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_dirigeant());
revoke all on public.assistances from anon, authenticated;
grant select on public.assistances to authenticated;

-- La session ouverte en ce moment pour cette entreprise, s'il y en a une.
create function prive.assistance_ouverte(p_entreprise uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.assistances a
  where a.entreprise_id = p_entreprise and a.statut = 'acceptee'
    and now() >= a.debut and now() < a.fin
  order by a.fin desc
  limit 1
$$;

-- Une demande de Chantio sans réponse expire au bout de 24 h.
create function prive.demande_en_attente(p_entreprise uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.assistances a
  where a.entreprise_id = p_entreprise and a.statut = 'demandee'
    and a.cree_le > now() - interval '24 hours'
  order by a.cree_le desc
  limit 1
$$;

-- Nom affiché du membre connecté dans une entreprise donnée.
create function prive.nom_membre(p_entreprise uuid) returns text
language sql stable security definer set search_path = '' as $$
  select trim(m.prenom || ' ' || coalesce(m.nom, '')) from public.membres m
  where m.entreprise_id = p_entreprise and m.user_id = auth.uid() and m.actif
  limit 1
$$;

-- Côté client ----------------------------------------------------------------

-- Le dirigeant ouvre lui-même l'accès (« j'ai un souci, regardez »).
create function public.autoriser_assistance(p_duree_minutes integer, p_motif text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid := prive.entreprise_courante();
  v_nom text;
  v_id uuid;
begin
  if not prive.est_dirigeant() then
    raise exception 'Seul le dirigeant peut ouvrir l''accès à Chantio';
  end if;
  if p_duree_minutes is null or p_duree_minutes not between 15 and 1440 then
    raise exception 'Durée invalide';
  end if;
  v_nom := prive.nom_membre(v_entreprise);
  -- Une seule session ouverte à la fois : la précédente se ferme.
  update public.assistances
     set statut = 'terminee', fin = now(), termine_par = v_nom
   where entreprise_id = v_entreprise and statut = 'acceptee' and fin > now();
  insert into public.assistances (entreprise_id, origine, demandeur, motif, duree_minutes, statut,
                                  repondu_le, repondu_par, debut, fin)
  values (v_entreprise, 'client', v_nom,
          coalesce(nullif(left(trim(coalesce(p_motif, '')), 300), ''), 'Accès ouvert par le dirigeant'),
          p_duree_minutes, 'acceptee', now(), v_nom, now(), now() + make_interval(mins => p_duree_minutes))
  returning id into v_id;
  insert into public.acces_chantio (entreprise_id, qui, action, assistance_id)
  values (v_entreprise, v_nom, 'A ouvert l''accès à l''équipe Chantio pendant ' || prive.duree_lisible(p_duree_minutes), v_id);
  return v_id;
end $$;

-- Le dirigeant accepte ou refuse une demande de Chantio.
create function public.repondre_assistance(p_assistance uuid, p_accepter boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.assistances;
  v_nom text;
begin
  select * into v from public.assistances where id = p_assistance and statut = 'demandee' for update;
  if not found or not prive.est_dirigeant_de(v.entreprise_id) then
    raise exception 'Demande introuvable';
  end if;
  if v.cree_le <= now() - interval '24 hours' then
    raise exception 'Cette demande a expiré : Chantio doit en refaire une';
  end if;
  v_nom := prive.nom_membre(v.entreprise_id);
  if p_accepter then
    update public.assistances
       set statut = 'terminee', fin = now(), termine_par = v_nom
     where entreprise_id = v.entreprise_id and statut = 'acceptee' and fin > now();
    update public.assistances
       set statut = 'acceptee', repondu_le = now(), repondu_par = v_nom,
           debut = now(), fin = now() + make_interval(mins => v.duree_minutes)
     where id = p_assistance;
  else
    update public.assistances set statut = 'refusee', repondu_le = now(), repondu_par = v_nom
     where id = p_assistance;
  end if;
  insert into public.acces_chantio (entreprise_id, qui, action, assistance_id)
  values (v.entreprise_id, v_nom,
          case when p_accepter
               then format('A accepté la demande d''accès de %s (%s) : « %s »', v.demandeur, prive.duree_lisible(v.duree_minutes), v.motif)
               else format('A refusé la demande d''accès de %s : « %s »', v.demandeur, v.motif) end,
          p_assistance);
end $$;

-- Le dirigeant coupe l'accès avant la fin prévue.
create function public.retirer_assistance(p_assistance uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.assistances;
  v_nom text;
begin
  select * into v from public.assistances
   where id = p_assistance and statut = 'acceptee' and fin > now() for update;
  if not found or not prive.est_dirigeant_de(v.entreprise_id) then
    raise exception 'Aucun accès ouvert';
  end if;
  v_nom := prive.nom_membre(v.entreprise_id);
  update public.assistances set statut = 'terminee', fin = now(), termine_par = v_nom where id = p_assistance;
  insert into public.acces_chantio (entreprise_id, qui, action, assistance_id)
  values (v.entreprise_id, v_nom, 'A coupé l''accès de l''équipe Chantio', p_assistance);
end $$;

-- ---------------------------------------------------------------------------
-- Fonctions de la console
-- ---------------------------------------------------------------------------

-- Qui ouvre la console ? null si la personne n'est pas de l'équipe.
-- Relie l'invitation au compte dont l'adresse e-mail a été validée.
create function public.console_moi() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio;
  v_aal2 boolean := coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
begin
  if auth.uid() is null then
    return null;
  end if;
  update prive.equipe_chantio e
     set user_id = auth.uid()
   where e.user_id is null and e.actif
     and lower(e.email) = (select lower(u.email) from auth.users u
                           where u.id = auth.uid() and u.email_confirmed_at is not null)
     and not exists (select 1 from prive.equipe_chantio x where x.user_id = auth.uid());
  select * into v from prive.equipe_chantio e where e.user_id = auth.uid() and e.actif;
  if not found then
    return null;
  end if;
  if v_aal2 then
    update prive.equipe_chantio set vu_le = now() where id = v.id;
  end if;
  return jsonb_build_object('id', v.id, 'prenom', v.prenom, 'nom', v.nom, 'email', v.email,
                            'role', v.role, 'double_verification', v_aal2);
end $$;

-- Pour afficher le lien « Console Chantio » dans le menu du bureau.
create function public.est_equipe_chantio() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from prive.equipe_chantio e
    where e.actif
      and (e.user_id = auth.uid()
           or (e.user_id is null
               and lower(e.email) = (select lower(u.email) from auth.users u
                                     where u.id = auth.uid() and u.email_confirmed_at is not null)))
  )
$$;

-- Toutes les entreprises, avec leur abonnement et leurs volumes (jamais le contenu).
create function public.console_entreprises()
returns table (
  id uuid, nom text, siren text, code_postal text, ville text, metiers text[], formule text,
  statut text, essai_fin date, prix_special numeric, options text[], identite_statut text,
  cree_le timestamptz, utilisateurs bigint, invitations bigint, dirigeant text, dirigeant_email text,
  derniere_connexion timestamptz, interventions bigint, fiches_30j bigint, assistance_ouverte boolean
)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('voir');
  return query
  select e.id, e.nom, e.siren, e.code_postal, e.ville, e.metiers, e.formule,
         coalesce(a.statut, 'essai'), a.essai_fin, a.prix_special, coalesce(a.options, '{}'), e.identite_statut,
         e.cree_le,
         (select count(*) from public.membres m where m.entreprise_id = e.id and m.actif and m.user_id is not null),
         (select count(*) from public.membres m where m.entreprise_id = e.id and m.actif and m.user_id is null),
         d.nom_complet, d.email,
         (select max(u.last_sign_in_at) from public.membres m join auth.users u on u.id = m.user_id where m.entreprise_id = e.id),
         (select count(*) from public.interventions i where i.entreprise_id = e.id),
         (select count(*) from public.fiches f where f.entreprise_id = e.id and f.envoyee_le > now() - interval '30 days'),
         prive.assistance_ouverte(e.id) is not null
  from public.entreprises e
  left join public.abonnements a on a.entreprise_id = e.id
  left join lateral (
    select trim(m.prenom || ' ' || coalesce(m.nom, '')) as nom_complet, m.email
    from public.membres m
    where m.entreprise_id = e.id and m.role = 'dirigeant' and m.actif
    order by (m.user_id is not null) desc, m.cree_le
    limit 1
  ) d on true
  order by lower(e.nom);
end $$;

-- Tableau de bord : chiffres de toute la plateforme (des comptes, jamais du contenu).
create function public.console_vue_ensemble() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  perform prive.console_exiger('voir');
  return jsonb_build_object(
    'utilisateurs', (select count(*) from public.membres where actif and user_id is not null),
    'connectes_7j', (select count(distinct m.user_id) from public.membres m join auth.users u on u.id = m.user_id
                     where m.actif and u.last_sign_in_at > now() - interval '7 days'),
    'identites_en_attente', (select count(*) from public.entreprises where identite_statut = 'en_attente'),
    'idees_nouvelles', (select count(*) from public.retours where statut = 'nouveau'),
    'demandes_assistance', (select count(*) from public.assistances
                            where statut = 'demandee' and cree_le > now() - interval '24 hours'),
    'jours', (
      select jsonb_agg(jsonb_build_object('jour', j.jour, 'interventions', coalesce(i.n, 0), 'fiches', coalesce(f.n, 0))
             order by j.jour)
      from (select v_aujourdhui - k as jour from generate_series(0, 29) as k) j
      left join (select (cree_le at time zone 'Europe/Paris')::date as jour, count(*) as n
                 from public.interventions where cree_le >= now() - interval '31 days' group by 1) i on i.jour = j.jour
      left join (select (envoyee_le at time zone 'Europe/Paris')::date as jour, count(*) as n
                 from public.fiches where envoyee_le >= now() - interval '31 days' group by 1) f on f.jour = j.jour
    )
  );
end $$;

-- Fiche d'une entreprise : identité, abonnement, utilisateurs, volumes, sessions, journal.
create function public.console_entreprise(p_entreprise uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.entreprises;
begin
  perform prive.console_exiger('voir');
  select * into e from public.entreprises where id = p_entreprise;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'entreprise', jsonb_build_object(
      'id', e.id, 'nom', e.nom, 'siren', e.siren, 'siret', e.siret, 'forme_juridique', e.forme_juridique,
      'adresse', e.adresse, 'code_postal', e.code_postal, 'ville', e.ville, 'telephone', e.telephone,
      'email', e.email, 'metiers', e.metiers, 'activite', e.activite, 'formule', e.formule,
      'identite_statut', e.identite_statut, 'identite_mode', e.identite_mode, 'identite_le', e.identite_le,
      'identite_motif', e.identite_motif, 'representant', e.representant, 'cree_le', e.cree_le),
    'abonnement', (select to_jsonb(a) - 'entreprise_id' from public.abonnements a where a.entreprise_id = e.id),
    'membres', coalesce((
      select jsonb_agg(jsonb_build_object(
               'prenom', m.prenom, 'nom', m.nom, 'email', m.email, 'role', m.role, 'actif', m.actif,
               'compte', m.user_id is not null, 'derniere_connexion', u.last_sign_in_at, 'cree_le', m.cree_le)
             order by m.actif desc, (m.role = 'dirigeant') desc, m.prenom)
      from public.membres m left join auth.users u on u.id = m.user_id
      where m.entreprise_id = e.id), '[]'::jsonb),
    'volumes', jsonb_build_object(
      'clients', (select count(*) from public.clients where entreprise_id = e.id),
      'interventions', (select count(*) from public.interventions where entreprise_id = e.id),
      'fiches', (select count(*) from public.fiches where entreprise_id = e.id),
      'photos', (select count(*) from public.medias where entreprise_id = e.id),
      'devis', (select count(*) from public.documents where entreprise_id = e.id and genre = 'devis'),
      'factures', (select count(*) from public.documents where entreprise_id = e.id and genre = 'facture'),
      'achats', (select count(*) from public.achats where entreprise_id = e.id),
      'contrats', (select count(*) from public.contrats where entreprise_id = e.id),
      'retours', (select count(*) from public.retours where entreprise_id = e.id),
      'stockage_octets', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
                          where o.bucket_id in ('medias', 'profils', 'documents', 'justificatifs')
                            and o.name like e.id::text || '/%')),
    'assistance_ouverte', prive.assistance_ouverte(e.id),
    'demande_en_attente', prive.demande_en_attente(e.id),
    'assistances', coalesce((
      select jsonb_agg(to_jsonb(a) - 'entreprise_id' - 'equipier_id' order by a.cree_le desc)
      from (select * from public.assistances where entreprise_id = e.id order by cree_le desc limit 20) a), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object('qui', j.qui, 'action', j.action, 'le', j.le) order by j.le desc, j.id desc)
      from (select * from public.acces_chantio where entreprise_id = e.id order by le desc, id desc limit 200) j), '[]'::jsonb)
  );
end $$;

-- Change la formule, l'état du compte, la fin d'essai, le prix ou les options.
-- Chaque changement est inscrit au journal que lit le dirigeant.
create function public.console_modifier_abonnement(
  p_entreprise    uuid,
  p_formule       text,
  p_statut        text,
  p_essai_fin     date default null,
  p_prix_special  numeric default null,
  p_options       text[] default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('abonnement');
  v_formule text;
  a public.abonnements;
  v_options text[] := coalesce(p_options, '{}');
  v_essai date := p_essai_fin;
  o text;
begin
  select formule into v_formule from public.entreprises where id = p_entreprise for update;
  if not found then
    raise exception 'Entreprise introuvable';
  end if;
  if coalesce(p_formule, '') not in ('solo', 'equipe', 'entreprise') then
    raise exception 'Formule inconnue';
  end if;
  if coalesce(p_statut, '') not in ('essai', 'actif', 'offert', 'resilie') then
    raise exception 'État inconnu';
  end if;
  if not v_options <@ array['compta', 'entreprise_sup'] then
    raise exception 'Option inconnue';
  end if;
  if p_prix_special is not null and (p_prix_special < 0 or p_prix_special > 100000) then
    raise exception 'Prix invalide';
  end if;
  insert into public.abonnements (entreprise_id) values (p_entreprise) on conflict (entreprise_id) do nothing;
  select * into a from public.abonnements where entreprise_id = p_entreprise for update;
  if p_statut = 'essai' then
    v_essai := coalesce(v_essai, a.essai_fin, (now() at time zone 'Europe/Paris')::date + 30);
  else
    v_essai := null;
  end if;

  if p_formule is distinct from v_formule then
    update public.entreprises set formule = p_formule where id = p_entreprise;
    perform prive.noter_acces(p_entreprise, v, format('A changé la formule : %s → %s',
      prive.libelle_formule(v_formule), prive.libelle_formule(p_formule)));
  end if;
  if p_statut is distinct from a.statut then
    perform prive.noter_acces(p_entreprise, v, format('A passé le compte de « %s » à « %s »',
      prive.libelle_statut_abonnement(a.statut), prive.libelle_statut_abonnement(p_statut)));
  end if;
  if p_statut = 'essai' and v_essai is distinct from a.essai_fin then
    perform prive.noter_acces(p_entreprise, v, 'A fixé la fin de l''essai au ' || to_char(v_essai, 'DD/MM/YYYY'));
  end if;
  if p_prix_special is distinct from a.prix_special then
    perform prive.noter_acces(p_entreprise, v, case when p_prix_special is null
      then 'A remis le prix de la formule'
      else 'A fixé un prix particulier : ' || replace(to_char(p_prix_special, 'FM999990.00'), '.', ',') || ' € HT par mois' end);
  end if;
  foreach o in array v_options loop
    if not o = any (a.options) then
      perform prive.noter_acces(p_entreprise, v, 'A ajouté l''option « ' ||
        case o when 'compta' then 'Connecteur comptable' else 'Entreprise supplémentaire' end || ' »');
    end if;
  end loop;
  foreach o in array a.options loop
    if not o = any (v_options) then
      perform prive.noter_acces(p_entreprise, v, 'A retiré l''option « ' ||
        case o when 'compta' then 'Connecteur comptable' else 'Entreprise supplémentaire' end || ' »');
    end if;
  end loop;

  update public.abonnements
     set statut = p_statut, essai_fin = v_essai, prix_special = p_prix_special,
         options = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(v_options) x),
         modifie_le = now()
   where entreprise_id = p_entreprise;
end $$;

-- Crée une entreprise signée hors du site (au téléphone, sur un salon) et
-- invite son dirigeant : il crée son compte avec cette adresse e-mail.
create function public.console_creer_entreprise(
  p_nom          text,
  p_prenom       text,
  p_nom_famille  text,
  p_email        text,
  p_siren        text default null,
  p_code_postal  text default null,
  p_ville        text default null,
  p_formule      text default 'equipe',
  p_statut       text default 'essai'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('abonnement');
  v_siren text := nullif(regexp_replace(coalesce(p_siren, ''), '\s', '', 'g'), '');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if length(trim(coalesce(p_nom, ''))) = 0 then
    raise exception 'Le nom de l''entreprise est obligatoire';
  end if;
  if length(trim(coalesce(p_prenom, ''))) = 0 then
    raise exception 'Le prénom du dirigeant est obligatoire';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if v_siren is not null and v_siren !~ '^[0-9]{9}$' then
    raise exception 'Le SIREN compte 9 chiffres';
  end if;
  if v_siren is not null and exists (select 1 from public.entreprises where siren = v_siren) then
    raise exception 'Cette entreprise est déjà inscrite sur Chantio' using errcode = 'unique_violation';
  end if;
  if coalesce(p_formule, '') not in ('solo', 'equipe', 'entreprise') or coalesce(p_statut, '') not in ('essai', 'actif', 'offert') then
    raise exception 'Formule ou état inconnu';
  end if;

  insert into public.entreprises (nom, siren, code_postal, ville, formule)
  values (trim(p_nom), v_siren, nullif(trim(p_code_postal), ''), nullif(trim(p_ville), ''), p_formule)
  returning id into v_id;
  update public.abonnements set statut = p_statut, essai_fin = case when p_statut = 'essai' then essai_fin end
   where entreprise_id = v_id;
  insert into public.membres (entreprise_id, email, prenom, nom, role)
  values (v_id, v_email, trim(p_prenom), nullif(trim(p_nom_famille), ''), 'dirigeant');
  perform prive.noter_acces(v_id, v, format('A créé le compte (formule %s, %s) et invité %s',
    prive.libelle_formule(p_formule), prive.libelle_statut_abonnement(p_statut), trim(p_prenom)));
  return v_id;
end $$;

-- Vérifications d'identité en attente (et les dernières décidées).
create function public.console_identites()
returns table (
  id uuid, nom text, siren text, forme_juridique text, ville text, identite_statut text,
  identite_mode text, identite_documents text[], identite_le timestamptz, identite_motif text,
  representant text, atteste_le timestamptz, dirigeant text, dirigeant_email text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('identite');
  return query
  select e.id, e.nom, e.siren, e.forme_juridique, e.ville, e.identite_statut, e.identite_mode,
         e.identite_documents, e.identite_le, e.identite_motif, e.representant, e.atteste_le,
         d.nom_complet, d.email
  from public.entreprises e
  left join lateral (
    select trim(m.prenom || ' ' || coalesce(m.nom, '')) as nom_complet, m.email
    from public.membres m
    where m.entreprise_id = e.id and m.role = 'dirigeant' and m.actif
    order by (m.user_id is not null) desc, m.cree_le
    limit 1
  ) d on true
  where e.identite_statut = 'en_attente'
     or (e.identite_statut in ('verifiee', 'refusee') and e.identite_le > now() - interval '60 days')
  order by (e.identite_statut = 'en_attente') desc, e.identite_le desc nulls last
  limit 100;
end $$;

-- Valide ou refuse la vérification d'identité d'un dirigeant (le motif est montré au client).
create function public.console_decider_identite(p_entreprise uuid, p_valider boolean, p_motif text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('identite');
  v_motif text := nullif(left(trim(coalesce(p_motif, '')), 500), '');
begin
  if not p_valider and v_motif is null then
    raise exception 'Indiquez au client pourquoi c''est refusé';
  end if;
  update public.entreprises
     set identite_statut = case when p_valider then 'verifiee' else 'refusee' end,
         identite_le = now(),
         identite_motif = case when p_valider then null else v_motif end
   where id = p_entreprise and identite_statut = 'en_attente';
  if not found then
    raise exception 'Aucune vérification en attente pour cette entreprise';
  end if;
  perform prive.noter_acces(p_entreprise, v, case when p_valider
    then 'A vérifié l''identité du dirigeant'
    else 'A refusé la vérification d''identité : ' || v_motif end);
end $$;

-- Les justificatifs déposés pour la vérification d'identité sont lisibles par
-- l'équipe Chantio qui la contrôle (le dirigeant les envoie pour ça).
create policy "justificatifs : lire (équipe Chantio)" on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and prive.console_peut('identite'));

-- Idées envoyées par la bulle « Vos idées pour Chantio », de toutes les entreprises.
create function public.console_idees()
returns table (
  id uuid, entreprise_id uuid, entreprise text, auteur text, texte text, page text, titre_page text,
  appareil text, statut text, cree_le timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('voir');
  return query
  select r.id, r.entreprise_id, e.nom, r.auteur, r.texte, r.page, r.titre_page, r.appareil, r.statut, r.cree_le
  from public.retours r join public.entreprises e on e.id = r.entreprise_id
  order by (r.statut = 'fait'), r.cree_le desc
  limit 500;
end $$;

create function public.console_suivre_idee(p_retour uuid, p_statut text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('idees');
  if coalesce(p_statut, '') not in ('nouveau', 'en_cours', 'fait') then
    raise exception 'État inconnu';
  end if;
  update public.retours set statut = p_statut where id = p_retour;
end $$;

-- Sessions d'assistance de toutes les entreprises (motif, durée, réponse ; pas de contenu).
create function public.console_assistances()
returns table (
  id uuid, entreprise_id uuid, entreprise text, origine text, demandeur text, motif text,
  duree_minutes integer, statut text, cree_le timestamptz, repondu_par text, debut timestamptz,
  fin timestamptz, termine_par text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('voir');
  return query
  select a.id, a.entreprise_id, e.nom, a.origine, a.demandeur, a.motif, a.duree_minutes, a.statut,
         a.cree_le, a.repondu_par, a.debut, a.fin, a.termine_par
  from public.assistances a join public.entreprises e on e.id = a.entreprise_id
  order by a.cree_le desc
  limit 100;
end $$;

-- Demande au dirigeant l'accès à son compte, pour une durée et un motif qu'il lit.
create function public.console_demander_assistance(p_entreprise uuid, p_duree_minutes integer, p_motif text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('assistance');
  v_motif text := nullif(left(trim(coalesce(p_motif, '')), 300), '');
  v_id uuid;
begin
  if not exists (select 1 from public.entreprises where id = p_entreprise) then
    raise exception 'Entreprise introuvable';
  end if;
  if v_motif is null then
    raise exception 'Le motif est obligatoire : le client le lit avant d''accepter';
  end if;
  if p_duree_minutes is null or p_duree_minutes not between 15 and 1440 then
    raise exception 'Durée invalide';
  end if;
  if prive.assistance_ouverte(p_entreprise) is not null then
    raise exception 'Un accès est déjà ouvert pour cette entreprise';
  end if;
  if prive.demande_en_attente(p_entreprise) is not null then
    raise exception 'Une demande attend déjà la réponse du client';
  end if;
  insert into public.assistances (entreprise_id, origine, equipier_id, demandeur, motif, duree_minutes)
  values (p_entreprise, 'chantio', v.id, v.prenom || ' de Chantio', v_motif, p_duree_minutes)
  returning id into v_id;
  perform prive.noter_acces(p_entreprise, v,
    format('A demandé l''accès au compte pour %s : « %s »', prive.duree_lisible(p_duree_minutes), v_motif), v_id);
  return v_id;
end $$;

-- Ferme une session ouverte, ou annule une demande sans réponse.
create function public.console_terminer_assistance(p_assistance uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('assistance');
  a public.assistances;
begin
  select * into a from public.assistances where id = p_assistance for update;
  if not found then
    raise exception 'Session introuvable';
  end if;
  if a.statut = 'demandee' then
    update public.assistances set statut = 'annulee', termine_par = v.prenom || ' de Chantio' where id = p_assistance;
    perform prive.noter_acces(a.entreprise_id, v, 'A annulé sa demande d''accès', p_assistance);
  elsif a.statut = 'acceptee' and a.fin > now() then
    update public.assistances set statut = 'terminee', fin = now(), termine_par = v.prenom || ' de Chantio' where id = p_assistance;
    perform prive.noter_acces(a.entreprise_id, v, 'A fermé la session d''assistance', p_assistance);
  else
    raise exception 'Cette session est déjà terminée';
  end if;
end $$;

-- Pendant une session acceptée seulement : le contenu du compte, en lecture.
-- Chaque page consultée est inscrite au journal (une fois toutes les 10 minutes).
create function public.console_assistance_donnees(p_entreprise uuid, p_vue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('assistance');
  v_assistance uuid := prive.assistance_ouverte(p_entreprise);
  v_action text;
  v_donnees jsonb;
begin
  if v_assistance is null then
    raise exception 'Aucun accès ouvert par le client' using errcode = 'insufficient_privilege';
  end if;
  if p_vue = 'interventions' then
    v_action := 'A consulté les interventions';
    select coalesce(jsonb_agg(t order by t.ordre desc, t.numero desc), '[]') into v_donnees from (
      select i.numero, i.reference, i.motif, i.statut, i.type, i.urgence, i.date_prevue, i.heure_prevue,
             c.nom as client,
             (select string_agg(m.prenom, ', ' order by m.prenom) from public.affectations af
              join public.membres m on m.id = af.membre_id where af.intervention_id = i.id) as techniciens,
             coalesce(i.date_prevue, (i.cree_le at time zone 'Europe/Paris')::date) as ordre
      from public.interventions i left join public.clients c on c.id = i.client_id
      where i.entreprise_id = p_entreprise
      order by coalesce(i.date_prevue, (i.cree_le at time zone 'Europe/Paris')::date) desc, i.numero desc
      limit 200) t;
  elsif p_vue = 'clients' then
    v_action := 'A consulté les clients';
    select coalesce(jsonb_agg(t order by lower(t.nom)), '[]') into v_donnees from (
      select c.nom, c.type, c.telephone, c.email, c.cree_le,
             (select count(*) from public.interventions i where i.client_id = c.id) as interventions
      from public.clients c where c.entreprise_id = p_entreprise
      order by lower(c.nom) limit 300) t;
  elsif p_vue = 'documents' then
    v_action := 'A consulté les devis et factures';
    select coalesce(jsonb_agg(t order by t.date_document desc, t.numero desc nulls last), '[]') into v_donnees from (
      select d.genre, d.type_facture, d.numero, d.statut, d.objet, d.client ->> 'nom' as client,
             d.total_ht, d.total_ttc, d.date_document, d.echeance
      from public.documents d where d.entreprise_id = p_entreprise
      order by d.date_document desc, d.numero desc nulls last limit 200) t;
  elsif p_vue = 'achats' then
    v_action := 'A consulté les achats';
    select coalesce(jsonb_agg(t order by t.date_facture desc), '[]') into v_donnees from (
      select f.nom as fournisseur, a.numero, a.date_facture, a.echeance, a.montant_ht, a.montant_ttc,
             a.statut::text as statut, a.avoir
      from public.achats a left join public.fournisseurs f on f.id = a.fournisseur_id
      where a.entreprise_id = p_entreprise
      order by a.date_facture desc limit 200) t;
  else
    raise exception 'Page inconnue';
  end if;
  if not exists (select 1 from public.acces_chantio
                 where assistance_id = v_assistance and equipier_id = v.id and action = v_action
                   and le > now() - interval '10 minutes') then
    perform prive.noter_acces(p_entreprise, v, v_action, v_assistance);
  end if;
  return v_donnees;
end $$;

-- Équipe Chantio -------------------------------------------------------------

create function public.console_equipe()
returns table (id uuid, prenom text, nom text, email text, role text, actif boolean, compte boolean,
               vu_le timestamptz, cree_le timestamptz, moi boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('voir');
  return query
  select e.id, e.prenom, e.nom, e.email, e.role, e.actif, e.user_id is not null, e.vu_le, e.cree_le,
         coalesce(e.user_id = auth.uid(), false)
  from prive.equipe_chantio e
  order by e.actif desc, (e.role = 'proprietaire') desc, e.prenom;
end $$;

-- Ajoute quelqu'un à l'équipe : il ouvre /console avec cette adresse e-mail
-- (compte Chantio créé et adresse validée), puis active sa double vérification.
create function public.console_inviter_equipier(p_email text, p_prenom text, p_nom text, p_role text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  perform prive.console_exiger('equipe');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if length(trim(coalesce(p_prenom, ''))) = 0 then
    raise exception 'Le prénom est obligatoire';
  end if;
  if coalesce(p_role, '') not in ('proprietaire', 'support', 'commercial') then
    raise exception 'Rôle inconnu';
  end if;
  if exists (select 1 from prive.equipe_chantio where lower(email) = v_email) then
    raise exception 'Cette personne fait déjà partie de l''équipe' using errcode = 'unique_violation';
  end if;
  insert into prive.equipe_chantio (email, prenom, nom, role)
  values (v_email, trim(p_prenom), nullif(trim(p_nom), ''), p_role)
  returning id into v_id;
  return v_id;
end $$;

-- Change le rôle d'un équipier ou lui retire l'accès (jamais soi-même, et il
-- reste toujours au moins un propriétaire actif).
create function public.console_modifier_equipier(p_equipier uuid, p_role text, p_actif boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('equipe');
begin
  if p_equipier = v.id then
    raise exception 'Vous ne pouvez pas changer votre propre accès';
  end if;
  if coalesce(p_role, '') not in ('proprietaire', 'support', 'commercial') or p_actif is null then
    raise exception 'Rôle inconnu';
  end if;
  update prive.equipe_chantio set role = p_role, actif = p_actif where id = p_equipier;
  if not found then
    raise exception 'Équipier introuvable';
  end if;
  if not exists (select 1 from prive.equipe_chantio where role = 'proprietaire' and actif) then
    raise exception 'Il faut garder au moins un propriétaire';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

-- Fonctions internes : appelées par les fonctions ci-dessus, jamais par l'API.
revoke execute on function prive.equipier() from public, anon, authenticated;
revoke execute on function prive.console_exiger(text) from public, anon, authenticated;
revoke execute on function prive.creer_abonnement() from public, anon, authenticated;
revoke execute on function prive.noter_acces(uuid, prive.equipe_chantio, text, uuid) from public, anon, authenticated;
revoke execute on function prive.assistance_ouverte(uuid) from public, anon, authenticated;
revoke execute on function prive.demande_en_attente(uuid) from public, anon, authenticated;
revoke execute on function prive.nom_membre(uuid) from public, anon, authenticated;
revoke execute on function prive.duree_lisible(integer) from public, anon, authenticated;
revoke execute on function prive.libelle_formule(text) from public, anon, authenticated;
revoke execute on function prive.libelle_statut_abonnement(text) from public, anon, authenticated;
-- Utilisée par la règle de lecture des justificatifs : le rôle connecté doit pouvoir l'appeler.
revoke execute on function prive.console_peut(text) from public, anon;
grant execute on function prive.console_peut(text) to authenticated;

revoke execute on function public.autoriser_assistance(integer, text) from public, anon;
revoke execute on function public.repondre_assistance(uuid, boolean) from public, anon;
revoke execute on function public.retirer_assistance(uuid) from public, anon;
revoke execute on function public.console_moi() from public, anon;
revoke execute on function public.est_equipe_chantio() from public, anon;
revoke execute on function public.console_entreprises() from public, anon;
revoke execute on function public.console_vue_ensemble() from public, anon;
revoke execute on function public.console_entreprise(uuid) from public, anon;
revoke execute on function public.console_modifier_abonnement(uuid, text, text, date, numeric, text[]) from public, anon;
revoke execute on function public.console_creer_entreprise(text, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.console_identites() from public, anon;
revoke execute on function public.console_decider_identite(uuid, boolean, text) from public, anon;
revoke execute on function public.console_idees() from public, anon;
revoke execute on function public.console_suivre_idee(uuid, text) from public, anon;
revoke execute on function public.console_assistances() from public, anon;
revoke execute on function public.console_demander_assistance(uuid, integer, text) from public, anon;
revoke execute on function public.console_terminer_assistance(uuid) from public, anon;
revoke execute on function public.console_assistance_donnees(uuid, text) from public, anon;
revoke execute on function public.console_equipe() from public, anon;
revoke execute on function public.console_inviter_equipier(text, text, text, text) from public, anon;
revoke execute on function public.console_modifier_equipier(uuid, text, boolean) from public, anon;

grant execute on function public.autoriser_assistance(integer, text) to authenticated;
grant execute on function public.repondre_assistance(uuid, boolean) to authenticated;
grant execute on function public.retirer_assistance(uuid) to authenticated;
grant execute on function public.console_moi() to authenticated;
grant execute on function public.est_equipe_chantio() to authenticated;
grant execute on function public.console_entreprises() to authenticated;
grant execute on function public.console_vue_ensemble() to authenticated;
grant execute on function public.console_entreprise(uuid) to authenticated;
grant execute on function public.console_modifier_abonnement(uuid, text, text, date, numeric, text[]) to authenticated;
grant execute on function public.console_creer_entreprise(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.console_identites() to authenticated;
grant execute on function public.console_decider_identite(uuid, boolean, text) to authenticated;
grant execute on function public.console_idees() to authenticated;
grant execute on function public.console_suivre_idee(uuid, text) to authenticated;
grant execute on function public.console_assistances() to authenticated;
grant execute on function public.console_demander_assistance(uuid, integer, text) to authenticated;
grant execute on function public.console_terminer_assistance(uuid) to authenticated;
grant execute on function public.console_assistance_donnees(uuid, text) to authenticated;
grant execute on function public.console_equipe() to authenticated;
grant execute on function public.console_inviter_equipier(text, text, text, text) to authenticated;
grant execute on function public.console_modifier_equipier(uuid, text, boolean) to authenticated;
