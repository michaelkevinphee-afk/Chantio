-- Devis et factures : catalogue d'articles, devis, factures (acompte,
-- avancement, situation, solde, avoir), lignes, documents importés.
--
-- Règles :
--   * tout est réservé au bureau (dirigeant, chef de chantier, assistant) ;
--   * un devis ou une facture reste un brouillon sans numéro tant qu'on ne
--     l'a pas validé (public.finaliser_document) ;
--   * les numéros se suivent sans trou par entreprise, par type et par année
--     (DE-2026-0001, FA-2026-0001, AV-2026-0001) ;
--   * une facture ou un avoir numéroté ne se modifie plus et ne se supprime
--     plus (on corrige par un avoir) ; seuls son état de paiement et ses
--     dates d'envoi ou de relance peuvent encore changer.

-- ---------------------------------------------------------------------------
-- Réglages de facturation de l'entreprise (mentions légales, assurance…)
-- ---------------------------------------------------------------------------

alter table public.entreprises
  add column facturation jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.articles (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  designation    text not null check (length(trim(designation)) > 0),
  categorie      text not null default 'Fournitures',
  unite          text not null default 'u',
  reference      text,
  prix_achat     numeric(12, 2) not null default 0 check (prix_achat >= 0),
  prix_vente     numeric(12, 2) not null default 0 check (prix_vente >= 0),
  tva            numeric(4, 1) not null default 10 check (tva in (0, 2.1, 5.5, 10, 20)),
  utilisations   integer not null default 0,
  actif          boolean not null default true,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now()
);
create index on public.articles (entreprise_id, categorie);

-- ---------------------------------------------------------------------------
-- Devis, factures et avoirs
-- ---------------------------------------------------------------------------

