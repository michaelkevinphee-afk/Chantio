-- Photos de profil et logo : chacun sa photo, le logo au dirigeant,
-- et rien de visible d'une entreprise à l'autre.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('patron@concurrent.example');

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
reset role;

-- Le technicien dépose et enregistre sa photo.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
declare v_chemin text := prive.entreprise_courante() || '/membres/' || prive.membre_id_courant() || '/a.jpg';
begin
  insert into storage.objects (bucket_id, name) values ('profils', v_chemin);
  perform public.definir_photo(v_chemin);
  assert (select photo_chemin from public.membres where id = prive.membre_id_courant()) = v_chemin, 'photo enregistrée';
  -- Pas dans le dossier d'un collègue.
  begin
    insert into storage.objects (bucket_id, name)
    values ('profils', prive.entreprise_courante() || '/membres/' || gen_random_uuid() || '/b.jpg');
    raise exception 'ÉCHEC : photo déposée pour un collègue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.definir_photo(prive.entreprise_courante() || '/membres/' || gen_random_uuid() || '/b.jpg');
    raise exception 'ÉCHEC : photo d''un collègue enregistrée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  -- Ni le logo.
  begin
    insert into storage.objects (bucket_id, name) values ('profils', prive.entreprise_courante() || '/logo/l.png');
    raise exception 'ÉCHEC : logo déposé par un technicien';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.definir_logo(prive.entreprise_courante() || '/logo/l.png');
    raise exception 'ÉCHEC : logo enregistré par un technicien';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Le dirigeant dépose le logo et voit la photo du technicien.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare v_logo text := prive.entreprise_courante() || '/logo/l.png';
begin
  insert into storage.objects (bucket_id, name) values ('profils', v_logo);
  perform public.definir_logo(v_logo);
  assert (select logo_chemin from public.entreprises) = v_logo, 'logo enregistré';
  assert (select count(*) from storage.objects where bucket_id = 'profils') = 2, 'Verger voit photo et logo';
end $$;
reset role;

-- Le concurrent ne voit rien et ne peut rien déposer chez Verger.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'profils') = 0, 'concurrent : aucune photo de Verger';
  begin
    insert into storage.objects (bucket_id, name)
    values ('profils', (select id from public.entreprises where nom = 'Verger')::text || '/logo/x.png');
    raise exception 'ÉCHEC : logo déposé chez une autre entreprise';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ok' as photos;
