-- Break RLS recursion between groups <-> group_members.
--
-- Root cause:
-- - groups SELECT policy checks membership via group_members
-- - group_members SELECT policy checks ownership via groups
-- This creates a circular policy evaluation path and Postgres raises
-- "infinite recursion detected in policy for relation \"groups\"".

-- Keep groups readable only by creators or members.
drop policy if exists "members can read their groups" on public.groups;
create policy "members can read their groups"
on public.groups for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.group_members gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
  )
);

-- Make group_members policy non-recursive (self-only).
-- This avoids querying groups while groups policy is being evaluated.
drop policy if exists "members can read group memberships" on public.group_members;
create policy "members can read group memberships"
on public.group_members for select
to authenticated
using (user_id = auth.uid());
