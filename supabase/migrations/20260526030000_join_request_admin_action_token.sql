-- Enable approve/reject actions directly from WhatsApp links.
-- Each join request receives a secure action token for public decision links.

alter table public.join_requests
  add column if not exists admin_action_token uuid;

update public.join_requests
set admin_action_token = gen_random_uuid()
where admin_action_token is null;

alter table public.join_requests
  alter column admin_action_token set default gen_random_uuid();

alter table public.join_requests
  alter column admin_action_token set not null;

create unique index if not exists idx_join_requests_admin_action_token
  on public.join_requests(admin_action_token);
