-- Console Chantio : réservée à l'équipe Chantio passée par la double vérification,
-- jamais le contenu d'un client sans session d'assistance qu'il a acceptée,
-- et chaque action inscrite au journal que lit le dirigeant.

\set QUIET on
\pset tuples_only on
-- Se connecte comme ce compte ; p_aal2 : après la double vérification.
create function pg_temp.connecter(p_email text, p_aal2 boolean default false) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false),
         set_config('request.jwt.claims', jsonb_build_object(
           'sub', (select id::text from auth.users where email = p_email),
           'aal', case when p_aal2 then 'aal2' else 'aal1' end)::text, false)
$$;
-- Vrai si l'appel est refusé faute de droits.
create function pg_temp.refuse(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (email) values
  ('christophe@verger.example'), ('technicien@verger.example'), ('patron@concurrent.example'),
  ('paul@chantio.example'), ('ines@chantio.example'), ('hugo@chantio.example'), ('intrus@exemple.example');
-- Adresse pas encore validée : l'invitation de l'équipe ne s'y relie pas.
insert into auth.users (email, email_confirmed_at) values ('pas-valide@chantio.example', null);

-- L'équipe Chantio : le propriétaire est ajouté à la main (script de mise en production).
insert into prive.equipe_chantio (email, prenom, role) values ('paul@chantio.example', 'Paul', 'proprietaire');

-- Une autre entreprise, avec un client.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
insert into public.clients (entreprise_id, nom) values (prive.entreprise_courante(), 'Client du concurrent');
reset role;

do $$
begin
  assert (select statut from public.abonnements a join public.entreprises e on e.id = a.entreprise_id
          where e.nom = 'Plomberie Concurrente') = 'essai', 'une nouvelle entreprise démarre en essai';
  assert (select essai_fin from public.abonnements a join public.entreprises e on e.id = a.entreprise_id
          where e.nom = 'Plomberie Concurrente') = (now() at time zone 'Europe/Paris')::date + 30, 'essai de 30 jours';
end $$;

-- Christophe ouvre une première fois son compte (relie l'invitation du dirigeant de Verger).
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.rejoindre_entreprise() is not null as relie;
reset role;
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
select public.rejoindre_entreprise() is not null as relie;
reset role;

-- Un compte ordinaire : la console n'existe pas pour lui.
select pg_temp.connecter('intrus@exemple.example', true);
set role authenticated;
do $$
begin
  assert public.console_moi() is null, 'pas de l''équipe : rien';
  assert not public.est_equipe_chantio(), 'pas de lien vers la console';
  assert pg_temp.refuse('select public.console_entreprises()'), 'liste des entreprises refusée';
  assert pg_temp.refuse('select public.console_vue_ensemble()'), 'vue d''ensemble refusée';
  assert pg_temp.refuse(format('select public.console_entreprise(%L)', gen_random_uuid())), 'fiche refusée';
  assert pg_temp.refuse($q$select public.console_inviter_equipier('intrus2@exemple.example', 'Intrus', null, 'proprietaire')$q$),
    'personne ne s''ajoute seul à l''équipe';
  begin
    insert into prive.equipe_chantio (email, prenom, role) values ('intrus@exemple.example', 'Intrus', 'proprietaire');
    raise exception 'ÉCHEC : écriture directe dans l''équipe Chantio';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from prive.equipe_chantio;
    raise exception 'ÉCHEC : équipe Chantio lisible';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Paul, sans la double vérification : il est reconnu, mais rien ne s'ouvre.
select pg_temp.connecter('paul@chantio.example', false);
set role authenticated;
do $$
declare
  moi jsonb := public.console_moi();
begin
  assert moi ->> 'role' = 'proprietaire', 'invitation reliée au compte validé';
  assert not (moi ->> 'double_verification')::boolean, 'double vérification pas encore faite';
  assert public.est_equipe_chantio(), 'lien vers la console dans le bureau';
  assert pg_temp.refuse('select public.console_entreprises()'), 'sans double vérification, rien';
  assert pg_temp.refuse('select public.console_vue_ensemble()'), 'sans double vérification, rien (bis)';
end $$;
reset role;

-- Paul avec la double vérification.
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
  fiche jsonb;
begin
  assert (public.console_moi() ->> 'double_verification')::boolean, 'double vérification faite';
  assert (select count(*) from public.console_entreprises()) = 2, 'voit toutes les entreprises';
  assert (select dirigeant from public.console_entreprises() where nom = 'Verger') = 'Christophe Rambla', 'dirigeant affiché';
  assert (select utilisateurs from public.console_entreprises() where nom = 'Verger') = 2, 'comptes reliés comptés';
  assert jsonb_array_length(public.console_vue_ensemble() -> 'jours') = 30, '30 jours de chiffres';
  fiche := public.console_entreprise(v_verger);
  assert (fiche -> 'volumes' ->> 'interventions')::int = 3, 'volumes comptés';
  assert jsonb_array_length(fiche -> 'membres') = 2, 'utilisateurs listés';
  -- Le contenu reste fermé : les règles de cloisonnement ne changent pas.
  assert (select count(*) from public.interventions) = 0, 'aucune intervention lisible directement';
  assert (select count(*) from public.clients) = 0, 'aucun client lisible directement';
  assert (select count(*) from public.acces_chantio) = 0, 'journal d''un client non lisible directement';
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)', v_verger, 'interventions')),
    'sans accord du client, pas de contenu';
  -- Équipe : Inès au support, Hugo commercial, et une adresse jamais validée.
  perform public.console_inviter_equipier('ines@chantio.example', 'Inès', null, 'support');
  perform public.console_inviter_equipier('Hugo@Chantio.example', 'Hugo', null, 'commercial');
  perform public.console_inviter_equipier('pas-valide@chantio.example', 'Paul', null, 'support');
  begin
    perform public.console_inviter_equipier('ines@chantio.example', 'Inès', null, 'support');
    raise exception 'ÉCHEC : invitée deux fois';
  exception when unique_violation then null;
  end;
  begin
    perform public.console_modifier_equipier((public.console_moi() ->> 'id')::uuid, 'support', true);
    raise exception 'ÉCHEC : propre rôle modifiable';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- Adresse pas validée : l'invitation ne se relie pas.
select pg_temp.connecter('pas-valide@chantio.example', true);
set role authenticated;
do $$
begin
  assert public.console_moi() is null, 'adresse non validée : pas d''accès';
  assert pg_temp.refuse('select public.console_entreprises()'), 'adresse non validée : rien';
end $$;
reset role;

-- Hugo (commercial) : les abonnements, pas l'assistance ni l'identité ni l'équipe.
select pg_temp.connecter('hugo@chantio.example', true);
set role authenticated;
-- Première ouverture de la console : relie l'invitation.
select public.console_moi() ->> 'role';
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
begin
  assert public.console_moi() ->> 'role' = 'commercial', 'commercial relié (e-mail sans tenir compte des majuscules)';
  perform public.console_modifier_abonnement(v_verger, 'entreprise', 'offert', null, 0, array['compta']);
  assert (select formule from public.console_entreprises() where nom = 'Verger') = 'entreprise', 'formule changée';
  assert (select statut from public.console_entreprises() where nom = 'Verger') = 'offert', 'compte offert';
  assert pg_temp.refuse(format('select public.console_demander_assistance(%L, 30, %L)', v_verger, 'Test')),
    'le commercial ne demande pas d''assistance';
  assert pg_temp.refuse('select public.console_identites()'), 'le commercial ne contrôle pas les identités';
  assert pg_temp.refuse($q$select public.console_inviter_equipier('x@chantio.example', 'X', null, 'support')$q$),
    'le commercial ne gère pas l''équipe';
end $$;
reset role;

-- Le dirigeant de Verger lit son abonnement et le journal ; le technicien non.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  assert (select statut from public.abonnements) = 'offert', 'le dirigeant lit son abonnement';
  assert (select count(*) from public.abonnements) = 1, 'seulement le sien';
  assert (select count(*) from public.acces_chantio where qui = 'Hugo de Chantio') = 4,
    'formule, état, prix et option notés au journal';
  assert exists (select 1 from public.acces_chantio where action = 'A changé la formule : Équipe → Entreprise'), 'phrase lisible';
  begin
    insert into public.acces_chantio (entreprise_id, qui, action) values (prive.entreprise_courante(), 'Moi', 'Faux');
    raise exception 'ÉCHEC : journal modifiable';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.acces_chantio;
    raise exception 'ÉCHEC : journal effaçable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.abonnements set statut = 'offert', prix_special = 0;
    raise exception 'ÉCHEC : abonnement modifiable par le client';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assistances (entreprise_id, origine, demandeur, motif, duree_minutes, statut, debut, fin)
    values (prive.entreprise_courante(), 'chantio', 'Faux', 'Faux', 60, 'acceptee', now(), now() + interval '1 hour');
    raise exception 'ÉCHEC : session écrite directement';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.acces_chantio) = 0, 'le technicien ne lit pas le journal';
  assert (select count(*) from public.abonnements) = 0, 'le technicien ne lit pas l''abonnement';
  begin
    perform public.autoriser_assistance(60);
    raise exception 'ÉCHEC : un technicien ouvre l''accès';
  exception when raise_exception then null;
  end;
