-- Fix RLS issues discovered in production checks:
-- 1) profiles had no INSERT policy for guest/auth onboarding.
-- 2) group_members SELECT policy caused infinite recursion.

-- Allow authenticated users (including anonymous auth sessions) to create their own profile row.
drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

-- Replace recursive policy with non-recursive checks.
drop policy if exists "members can read group memberships" on public.group_members;
create policy "members can read group memberships"
on public.group_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.groups g
    where g.id = group_members.group_id
      and g.created_by = auth.uid()
  )
);
