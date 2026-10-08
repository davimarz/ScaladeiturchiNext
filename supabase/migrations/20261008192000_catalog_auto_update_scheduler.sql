create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'QiFOmP6PWW9ZOvu9dxQlcuLAIiQ-v0IO5DcArHmu1XczJgxC5AjPkbH1yA7eIQRV',
  'catalog_cron_secret',
  'Server-to-server secret for daily Amazon catalog scheduler'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'catalog_cron_secret'
);

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
