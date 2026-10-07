-- Assistance « lecture et modification » : l'équipe Chantio peut paramétrer le
-- compte d'un client, avec son accord.
--
-- • Le dirigeant choisit, en ouvrant ou en acceptant l'accès, entre « lecture
--   seule » (comme avant : la console lit le compte) et « lecture et
--   modification ».
-- • En « lecture et modification », l'équipier entre dans le bureau du client
--   depuis la console : il y devient membre temporaire (rôle dirigeant), lié à
--   la session d'assistance. Dès que la session se termine (fin de la durée,
--   coupée par le dirigeant ou fermée par Chantio), ce lien ne vaut plus rien :
--   la base ne le reconnaît plus, sans attendre de ménage.
-- • Il n'apparaît pas dans l'équipe du client, ne peut ni toucher aux
--   dirigeants, ni ouvrir ou prolonger l'accès lui-même, ni gérer l'identité ou
--   les demandes d'accès de l'entreprise.
-- • Ce qu'il ajoute, modifie ou supprime est noté dans le journal que le
--   dirigeant lit (Paramètres › Accès de Chantio), une ligne par sujet toutes
--   les 10 minutes.
-- Le script ne supprime aucune donnée.

alter table public.assistances
  add column mode text not null default 'lecture' check (mode in ('lecture', 'modification'));

alter table public.membres
  add column assistance_id uuid references public.assistances (id);
create index on public.membres (assistance_id) where assistance_id is not null;

-- ---------------------------------------------------------------------------
-- Validité du lien de l'équipier avec le compte du client
-- ---------------------------------------------------------------------------

-- Vrai si cette session est ouverte en modification et que le compte connecté
-- est un équipier Chantio actif, passé par la double vérification, avec le
-- droit d'assistance.
create function prive.assistance_modif_valide(p_assistance uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assistances a
    where a.id = p_assistance and a.statut = 'acceptee' and a.mode = 'modification'
      and now() >= a.debut and now() < a.fin
  ) and prive.console_peut('assistance')
$$;

-- Le compte connecté est-il ici en tant qu'équipier Chantio ?
create function prive.chantio_dans(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.entreprise_id = p_entreprise and m.user_id = auth.uid() and m.assistance_id is not null
  )
$$;

-- L'entreprise choisie si le compte en est toujours membre, sinon la plus ancienne.
-- Un lien d'assistance ne compte que pendant sa session.
create or replace function prive.entreprise_courante() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.entreprise_id from public.membres m
  left join prive.entreprise_active a on a.user_id = m.user_id
  where m.user_id = auth.uid() and m.actif
    and (m.assistance_id is null or prive.assistance_modif_valide(m.assistance_id))
  order by (m.entreprise_id = a.entreprise_id) desc nulls last, m.cree_le, m.id
  limit 1
$$;

