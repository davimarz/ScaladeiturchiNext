create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;
create table if not exists app_private.admin_login_limits (
  client_key text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table app_private.admin_login_limits enable row level security;
revoke all on app_private.admin_login_limits from public, anon, authenticated;
grant select, insert, update, delete on app_private.admin_login_limits to service_role;

create or replace function public.consume_admin_login_attempt(p_client_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  global_attempts integer;
  client_attempts integer;
  slot timestamptz := pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp())
    + pg_catalog.floor(extract(minute from pg_catalog.clock_timestamp()) / 15) * interval '15 minutes';
begin
  if p_client_key is null or p_client_key !~ '^(shared|[0-9a-f]{64})$' then
    raise exception 'Invalid client key';
  end if;
  delete from app_private.admin_login_limits where window_start < slot - interval '1 day';
  insert into app_private.admin_login_limits as limits values ('global', slot, 1)
  on conflict (client_key) do update set window_start = excluded.window_start,
    attempts = case when limits.window_start = excluded.window_start then least(limits.attempts + 1, 201) else 1 end
  returning attempts into global_attempts;
  if global_attempts > 200 then return false; end if;
  insert into app_private.admin_login_limits as limits values (p_client_key, slot, 1)
  on conflict (client_key) do update set window_start = excluded.window_start,
    attempts = case when limits.window_start = excluded.window_start then least(limits.attempts + 1, 11) else 1 end
  returning attempts into client_attempts;
  return client_attempts <= 10;
end;
$$;
revoke all on function public.consume_admin_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_attempt(text) to service_role;
