-- API-Football integration fields for match result sync

alter table public.matches
  add column if not exists external_fixture_id bigint,
  add column if not exists league_id integer,
  add column if not exists season integer,
  add column if not exists status_short text,
  add column if not exists status_long text,
  add column if not exists api_sync_at timestamptz;

create unique index if not exists idx_matches_external_fixture_id
  on public.matches(external_fixture_id)
  where external_fixture_id is not null;

create index if not exists idx_matches_league_season_kickoff
  on public.matches(league_id, season, kickoff_at);
