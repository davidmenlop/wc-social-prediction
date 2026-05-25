-- Join request snapshot fields for admin review and WhatsApp approval flow

alter table public.join_requests
  add column if not exists requested_name text,
  add column if not exists requested_phone text,
  add column if not exists admin_notes text;

create or replace function public.prevent_join_request_phone_update()
returns trigger
language plpgsql
as $$
begin
  if old.requested_phone is not null
     and new.requested_phone is distinct from old.requested_phone then
    raise exception 'requested_phone cannot be updated once set';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_join_request_phone_update on public.join_requests;

create trigger trg_prevent_join_request_phone_update
before update on public.join_requests
for each row
execute function public.prevent_join_request_phone_update();
