-- Supabase a activé la sécurité ligne à ligne (RLS) sur prive.entreprise_active
-- au lancement de la migration 20261007000000 (« Run and enable RLS ») : on
-- l'écrit ici pour que le dépôt corresponde à la base. Sans règle, la table
-- reste fermée aux comptes ; seules les fonctions « security definer »
-- (entreprise_courante, choisir_entreprise, creer_entreprise…) la lisent et
-- l'écrivent. Sans effet si la sécurité est déjà active.
alter table prive.entreprise_active enable row level security;
