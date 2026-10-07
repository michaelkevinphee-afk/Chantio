-- Assistance « lecture et modification » : l'équipier Chantio entre dans le bureau du
-- client seulement si le dirigeant l'a choisi, seulement pendant la session, sans
-- toucher aux dirigeants ni prolonger l'accès, et chaque modification est notée.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text, p_aal2 boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', (select id::text from auth.users where email = p_email),
           'aal', case when p_aal2 then 'aal2' else 'aal1' end)::text, false)
$$;
create function pg_temp.refuse(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or raise_exception then
  return true;
end $$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('paul@chantio.example'), ('hugo@chantio.example');
insert into prive.equipe_chantio (email, prenom, role) values
  ('paul@chantio.example', 'Paul', 'proprietaire'), ('hugo@chantio.example', 'Hugo', 'commercial');

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.rejoindre_entreprise() is not null as relie;
reset role;
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
select public.console_moi() ->> 'role';
reset role;

-- Accès en lecture seule : Paul ne peut pas entrer dans le bureau.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.autoriser_assistance(60, 'Regarder une facture') is not null;
reset role;
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
begin
  assert (select mode from public.console_assistances() limit 1) = 'lecture', 'mode lecture par défaut';
  assert pg_temp.refuse(format('select public.console_entrer_compte(%L)', v_verger)), 'lecture seule : pas d''entrée';
  assert prive.entreprise_courante() is null, 'aucune entreprise';
end $$;
reset role;

-- Christophe rouvre l'accès en lecture et modification.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.autoriser_assistance(60, 'Paramétrer le compte', 'modification') is not null;
do $$
begin
  assert pg_temp.refuse($q$select public.autoriser_assistance(60, null, 'tout')$q$), 'mode inconnu refusé';
end $$;
reset role;

-- Hugo (commercial) n'a pas le droit d'assistance.
select pg_temp.connecter('hugo@chantio.example', true);
set role authenticated;
select public.console_moi() ->> 'role';
do $$
begin
  assert pg_temp.refuse(format('select public.console_entrer_compte(%L)', (select id from public.console_entreprises() where nom = 'Verger'))),
    'le commercial n''entre pas';
end $$;
reset role;

select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
begin
  perform public.console_entrer_compte(v_verger);
  assert prive.entreprise_courante() = v_verger, 'Paul est dans le compte de Verger';
  assert prive.est_dirigeant(), 'avec les droits du dirigeant';
  assert (select count(*) from public.mes_entreprises()) = 1, 'Verger dans son sélecteur';
  assert (select count(*) from public.clients) > 0, 'il voit les clients';
  insert into public.clients (entreprise_id, nom) values (v_verger, 'Client ajouté par Chantio');
  insert into public.clients (entreprise_id, nom) values (v_verger, 'Deuxième client');
  update public.entreprises set telephone = '01 23 45 67 89' where id = v_verger;
  assert (select count(*) from public.acces_chantio where action = 'A ajouté : des clients') = 1, 'une ligne par sujet';
  assert exists (select 1 from public.acces_chantio where action = 'A modifié : la fiche de l''entreprise' and qui = 'Paul de Chantio'),
    'modification de l''entreprise notée';
  assert exists (select 1 from public.acces_chantio where action = 'Est entré dans le compte pour le paramétrer'), 'entrée notée';
  -- Garde-fous.
  assert pg_temp.refuse($q$select public.autoriser_assistance(1440, null, 'modification')$q$), 'ne prolonge pas l''accès lui-même';
  assert pg_temp.refuse($q$update public.membres set role = 'technicien' where email = 'christophe@verger.example'$q$),
    'ne touche pas au dirigeant';
  assert pg_temp.refuse($q$update public.membres set assistance_id = null where user_id = auth.uid()$q$),
    'ne se rend pas membre pour de bon';
  assert pg_temp.refuse($q$insert into public.membres (entreprise_id, email, prenom, role) values (prive.entreprise_courante(), 'x@x.example', 'X', 'dirigeant')$q$),
    'n''ajoute pas de dirigeant';
  assert not prive.est_dirigeant_de(v_verger), 'pas dirigeant titulaire';
  -- Un technicien, il peut l'inviter.
  insert into public.membres (entreprise_id, email, prenom, role) values (v_verger, 'nouveau@verger.example', 'Nouveau', 'technicien');
  assert exists (select 1 from public.acces_chantio where action = 'A ajouté : l''équipe'), 'invitation notée';
end $$;
reset role;

-- Sans double vérification, le lien ne vaut rien.
select pg_temp.connecter('paul@chantio.example', false);
set role authenticated;
do $$
begin
  assert prive.entreprise_courante() is null, 'sans double vérification : rien';
  assert (select count(*) from public.clients) = 0, 'aucun client lisible';
end $$;
reset role;

-- Christophe ne voit pas Paul dans son équipe et lit le journal.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  assert not exists (select 1 from public.membres where nom = 'de Chantio'), 'Paul absent de l''équipe';
  assert (select count(*) from public.membres where email = 'nouveau@verger.example') = 1, 'invitation visible';
  assert exists (select 1 from public.acces_chantio where action like 'A ouvert l''accès%(lecture et modification)'), 'mode noté';
  perform public.retirer_assistance((select id from public.assistances where statut = 'acceptee'));
end $$;
reset role;

-- Accès coupé : Paul n'a plus rien.
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
begin
  assert prive.entreprise_courante() is null, 'accès coupé : plus d''entreprise';
  assert (select count(*) from public.mes_entreprises()) = 0, 'plus rien dans le sélecteur';
  assert (select count(*) from public.clients) = 0, 'plus aucun client';
end $$;
reset role;

-- Demande de Chantio en modification, acceptée ; puis fin de la durée.
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
select public.console_demander_assistance((select id from public.console_entreprises() where nom = 'Verger'), 30, 'Régler le catalogue', 'modification') is not null;
reset role;
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.repondre_assistance((select id from public.assistances where statut = 'demandee'), true);
do $$
begin
  assert exists (select 1 from public.acces_chantio where action like 'A accepté la demande d''accès de Paul de Chantio (30 min, lecture et modification)%'),
    'acceptation notée avec le mode';
end $$;
reset role;
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
select public.console_entrer_compte((select id from public.console_entreprises() where nom = 'Verger')) is not null;
reset role;
-- La durée s'écoule (sans passer par une fonction : le lien reste « actif »).
alter table public.assistances disable trigger fermer_liens;
update public.assistances set debut = now() - interval '2 hours', fin = now() - interval '1 hour' where statut = 'acceptee';
alter table public.assistances enable trigger fermer_liens;
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
begin
  assert prive.entreprise_courante() is null, 'durée écoulée : plus d''accès';
  assert (select count(*) from public.clients) = 0, 'durée écoulée : plus de clients';
end $$;
select public.quitter_compte_client();
reset role;

do $$
begin
  assert not (select actif from public.membres where nom = 'de Chantio'), 'lien désactivé en quittant';
end $$;

\echo '  assistance en modification : OK'
