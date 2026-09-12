create table public.event_rate_limits (
  bucket_key text primary key
    check (bucket_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null
    check (request_count between 1 and 120)
);

alter table public.event_rate_limits enable row level security;

revoke all on public.event_rate_limits
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

create or replace function public.consume_event_rate_limit(p_bucket_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_allowed boolean;
begin
  if p_bucket_key !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.event_rate_limits (
    bucket_key,
    window_started_at,
    request_count
  )
  values (
    p_bucket_key,
    statement_timestamp(),
    1
  )
  on conflict (bucket_key) do update set
    window_started_at = case
      when event_rate_limits.window_started_at
        <= statement_timestamp() - interval '1 minute'
      then statement_timestamp()
      else event_rate_limits.window_started_at
    end,
    request_count = case
      when event_rate_limits.window_started_at
        <= statement_timestamp() - interval '1 minute'
      then 1
      else event_rate_limits.request_count + 1
    end
  where
    event_rate_limits.window_started_at
      <= statement_timestamp() - interval '1 minute'
    or event_rate_limits.request_count < 120
  returning true into was_allowed;

  return coalesce(was_allowed, false);
end
$$;

revoke all on function public.consume_event_rate_limit(text)
  from public, anon, authenticated, moyufun_publisher;
grant execute on function public.consume_event_rate_limit(text)
  to moyufun_web;
