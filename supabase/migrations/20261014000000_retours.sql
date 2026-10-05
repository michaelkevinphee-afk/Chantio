-- Retours sur Chantio : ce que les utilisateurs voudraient améliorer, dicté ou
-- écrit depuis la bulle en bas à droite, avec la page exacte où ils étaient.
-- Le script ne supprime rien.

create table public.retours (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null default prive.entreprise_courante() references public.entreprises (id) on delete cascade,
  membre_id      uuid default prive.membre_id_courant() references public.membres (id) on delete set null,
  auteur         text,                                                        -- prénom et nom au moment du retour
  texte          text not null check (length(trim(texte)) between 1 and 5000),
  page           text not null check (length(page) <= 1000),                  -- adresse exacte : /devis/…?onglet=…
  titre_page     text check (length(titre_page) <= 300),                      -- ce qui était affiché : « Devis DE-2026-0147 »
  appareil       text check (length(appareil) <= 300),                        -- ordinateur / téléphone, taille d'écran, appli
  statut         text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'fait')),
  cree_le        timestamptz not null default now()
);
create index on public.retours (entreprise_id, cree_le desc);

-- Tout membre (bureau ou technicien) envoie un retour, à son nom, dans son entreprise.
-- Il relit les siens ; le bureau voit tous ceux de l'entreprise et en change le statut.
alter table public.retours enable row level security;
create policy envoyer on public.retours for insert to authenticated
  with check (entreprise_id = prive.entreprise_courante() and membre_id = prive.membre_id_courant());
create policy lire on public.retours for select to authenticated
  using (entreprise_id = prive.entreprise_courante() and (prive.est_bureau() or membre_id = prive.membre_id_courant()));
create policy suivre on public.retours for update to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

-- Seul le statut se modifie ; le texte et la page restent ceux envoyés.
revoke update on public.retours from authenticated, anon;
grant select, insert on public.retours to authenticated;
grant update (statut) on public.retours to authenticated;
