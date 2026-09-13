create extension if not exists pg_cron;

create table public.event_daily_rollup_status (
  summary_date date primary key,
  completed_at timestamptz not null default statement_timestamp(),
  check (
    summary_date < (completed_at at time zone 'Asia/Shanghai')::date
  )
);

alter table public.event_daily_rollup_status enable row level security;

revoke all on public.event_daily_rollup_status
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

create or replace function public.cleanup_summarized_events()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count bigint;
begin
  delete from public.events as e
  using public.event_daily_rollup_status as rollup
  where e.received_at < statement_timestamp() - interval '30 days'
    and rollup.summary_date =
      (e.received_at at time zone 'Asia/Shanghai')::date;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

create or replace function public.cleanup_expired_event_rate_limits()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count bigint;
begin
  delete from public.event_rate_limits
  where window_started_at < statement_timestamp() - interval '1 day';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

create or replace function public.run_event_retention_maintenance()
returns table (
  deleted_events bigint,
  deleted_rate_limit_buckets bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  deleted_events := public.cleanup_summarized_events();
  deleted_rate_limit_buckets := public.cleanup_expired_event_rate_limits();
  return next;
end
$$;

revoke all on function public.cleanup_summarized_events()
  from public, anon, authenticated, moyufun_web, moyufun_publisher;
revoke all on function public.cleanup_expired_event_rate_limits()
  from public, anon, authenticated, moyufun_web, moyufun_publisher;
revoke all on function public.run_event_retention_maintenance()
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

do $$
begin
  if coalesce(current_setting('cron.timezone', true), '') not in ('GMT', 'UTC') then
    raise exception 'moyufun cron schedule requires cron.timezone GMT or UTC';
  end if;
end
$$;

select cron.schedule(
  'moyufun-daily-event-maintenance',
  '30 19 * * *',
  'select public.run_event_retention_maintenance();'
);

do $$
begin
  if exists (
    select 1
    from (
      values
        ('anon'),
        ('authenticated'),
        ('moyufun_web'),
        ('moyufun_publisher')
    ) as role_names(role_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      role_name,
      'public.event_daily_rollup_status',
      privilege_name
    )
  ) then
    raise exception 'application roles must not access rollup status';
  end if;

  if exists (
    select 1
    from (
      values
        ('anon'),
        ('authenticated'),
        ('moyufun_web'),
        ('moyufun_publisher')
    ) as role_names(role_name)
    cross join (
      values
        ('public.cleanup_summarized_events()'),
        ('public.cleanup_expired_event_rate_limits()'),
        ('public.run_event_retention_maintenance()')
    ) as function_names(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then
    raise exception 'application roles must not execute event maintenance';
  end if;

  if (
    select count(*)
    from cron.job
    where jobname = 'moyufun-daily-event-maintenance'
      and schedule = '30 19 * * *'
      and command = 'select public.run_event_retention_maintenance();'
      and active
  ) <> 1 then
    raise exception 'event maintenance must have one active daily job';
  end if;
end
$$;
