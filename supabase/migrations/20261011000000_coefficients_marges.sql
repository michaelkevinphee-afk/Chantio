-- Coefficients et marges des devis, métrés, bibliothèque d'ouvrages, DPGF.
--
-- 1. Chaque ligne peut porter son coût, jamais imprimé : fourniture achetée
--    et temps de pose par unité. Son prix est alors calculé :
--    (fourniture + pose × coût horaire) × coefficient. Le coefficient est
--    celui de la ligne, sinon celui du document, sinon celui des réglages
--    (entreprises.facturation : cout_horaire, frais_generaux, coefficient,
--    marge_min, chute). Une ligne sans prix calculé garde son prix saisi.
-- 2. Le métré qui donne la quantité (longueur × largeur × nombre, moins
--    les ouvertures, plus la chute) et le n° de poste du cadre de réponse
--    du client (DPGF) sont gardés avec la ligne.
-- 3. Les articles du catalogue ont un temps de pose : un ouvrage est une
--    fourniture et sa pose.
--
-- Rien n'est supprimé ni modifié dans les données existantes.

alter table public.documents
  add column coefficient numeric(6, 3) check (coefficient is null or coefficient between 0.5 and 10);

alter table public.lignes_document
  add column achat         numeric(12, 2) check (achat is null or achat >= 0),
  add column heures        numeric(10, 3) check (heures is null or heures >= 0),
  add column coefficient   numeric(6, 3) check (coefficient is null or coefficient between 0.5 and 10),
  add column prix_calcule  boolean not null default false,
  add column metre         jsonb,
  add column reference     text check (reference is null or length(reference) <= 40);

alter table public.articles
  add column heures numeric(10, 3) not null default 0 check (heures >= 0);
