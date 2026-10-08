alter table public.products
  add column if not exists lambo_verified_at timestamptz,
  add column if not exists lambo_verification_status text not null default 'pending',
  add column if not exists lambo_verification_attempts integer not null default 0,
  add column if not exists lambo_last_verification_error text,
  add column if not exists bestseller_verified_at timestamptz,
  add column if not exists bestseller_verification_status text not null default 'pending',
  add column if not exists bestseller_verification_attempts integer not null default 0,
  add column if not exists bestseller_last_verification_error text;

create index if not exists products_lambo_verification_idx
  on public.products (lambo_verification_status, updated_at)
  where active = true and in_offerte_lambo = true;

create index if not exists products_bestseller_verification_idx
  on public.products (bestseller_verification_status, updated_at)
  where active = true and in_bestseller = true;
