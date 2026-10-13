drop index if exists public.products_catalog_verification_idx;

alter table public.products
  drop column if exists catalog_verified_at,
  drop column if exists catalog_verification_status,
  drop column if exists catalog_verification_attempts,
  drop column if exists catalog_last_verification_error;