-- Dirigeant « titulaire » de cette entreprise : jamais l'équipier en assistance
-- (identité, justificatifs, demandes d'accès, réponse aux demandes de Chantio).
create or replace function prive.est_dirigeant_de(p_entreprise uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.entreprise_id = p_entreprise and m.user_id = auth.uid()
      and m.actif and m.role = 'dirigeant' and m.assistance_id is null
  )
$$;

create or replace function prive.peut_gerer_justificatif(p_chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membres m
    where m.entreprise_id::text = (storage.foldername(p_chemin))[1]
      and m.user_id = auth.uid() and m.actif and m.role = 'dirigeant' and m.assistance_id is null
  )
$$;

create or replace function public.mes_entreprises()
returns table (
  id uuid, nom text, siren text, siret text, forme_juridique text, adresse text, code_postal text,
  ville text, logo_chemin text, formule text, identite_statut text, identite_mode text,
  identite_motif text, role public.role_membre, active boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.nom, e.siren, e.siret, e.forme_juridique, e.adresse, e.code_postal, e.ville,
         e.logo_chemin, e.formule, e.identite_statut, e.identite_mode, e.identite_motif,
         m.role, e.id = prive.entreprise_courante()
  from public.membres m
  join public.entreprises e on e.id = m.entreprise_id
  where m.user_id = auth.uid() and m.actif
    and (m.assistance_id is null or prive.assistance_modif_valide(m.assistance_id))
  order by lower(e.nom)
$$;

create or replace function public.choisir_entreprise(p_entreprise uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.membres
                 where user_id = auth.uid() and entreprise_id = p_entreprise and actif
                   and (assistance_id is null or prive.assistance_modif_valide(assistance_id))) then
    raise exception 'Entreprise introuvable';
  end if;
  insert into prive.entreprise_active (user_id, entreprise_id) values (auth.uid(), p_entreprise)
  on conflict (user_id) do update set entreprise_id = excluded.entreprise_id, le = now();
end $$;

-- L'équipier n'apparaît pas dans l'équipe du client (il voit sa propre fiche).
drop policy lire on public.membres;
create policy lire on public.membres for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and (assistance_id is null or user_id = auth.uid()));

-- Garde-fous : le lien d'assistance ne se pose ni ne se retire à la main, et
-- l'équipier ne touche pas aux dirigeants du client.
create function prive.proteger_membre_assistance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.assistance_id is not null then
      raise exception 'Le lien d''assistance ne se crée pas à la main';
    end if;
    if tg_op = 'UPDATE' and new.assistance_id is distinct from old.assistance_id then
      raise exception 'Le lien d''assistance ne se modifie pas';
    end if;
  end if;
  if prive.chantio_dans(coalesce(new.entreprise_id, old.entreprise_id))
     and ((tg_op <> 'INSERT' and old.role = 'dirigeant' and old.assistance_id is null)
          or (tg_op <> 'DELETE' and new.role = 'dirigeant' and new.assistance_id is null)) then
    raise exception 'L''équipe Chantio ne peut pas ajouter, modifier ni retirer un dirigeant';
  end if;
  return coalesce(new, old);
end $$;

create trigger proteger_assistance before insert or update or delete on public.membres
  for each row execute function prive.proteger_membre_assistance();

-- ---------------------------------------------------------------------------
-- Journal des modifications faites par Chantio
-- ---------------------------------------------------------------------------

create function prive.noter_modif_chantio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old));
  v_entreprise uuid := case when tg_table_name = 'entreprises' then (v_ligne ->> 'id')::uuid
                            else (v_ligne ->> 'entreprise_id')::uuid end;
  v_membre public.membres;
  v_equipier prive.equipe_chantio;
  v_action text;
