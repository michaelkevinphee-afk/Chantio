-- Contrats d'entretien : numéro CT par année, dates cohérentes, adresse du
-- client, visites rattachées au contrat ; les contrats restent au bureau.

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

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
  v_an text := to_char(now() at time zone 'Europe/Paris', 'YYYY');
  v_erables uuid := (select id from public.clients where nom = 'Exemple · SCI Les Érables');
  v_laurent uuid := (select id from public.clients where nom = 'Exemple · Mme Laurent');
  v_site uuid;
  v_site_laurent uuid := (select id from public.sites where client_id = v_laurent limit 1);
  v_ct uuid;
  v_ct2 uuid;
  v_visite uuid;
begin
  insert into public.sites (entreprise_id, client_id, adresse, ville) values (v_ent, v_erables, '8 rue des Érables', 'Paris') returning id into v_site;
  insert into public.contrats (entreprise_id, client_id, site_id, objet, debut, fin, montant_ht, visites_par_an)
  values (v_ent, v_erables, v_site, 'Entretien chaufferie collective', '2026-01-01', '2026-12-31', 2400, 4) returning id into v_ct;
  insert into public.contrats (entreprise_id, client_id, objet, debut, fin)
  values (v_ent, v_laurent, 'Entretien chaudière', '2026-03-01', '2027-02-28') returning id into v_ct2;
  assert (select reference from public.contrats where id = v_ct) = 'CT-' || v_an || '-0001', 'premier contrat CT-0001';
  assert (select reference from public.contrats where id = v_ct2) = 'CT-' || v_an || '-0002', 'le compteur CT avance';
  assert (select preavis_mois = 3 and tacite and visites_par_an = 1 from public.contrats where id = v_ct2), 'valeurs par défaut';

  update public.contrats set reference = 'CT-1999-0001' where id = v_ct;
  assert (select reference from public.contrats where id = v_ct) = 'CT-' || v_an || '-0001', 'le numéro ne change plus';

  begin
    update public.contrats set fin = '2025-12-31' where id = v_ct;
    raise exception 'ÉCHEC : fin avant le début acceptée';
  exception when check_violation then null;
  end;
  begin
    update public.contrats set site_id = v_site_laurent where id = v_ct;
    raise exception 'ÉCHEC : adresse d''un autre client acceptée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  -- Une visite créée depuis le contrat, à placer au planning.
  insert into public.interventions (entreprise_id, client_id, site_id, type, motif, contrat_id, souhaitee_le)
  values (v_ent, v_erables, v_site, 'entretien', 'Visite 1/4 · Entretien chaufferie collective', v_ct, '2026-10-15') returning id into v_visite;
  assert (select statut = 'a_planifier' and souhaitee_le = '2026-10-15' from public.interventions where id = v_visite), 'visite à planifier';

  -- Équipements suivis à l'adresse.
  insert into public.equipements (entreprise_id, site_id, categorie, marque, dernier_passage, prochain_passage, obligation)
  values (v_ent, v_site, 'Chaudière à condensation 120 kW', 'Viessmann', '2026-01-10', '2027-01-10', 'Entretien annuel obligatoire');
  assert (select count(*) from public.equipements where site_id = v_site and obligation is not null) = 1, 'équipement suivi';
end $$;
reset role;

-- Le technicien ne voit pas les contrats.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.contrats) = 0, 'le technicien ne voit pas les contrats';
end $$;
reset role;

-- Une autre entreprise ne voit pas les contrats et ne peut pas s'y rattacher.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
  v_client uuid;
begin
  assert (select count(*) from public.contrats) = 0, 'contrats invisibles d''une autre entreprise';
  insert into public.clients (entreprise_id, nom) values (v_ent, 'Client concurrent') returning id into v_client;
end $$;
reset role;

-- Même en connaissant l'identifiant d'un contrat de Verger, on ne s'y rattache pas.
do $$
declare
  v_ent uuid := (select id from public.entreprises where nom = 'Plomberie Concurrente');
  v_client uuid := (select id from public.clients where nom = 'Client concurrent');
  v_ct uuid := (select id from public.contrats order by reference limit 1);
begin
  begin
    insert into public.interventions (entreprise_id, client_id, motif, contrat_id) values (v_ent, v_client, 'Visite', v_ct);
    raise exception 'ÉCHEC : contrat d''une autre entreprise accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

select 'Contrats d''entretien : OK';