create table public.documents (
  id                    uuid primary key default gen_random_uuid(),
  entreprise_id         uuid not null references public.entreprises (id) on delete cascade,
  genre                 text not null check (genre in ('devis', 'facture')),
  -- Pour une facture : totale (facture unique), acompte, avancement,
  -- situation (ligne par ligne, en cumulé), solde (décompte final), avoir.
  type_facture          text check (type_facture in ('totale', 'acompte', 'avancement', 'situation', 'solde', 'avoir')),
  numero                text,
  statut                text not null default 'brouillon'
                        check (statut in ('brouillon', 'envoye', 'signe', 'refuse', 'a_encaisser', 'payee', 'annule')),
  client_id             uuid references public.clients (id) on delete set null,
  -- Copie du client au moment du document (particulier ou professionnel).
  client                jsonb not null default '{}'::jsonb,
  objet                 text not null default '',
  date_document         date not null default current_date,
  echeance              date,
  -- Conditions particulières (validité, échéancier, retenue de garantie…).
  conditions            jsonb not null default '{}'::jsonb,
  -- Devis d'origine d'une facture, ou facture d'origine d'un avoir.
  devis_id              uuid references public.documents (id) on delete set null,
  facture_id            uuid references public.documents (id) on delete set null,
  remise                numeric(5, 2) not null default 0 check (remise between 0 and 100),
  pourcentage           numeric(5, 2) not null default 30 check (pourcentage between 0 and 100),
  avancement            numeric(5, 2) not null default 0 check (avancement between 0 and 100),
  avancement_precedent  numeric(5, 2) not null default 0 check (avancement_precedent between 0 and 100),
  situation_numero      integer,
  -- Totaux enregistrés (recalculés par l'application à chaque enregistrement).
  total_ht              numeric(12, 2) not null default 0,
  total_tva             numeric(12, 2) not null default 0,
  total_ttc             numeric(12, 2) not null default 0,
  net_a_payer           numeric(12, 2) not null default 0,
  origine               text not null default 'saisie' check (origine in ('saisie', 'import')),
  cree_par              uuid references public.membres (id) on delete set null,
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now(),
  finalise_le           timestamptz,
  envoye_le             timestamptz,
  relance_le            timestamptz,
  relances              integer not null default 0,
  signe_le              timestamptz,
  paye_le               timestamptz,
  unique (entreprise_id, numero),
  check (genre = 'facture' or type_facture is null),
  check (genre = 'devis' or type_facture is not null)
);
create index on public.documents (entreprise_id, genre, date_document desc);
create index on public.documents (devis_id);

create table public.lignes_document (
  id                    uuid primary key default gen_random_uuid(),
  entreprise_id         uuid not null references public.entreprises (id) on delete cascade,
  document_id           uuid not null references public.documents (id) on delete cascade,
  position              integer not null default 0,
  -- Une ligne « titre » regroupe les ouvrages qui suivent (lot).
  titre                 boolean not null default false,
  designation           text not null default '',
  quantite              numeric(12, 3) not null default 1,
  unite                 text not null default 'u',
  prix_unitaire         numeric(12, 2) not null default 0,
  tva                   numeric(4, 1) not null default 10 check (tva in (0, 2.1, 5.5, 10, 20)),
  -- Situations : avancement cumulé de la ligne, et celui déjà facturé.
  avancement            numeric(5, 2) not null default 0 check (avancement between 0 and 100),
  avancement_precedent  numeric(5, 2) not null default 0 check (avancement_precedent between 0 and 100),
  article_id            uuid references public.articles (id) on delete set null
);
create index on public.lignes_document (document_id, position);

-- ---------------------------------------------------------------------------
-- Documents importés (anciens devis, factures d'un autre logiciel, scans)
-- ---------------------------------------------------------------------------

create table public.imports (
  id             uuid primary key default gen_random_uuid(),
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  nom_fichier    text not null,
  chemin         text not null,
  taille         integer,
  type_mime      text,
  statut         text not null default 'a_lire' check (statut in ('a_lire', 'a_verifier', 'pret', 'converti', 'erreur')),
  -- Champs lus : { numero, date, client, adresse, objet, lignes:[…], confiance:{…} }
  champs         jsonb not null default '{}'::jsonb,
  document_id    uuid references public.documents (id) on delete set null,
  cree_par       uuid references public.membres (id) on delete set null,
  cree_le        timestamptz not null default now()
);
create index on public.imports (entreprise_id, cree_le desc);

-- Compteurs de numérotation (lus et écrits uniquement par finaliser_document).
create table prive.compteurs_documents (
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  prefixe        text not null,
  annee          integer not null,
  dernier        integer not null default 0,
  primary key (entreprise_id, prefixe, annee)
);

-- ---------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------

create trigger modifie_le before update on public.articles
  for each row execute function prive.toucher_modifie_le();
create trigger modifie_le before update on public.documents
  for each row execute function prive.toucher_modifie_le();

-- Tout ce qui est rattaché (client, devis, document, article) vient de la
-- même entreprise.
create function prive.verifier_entreprise_devis() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_autre uuid;
begin
  if tg_table_name = 'documents' then
    if new.client_id is not null then
      select entreprise_id into v_autre from public.clients where id = new.client_id;
      if v_autre is distinct from new.entreprise_id then
        raise exception 'Client d''une autre entreprise';
      end if;
    end if;
    if new.devis_id is not null then
      select entreprise_id into v_autre from public.documents where id = new.devis_id;
      if v_autre is distinct from new.entreprise_id then
        raise exception 'Devis d''une autre entreprise';
      end if;
    end if;
    if new.facture_id is not null then
      select entreprise_id into v_autre from public.documents where id = new.facture_id;
      if v_autre is distinct from new.entreprise_id then
        raise exception 'Facture d''une autre entreprise';
      end if;
    end if;
  elsif tg_table_name = 'lignes_document' then
    select entreprise_id into v_autre from public.documents where id = new.document_id;
    if v_autre is distinct from new.entreprise_id then
      raise exception 'Document d''une autre entreprise';
    end if;
    if new.article_id is not null then
      select entreprise_id into v_autre from public.articles where id = new.article_id;
      if v_autre is distinct from new.entreprise_id then
        raise exception 'Article d''une autre entreprise';
      end if;
    end if;
  elsif tg_table_name = 'imports' then
    if new.document_id is not null then
      select entreprise_id into v_autre from public.documents where id = new.document_id;
      if v_autre is distinct from new.entreprise_id then
        raise exception 'Document d''une autre entreprise';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger meme_entreprise before insert or update on public.documents
  for each row execute function prive.verifier_entreprise_devis();
create trigger meme_entreprise before insert or update on public.lignes_document
  for each row execute function prive.verifier_entreprise_devis();
create trigger meme_entreprise before insert or update on public.imports
  for each row execute function prive.verifier_entreprise_devis();

-- Une facture ou un avoir numéroté est figé.
create function prive.proteger_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.genre = 'facture' and old.numero is not null then
      raise exception 'Une facture numérotée ne se supprime pas : faites un avoir';
    end if;
    return old;
  end if;
  -- Le numéro n'est donné que par finaliser_document, et ne change plus.
  if new.numero is distinct from old.numero
     and current_setting('chantio.numerotation', true) is distinct from 'oui' then
    raise exception 'Le numéro est attribué à la validation du document';
  end if;
  if old.genre = 'facture' and old.numero is not null then
    if (to_jsonb(new) - array['statut', 'envoye_le', 'relance_le', 'relances', 'paye_le', 'modifie_le'])
       is distinct from (to_jsonb(old) - array['statut', 'envoye_le', 'relance_le', 'relances', 'paye_le', 'modifie_le']) then
      raise exception 'Une facture numérotée ne se modifie plus : faites un avoir';
    end if;
    if new.statut not in ('a_encaisser', 'payee', 'annule') then
      raise exception 'État impossible pour une facture';
    end if;
  end if;
  if new.genre <> old.genre then
    raise exception 'Un devis reste un devis, une facture reste une facture';
  end if;
  return new;
end $$;

create trigger proteger before update or delete on public.documents
  for each row execute function prive.proteger_document();

create function prive.proteger_lignes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_doc uuid := coalesce(new.document_id, old.document_id);
begin
  if exists (select 1 from public.documents d
             where d.id = v_doc and d.genre = 'facture' and d.numero is not null) then
    raise exception 'Une facture numérotée ne se modifie plus : faites un avoir';
  end if;
  if tg_op = 'UPDATE' and new.document_id <> old.document_id then
    raise exception 'Une ligne ne change pas de document';
  end if;
  return coalesce(new, old);
end $$;

create trigger proteger before insert or update or delete on public.lignes_document
  for each row execute function prive.proteger_lignes();

create trigger journal after insert or update or delete on public.documents
  for each row execute function prive.journaliser();

-- ---------------------------------------------------------------------------
-- Sécurité : réservé au bureau de l'entreprise
-- ---------------------------------------------------------------------------

alter table public.articles        enable row level security;
alter table public.documents       enable row level security;
alter table public.lignes_document enable row level security;
alter table public.imports         enable row level security;
alter table prive.compteurs_documents enable row level security;

create policy bureau on public.articles for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy bureau on public.documents for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy bureau on public.lignes_document for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());
create policy bureau on public.imports for all to authenticated
  using (entreprise_id = prive.entreprise_courante() and prive.est_bureau())
  with check (entreprise_id = prive.entreprise_courante() and prive.est_bureau());

-- ---------------------------------------------------------------------------
-- Valider un document : numéro définitif, état « envoyé » ou « à encaisser »
-- ---------------------------------------------------------------------------

create function public.finaliser_document(p_document uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_doc     public.documents;
  v_prefixe text;
  v_annee   integer;
  v_rang    integer;
  v_numero  text;
begin
  if not prive.est_bureau() then
    raise exception 'Réservé au bureau';
  end if;
  select * into v_doc from public.documents
   where id = p_document and entreprise_id = prive.entreprise_courante()
   for update;
  if not found then
    raise exception 'Document introuvable';
  end if;
  if v_doc.numero is not null then
    return v_doc.numero;
  end if;
  if not exists (select 1 from public.lignes_document l where l.document_id = p_document and not l.titre) then
    raise exception 'Ajoutez au moins une ligne avant de valider';
  end if;

  v_prefixe := case when v_doc.genre = 'devis' then 'DE'
                    when v_doc.type_facture = 'avoir' then 'AV'
                    else 'FA' end;
  v_annee := extract(year from v_doc.date_document)::integer;

  insert into prive.compteurs_documents as c (entreprise_id, prefixe, annee, dernier)
  values (v_doc.entreprise_id, v_prefixe, v_annee, 1)
  on conflict (entreprise_id, prefixe, annee) do update set dernier = c.dernier + 1
  returning dernier into v_rang;

  v_numero := v_prefixe || '-' || v_annee || '-' || lpad(v_rang::text, 4, '0');

  perform set_config('chantio.numerotation', 'oui', true);
  update public.documents
     set numero = v_numero,
         statut = case when genre = 'devis' then 'envoye' else 'a_encaisser' end,
         finalise_le = now(),
         echeance = coalesce(echeance, case when genre = 'facture' then date_document + 30 end)
   where id = p_document;
  perform set_config('chantio.numerotation', 'non', true);

  -- Le catalogue garde la trace des articles les plus utilisés.
  update public.articles a
     set utilisations = utilisations + 1
   where a.id in (select l.article_id from public.lignes_document l where l.document_id = p_document);

  return v_numero;
end $$;

revoke execute on function public.finaliser_document(uuid) from public, anon;
grant execute on function public.finaliser_document(uuid) to authenticated;
revoke execute on function prive.verifier_entreprise_devis() from public, anon;
revoke execute on function prive.proteger_document() from public, anon;
revoke execute on function prive.proteger_lignes() from public, anon;

-- ---------------------------------------------------------------------------
-- Fichiers importés : stockage privé « documents », rangé par entreprise
--   documents/<entreprise_id>/imports/<fichier>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents : lire" on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and (storage.foldername(name))[1] = prive.entreprise_courante()::text
         and prive.est_bureau());

create policy "documents : déposer" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and (storage.foldername(name))[1] = prive.entreprise_courante()::text
              and prive.est_bureau());