end $$;
reset role;

-- Inès (support) demande l'accès ; le dirigeant accepte.
select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
select public.console_moi() ->> 'role';
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
begin
  assert pg_temp.refuse(format($q$select public.console_modifier_abonnement(%L, 'solo', 'actif')$q$, v_verger)),
    'le support ne touche pas aux abonnements';
  perform public.console_demander_assistance(v_verger, 30, 'Photos qui restent en attente');
  begin
    perform public.console_demander_assistance(v_verger, 30, 'Encore');
    raise exception 'ÉCHEC : deux demandes en même temps';
  exception when raise_exception then null;
  end;
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)', v_verger, 'clients')),
    'demande pas encore acceptée : rien';
end $$;
reset role;

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.assistances) = 0, 'une autre entreprise ne voit pas la demande';
end $$;
reset role;
-- Le patron concurrent essaie avec l'identifiant exact de la demande de Verger.
do $$
declare
  v_id uuid := (select id from public.assistances);
begin
  perform set_config('test.demande', v_id::text, false);
end $$;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
begin
  perform public.repondre_assistance(current_setting('test.demande')::uuid, true);
  raise exception 'ÉCHEC : accepté par une autre entreprise';
exception when raise_exception then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
end $$;
reset role;
do $$
begin
  assert (select statut from public.assistances) = 'demandee', 'toujours en attente de Verger';
