begin;

do $$
begin
  if not exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception 'pg_cron must be enabled';
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
end
$$;

insert into public.events (
  event_id,
  event_type,
  visitor_id,
  session_id,
  path,
  metadata,
  occurred_at,
  received_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'page_view',
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '/',
    '{"environment":"production"}',
    statement_timestamp() - interval '30 days 1 second',
    statement_timestamp() - interval '30 days 1 second'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'page_view',
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '/',
    '{"environment":"production"}',
    statement_timestamp() - interval '30 days',
    statement_timestamp() - interval '30 days'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'page_view',
    '20000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000003',
    '/',
    '{"environment":"production"}',
    statement_timestamp() - interval '31 days',
    statement_timestamp() - interval '31 days'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'page_view',
    '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004',
    '/',
    '{"environment":"production"}',
    statement_timestamp() - interval '1 day',
    statement_timestamp() - interval '1 day'
  );

insert into public.event_daily_rollup_status (summary_date)
select distinct
  (received_at at time zone 'Asia/Shanghai')::date
from public.events
where event_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

insert into public.event_rate_limits (
  bucket_key,
  window_started_at,
  request_count
)
values
  (repeat('a', 64), statement_timestamp() - interval '1 day 1 second', 1),
  (repeat('b', 64), statement_timestamp() - interval '1 day', 120),
  (repeat('c', 64), statement_timestamp() - interval '1 minute', 2);

select public.cleanup_summarized_events();
select public.cleanup_expired_event_rate_limits();

do $$
begin
  if exists (
    select 1
    from public.events
    where event_id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'summarized event outside retention must be deleted';
  end if;

  if (
    select count(*)
    from public.events
    where event_id in (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004'
    )
  ) <> 3 then
    raise exception 'boundary, unsummarized, and active events must be retained';
  end if;

  if exists (
    select 1
    from public.event_rate_limits
    where bucket_key = repeat('a', 64)
  ) then
    raise exception 'expired rate-limit bucket must be deleted';
  end if;

  if (
    select count(*)
    from public.event_rate_limits
    where bucket_key in (repeat('b', 64), repeat('c', 64))
  ) <> 2 then
    raise exception 'boundary and active rate-limit buckets must be retained';
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

rollback;
