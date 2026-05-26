-- Allow the same external fixture to exist across multiple groups.
-- Previous unique index on external_fixture_id was global and blocked multi-group usage.

alter table if exists public.matches
  add column if not exists external_fixture_id bigint;

drop index if exists idx_matches_external_fixture_id;

create unique index if not exists idx_matches_group_external_fixture_id
  on public.matches(group_id, external_fixture_id)
  where external_fixture_id is not null;
