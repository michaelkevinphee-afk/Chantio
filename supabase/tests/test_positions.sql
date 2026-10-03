-- Équipe en direct : partage de position choisi par le technicien, limité aux heures
-- de travail, visible du dirigeant seulement ; pointages Démarrer / Terminer.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('patron@concurrent.example');

-- Heures de travail (heure de Paris) : lundi–vendredi 7:30–18:30, hors 12:00–13:30.
do $$
declare e uuid := (select id from public.entreprises where nom = 'Verger');
begin
  assert prive.en_heures_de_travail(e, '2026-10-02 10:40 Europe/Paris'), 'vendredi 10:40 : oui';
  assert not prive.en_heures_de_travail(e, '2026-10-02 12:30 Europe/Paris'), 'pause déjeuner : non';
  assert not prive.en_heures_de_travail(e, '2026-10-02 19:00 Europe/Paris'), 'le soir : non';
  assert not prive.en_heures_de_travail(e, '2026-10-02 07:00 Europe/Paris'), 'avant 7:30 : non';
  assert not prive.en_heures_de_travail(e, '2026-10-03 10:00 Europe/Paris'), 'samedi : non';
  -- Pour la suite du test, toute heure compte comme heure de travail.
  update public.entreprises set geolocalisation = '{"jours": [1,2,3,4,5,6,7], "debut": "00:00", "fin": "24:00"}' where id = e;
end $$;

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
reset role;

-- Le technicien : rien n'est gardé tant qu'il n'a pas activé le partage.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
declare
  i uuid := (select a.intervention_id from public.affectations a where a.membre_id = prive.membre_id_courant() limit 1);
begin
  assert not public.partager_position(48.8405, 2.2410, 12), 'partage coupé par défaut';
  assert (select count(*) from public.positions) = 0, 'aucune position sans accord';

  perform public.regler_partage_position(true);
  assert (select partage_position_le is not null from public.membres where id = prive.membre_id_courant()), 'accord daté';
  assert public.partager_position(48.8405, 2.2410, 12), 'position acceptée';
  assert public.partager_position(48.8410, 2.2420, 8), 'position mise à jour';
  assert (select count(*) from public.positions) = 1, 'une seule position gardée';
  assert (select latitude from public.positions) = 48.8410, 'la dernière';

  -- Pas d'écriture directe.
  begin
    insert into public.positions (membre_id, entreprise_id, latitude, longitude)
    values (prive.membre_id_courant(), prive.entreprise_courante(), 0, 0);
    raise exception 'ÉCHEC : position écrite sans passer par la fonction';
  exception when insufficient_privilege then null;
  end;

  -- Pointages : arrivée puis départ, un renvoi ne fait pas de doublon.
  perform public.pointer(i, 'arrivee', 48.8405, 2.2410, 10, '2026-10-02 10:22+02');
  perform public.pointer(i, 'arrivee', 48.8405, 2.2410, 10, '2026-10-02 10:22+02');
  perform public.pointer(i, 'depart', null, null, null, null);
  assert (select count(*) from public.pointages) = 2, 'arrivée et départ notés une fois';
  begin
    perform public.pointer(i, 'pause', null, null, null, null);
    raise exception 'ÉCHEC : pointage inconnu accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- Le technicien ne voit pas la position d'un collègue (il ne voit que la sienne).
  assert (select count(*) from public.positions where membre_id <> prive.membre_id_courant()) = 0, 'pas de collègues';
end $$;
reset role;

-- Le dirigeant voit la position et les pointages ; le concurrent ne voit rien.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.positions) = 1, 'dirigeant : voit la position';
  assert (select count(*) from public.pointages) = 2, 'dirigeant : voit les pointages';
end $$;
reset role;

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.positions) = 0, 'concurrent : aucune position';
  assert (select count(*) from public.pointages) = 0, 'concurrent : aucun pointage';
  begin
    perform public.pointer((select id from public.interventions limit 1), 'arrivee');
    raise exception 'ÉCHEC : pointage chez une autre entreprise';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Couper le partage efface la position aussitôt ; hors heures, plus rien n'est gardé.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  perform public.regler_partage_position(false);
  assert (select count(*) from public.positions) = 0, 'position effacée en coupant';
  perform public.regler_partage_position(true);
  assert public.partager_position(48.84, 2.24), 'de nouveau partagée';
end $$;
reset role;
update public.entreprises set geolocalisation = '{"jours": [], "debut": "07:30", "fin": "18:30"}' where nom = 'Verger';
set role authenticated;
do $$ begin
  assert not public.partager_position(48.84, 2.24), 'hors heures : refusée';
  assert (select count(*) from public.positions) = 0, 'hors heures : position effacée';
end $$;
reset role;

-- Les pointages de plus de 2 mois sont effacés au pointage suivant.
update public.pointages set le = now() - interval '3 months';
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.pointer((select id from public.interventions where statut <> 'validee' limit 1), 'arrivee');
do $$ begin
  assert (select count(*) from public.pointages) = 1, 'anciens pointages effacés';
end $$;
reset role;

select 'ok' as positions;
