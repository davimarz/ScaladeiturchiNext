alter table public.products
  add column if not exists description text,
  add column if not exists catalog_verified_at timestamptz,
  add column if not exists catalog_verification_status text not null default 'pending',
  add column if not exists catalog_verification_attempts integer not null default 0,
  add column if not exists catalog_last_verification_error text;

create index if not exists products_catalog_verification_idx
  on public.products (catalog_verification_status, updated_at)
  where active = true;
