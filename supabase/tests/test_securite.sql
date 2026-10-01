-- Vérifie que chaque entreprise est bien cloisonnée et que le parcours
-- d'une fiche (démarrer → envoyer → valider → facturer) respecte les droits.
--
-- « en_tant_que » simule une connexion depuis l'application : rôle
-- `authenticated` et identifiant du compte, comme le fait Supabase.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

-- Comptes : deux dirigeants (Verger, et une autre entreprise), un technicien
-- invité par Verger, un sous-traitant, un inconnu sans entreprise.
insert into auth.users (email) values
  ('christophe@verger.example'),   -- relié à son invitation (seed)
  ('technicien@verger.example'),   -- relié à son invitation (seed)
  ('patron@concurrent.example'),
  ('inconnu@example.com');

do $$ begin
  assert (select count(*) from public.membres where user_id is not null) = 2,
    'les comptes invités doivent être reliés à leur fiche membre';
end $$;

-- Le concurrent crée son entreprise depuis l'application.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null as cree;
insert into public.clients (entreprise_id, nom)
  values (prive.entreprise_courante(), 'Client du concurrent');
do $$ begin
  assert (select count(*) from public.clients) = 1, 'le concurrent ne voit que son client';
  assert (select count(*) from public.interventions) = 0, 'le concurrent ne voit aucune intervention de Verger';
  assert (select count(*) from public.membres) = 1, 'le concurrent ne voit que son équipe';
end $$;

-- Il ne peut pas écrire chez Verger, même en connaissant son identifiant.
do $$ begin
  begin
    insert into public.clients (entreprise_id, nom)
    values ((select id from public.entreprises where nom = 'Verger'), 'intrus');
    raise exception 'ÉCHEC : insertion chez une autre entreprise acceptée';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Ni démarrer ni envoyer une fiche sur une intervention de Verger,
-- même avec son identifiant exact.
do $$
declare v uuid := (select id from public.interventions where motif = 'Fuite sous évier');
begin
  perform set_config('test.inter', v::text, false);
end $$;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  begin
    perform public.demarrer_intervention(current_setting('test.inter')::uuid);
    raise exception 'ÉCHEC : démarrage chez une autre entreprise accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    perform public.envoyer_fiche(jsonb_build_object(
      'id', gen_random_uuid(), 'intervention_id', current_setting('test.inter')));
    raise exception 'ÉCHEC : fiche envoyée chez une autre entreprise';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Un inconnu (connecté mais sans entreprise) ne voit rien.
select pg_temp.connecter('inconnu@example.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.entreprises) = 0, 'inconnu : aucune entreprise';
  assert (select count(*) from public.interventions) = 0, 'inconnu : aucune intervention';
end $$;
reset role;

-- Non connecté : rien non plus.
set role anon;
do $$ begin
  assert (select count(*) from public.interventions) = 0, 'anonyme : aucune intervention';
end $$;
reset role;

-- Le technicien de Verger ne voit que ses affectations.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.interventions) = 1, 'technicien : seulement son intervention';
  assert (select motif from public.interventions) = 'Fuite sous évier', 'technicien : la bonne intervention';
  assert (select count(*) from public.clients) = 3, 'technicien : voit les clients de son entreprise';
end $$;
-- Il ne peut ni créer de client ni modifier une intervention directement.
do $$ begin
  begin
    insert into public.clients (entreprise_id, nom) values (prive.entreprise_courante(), 'x');
    raise exception 'ÉCHEC : un technicien a créé un client';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.interventions set motif = 'modifié' where motif = 'Fuite sous évier';
do $$ begin
  assert (select motif from public.interventions) = 'Fuite sous évier', 'technicien : pas de modification directe';
end $$;

-- Il démarre, puis envoie sa fiche avec fournitures et photo.
select public.demarrer_intervention(current_setting('test.inter')::uuid);
do $$ begin
  assert (select statut from public.interventions) = 'en_cours', 'statut en cours après démarrage';
end $$;
select set_config('test.fiche', gen_random_uuid()::text, false);
do $$
declare
  v_fiche jsonb := jsonb_build_object(
    'id', current_setting('test.fiche'),
    'intervention_id', current_setting('test.inter'),
    'debut', now() - interval '45 minutes',
    'duree_minutes', 45,
    'valeurs', jsonb_build_object('constat', jsonb_build_array('Fuite'), 'travaux', 'Joint remplacé'),
    'resultat', 'termine',
    'signataire_nom', 'M. Benali',
    'signature_client', 'M0 0 L10 10',
    'fournitures', jsonb_build_array(jsonb_build_object('designation', 'Joint fibre 1/2', 'quantite', 2)),
    'medias', jsonb_build_array(jsonb_build_object(
      'chemin', prive.entreprise_courante() || '/' || current_setting('test.fiche') || '/avant.jpg',
      'categorie', 'avant'))
  );
