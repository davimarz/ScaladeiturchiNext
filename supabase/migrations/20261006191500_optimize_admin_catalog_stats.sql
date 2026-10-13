create or replace function public.admin_catalog_stats()
returns table (
  haul_count bigint,
  lambo_count bigint,
  bestseller_count bigint,
  haul_last_price timestamptz,
  lambo_last_price timestamptz,
  bestseller_last_price timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where active = true and in_haul = true),
    count(*) filter (where active = true and in_offerte_lambo = true),
    count(*) filter (where active = true and in_bestseller = true),
    max(price_verified_at) filter (where active = true and in_haul = true and price_verified_at is not null),
    max(price_verified_at) filter (where active = true and in_offerte_lambo = true and price_verified_at is not null),
    max(price_verified_at) filter (where active = true and in_bestseller = true and price_verified_at is not null)
  from public.products;
$$;

revoke all on function public.admin_catalog_stats() from public, anon, authenticated;
grant execute on function public.admin_catalog_stats() to service_role;
