alter table public.products
  add column if not exists haul_verified_at timestamptz,
  add column if not exists haul_verification_status text not null default 'pending',
  add column if not exists haul_verification_attempts integer not null default 0,
  add column if not exists haul_last_verification_error text;

create index if not exists products_haul_verification_idx
  on public.products (haul_verification_status, updated_at)
  where active = true and in_haul = true;

-- Old verification checked prices/images only; descriptions now count as required data.
update public.products set lambo_verification_status = 'pending', lambo_verification_attempts = 0
where active and in_offerte_lambo and lambo_verification_status = 'verified'
  and (description is null or length(trim(description)) < 20);
update public.products set bestseller_verification_status = 'pending', bestseller_verification_attempts = 0
where active and in_bestseller and bestseller_verification_status = 'verified'
  and (description is null or length(trim(description)) < 20);

-- Atomic, expiring leases coordinate admin requests and the once-a-minute scheduler.
create or replace function public.claim_catalog_job(p_catalog text, p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed boolean := false;
begin
  if p_catalog not in ('haul', 'offerte-lambo', 'bestseller', 'scheduler') or p_token is null then
    raise exception 'Invalid catalog job';
  end if;
  insert into public.site_settings as settings (key, value, updated_at)
    values ('catalog_job_' || p_catalog,
      jsonb_build_object('token', p_token, 'expires', extract(epoch from clock_timestamp() + interval '320 seconds')),
      clock_timestamp())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
    where coalesce((settings.value->>'expires')::numeric, 0) < extract(epoch from clock_timestamp())
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.release_catalog_job(p_catalog text, p_token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_catalog not in ('haul', 'offerte-lambo', 'bestseller', 'scheduler') or p_token is null then
    raise exception 'Invalid catalog job';
  end if;
  delete from public.site_settings
    where key = 'catalog_job_' || p_catalog and value->>'token' = p_token::text;
end;
$$;

revoke all on function public.claim_catalog_job(text, uuid) from public, anon, authenticated;
revoke all on function public.release_catalog_job(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_catalog_job(text, uuid) to service_role;
grant execute on function public.release_catalog_job(text, uuid) to service_role;