begin
  perform public.envoyer_fiche(v_fiche);
  -- Un deuxième envoi (réseau coupé puis revenu) ne crée pas de doublon.
  perform public.envoyer_fiche(v_fiche);
  assert (select count(*) from public.fiches) = 1, 'une seule fiche malgré deux envois';
  assert (select count(*) from public.fournitures) = 1, 'fournitures non dupliquées';
  assert (select count(*) from public.medias) = 1, 'photos non dupliquées';
  assert (select statut from public.interventions) = 'terminee', 'statut terminé après envoi';
end $$;
-- Une photo rangée dans le dossier d'une autre entreprise est refusée.
do $$ begin
  begin
    perform public.envoyer_fiche(jsonb_build_object(
      'id', current_setting('test.fiche'), 'intervention_id', current_setting('test.inter'),
      'medias', jsonb_build_array(jsonb_build_object('chemin', gen_random_uuid() || '/' || current_setting('test.fiche') || '/x.jpg'))));
    raise exception 'ÉCHEC : chemin de photo d''une autre entreprise accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
-- Le technicien ne peut pas valider lui-même.
do $$ begin
  begin
    perform public.valider_intervention(current_setting('test.inter')::uuid);
    raise exception 'ÉCHEC : un technicien a validé';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

-- Le dirigeant voit tout, ne peut pas sauter d'étape, puis valide et facture.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.interventions) = 3, 'dirigeant : toutes les interventions';
  assert (select count(*) from public.fiches) = 1, 'dirigeant : voit la fiche envoyée';
  begin
    update public.interventions set statut = 'facturee' where id = current_setting('test.inter')::uuid;
    raise exception 'ÉCHEC : statut forcé directement';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    perform public.marquer_facturee(current_setting('test.inter')::uuid);
    raise exception 'ÉCHEC : facturée sans validation';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  perform public.valider_intervention(current_setting('test.inter')::uuid);
  perform public.marquer_facturee(current_setting('test.inter')::uuid);
  assert (select statut from public.interventions where id = current_setting('test.inter')::uuid) = 'facturee',
    'statut facturé';
  assert (select count(*) from public.journal) > 0, 'le journal d''audit est rempli';
end $$;

-- Planification automatique : affecter un technicien à une intervention datée
-- la fait passer de « à planifier » à « planifiée ».
do $$
declare v uuid := (select id from public.interventions where motif = 'Panne chaudière');
begin
  assert (select statut from public.interventions where id = v) = 'a_planifier', 'à planifier au départ';
  insert into public.affectations (intervention_id, membre_id, entreprise_id)
  values (v, prive.membre_id_courant(), prive.entreprise_courante());
  assert (select statut from public.interventions where id = v) = 'planifiee', 'planifiée après affectation';
  delete from public.affectations where intervention_id = v;
  assert (select statut from public.interventions where id = v) = 'a_planifier', 'à planifier sans technicien';
end $$;

-- Le dirigeant ne peut pas se rétrograder, ni rattacher un compte étranger.
do $$ begin
  begin
    update public.membres set role = 'technicien' where user_id = auth.uid();
    raise exception 'ÉCHEC : le dirigeant s''est rétrogradé';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    update public.membres set user_id = (select id from auth.users where email = 'inconnu@example.com')
     where email = 'technicien@verger.example';
    raise exception 'ÉCHEC : compte étranger rattaché';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- Photos : lisibles par Verger, pas par le concurrent.
insert into storage.objects (bucket_id, name)
values ('medias', prive.entreprise_courante() || '/' || current_setting('test.fiche') || '/avant.jpg');
do $$ begin
  assert (select count(*) from storage.objects) = 1, 'Verger voit sa photo';
end $$;
reset role;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'le concurrent ne voit pas la photo';
  begin
    insert into storage.objects (bucket_id, name)
    values ('medias', (select id from public.entreprises limit 1)::text || '/x/y.jpg');
  exception when others then raise exception 'ÉCHEC : dépôt dans son propre dossier refusé (%)', sqlerrm;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('medias', gen_random_uuid() || '/x/y.jpg');
    raise exception 'ÉCHEC : dépôt dans le dossier d''une autre entreprise accepté';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'ok' as securite;
