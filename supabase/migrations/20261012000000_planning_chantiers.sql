-- Planning des chantiers : interventions sur plusieurs jours (par demi-journée),
-- durée prévue, heures de travail de chaque membre et créneaux gardés pour les urgences.

-- Un chantier sur plusieurs jours va du jour prévu au dernier jour ; il commence
-- l'après-midi si son heure est après midi, et peut finir à midi le dernier jour.
alter table public.interventions
  add column date_fin date,
  add column fin_midi boolean not null default false,
  add column duree_prevue numeric(5, 2) check (duree_prevue > 0 and duree_prevue <= 24),
  add constraint date_fin_apres_debut check (date_fin is null or (date_prevue is not null and date_fin >= date_prevue));

create index interventions_date_fin on public.interventions (entreprise_id, date_fin) where date_fin is not null;

-- Heures par semaine (calcul de la charge) et demi-journées gardées pour les
-- urgences : 0 = lundi matin, 1 = lundi après-midi… 13 = dimanche après-midi.
alter table public.membres
  add column heures_semaine numeric(4, 1) not null default 35 check (heures_semaine >= 0 and heures_semaine <= 80),
  add column reserve_urgences smallint[] not null default '{}'
    check (reserve_urgences <@ '{0,1,2,3,4,5,6,7,8,9,10,11,12,13}'::smallint[]);
