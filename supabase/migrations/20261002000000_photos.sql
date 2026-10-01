-- Photos de profil des membres et logo de l'entreprise.
--
-- Stockage privé « profils », rangé par entreprise :
--   profils/<entreprise_id>/membres/<membre_id>/<fichier>.jpg
--   profils/<entreprise_id>/logo/<fichier>.png
-- Chaque nouvel envoi crée un nouveau fichier (pas d'écrasement) ; la fiche
-- membre (photo_chemin) ou l'entreprise (logo_chemin) pointe vers le dernier.

alter table public.membres add column photo_chemin text;

insert into storage.buckets (id, name, public)
values ('profils', 'profils', false)
on conflict (id) do nothing;

-- Toute l'entreprise voit les photos de l'équipe et le logo.
create policy "profils : lire" on storage.objects for select to authenticated
  using (bucket_id = 'profils'
         and (storage.foldername(name))[1] = prive.entreprise_courante()::text);

-- Chacun dépose sa propre photo ; seul le dirigeant dépose le logo.
create policy "profils : déposer" on storage.objects for insert to authenticated
  with check (bucket_id = 'profils'
              and (storage.foldername(name))[1] = prive.entreprise_courante()::text
              and (((storage.foldername(name))[2] = 'membres'
                    and (storage.foldername(name))[3] = prive.membre_id_courant()::text)
                   or ((storage.foldername(name))[2] = 'logo' and prive.est_dirigeant())));

-- Enregistre la photo du membre connecté (chemin déposé juste avant).
create function public.definir_photo(p_chemin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membre uuid := prive.membre_id_courant();
begin
  if v_membre is null then
    raise exception 'Connexion requise';
  end if;
  if p_chemin is not null
     and p_chemin not like prive.entreprise_courante()::text || '/membres/' || v_membre::text || '/%' then
    raise exception 'Chemin de photo invalide';
  end if;
  update public.membres set photo_chemin = p_chemin where id = v_membre;
end $$;

-- Enregistre le logo de l'entreprise (dirigeant uniquement).
create function public.definir_logo(p_chemin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.est_dirigeant() then
    raise exception 'Réservé au dirigeant';
  end if;
  if p_chemin is not null
     and p_chemin not like prive.entreprise_courante()::text || '/logo/%' then
    raise exception 'Chemin de logo invalide';
  end if;
  update public.entreprises set logo_chemin = p_chemin where id = prive.entreprise_courante();
end $$;

revoke execute on function public.definir_photo(text) from public, anon;
revoke execute on function public.definir_logo(text) from public, anon;
grant execute on function public.definir_photo(text) to authenticated;
grant execute on function public.definir_logo(text) to authenticated;
