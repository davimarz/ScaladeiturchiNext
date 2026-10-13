alter table public.ai_search_history
add column if not exists product_titles jsonb not null default '[]'::jsonb;
