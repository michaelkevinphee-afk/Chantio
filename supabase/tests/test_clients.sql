-- Fiche client détaillée : SIREN/SIRET contrôlés, contacts gérés par le bureau
-- et invisibles d'une entreprise à l'autre.

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

-- Le dirigeant de Verger crée un syndic avec son SIREN et deux contacts.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare v_client uuid;
begin
  insert into public.clients (entreprise_id, nom, type, siren, siret, forme_juridique, tva_intracom)
  values (prive.entreprise_courante(), 'Cabinet Exemple', 'syndic', '552100554', '55210055400013', 'SAS', 'FR40552100554')
  returning id into v_client;
  insert into public.contacts_client (entreprise_id, client_id, nom, fonction, telephone)
  values (prive.entreprise_courante(), v_client, 'Claire Martin', 'Gestionnaire', '01 23 45 67 89'),
         (prive.entreprise_courante(), v_client, 'Gardien', null, null);
  assert (select count(*) from public.contacts_client where client_id = v_client) = 2, 'contacts enregistrés';
  begin
    insert into public.clients (entreprise_id, nom, siren) values (prive.entreprise_courante(), 'Faux', '12345');
    raise exception 'ÉCHEC : SIREN invalide accepté';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Le technicien lit les contacts mais ne peut pas en ajouter.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contacts_client) = 2, 'le technicien voit les contacts';
  begin
    insert into public.contacts_client (entreprise_id, client_id, nom)
    select prive.entreprise_courante(), id, 'Intrus' from public.clients limit 1;
    raise exception 'ÉCHEC : contact ajouté par un technicien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Le concurrent ne voit rien et ne peut pas rattacher un contact au client de Verger.
select set_config('test.client', (select id::text from public.clients where nom = 'Cabinet Exemple'), false) is not null;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contacts_client) = 0, 'contacts cloisonnés';
  begin
    insert into public.contacts_client (entreprise_id, client_id, nom)
    values (prive.entreprise_courante(),
            current_setting('test.client')::uuid, 'Intrus');
    raise exception 'ÉCHEC : contact rattaché au client d''une autre entreprise';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'clients : ok';
