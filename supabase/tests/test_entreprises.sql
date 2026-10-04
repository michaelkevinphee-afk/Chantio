-- Plusieurs entreprises par compte : création par SIREN, entreprise active,
-- cloisonnement, invitations, demandes d'accès et vérification d'identité.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'),
  ('technicien@verger.example'),
  ('nouveau@exemple.com');

-- Christophe crée une 2e entreprise : elle devient active, Verger reste à lui.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
select public.creer_entreprise('Atelier Clim 16', p_siren => '123 456 789', p_siret => '12345678900012',
                               p_ville => 'Paris', p_representant => 'Christophe Rambla') is not null;
do $$ begin
  assert (select count(*) from public.mes_entreprises()) = 2, 'deux entreprises pour Christophe';
  assert (select nom from public.entreprises where id = prive.entreprise_courante()) = 'Atelier Clim 16', 'la nouvelle est active';
  assert (select prenom from public.membre_actif()) = 'Christophe', 'prénom repris de Verger';
  assert (select count(*) from public.interventions) = 0, 'les interventions de Verger ne se voient pas depuis Atelier Clim';
  assert (select count(*) from public.membres) = 1, 'équipe de l''entreprise active seulement';
  assert prive.est_dirigeant(), 'dirigeant de la nouvelle entreprise';
  assert (select siren from public.entreprises where id = prive.entreprise_courante()) = '123456789', 'SIREN sans espaces';
end $$;
insert into public.clients (entreprise_id, nom) values (prive.entreprise_courante(), 'Client Clim');

-- Retour sur Verger.
select public.choisir_entreprise((select id from public.mes_entreprises() where nom = 'Verger'));
do $$ begin
  assert (select count(*) from public.interventions) > 0, 'Verger retrouve ses interventions';
  assert not exists (select 1 from public.clients where nom = 'Client Clim'), 'le client Clim reste chez Atelier Clim';
end $$;

-- Un SIREN déjà inscrit est refusé.
do $$ begin
  begin
    perform public.creer_entreprise('Doublon', 'X', p_siren => '123456789');
    raise exception 'ÉCHEC : SIREN en double accepté';
  exception when unique_violation then null;
  end;
end $$;

-- On ne choisit pas une entreprise dont on n'est pas membre.
do $$ begin
  begin
    perform public.choisir_entreprise(gen_random_uuid());
    raise exception 'ÉCHEC : entreprise étrangère choisie';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- L'identité ne se change pas à la main.
do $$ begin
  begin
    update public.entreprises set identite_statut = 'verifiee' where id = prive.entreprise_courante();
    raise exception 'ÉCHEC : identité modifiée à la main';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
-- La formule, si.
update public.entreprises set formule = 'entreprise' where id = prive.entreprise_courante();

-- Verger n'a pas de SIREN : il le renseigne, puis demande la vérification au registre.
select public.definir_siren(prive.entreprise_courante(), '987654321', p_ville => 'Paris');
select public.demander_verification_registre(prive.entreprise_courante());
do $$ begin
  assert (select identite_statut from public.entreprises where id = prive.entreprise_courante()) = 'en_attente',
    'vérification en attente de Chantio';
  begin
    perform public.definir_siren(prive.entreprise_courante(), '111111111');
    raise exception 'ÉCHEC : SIREN changé pendant la vérification';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- Justificatifs : seulement dans le dossier d'une entreprise dont on est dirigeant.
insert into storage.objects (bucket_id, name)
values ('justificatifs', (select id from public.mes_entreprises() where nom = 'Atelier Clim 16') || '/identite.pdf');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('justificatifs', gen_random_uuid() || '/x.pdf');
    raise exception 'ÉCHEC : justificatif déposé chez une autre entreprise';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.envoyer_justificatifs((select id from public.mes_entreprises() where nom = 'Atelier Clim 16'),
                                         array[gen_random_uuid() || '/a.pdf', gen_random_uuid() || '/b.pdf']);
    raise exception 'ÉCHEC : justificatifs d''un autre dossier acceptés';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
select public.envoyer_justificatifs(e.id, array[e.id || '/identite.pdf', e.id || '/kbis.pdf'])
  from public.mes_entreprises() e where e.nom = 'Atelier Clim 16';

-- Le technicien de Verger est invité chez Atelier Clim : il voit l'invitation et la rejoint.
select public.choisir_entreprise((select id from public.mes_entreprises() where nom = 'Atelier Clim 16'));
insert into public.membres (entreprise_id, email, prenom, role)
values ((select id from public.mes_entreprises() where nom = 'Atelier Clim 16'), 'technicien@verger.example', 'Technicien', 'technicien');
reset role;
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.invitations_recues()) = 1, 'une invitation reçue';
  assert (select nom from public.entreprises where id = prive.entreprise_courante()) = 'Verger', 'toujours sur Verger';
  assert not prive.est_bureau(), 'technicien chez Verger';
end $$;
select public.rejoindre_entreprise((select membre_id from public.invitations_recues()));
do $$ begin
  assert (select count(*) from public.mes_entreprises()) = 2, 'technicien de deux entreprises';
  assert (select nom from public.entreprises where id = prive.entreprise_courante()) = 'Atelier Clim 16', 'invitation acceptée = active';
  assert (select count(*) from public.invitations_recues()) = 0, 'plus d''invitation';
end $$;
reset role;

-- Un nouveau compte trouve Atelier Clim déjà inscrite et demande l'accès.
select pg_temp.connecter('nouveau@exemple.com');
set role authenticated;
do $$ begin
  assert prive.entreprise_courante() is null, 'sans entreprise';
  assert public.sirens_inscrits(array['123456789', '000000000']) = array['123456789'], 'SIREN inscrit repéré';
  assert public.demander_acces('123456789', 'Nina', 'Durand') = 'Atelier Clim 16', 'demande envoyée';
  assert (select count(*) from public.demandes_acces) = 1, 'le demandeur voit sa demande';
  assert (select count(*) from public.entreprises) = 0, 'mais pas l''entreprise';
  begin
    perform public.traiter_demande((select id from public.demandes_acces), true, 'dirigeant');
    raise exception 'ÉCHEC : le demandeur s''accepte lui-même';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Le technicien (pas dirigeant) ne peut pas l'accepter ; Christophe, si, même depuis Verger.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.demandes_acces) = 0, 'le technicien ne voit pas les demandes';
end $$;
reset role;
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.demandes_acces where statut = 'en_attente') = 1, 'Christophe voit la demande';
end $$;
select public.traiter_demande((select id from public.demandes_acces), true, 'assistant');
reset role;
select pg_temp.connecter('nouveau@exemple.com');
set role authenticated;
do $$ begin
  assert (select nom from public.entreprises where id = prive.entreprise_courante()) = 'Atelier Clim 16', 'Nina a rejoint';
  assert prive.est_bureau(), 'avec le rôle choisi (bureau)';
  assert not prive.est_dirigeant(), 'mais pas dirigeante';
end $$;
reset role;

select 'ok' as entreprises;
