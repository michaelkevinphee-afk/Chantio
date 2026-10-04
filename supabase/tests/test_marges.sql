-- Coefficients et marges : coût des lignes, métré et n° de poste gardés avec
-- le devis, coefficients bornés, temps de pose des ouvrages du catalogue ;
-- une facture validée reste figée, coûts compris.

\set QUIET on
\pset tuples_only on
create function pg_temp.connecter(p_email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false)
$$;

insert into auth.users (email) values ('christophe@verger.example');

select pg_temp.connecter('christophe@verger.example');
set role authenticated;
do $$
declare
  v_ent uuid := prive.entreprise_courante();
  v_art uuid;
  v_devis uuid;
  v_fact uuid;
begin
  insert into public.articles (entreprise_id, designation, categorie, unite, prix_achat, prix_vente, heures, tva)
  values (v_ent, 'Faïence murale posée', 'Ouvrages', 'm²', 28, 120, 1.2, 10) returning id into v_art;
  assert (select heures from public.articles where id = v_art) = 1.2, 'temps de pose de l''ouvrage gardé';

  insert into public.documents (entreprise_id, genre, objet, client, coefficient)
  values (v_ent, 'devis', 'Salle de bain', '{"type":"particulier","nom":"Durand"}', 1.45) returning id into v_devis;
  insert into public.lignes_document (entreprise_id, document_id, position, designation, quantite, unite, prix_unitaire, tva,
                                      article_id, achat, heures, coefficient, prix_calcule, metre, reference)
  values (v_ent, v_devis, 0, 'Faïence murale posée', 22, 'm²', 113.68, 10, v_art, 28, 1.2, null, true,
          '{"longueur": 9.6, "largeur": 2.5, "nombre": 1, "deduction": 3.6, "chute": 10}', '11.2.1');
  -- Une ligne ancienne, sans coût : prix fixe, rien d'obligatoire.
  insert into public.lignes_document (entreprise_id, document_id, position, designation, quantite, prix_unitaire, tva)
  values (v_ent, v_devis, 1, 'Déplacement', 1, 45, 10);

  assert (select coefficient from public.documents where id = v_devis) = 1.45, 'coefficient du devis gardé';
  assert (select prix_calcule and achat = 28 and heures = 1.2 and reference = '11.2.1' and (metre ->> 'longueur')::numeric = 9.6
          from public.lignes_document where document_id = v_devis and position = 0), 'coût, métré et n° de poste gardés';
  assert (select not prix_calcule and achat is null and coefficient is null
          from public.lignes_document where document_id = v_devis and position = 1), 'ligne sans coût : prix fixe';

  -- Coefficients bornés entre 0,5 et 10, coûts positifs.
  begin
    update public.documents set coefficient = 20 where id = v_devis;
    raise exception 'ÉCHEC : coefficient de 20 accepté';
  exception when check_violation then null;
  end;
  begin
    update public.lignes_document set coefficient = 0.1 where document_id = v_devis and position = 0;
    raise exception 'ÉCHEC : coefficient de ligne de 0,1 accepté';
  exception when check_violation then null;
  end;
  begin
    update public.lignes_document set achat = -5 where document_id = v_devis and position = 0;
    raise exception 'ÉCHEC : coût négatif accepté';
  exception when check_violation then null;
  end;

  -- Une facture validée ne se modifie plus, y compris ses coûts.
  insert into public.documents (entreprise_id, genre, type_facture, devis_id, objet, coefficient)
  values (v_ent, 'facture', 'totale', v_devis, 'Salle de bain', 1.45) returning id into v_fact;
  insert into public.lignes_document (entreprise_id, document_id, position, designation, quantite, unite, prix_unitaire, tva, achat, heures, prix_calcule)
  values (v_ent, v_fact, 0, 'Faïence murale posée', 22, 'm²', 113.68, 10, 28, 1.2, true);
  perform public.finaliser_document(v_fact);
  begin
    update public.lignes_document set achat = 10 where document_id = v_fact;
    raise exception 'ÉCHEC : coût modifié sur une facture validée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
  begin
    update public.documents set coefficient = 2 where id = v_fact;
    raise exception 'ÉCHEC : coefficient modifié sur une facture validée';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;
end $$;
reset role;

select 'Coefficients et marges : OK';
