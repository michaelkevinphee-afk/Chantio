-- Équipe en direct : position des techniciens sur le Pilotage, et preuve de passage.
--
-- Règles (encadrement CNIL de la géolocalisation des salariés) :
--   * le technicien active lui-même le partage depuis son téléphone (écran Moi),
--     et peut le couper à tout moment ;
--   * la position n'est acceptée que pendant les heures de travail de l'entreprise
--     (par défaut du lundi au vendredi, 7:30–18:30, hors pause 12:00–13:30) ;
--   * une seule position par personne : la dernière (pas d'historique de trajet) ;
--   * Démarrer et Terminer notent l'heure et le lieu sur l'intervention (« pointages »),
--     effacés au bout de 2 mois ;
--   * seuls le dirigeant et les chefs de chantier voient les positions des autres.

-- ---------------------------------------------------------------------------
-- Réglages
-- ---------------------------------------------------------------------------

alter table public.membres
  add column partage_position boolean not null default false,
  -- date à laquelle le technicien a activé le partage (son accord, après information)
  add column partage_position_le timestamptz;

alter table public.entreprises
  add column geolocalisation jsonb not null default
    '{"jours": [1, 2, 3, 4, 5], "debut": "07:30", "fin": "18:30", "pause_debut": "12:00", "pause_fin": "13:30"}'::jsonb;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Dernière position connue de chaque membre (une ligne par membre, écrasée à chaque envoi).
create table public.positions (
  membre_id       uuid primary key references public.membres (id) on delete cascade,
  entreprise_id   uuid not null references public.entreprises (id) on delete cascade,
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  precision_m     real check (precision_m is null or precision_m >= 0),
  enregistree_le  timestamptz not null default now()
);
create index on public.positions (entreprise_id);

-- Arrivée (Démarrer) et départ (Terminer) d'un technicien sur une intervention.
create table public.pointages (
  id               uuid primary key default gen_random_uuid(),
  entreprise_id    uuid not null references public.entreprises (id) on delete cascade,
  intervention_id  uuid not null references public.interventions (id) on delete cascade,
  membre_id        uuid not null references public.membres (id) on delete cascade,
  genre            text not null check (genre in ('arrivee', 'depart')),
  latitude         double precision check (latitude between -90 and 90),
  longitude        double precision check (longitude between -180 and 180),
  precision_m      real check (precision_m is null or precision_m >= 0),
  le               timestamptz not null default now()
);
create index on public.pointages (intervention_id);
create index on public.pointages (entreprise_id, le);

alter table public.positions enable row level security;
alter table public.pointages enable row level security;

-- Lecture : le dirigeant et les chefs de chantier, ou la personne elle-même.
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
create policy lire on public.positions for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and (prive.peut_valider() or membre_id = prive.membre_id_courant()));
create policy lire on public.pointages for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and (prive.peut_valider() or membre_id = prive.membre_id_courant()));

grant select on public.positions, public.pointages to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------------

-- L'entreprise est-elle dans ses heures de travail (heure de Paris) ?
create function prive.en_heures_de_travail(p_entreprise uuid, p_le timestamptz default now())
returns boolean
language sql stable security definer set search_path = '' as $$
  with r as (
    select e.geolocalisation g, (p_le at time zone 'Europe/Paris') l
    from public.entreprises e where e.id = p_entreprise
  )
  select coalesce((
    select (g -> 'jours') @> to_jsonb(extract(isodow from l)::int)
       and l::time >= coalesce(g ->> 'debut', '07:30')::time
       and l::time <  coalesce(g ->> 'fin', '18:30')::time
       and not (g ? 'pause_debut' and g ? 'pause_fin'
                and l::time >= (g ->> 'pause_debut')::time
                and l::time <  (g ->> 'pause_fin')::time)
    from r
  ), false)
$$;

-- Le technicien active ou coupe le partage de sa position (écran Moi).
-- Couper efface aussitôt sa dernière position.
create function public.regler_partage_position(p_actif boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membre uuid := prive.membre_id_courant();
begin
  if v_membre is null then
    raise exception 'Compte non rattaché à une entreprise';
  end if;
  update public.membres
     set partage_position = p_actif,
         partage_position_le = case when p_actif then now() end
   where id = v_membre;
  if not p_actif then
    delete from public.positions where membre_id = v_membre;
  end if;
end $$;

-- Le téléphone envoie sa position (toutes les 2 minutes quand l'appli est ouverte).
-- Retourne false (et efface la position gardée) si le partage est coupé ou hors des heures de travail.
create function public.partager_position(p_latitude double precision, p_longitude double precision,
                                         p_precision real default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_membre public.membres := prive.membre_courant();
begin
  if v_membre.id is null then
    raise exception 'Compte non rattaché à une entreprise';
  end if;
  if not v_membre.partage_position or not prive.en_heures_de_travail(v_membre.entreprise_id) then
    delete from public.positions where membre_id = v_membre.id;
    return false;
  end if;
  insert into public.positions (membre_id, entreprise_id, latitude, longitude, precision_m, enregistree_le)
  values (v_membre.id, v_membre.entreprise_id, p_latitude, p_longitude, p_precision, now())
  on conflict (membre_id) do update set
    latitude = excluded.latitude, longitude = excluded.longitude,
    precision_m = excluded.precision_m, enregistree_le = excluded.enregistree_le;
  return true;
end $$;

-- Démarrer (arrivee) ou Terminer (depart) : note l'heure et, si le téléphone la donne, le lieu.
-- p_le : heure sur le téléphone (l'envoi peut partir plus tard, hors ligne).
-- Fait aussi le ménage des pointages de plus de 2 mois de l'entreprise.
create function public.pointer(p_intervention uuid, p_genre text,
                               p_latitude double precision default null, p_longitude double precision default null,
                               p_precision real default null, p_le timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_le timestamptz := least(coalesce(p_le, now()), now());
  v_entreprise uuid := prive.entreprise_courante();
begin
  if p_genre not in ('arrivee', 'depart') then
    raise exception 'Pointage inconnu';
  end if;
  if not prive.voit_intervention(p_intervention) then
    raise exception 'Intervention introuvable';
  end if;
  if not (prive.est_affecte(p_intervention) or prive.est_bureau()) then
    raise exception 'Vous n''êtes pas affecté à cette intervention';
  end if;
  if v_le < now() - interval '3 days' then
    v_le := now();
  end if;
  -- Un renvoi (réseau capricieux) ne crée pas de doublon.
  if exists (select 1 from public.pointages
              where intervention_id = p_intervention and membre_id = prive.membre_id_courant()
                and genre = p_genre and le = v_le) then
    return;
  end if;
  insert into public.pointages (entreprise_id, intervention_id, membre_id, genre, latitude, longitude, precision_m, le)
  values (v_entreprise, p_intervention, prive.membre_id_courant(), p_genre,
          case when p_longitude is not null then p_latitude end,
          case when p_latitude is not null then p_longitude end,
          p_precision, v_le);
  delete from public.pointages where entreprise_id = v_entreprise and le < now() - interval '2 months';
end $$;

revoke execute on function public.regler_partage_position(boolean) from public, anon;
revoke execute on function public.partager_position(double precision, double precision, real) from public, anon;
revoke execute on function public.pointer(uuid, text, double precision, double precision, real, timestamptz) from public, anon;
grant execute on function public.regler_partage_position(boolean) to authenticated;
grant execute on function public.partager_position(double precision, double precision, real) to authenticated;
grant execute on function public.pointer(uuid, text, double precision, double precision, real, timestamptz) to authenticated;
grant execute on function prive.en_heures_de_travail(uuid, timestamptz) to authenticated;