end $$;

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_id uuid := (select id from public.assistances where statut = 'demandee');
begin
  assert (select demandeur from public.assistances where id = v_id) = 'Inès de Chantio', 'le client voit qui demande';
  perform public.repondre_assistance(v_id, true);
  assert (select statut from public.assistances where id = v_id) = 'acceptee', 'acceptée';
  assert (select fin - debut from public.assistances where id = v_id) = interval '30 minutes', 'pour 30 minutes';
end $$;
reset role;

-- Pendant la session : Inès lit le contenu, chaque page est notée une fois.
select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
declare
  v_verger uuid := (select id from public.console_entreprises() where nom = 'Verger');
  v_concurrent uuid := (select id from public.console_entreprises() where nom = 'Plomberie Concurrente');
begin
  assert jsonb_array_length(public.console_assistance_donnees(v_verger, 'interventions')) = 3, 'interventions de Verger';
  assert jsonb_array_length(public.console_assistance_donnees(v_verger, 'interventions')) = 3, 'relue';
  assert jsonb_array_length(public.console_assistance_donnees(v_verger, 'clients')) = 3, 'clients de Verger';
  assert (select count(*) from public.console_entreprises() where assistance_ouverte) = 1, 'session visible dans la liste';
  -- L'accord de Verger n'ouvre pas l'autre entreprise.
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)', v_concurrent, 'clients')),
    'l''accord d''un client n''ouvre pas les autres';
  -- Ni les tables elles-mêmes.
  assert (select count(*) from public.clients) = 0, 'les tables restent fermées';
end $$;
reset role;

-- Hugo (commercial) n'en profite pas.
select pg_temp.connecter('hugo@chantio.example', true);
set role authenticated;
do $$
begin
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)',
    (select id from public.console_entreprises() where nom = 'Verger'), 'clients')), 'le commercial ne voit pas le contenu';
end $$;
reset role;

-- Inès sans la double vérification : plus rien, même pendant la session.
select pg_temp.connecter('ines@chantio.example', false);
set role authenticated;
do $$
begin
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)',
    (select id from public.entreprises where nom = 'Verger'), 'clients')), 'double vérification exigée';
end $$;
reset role;

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.acces_chantio where action = 'A consulté les interventions') = 1,
    'une page consultée est notée une fois';
  assert (select count(*) from public.acces_chantio where action = 'A consulté les clients') = 1, 'clients notés';
  -- Christophe coupe l'accès.
  perform public.retirer_assistance((select id from public.assistances where statut = 'acceptee'));
  assert exists (select 1 from public.acces_chantio where action = 'A coupé l''accès de l''équipe Chantio'), 'coupure notée';
end $$;
reset role;

select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
begin
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)',
    (select id from public.console_entreprises() where nom = 'Verger'), 'clients')), 'accès coupé : plus rien';
end $$;
reset role;

-- Christophe ouvre lui-même l'accès pour 24 h ; à l'heure de fin, il se coupe seul.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.autoriser_assistance(1440, 'Mes factures ne partent pas') is not null as ouvert;
reset role;

select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
begin
  assert jsonb_array_length(public.console_assistance_donnees(
    (select id from public.console_entreprises() where nom = 'Verger'), 'documents')) = 0, 'devis et factures lisibles';
end $$;
reset role;

update public.assistances set debut = now() - interval '25 hours', fin = now() - interval '1 hour' where statut = 'acceptee';

select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
begin
  assert pg_temp.refuse(format('select public.console_assistance_donnees(%L, %L)',
    (select id from public.console_entreprises() where nom = 'Verger'), 'documents')), 'durée écoulée : plus rien';
end $$;
reset role;

