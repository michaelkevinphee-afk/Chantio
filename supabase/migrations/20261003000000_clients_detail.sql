-- Fiche client plus complète : identité de l'entreprise (SIREN, SIRET…),
-- civilité et mobile pour les particuliers, et plusieurs contacts par client.

alter table public.clients
  add column civilite         text,   -- M., Mme (particuliers)
  add column mobile           text,
  add column siren            text check (siren ~ '^[0-9]{9}$'),
  add column siret            text check (siret ~ '^[0-9]{14}$'),
  add column forme_juridique  text,   -- SAS, SARL, syndicat de copropriété…
  add column activite         text,   -- code NAF et libellé
  add column tva_intracom     text,
  add column site_web         text;

-- Personnes à joindre chez le client (gestionnaire, gardien, comptable…).
create table public.contacts_client (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  nom            text not null check (length(trim(nom)) > 0),
  fonction       text,
  telephone      text,
  email          text,
  cree_le        timestamptz not null default now()
);
create index on public.contacts_client (client_id);

alter table public.contacts_client enable row level security;

-- Mêmes droits que la fiche client : lus par ceux qui voient le client,
-- gérés par le bureau, et toujours rattachés à un client de l'entreprise.
create policy lire on public.contacts_client for select to authenticated
  using (entreprise_id = prive.entreprise_courante()
         and exists (select 1 from public.clients c where c.id = contacts_client.client_id));
create policy ecrire on public.contacts_client for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau()
              and exists (select 1 from public.clients c
                          where c.id = contacts_client.client_id
                            and c.entreprise_id = prive.entreprise_courante()));
