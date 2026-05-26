-- Development reset script: removes app data so you can test from scratch.
-- Run in Supabase SQL Editor. Do NOT use in production.

begin;

-- Clear gameplay and group data.
truncate table public.predictions restart identity cascade;
truncate table public.matches restart identity cascade;
truncate table public.join_requests restart identity cascade;
truncate table public.group_members restart identity cascade;
truncate table public.groups restart identity cascade;

-- Clear local profile records used by the app.
truncate table public.profiles restart identity cascade;

-- Optional: clear anonymous auth users created by signInAnonymously.
-- Uncomment if you also want to fully reset anonymous sessions.
-- delete from auth.users where is_anonymous = true;

commit;
