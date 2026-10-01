-- Données d'exemple pour l'environnement de développement : l'entreprise
-- pilote Verger, avec des clients et des interventions fictifs.
--
-- Les membres sont créés comme « invitations » : à la première connexion
-- avec l'adresse e-mail indiquée, le compte est relié automatiquement.

do $$
declare
  v_verger uuid;
  v_christophe uuid;
  v_tech uuid;
  v_laurent uuid;
  v_benali uuid;
  v_erables uuid;
  v_site uuid;
  v_inter uuid;
begin
  insert into public.entreprises (nom, adresse, metiers)
  values ('Verger', '3 rue Gros, 75016 Paris', array['plomberie', 'chauffage'])
  returning id into v_verger;

  insert into public.membres (entreprise_id, email, prenom, nom, role)
  values (v_verger, 'christophe@verger.example', 'Christophe', 'Rambla', 'dirigeant')
  returning id into v_christophe;
  insert into public.membres (entreprise_id, email, prenom, role)
  values (v_verger, 'technicien@verger.example', 'Technicien', 'technicien')
  returning id into v_tech;

  insert into public.clients (entreprise_id, nom, telephone)
  values (v_verger, 'Exemple · Mme Laurent', '01 23 45 67 89') returning id into v_laurent;
  insert into public.clients (entreprise_id, nom)
  values (v_verger, 'Exemple · M. Benali') returning id into v_benali;
  insert into public.clients (entreprise_id, nom, type)
  values (v_verger, 'Exemple · SCI Les Érables', 'bailleur') returning id into v_erables;

  insert into public.sites (entreprise_id, client_id, adresse, code_postal, ville, acces)
  values (v_verger, v_laurent, '12 rue des Tilleuls', '75016', 'Paris', 'Code 4512B · 3e étage')
  returning id into v_site;
  insert into public.interventions (entreprise_id, client_id, site_id, type, motif, description, date_prevue, heure_prevue)
  values (v_verger, v_laurent, v_site, 'entretien', 'Entretien chaudière', 'Chaudière gaz murale, entretien annuel.', current_date, '08:30')
  returning id into v_inter;
  insert into public.affectations (intervention_id, membre_id, entreprise_id) values (v_inter, v_christophe, v_verger);

  insert into public.sites (entreprise_id, client_id, adresse, code_postal, ville)
  values (v_verger, v_benali, '4 avenue Victor Hugo', '92100', 'Boulogne-Billancourt')
  returning id into v_site;
  insert into public.interventions (entreprise_id, client_id, site_id, type, urgence, motif, date_prevue, heure_prevue)
  values (v_verger, v_benali, v_site, 'depannage', 'urgente', 'Fuite sous évier', current_date, '10:15')
  returning id into v_inter;
  insert into public.affectations (intervention_id, membre_id, entreprise_id) values (v_inter, v_tech, v_verger);

  insert into public.sites (entreprise_id, client_id, adresse, code_postal, ville)
  values (v_verger, v_erables, '8 rue de Chézy', '92200', 'Neuilly-sur-Seine')
  returning id into v_site;
  insert into public.interventions (entreprise_id, client_id, site_id, type, motif, date_prevue, heure_prevue)
  values (v_verger, v_erables, v_site, 'depannage', 'Panne chaudière', current_date + 1, '09:00');
end $$;
