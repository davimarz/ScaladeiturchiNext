create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Secret provisioning is intentionally kept outside the repository.
-- The scheduler reads catalog_cron_secret from Supabase Vault at runtime.

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'catalog-auto-update-check'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'catalog-auto-update-check',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://scaladeiturchinext.vercel.app/api/cron/catalogs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'catalog_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $cron$
);
