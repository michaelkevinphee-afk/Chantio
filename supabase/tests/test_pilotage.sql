-- Pilotage de l'année : budget et production importée réservés au dirigeant
-- de l'entreprise active ; un budget par année, un montant par mois et par famille.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('chef@verger.example'), ('patron@concurrent.example');
insert into public.membres (entreprise_id, email, prenom, role)
select id, 'chef@verger.example', 'Chef', 'chef_chantier' from public.entreprises where nom = 'Verger';

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
reset role;

-- Le dirigeant enregistre son budget et ses mois.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
begin
  insert into public.budgets (entreprise_id, annee, objectif_depannage, objectif_chantier, achats_pc, sous_traitance, salaires, charges_pc, frais)
  values (v_ent, 2026, 120000, 300000, 15, 50000, 80000, 50, '[{"libelle": "Assurances", "montant": 5000}]');
  insert into public.production_importee (entreprise_id, mois, famille, montant_ht, source) values
    (v_ent, '2026-01-01', 'depannage', 10000, 'excel'),
    (v_ent, '2026-01-01', 'chantier', 25000, 'excel'),
    (v_ent, '2025-01-01', 'total', 30000, 'excel');
  -- Un import repasse sur le même mois : la ligne est remplacée.
  insert into public.production_importee (entreprise_id, mois, famille, montant_ht, source) values (v_ent, '2026-01-01', 'depannage', 11000, 'excel')
  on conflict (entreprise_id, mois, famille) do update set montant_ht = excluded.montant_ht;
  assert (select montant_ht from public.production_importee where mois = '2026-01-01' and famille = 'depannage') = 11000, 'import remplacé';
  assert (select coef_depannage = 2 and coef_chantier = 1.6 and impot_pc = 25 from public.budgets), 'valeurs par défaut';

  begin
    insert into public.budgets (entreprise_id, annee) values (v_ent, 2026);
    raise exception 'ÉCHEC : deux budgets la même année';
  exception when unique_violation then null;
  end;
  begin
    insert into public.production_importee (entreprise_id, mois, famille, montant_ht) values (v_ent, '2026-02-15', 'chantier', 1);
    raise exception 'ÉCHEC : mois qui ne commence pas le 1er';
  exception when check_violation then null;
  end;
  begin
    insert into public.production_importee (entreprise_id, mois, famille, montant_ht) values (v_ent, '2026-02-01', 'entretien', 1);
    raise exception 'ÉCHEC : famille inconnue';
  exception when check_violation then null;
  end;
  begin
    update public.budgets set frais = '{}'::jsonb;
    raise exception 'ÉCHEC : frais qui ne sont pas une liste';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Chef de chantier et technicien : ni lecture ni écriture.
select pg_temp.connecter('chef@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.budgets) = 0, 'le chef ne voit pas le budget';
  assert (select count(*) from public.production_importee) = 0, 'le chef ne voit pas la production importée';
  begin
    insert into public.budgets (entreprise_id, annee) values (prive.entreprise_courante(), 2027);
    raise exception 'ÉCHEC : budget créé par le chef';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.budgets) = 0, 'le technicien ne voit pas le budget';
  update public.production_importee set montant_ht = 0;
  assert not found, 'le technicien ne modifie rien';
end $$;
reset role;

-- Une autre entreprise : rien de Verger, et rien chez Verger.
select set_config('test.verger', (select id::text from public.entreprises where nom = 'Verger'), false);
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.budgets) = 0, 'budget de Verger invisible';
  assert (select count(*) from public.production_importee) = 0, 'production de Verger invisible';
  begin
    insert into public.production_importee (entreprise_id, mois, famille, montant_ht)
    values (current_setting('test.verger')::uuid, '2026-03-01', 'chantier', 1);
    raise exception 'ÉCHEC : écriture chez Verger';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'pilotage : ok';
