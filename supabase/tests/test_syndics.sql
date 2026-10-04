-- Syndics : immeubles, occupants et ordres de service ; numéros d'intervention
-- par type (DEP, CH, ENT) qui ne changent plus et ne sont jamais réutilisés.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('patron@concurrent.example');

-- Les interventions de démonstration ont chacune leur numéro par type.
do $$
declare v_an text := to_char(now() at time zone 'Europe/Paris', 'YYYY');
begin
  assert (select reference from public.interventions where motif = 'Entretien chaudière') = 'ENT-' || v_an || '-0001', 'entretien numéroté ENT';
  assert (select reference from public.interventions where motif = 'Fuite sous évier') = 'DEP-' || v_an || '-0001', 'dépannage numéroté DEP';
  assert (select reference from public.interventions where motif = 'Panne chaudière') = 'DEP-' || v_an || '-0002', 'le compteur DEP avance';
end $$;

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
reset role;

-- Le dirigeant de Verger crée un syndic, un immeuble, ses occupants, puis une
-- intervention chez un occupant avec l'ordre de service du syndic.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_an text := to_char(now() at time zone 'Europe/Paris', 'YYYY');
  v_syndic uuid;
  v_imm uuid;
  v_autre uuid;
  v_occ uuid;
  v_occ_autre uuid;
  v_inter uuid;
  v_ref text;
begin
  insert into public.clients (entreprise_id, nom, type, facturation)
  values (prive.entreprise_courante(), 'Cabinet Dupré', 'syndic', 'mensuel') returning id into v_syndic;
  insert into public.sites (entreprise_id, client_id, adresse, code_postal, ville, acces, gardien, copropriete)
  values (prive.entreprise_courante(), v_syndic, '12 rue de la Pompe', '75016', 'Paris', 'Code 4521B', 'Mme Diaz', 'Syndicat du 12 rue de la Pompe')
  returning id into v_imm;
  insert into public.sites (entreprise_id, client_id, adresse) values (prive.entreprise_courante(), v_syndic, '48 avenue Mozart')
  returning id into v_autre;
  insert into public.occupants (entreprise_id, site_id, nom, lot, telephone)
  values (prive.entreprise_courante(), v_imm, 'Mme Martin', '3e gauche', '06 12 34 56 78') returning id into v_occ;
  insert into public.occupants (entreprise_id, site_id, nom, lot)
  values (prive.entreprise_courante(), v_autre, 'Mme Royer', '2e face') returning id into v_occ_autre;

  insert into public.interventions (entreprise_id, client_id, site_id, occupant_id, ordre_service, type, motif)
  values (prive.entreprise_courante(), v_syndic, v_imm, v_occ, 'OS 55702', 'depannage', 'Fuite sous évier')
  returning id, reference into v_inter, v_ref;
  assert v_ref = 'DEP-' || v_an || '-0003', 'nouveau dépannage : DEP-…-0003, reçu ' || v_ref;

  insert into public.interventions (entreprise_id, client_id, site_id, type, motif)
  values (prive.entreprise_courante(), v_syndic, v_imm, 'installation', 'Remplacement de colonne')
  returning reference into v_ref;
  assert v_ref = 'CH-' || v_an || '-0001', 'une installation compte comme un chantier, reçu ' || v_ref;

  -- Le numéro ne se change pas à la main.
  update public.interventions set reference = 'DEP-1999-0001', motif = 'Fuite sous évier (cuisine)' where id = v_inter;
  assert (select reference from public.interventions where id = v_inter) = 'DEP-' || v_an || '-0003', 'numéro figé';

  -- L'occupant doit habiter à l'adresse de l'intervention.
  begin
    update public.interventions set occupant_id = v_occ_autre where id = v_inter;
    raise exception 'ÉCHEC : occupant d''un autre immeuble accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  -- Un numéro supprimé n'est jamais redonné.
  delete from public.interventions where id = v_inter;
  insert into public.interventions (entreprise_id, client_id, site_id, type, motif)
  values (prive.entreprise_courante(), v_syndic, v_imm, 'sav', 'Robinet qui goutte')
  returning reference into v_ref;
  assert v_ref = 'DEP-' || v_an || '-0004', 'pas de réutilisation après suppression, reçu ' || v_ref;

  begin
    insert into public.clients (entreprise_id, nom, facturation) values (prive.entreprise_courante(), 'Faux', 'trimestriel');
    raise exception 'ÉCHEC : facturation inconnue acceptée';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Le technicien voit les occupants (pour appeler avant de monter) mais ne les modifie pas.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.occupants) = 2, 'le technicien voit les occupants';
  begin
    insert into public.occupants (entreprise_id, site_id, nom)
    select prive.entreprise_courante(), id, 'Intrus' from public.sites limit 1;
    raise exception 'ÉCHEC : occupant ajouté par un technicien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Le concurrent ne voit rien et ne peut pas rattacher un occupant à un immeuble de Verger.
select set_config('test.immeuble', (select id::text from public.sites where adresse = '12 rue de la Pompe'), false) is not null;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.occupants) = 0, 'occupants cloisonnés';
  begin
    insert into public.occupants (entreprise_id, site_id, nom)
    values (prive.entreprise_courante(), current_setting('test.immeuble')::uuid, 'Intrus');
    raise exception 'ÉCHEC : occupant rattaché à l''immeuble d''une autre entreprise';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Les compteurs ne sont lisibles par personne en direct.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$ begin
  begin
    perform count(*) from prive.compteurs;
    raise exception 'ÉCHEC : compteurs lisibles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ok';