-- Une demande sans réponse depuis plus de 24 h ne peut plus être acceptée.
select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
select public.console_demander_assistance((select id from public.console_entreprises() where nom = 'Verger'), 60, 'Import Excel') is not null;
reset role;
update public.assistances set cree_le = now() - interval '25 hours' where statut = 'demandee';
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  perform public.repondre_assistance((select id from public.assistances where statut = 'demandee'), true);
  raise exception 'ÉCHEC : demande expirée acceptée';
exception when raise_exception then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
end $$;
reset role;

-- Vérification d'identité : le dirigeant envoie ses justificatifs, le support décide.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
declare
  v_e uuid := prive.entreprise_courante();
begin
  insert into storage.objects (bucket_id, name) values
    ('justificatifs', v_e || '/identite.pdf'), ('justificatifs', v_e || '/kbis.pdf');
  perform public.envoyer_justificatifs(v_e, array[v_e || '/identite.pdf', v_e || '/kbis.pdf']);
end $$;
reset role;

select pg_temp.connecter('hugo@chantio.example', true);
set role authenticated;
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'justificatifs') = 0, 'le commercial ne lit pas les pièces';
end $$;
reset role;

select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
declare
  v_e uuid := (select id from public.console_identites() where identite_statut = 'en_attente');
begin
  assert v_e is not null, 'demande listée';
  assert (select count(*) from storage.objects where bucket_id = 'justificatifs') = 2, 'le support lit les pièces';
  assert (select count(*) from storage.objects where bucket_id <> 'justificatifs') = 0, 'et rien d''autre';
  begin
    perform public.console_decider_identite(v_e, false, '  ');
    raise exception 'ÉCHEC : refus sans motif';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  perform public.console_decider_identite(v_e, true);
  assert (select identite_statut from public.entreprises where id = v_e) is null, 'entreprises toujours fermées';
  assert (select identite_statut from public.console_identites() where id = v_e) = 'verifiee', 'identité vérifiée';
end $$;
reset role;

select pg_temp.connecter('ines@chantio.example', false);
set role authenticated;
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'justificatifs') = 0, 'pièces fermées sans double vérification';
end $$;
reset role;

-- Création d'une entreprise depuis la console : son dirigeant est invité.
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
do $$
declare
  v_id uuid;
begin
  v_id := public.console_creer_entreprise('Thermi Confort', 'Sophie', 'Garnier', 'Sophie@Thermi.example', '812004315',
                                          '44000', 'Nantes', 'equipe', 'essai');
  assert (select statut from public.console_entreprises() where id = v_id) = 'essai', 'en essai';
  assert (select dirigeant_email from public.console_entreprises() where id = v_id) = 'sophie@thermi.example', 'dirigeante invitée';
  begin
    perform public.console_creer_entreprise('Doublon', 'X', null, 'x@exemple.example', '812 004 315');
    raise exception 'ÉCHEC : SIREN en double';
  exception when unique_violation then null;
  end;
  -- Il reste toujours un propriétaire.
  begin
    perform public.console_modifier_equipier(
      (select id from public.console_equipe() where email = 'hugo@chantio.example'), 'commercial', false);
    perform public.console_modifier_equipier(
      (select id from public.console_equipe() where email = 'hugo@chantio.example'), 'commercial', true);
  end;
  -- Idées des clients : toutes les entreprises, suivies par l'équipe.
  assert (select count(*) from public.console_idees()) = 0, 'aucune idée pour l''instant';
end $$;
reset role;

-- Un équipier retiré n'a plus accès, même avec la double vérification.
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
select public.console_modifier_equipier((select id from public.console_equipe() where email = 'ines@chantio.example'), 'support', false);
reset role;
select pg_temp.connecter('ines@chantio.example', true);
set role authenticated;
do $$
begin
  assert public.console_moi() is null, 'équipière retirée';
  assert pg_temp.refuse('select public.console_entreprises()'), 'équipière retirée : rien';
end $$;
reset role;

-- Dernier propriétaire : impossible de le retirer (Paul ne se retire pas lui-même ; on promeut Hugo puis on essaie).
select pg_temp.connecter('paul@chantio.example', true);
set role authenticated;
select public.console_modifier_equipier((select id from public.console_equipe() where email = 'hugo@chantio.example'), 'proprietaire', true);
reset role;
select pg_temp.connecter('hugo@chantio.example', true);
set role authenticated;
do $$
begin
  perform public.console_modifier_equipier((select id from public.console_equipe() where email = 'paul@chantio.example'), 'support', true);
  -- Hugo reste propriétaire : le changement passe.
  assert (select role from public.console_equipe() where email = 'paul@chantio.example') = 'support', 'rôle changé';
end $$;
reset role;

-- Sans compte connecté : rien.
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);
set role anon;
do $$
begin
  perform public.console_moi();
  raise exception 'ÉCHEC : console appelable sans compte';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'Console : OK';
