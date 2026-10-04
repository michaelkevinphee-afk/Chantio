-- Planning des chantiers : un chantier va du jour prévu au dernier jour (jamais
-- avant), la durée prévue reste raisonnable ; les heures par semaine et la
-- réserve d'urgences d'un membre ne se règlent que par le dirigeant.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values ('christophe@verger.example'), ('technicien@verger.example');

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
  v_client uuid := (select id from public.clients where nom = 'Exemple · M. Benali');
  v_ch uuid;
  v_tech uuid := (select id from public.membres where email = 'technicien@verger.example');
begin
  insert into public.interventions (entreprise_id, client_id, type, motif, date_prevue, heure_prevue, date_fin, fin_midi)
  values (v_ent, v_client, 'chantier', 'Rénovation salle de bain', '2026-10-08', '08:00', '2026-10-13', true) returning id into v_ch;
  assert (select date_fin = '2026-10-13' and fin_midi and duree_prevue is null from public.interventions where id = v_ch), 'chantier sur plusieurs jours gardé';

  -- Planifié avec un technicien : le statut suit, comme pour une intervention d'un jour.
  insert into public.affectations (intervention_id, membre_id, entreprise_id) values (v_ch, v_tech, v_ent);
  assert (select statut from public.interventions where id = v_ch) = 'planifiee', 'chantier planifié';

  begin
    update public.interventions set date_fin = '2026-10-01' where id = v_ch;
    raise exception 'ÉCHEC : dernier jour avant le premier accepté';
  exception when check_violation then null;
  end;
  begin
    update public.interventions set date_prevue = null where id = v_ch;
    raise exception 'ÉCHEC : dernier jour sans premier jour accepté';
  exception when check_violation then null;
  end;
  begin
    update public.interventions set duree_prevue = 30 where id = v_ch;
    raise exception 'ÉCHEC : durée de 30 h accepté';
  exception when check_violation then null;
  end;
  update public.interventions set date_fin = null, fin_midi = false, duree_prevue = 2.5 where id = v_ch;
  assert (select duree_prevue from public.interventions where id = v_ch) = 2.5, 'durée prévue gardée';

  -- Disponibilités : par défaut 35 h et aucune réserve ; le dirigeant les règle.
  assert (select heures_semaine = 35 and reserve_urgences = '{}' from public.membres where id = v_tech), 'valeurs par défaut';
  update public.membres set heures_semaine = 39, reserve_urgences = '{7,8}' where id = v_tech;
  assert (select heures_semaine = 39 and reserve_urgences = '{7,8}' from public.membres where id = v_tech), 'disponibilités réglées';
  begin
    update public.membres set reserve_urgences = '{14}' where id = v_tech;
    raise exception 'ÉCHEC : demi-journée 14 acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.membres set heures_semaine = 100 where id = v_tech;
    raise exception 'ÉCHEC : 100 h par semaine acceptées';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Le technicien ne change pas ses disponibilités lui-même.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  update public.membres set heures_semaine = 10, reserve_urgences = '{}' where email = 'technicien@verger.example';
  assert (select heures_semaine from public.membres where email = 'technicien@verger.example') = 39, 'le technicien ne règle pas ses heures';
end $$;
reset role;

select 'Planning des chantiers : OK';