begin
  if auth.uid() is null or v_entreprise is null then
    return null;
  end if;
  select * into v_membre from public.membres
   where entreprise_id = v_entreprise and user_id = auth.uid() and assistance_id is not null;
  -- Personne de Chantio ici, ou sa propre fiche (entrée et sortie, notées à part).
  if not found or (tg_table_name = 'membres' and (v_ligne ->> 'id')::uuid = v_membre.id) then
    return null;
  end if;
  v_action := case tg_op when 'INSERT' then 'A ajouté' when 'UPDATE' then 'A modifié' else 'A supprimé' end
    || ' : ' || case tg_table_name
      when 'entreprises' then 'la fiche de l''entreprise'
      when 'membres' then 'l''équipe'
      when 'clients' then 'des clients'
      when 'contacts_client' then 'des contacts clients'
      when 'sites' then 'des adresses d''intervention'
      when 'occupants' then 'des occupants'
      when 'equipements' then 'des équipements'
      when 'interventions' then 'des interventions'
      when 'affectations' then 'le planning'
      when 'documents' then 'des devis ou factures'
      when 'lignes_document' then 'des lignes de devis ou factures'
      when 'articles' then 'le catalogue'
      when 'fournisseurs' then 'des fournisseurs'
      when 'achats' then 'des achats'
      when 'paiements_achats' then 'des paiements d''achats'
      when 'contrats' then 'des contrats d''entretien'
      when 'budgets' then 'des budgets'
      when 'production_importee' then 'les objectifs de l''année'
      else tg_table_name end;
  if exists (select 1 from public.acces_chantio
             where assistance_id = v_membre.assistance_id and action = v_action
               and le > now() - interval '10 minutes') then
    return null;
  end if;
  v_equipier := prive.equipier();
  insert into public.acces_chantio (entreprise_id, equipier_id, qui, action, assistance_id)
  values (v_entreprise, v_equipier.id, coalesce(v_equipier.prenom, v_membre.prenom) || ' de Chantio',
          v_action, v_membre.assistance_id);
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['entreprises', 'membres', 'clients', 'contacts_client', 'sites', 'occupants',
                           'equipements', 'interventions', 'affectations', 'documents', 'lignes_document',
                           'articles', 'fournisseurs', 'achats', 'paiements_achats', 'contrats', 'budgets',
                           'production_importee'] loop
    execute format('create trigger noter_chantio after insert or update or delete on public.%I
                    for each row execute function prive.noter_modif_chantio()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Côté client : choisir le mode
-- ---------------------------------------------------------------------------

drop function public.autoriser_assistance(integer, text);
create function public.autoriser_assistance(p_duree_minutes integer, p_motif text default null, p_mode text default 'lecture')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entreprise uuid := prive.entreprise_courante();
  v_nom text;
  v_id uuid;
begin
  if not prive.est_dirigeant() or prive.chantio_dans(v_entreprise) then
    raise exception 'Seul le dirigeant peut ouvrir l''accès à Chantio';
  end if;
  if p_duree_minutes is null or p_duree_minutes not between 15 and 1440 then
    raise exception 'Durée invalide';
  end if;
  if coalesce(p_mode, '') not in ('lecture', 'modification') then
    raise exception 'Mode d''accès inconnu';
  end if;
  v_nom := prive.nom_membre(v_entreprise);
  -- Une seule session ouverte à la fois : la précédente se ferme.
  update public.assistances
     set statut = 'terminee', fin = now(), termine_par = v_nom
   where entreprise_id = v_entreprise and statut = 'acceptee' and fin > now();
  insert into public.assistances (entreprise_id, origine, demandeur, motif, duree_minutes, mode, statut,
                                  repondu_le, repondu_par, debut, fin)
  values (v_entreprise, 'client', v_nom,
          coalesce(nullif(left(trim(coalesce(p_motif, '')), 300), ''), 'Accès ouvert par le dirigeant'),
          p_duree_minutes, p_mode, 'acceptee', now(), v_nom, now(), now() + make_interval(mins => p_duree_minutes))
  returning id into v_id;
  insert into public.acces_chantio (entreprise_id, qui, action, assistance_id)
  values (v_entreprise, v_nom,
          format('A ouvert l''accès à l''équipe Chantio pendant %s (%s)', prive.duree_lisible(p_duree_minutes),
                 case p_mode when 'modification' then 'lecture et modification' else 'lecture seule' end),
          v_id);
  return v_id;
end $$;

-- Le dirigeant accepte (dans le mode demandé) ou refuse une demande de Chantio.
create or replace function public.repondre_assistance(p_assistance uuid, p_accepter boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.assistances;
  v_nom text;
begin
  select * into v from public.assistances where id = p_assistance and statut = 'demandee' for update;
  if not found or not prive.est_dirigeant_de(v.entreprise_id) then
    raise exception 'Demande introuvable';
  end if;
  if v.cree_le <= now() - interval '24 hours' then
    raise exception 'Cette demande a expiré : Chantio doit en refaire une';
  end if;
  v_nom := prive.nom_membre(v.entreprise_id);
  if p_accepter then
    update public.assistances
       set statut = 'terminee', fin = now(), termine_par = v_nom
     where entreprise_id = v.entreprise_id and statut = 'acceptee' and fin > now();
    update public.assistances
       set statut = 'acceptee', repondu_le = now(), repondu_par = v_nom,
           debut = now(), fin = now() + make_interval(mins => v.duree_minutes)
     where id = p_assistance;
  else
    update public.assistances set statut = 'refusee', repondu_le = now(), repondu_par = v_nom
     where id = p_assistance;
  end if;
  insert into public.acces_chantio (entreprise_id, qui, action, assistance_id)
  values (v.entreprise_id, v_nom,
          case when p_accepter
               then format('A accepté la demande d''accès de %s (%s, %s) : « %s »', v.demandeur, prive.duree_lisible(v.duree_minutes),
                           case v.mode when 'modification' then 'lecture et modification' else 'lecture seule' end, v.motif)
               else format('A refusé la demande d''accès de %s : « %s »', v.demandeur, v.motif) end,
          p_assistance);
end $$;

-- ---------------------------------------------------------------------------
-- Côté console : demander un mode, entrer dans le compte, en sortir
-- ---------------------------------------------------------------------------

drop function public.console_demander_assistance(uuid, integer, text);
create function public.console_demander_assistance(p_entreprise uuid, p_duree_minutes integer, p_motif text, p_mode text default 'lecture')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('assistance');
  v_motif text := nullif(left(trim(coalesce(p_motif, '')), 300), '');
  v_id uuid;
begin
  if not exists (select 1 from public.entreprises where id = p_entreprise) then
    raise exception 'Entreprise introuvable';
  end if;
  if v_motif is null then
    raise exception 'Le motif est obligatoire : le client le lit avant d''accepter';
  end if;
  if p_duree_minutes is null or p_duree_minutes not between 15 and 1440 then
    raise exception 'Durée invalide';
  end if;
  if coalesce(p_mode, '') not in ('lecture', 'modification') then
    raise exception 'Mode d''accès inconnu';
  end if;
  if prive.assistance_ouverte(p_entreprise) is not null then
    raise exception 'Un accès est déjà ouvert pour cette entreprise';
  end if;
  if prive.demande_en_attente(p_entreprise) is not null then
    raise exception 'Une demande attend déjà la réponse du client';
  end if;
  insert into public.assistances (entreprise_id, origine, equipier_id, demandeur, motif, duree_minutes, mode)
  values (p_entreprise, 'chantio', v.id, v.prenom || ' de Chantio', v_motif, p_duree_minutes, p_mode)
  returning id into v_id;
  perform prive.noter_acces(p_entreprise, v,
    format('A demandé l''accès au compte pour %s (%s) : « %s »', prive.duree_lisible(p_duree_minutes),
           case p_mode when 'modification' then 'lecture et modification' else 'lecture seule' end, v_motif), v_id);
  return v_id;
end $$;

-- Entre dans le bureau du client pendant une session « lecture et modification » :
-- l'équipier y devient membre temporaire et l'entreprise devient son entreprise active.
create function public.console_entrer_compte(p_entreprise uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v prive.equipe_chantio := prive.console_exiger('assistance');
  v_assistance uuid := prive.assistance_ouverte(p_entreprise);
  v_membre public.membres;
begin
  if v_assistance is null
     or not exists (select 1 from public.assistances where id = v_assistance and mode = 'modification') then
    raise exception 'Le client n''a pas ouvert l''accès en modification' using errcode = 'insufficient_privilege';
  end if;
  select * into v_membre from public.membres where entreprise_id = p_entreprise and user_id = auth.uid();
  if found and v_membre.assistance_id is null then
    raise exception 'Vous êtes déjà membre de cette entreprise : choisissez-la dans votre bureau';
  end if;
  if found then
    update public.membres set assistance_id = v_assistance, actif = true, role = 'dirigeant' where id = v_membre.id;
  else
    if exists (select 1 from public.membres where entreprise_id = p_entreprise and lower(email) = lower(v.email)) then
      raise exception 'Votre adresse e-mail est déjà invitée dans cette entreprise';
    end if;
    insert into public.membres (entreprise_id, user_id, email, prenom, nom, role, assistance_id)
    values (p_entreprise, auth.uid(), v.email, v.prenom, 'de Chantio', 'dirigeant', v_assistance);
  end if;
  insert into prive.entreprise_active (user_id, entreprise_id) values (auth.uid(), p_entreprise)
  on conflict (user_id) do update set entreprise_id = excluded.entreprise_id, le = now();
  perform prive.noter_acces(p_entreprise, v, 'Est entré dans le compte pour le paramétrer', v_assistance);
  return p_entreprise;
end $$;

-- Quitte le compte du client (bandeau de son bureau) et revient à sa propre entreprise.
create function public.quitter_compte_client() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membre public.membres;
begin
  select * into v_membre from public.membres
   where user_id = auth.uid() and assistance_id is not null and actif
     and entreprise_id = (select entreprise_id from prive.entreprise_active where user_id = auth.uid());
  if found then
    update public.membres set actif = false where id = v_membre.id;
    insert into public.acces_chantio (entreprise_id, equipier_id, qui, action, assistance_id)
    select v_membre.entreprise_id, e.id, e.prenom || ' de Chantio', 'A quitté le compte', v_membre.assistance_id
    from prive.equipe_chantio e where e.user_id = auth.uid();
  end if;
  delete from prive.entreprise_active where user_id = auth.uid();
end $$;

-- Les sessions qui se ferment désactivent aussi le lien de l'équipier.
create function prive.fermer_liens_assistance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.membres set actif = false where assistance_id = new.id and actif;
  return null;
end $$;

create trigger fermer_liens after update of statut, fin on public.assistances
  for each row when (new.statut <> 'acceptee' or new.fin <= now())
  execute function prive.fermer_liens_assistance();

-- La liste de la console indique le mode de chaque session.
drop function public.console_assistances();
create function public.console_assistances()
returns table (
  id uuid, entreprise_id uuid, entreprise text, origine text, demandeur text, motif text,
  duree_minutes integer, mode text, statut text, cree_le timestamptz, repondu_par text, debut timestamptz,
  fin timestamptz, termine_par text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform prive.console_exiger('voir');
  return query
  select a.id, a.entreprise_id, e.nom, a.origine, a.demandeur, a.motif, a.duree_minutes, a.mode, a.statut,
         a.cree_le, a.repondu_par, a.debut, a.fin, a.termine_par
  from public.assistances a join public.entreprises e on e.id = a.entreprise_id
  order by a.cree_le desc
  limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

revoke execute on function prive.assistance_modif_valide(uuid) from public, anon, authenticated;
revoke execute on function prive.chantio_dans(uuid) from public, anon, authenticated;
revoke execute on function prive.proteger_membre_assistance() from public, anon, authenticated;
revoke execute on function prive.noter_modif_chantio() from public, anon, authenticated;
revoke execute on function prive.fermer_liens_assistance() from public, anon, authenticated;

revoke execute on function public.autoriser_assistance(integer, text, text) from public, anon;
revoke execute on function public.console_demander_assistance(uuid, integer, text, text) from public, anon;
revoke execute on function public.console_entrer_compte(uuid) from public, anon;
revoke execute on function public.quitter_compte_client() from public, anon;
revoke execute on function public.console_assistances() from public, anon;
grant execute on function public.autoriser_assistance(integer, text, text) to authenticated;
grant execute on function public.console_demander_assistance(uuid, integer, text, text) to authenticated;
grant execute on function public.console_entrer_compte(uuid) to authenticated;
grant execute on function public.quitter_compte_client() to authenticated;
grant execute on function public.console_assistances() to authenticated;
