-- World Cup Social Prediction MVP schema
-- Scope: groups, members, matches, predictions, rankings and winner notifications

create extension if not exists pgcrypto;

create type public.group_privacy as enum ('open', 'approval_required');
create type public.prediction_status as enum ('pending', 'locked', 'decided');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  privacy public.group_privacy not null default 'open',
  registration_deadline timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  home_goals smallint,
  away_goals smallint,
  ended boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (ended = false and home_goals is null and away_goals is null)
    or (ended = true and home_goals is not null and away_goals is not null)
  )
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  home_score smallint not null check (home_score >= 0),
  away_score smallint not null check (away_score >= 0),
  status public.prediction_status not null default 'pending',
  points smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create index if not exists idx_group_members_user on public.group_members(user_id);
create index if not exists idx_matches_group_kickoff on public.matches(group_id, kickoff_at);
create index if not exists idx_predictions_group_user on public.predictions(group_id, user_id);
create index if not exists idx_predictions_match on public.predictions(match_id);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.join_requests enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

create policy "profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "members can read their groups"
on public.groups for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
  )
);

create policy "authenticated users can create groups"
on public.groups for insert
to authenticated
with check (created_by = auth.uid());

create policy "members can read group memberships"
on public.group_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = group_members.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "users can join open groups"
on public.group_members for insert
to authenticated
with check (user_id = auth.uid());

create policy "members can read matches in their groups"
on public.matches for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = matches.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "members can read predictions in their groups"
on public.predictions for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.group_id = predictions.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "users can upsert own predictions"
on public.predictions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_members gm
    where gm.group_id = predictions.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "users can update own pending predictions"
on public.predictions for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid());
