-- Server-side throttling for public login and client-tracking endpoints.
create table if not exists public.public_api_rate_limit_buckets (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  bucket_scope text not null check (bucket_scope in (
    'client_lookup_ip','client_lookup_phone','login_ip','login_identifier'
  )),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists public_api_rate_limit_buckets_updated_at_idx
  on public.public_api_rate_limit_buckets (updated_at);
alter table public.public_api_rate_limit_buckets enable row level security;
revoke all on table public.public_api_rate_limit_buckets from public, anon, authenticated;
grant all on table public.public_api_rate_limit_buckets to service_role;

create or replace function public.consume_public_api_rate_limit(
  p_bucket_hash text, p_bucket_scope text, p_max_attempts integer, p_window_seconds integer
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_attempts integer;
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$'
     or p_bucket_scope not in ('client_lookup_ip','client_lookup_phone','login_ip','login_identifier')
     or p_max_attempts < 1 or p_max_attempts > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then return false; end if;
  insert into public.public_api_rate_limit_buckets
    (bucket_hash, bucket_scope, window_started_at, attempts, updated_at)
  values (p_bucket_hash, p_bucket_scope, now(), 1, now())
  on conflict (bucket_hash) do update set
    bucket_scope = excluded.bucket_scope,
    window_started_at = case
      when public.public_api_rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then now() else public.public_api_rate_limit_buckets.window_started_at end,
    attempts = case
      when public.public_api_rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
      then 1 else public.public_api_rate_limit_buckets.attempts + 1 end,
    updated_at = now()
  returning attempts into v_attempts;
  delete from public.public_api_rate_limit_buckets where updated_at < now() - interval '2 days';
  return v_attempts <= p_max_attempts;
end;
$$;
revoke all on function public.consume_public_api_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_public_api_rate_limit(text,text,integer,integer) to service_role;
