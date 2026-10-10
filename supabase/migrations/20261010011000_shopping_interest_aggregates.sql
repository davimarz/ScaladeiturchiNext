create table if not exists public.shopping_interest_daily (
  event_day date not null default (now() at time zone 'Europe/Rome')::date,
  event text not null check (event in ('catalog-view','search','filter','sort','favorite','compare','share')),
  catalog text not null check (catalog in ('tutte','bestseller','offerte-lambo','haul','ai','preferiti')),
  count integer not null default 1 check(count between 0 and 100000),
  primary key(event_day,event,catalog)
);
alter table public.shopping_interest_daily enable row level security;
revoke all on public.shopping_interest_daily from anon,authenticated;
grant select,insert,update on public.shopping_interest_daily to service_role;
create or replace function public.record_shopping_interest(p_event text,p_catalog text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_event not in ('catalog-view','search','filter','sort','favorite','compare','share') or p_catalog not in ('tutte','bestseller','offerte-lambo','haul','ai','preferiti') then raise exception 'Invalid event'; end if;
  insert into public.shopping_interest_daily(event_day,event,catalog,count)
  values((now() at time zone 'Europe/Rome')::date,p_event,p_catalog,1)
  on conflict(event_day,event,catalog) do update set count=least(public.shopping_interest_daily.count+1,100000);
end;
$$;
revoke all on function public.record_shopping_interest(text,text) from public,anon,authenticated;
grant execute on function public.record_shopping_interest(text,text) to service_role;
create or replace function public.shopping_click_summary() returns table(product_id uuid,title text,clicks bigint)
language sql stable security definer set search_path=public as $$
 select p.id,p.title,count(*) from public.affiliate_clicks c join public.products p on p.id=c.product_id
 where c.created_at>=now()-interval '30 days' group by p.id,p.title order by count(*) desc,p.id limit 10;
$$;
revoke all on function public.shopping_click_summary() from public,anon,authenticated;
grant execute on function public.shopping_click_summary() to service_role;
