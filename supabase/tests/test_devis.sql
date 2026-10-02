-- Devis et factures : réservés au bureau, numéros sans trou, factures
-- numérotées figées, rien de visible d'une entreprise à l'autre.

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

-- Le dirigeant crée un article, un devis, le valide puis le facture.
select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
  v_art uuid;
  v_devis uuid;
  v_fact uuid;
  v_fact2 uuid;
  v_num text;
begin
  insert into public.articles (entreprise_id, designation, unite, prix_achat, prix_vente, tva)
  values (v_ent, 'Main-d''œuvre plombier', 'h', 34, 62, 10) returning id into v_art;

  insert into public.documents (entreprise_id, genre, objet, client)
  values (v_ent, 'devis', 'Salle de bain', '{"type":"particulier","nom":"Durand"}') returning id into v_devis;

  -- Pas de validation sans ligne.
  begin
    perform public.finaliser_document(v_devis);
    raise exception 'ÉCHEC : devis vide validé';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  insert into public.lignes_document (entreprise_id, document_id, position, titre, designation)
  values (v_ent, v_devis, 0, true, 'Plomberie');
  insert into public.lignes_document (entreprise_id, document_id, position, designation, quantite, unite, prix_unitaire, tva, article_id)
  values (v_ent, v_devis, 1, 'Main-d''œuvre plombier', 4, 'h', 62, 10, v_art);

  -- Le numéro ne se choisit pas à la main.
  begin
    update public.documents set numero = 'DE-2026-9999' where id = v_devis;
    raise exception 'ÉCHEC : numéro forcé';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  v_num := public.finaliser_document(v_devis);
  assert v_num = 'DE-' || extract(year from current_date) || '-0001', 'premier numéro de devis : ' || v_num;
  assert public.finaliser_document(v_devis) = v_num, 'valider deux fois garde le numéro';
  assert (select statut from public.documents where id = v_devis) = 'envoye', 'devis envoyé';
  assert (select utilisations from public.articles where id = v_art) = 1, 'article compté';

  -- Un devis numéroté reste modifiable (avenant avant signature).
  update public.documents set statut = 'signe', signe_le = now() where id = v_devis;
  update public.lignes_document set quantite = 5 where document_id = v_devis and not titre;

  -- Facture d'acompte puis facture de solde.
  insert into public.documents (entreprise_id, genre, type_facture, devis_id, pourcentage, objet)
  values (v_ent, 'facture', 'acompte', v_devis, 30, 'Acompte') returning id into v_fact;
  insert into public.lignes_document (entreprise_id, document_id, position, designation, quantite, prix_unitaire, tva)
  values (v_ent, v_fact, 0, 'Main-d''œuvre plombier', 5, 62, 10);
  assert public.finaliser_document(v_fact) = 'FA-' || extract(year from current_date) || '-0001', 'premier numéro de facture';
  assert (select statut from public.documents where id = v_fact) = 'a_encaisser', 'facture à encaisser';
  assert (select echeance from public.documents where id = v_fact) = current_date + 30, 'échéance à 30 jours';

  insert into public.documents (entreprise_id, genre, type_facture, devis_id, objet)
  values (v_ent, 'facture', 'solde', v_devis, 'Solde') returning id into v_fact2;
  insert into public.lignes_document (entreprise_id, document_id, designation, quantite, prix_unitaire)
  values (v_ent, v_fact2, 'Main-d''œuvre plombier', 5, 62);
  assert public.finaliser_document(v_fact2) = 'FA-' || extract(year from current_date) || '-0002', 'numéros qui se suivent';

  -- Facture numérotée : figée, sauf l'encaissement.
  begin
    update public.documents set objet = 'Autre' where id = v_fact;
    raise exception 'ÉCHEC : facture numérotée modifiée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    update public.lignes_document set prix_unitaire = 1 where document_id = v_fact;
    raise exception 'ÉCHEC : ligne de facture modifiée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    insert into public.lignes_document (entreprise_id, document_id, designation) values (v_ent, v_fact, 'Ajout');
    raise exception 'ÉCHEC : ligne ajoutée à une facture';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    delete from public.documents where id = v_fact;
    raise exception 'ÉCHEC : facture numérotée supprimée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  update public.documents set statut = 'payee', paye_le = now() where id = v_fact;
  update public.documents set relances = relances + 1, relance_le = now() where id = v_fact2;
  assert (select statut from public.documents where id = v_fact) = 'payee', 'facture encaissée';

  -- L'avoir a sa propre série.
  insert into public.documents (entreprise_id, genre, type_facture, facture_id, objet)
  values (v_ent, 'facture', 'avoir', v_fact2, 'Avoir') returning id into v_fact;
  insert into public.lignes_document (entreprise_id, document_id, designation, quantite, prix_unitaire)
  values (v_ent, v_fact, 'Geste commercial', 1, 50);
  assert public.finaliser_document(v_fact) = 'AV-' || extract(year from current_date) || '-0001', 'série des avoirs';

  -- Un brouillon se supprime.
  insert into public.documents (entreprise_id, genre, type_facture) values (v_ent, 'facture', 'totale') returning id into v_fact;
  delete from public.documents where id = v_fact;
end $$;
reset role;

-- Le technicien ne voit ni ne crée rien.
select pg_temp.connecter('technicien@verger.example');
set role authenticated;
do $$
begin
  assert (select count(*) from public.documents) = 0, 'technicien : aucun document visible';
  assert (select count(*) from public.articles) = 0, 'technicien : aucun article visible';
  begin
    insert into public.articles (entreprise_id, designation) values (prive.entreprise_courante(), 'Pirate');
    raise exception 'ÉCHEC : article créé par un technicien';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finaliser_document((select id from public.documents limit 1));
    raise exception 'ÉCHEC : document validé par un technicien';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('documents', prive.entreprise_courante() || '/imports/x.pdf');
    raise exception 'ÉCHEC : fichier importé par un technicien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- L'autre entreprise ne voit rien et ne peut rien rattacher.
select pg_temp.connecter('patron@concurrent.example');
set role authenticated;
do $$
declare
  v_doc uuid;
begin
  assert (select count(*) from public.documents) = 0, 'concurrent : aucun document visible';
  assert (select count(*) from public.lignes_document) = 0, 'concurrent : aucune ligne visible';
  assert (select count(*) from public.articles) = 0, 'concurrent : aucun article visible';
  -- Son premier devis repart de 0001 : les compteurs sont propres à chaque entreprise.
  insert into public.documents (entreprise_id, genre) values (prive.entreprise_courante(), 'devis') returning id into v_doc;
  insert into public.lignes_document (entreprise_id, document_id, designation, prix_unitaire)
  values (prive.entreprise_courante(), v_doc, 'Forfait', 100);
  assert public.finaliser_document(v_doc) = 'DE-' || extract(year from current_date) || '-0001', 'compteur propre à l''entreprise';
  begin
    insert into public.documents (entreprise_id, genre) values ((select id from public.entreprises where nom = 'Verger'), 'devis');
    raise exception 'ÉCHEC : document créé chez Verger';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('documents', (select id from public.entreprises where nom = 'Verger') || '/imports/x.pdf');
    raise exception 'ÉCHEC : fichier déposé chez Verger';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'test_devis : OK';
