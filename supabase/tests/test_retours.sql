-- Retours sur Chantio : chacun envoie à son nom, le bureau voit tout et suit,
-- le technicien ne voit que les siens, une autre entreprise ne voit rien.

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
insert into public.retours (texte, page) values ('Retour du concurrent', '/');
reset role;

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  insert into public.retours (auteur, texte, page, titre_page, appareil)
  values ('Christophe', 'Le bouton Envoyer est trop petit', '/devis/123?onglet=lignes', 'Devis DE-2026-0147', 'ordinateur 1440×900');
  assert (select entreprise_id = prive.entreprise_courante() and membre_id = prive.membre_id_courant() and statut = 'nouveau'
          from public.retours where texte like 'Le bouton%'), 'entreprise, membre et statut posés d''office';
  begin
    insert into public.retours (texte, page) values ('   ', '/');
    raise exception 'ÉCHEC : retour vide accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.retours (texte, page, entreprise_id)
    values ('Intrus', '/', (select id from public.entreprises where nom = 'Plomberie Concurrente'));
    raise exception 'ÉCHEC : retour dans une autre entreprise accepté';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  insert into public.retours (texte, page) values ('La photo met du temps', '/terrain');
  assert (select count(*) from public.retours) = 1, 'le technicien ne voit que ses retours';
  update public.retours set statut = 'fait';
  assert (select statut from public.retours) = 'nouveau', 'le technicien ne change pas le statut';
end $$;
reset role;

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.retours) = 2, 'le bureau voit tous les retours de l''entreprise';
  update public.retours set statut = 'fait' where texte like 'La photo%';
  assert (select statut from public.retours where texte like 'La photo%') = 'fait', 'le bureau suit les retours';
  begin
    update public.retours set texte = 'Réécrit';
    raise exception 'ÉCHEC : texte modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'Retours : OK';
