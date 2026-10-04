-- Achats : factures fournisseurs réservées au bureau, cloisonnées par
-- entreprise, paiements partiels puis complets.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values
  ('christophe@verger.example'),
  ('technicien@verger.example'),
  ('patron@concurrent.example');

select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
select public.creer_entreprise('Plomberie Concurrente', 'Paul') is not null;
insert into public.fournisseurs (entreprise_id, nom) values (prive.entreprise_courante(), 'Négoce du concurrent');
reset role;

-- Le bureau de Verger enregistre une facture et son fournisseur.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
insert into public.fournisseurs (entreprise_id, nom, siret, delai_paiement)
values (prive.entreprise_courante(), 'Thermo Négoce IDF', '52814736900027', 30);
insert into public.achats (entreprise_id, fournisseur_id, numero, montant_ht, taux_tva, montant_tva, responsable_id)
select prive.entreprise_courante(), f.id, 'TN-2026-3512', 500, 20, 100, prive.membre_id_courant()
  from public.fournisseurs f where f.nom = 'Thermo Négoce IDF';
do $$ begin
  assert (select count(*) from public.fournisseurs) = 1, 'Verger ne voit pas les fournisseurs du concurrent';
  assert (select montant_ttc from public.achats) = 600, 'TTC = HT + TVA';
end $$;

-- Un fournisseur d'une autre entreprise est refusé.
reset role;
do $$
declare v_autre uuid := (select id from public.fournisseurs where nom = 'Négoce du concurrent');
begin
  perform set_config('test.autre', v_autre::text, false);
end $$;
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$ begin
  begin
    update public.achats set fournisseur_id = current_setting('test.autre')::uuid;
    raise exception 'ÉCHEC : fournisseur d''une autre entreprise accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

-- Pas de paiement tant que la facture n'est pas approuvée.
do $$ begin
  begin
    perform public.declarer_paiement_achat((select id from public.achats), 'Virement', 100, current_date);
    raise exception 'ÉCHEC : paiement d''une facture non approuvée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;

update public.achats set statut = 'a_payer', approuvee_le = current_date;
do $$ begin
  assert public.declarer_paiement_achat((select id from public.achats), 'Virement', 200, current_date) = 'a_payer',
    'paiement partiel : reste à payer';
  begin
    perform public.declarer_paiement_achat((select id from public.achats), 'Virement', 500, current_date);
    raise exception 'ÉCHEC : paiement supérieur au reste accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  assert public.declarer_paiement_achat((select id from public.achats), 'Chèque', 400, current_date) = 'payee',
    'le solde rend la facture payée';
  assert (select sum(montant) from public.paiements_achats) = 600, 'deux paiements enregistrés';
end $$;

-- L'historique des paiements ne se réécrit pas.
do $$ begin
  begin
    delete from public.paiements_achats;
    if (select count(*) from public.paiements_achats) <> 2 then
      raise exception 'ÉCHEC : paiement supprimé';
    end if;
  end;
end $$;

insert into public.commentaires_achats (entreprise_id, achat_id, membre_id, texte)
select prive.entreprise_courante(), id, prive.membre_id_courant(), 'Livraison complète' from public.achats;
reset role;

-- Le technicien ne voit pas les achats ; le concurrent non plus.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.achats) = 0, 'le technicien ne voit pas les achats';
  assert (select count(*) from public.fournisseurs) = 0, 'ni les fournisseurs';
end $$;
reset role;
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$ begin
  assert (select count(*) from public.achats) = 0, 'le concurrent ne voit pas les achats de Verger';
  assert (select count(*) from public.commentaires_achats) = 0, 'ni leurs commentaires';
end $$;
reset role;

select 'ok' as achats;
