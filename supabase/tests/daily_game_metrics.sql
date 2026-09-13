begin;

insert into public.games (
  id,
  slug,
  name,
  short_description,
  description,
  cover,
  is_listed
)
values (
  '41000000-0000-4000-8000-000000000001',
  'metrics-fixture',
  'Metrics fixture',
  'Metrics fixture',
  'Metrics fixture',
  '{"symbol":"M","eyebrow":"TEST","accent":"#000000","accentSecondary":"#ffffff"}',
  false
);

insert into public.game_versions (id, game_id, version_key, entry_path)
values
  (
    '42000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'v1',
    '/games/metrics-fixture/v1/index.html'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001',
    'v2',
    '/games/metrics-fixture/v2/index.html'
  );

do $$
declare
  summary_date date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 2;
  day_start timestamptz :=
    summary_date::timestamp at time zone 'Asia/Shanghai';
begin
  insert into public.events (
    event_id,
    event_type,
    visitor_id,
    session_id,
    game_id,
    game_version_id,
    load_id,
    play_id,
    path,
    duration_ms,
    active_seconds,
    metadata,
    occurred_at,
    received_at
  )
  select
    event_id,
    event_type,
    visitor_id,
    session_id,
    game_id,
    game_version_id,
    load_id,
    play_id,
    path,
    duration_ms,
    active_seconds,
    metadata,
    received_at,
    received_at
  from (
    values
      -- Three production home sessions; the duplicate must not count twice.
      ('51000000-0000-4000-8000-000000000001'::uuid, 'page_view', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '1 hour'),
      ('51000000-0000-4000-8000-000000000002'::uuid, 'page_view', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '2 hours'),
      ('51000000-0000-4000-8000-000000000003'::uuid, 'page_view', '61000000-0000-4000-8000-000000000002'::uuid, '71000000-0000-4000-8000-000000000002'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '3 hours'),
      ('51000000-0000-4000-8000-000000000004'::uuid, 'page_view', '61000000-0000-4000-8000-000000000003'::uuid, '71000000-0000-4000-8000-000000000003'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '4 hours'),
      -- These two are excluded by the Shanghai boundary and environment.
      ('51000000-0000-4000-8000-000000000005'::uuid, 'page_view', '61000000-0000-4000-8000-000000000004'::uuid, '71000000-0000-4000-8000-000000000004'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start - interval '1 millisecond'),
      ('51000000-0000-4000-8000-000000000006'::uuid, 'page_view', '61000000-0000-4000-8000-000000000005'::uuid, '71000000-0000-4000-8000-000000000005'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, '/', null::integer, null::smallint, '{"environment":"preview"}'::jsonb, day_start + interval '5 hours'),

      -- v1 has two detail sessions and one distinct start session across three plays.
      ('52000000-0000-4000-8000-000000000001'::uuid, 'game_detail_view', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, '/games/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '6 hours'),
      ('52000000-0000-4000-8000-000000000002'::uuid, 'game_detail_view', '61000000-0000-4000-8000-000000000002'::uuid, '71000000-0000-4000-8000-000000000002'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, '/games/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '7 hours'),
      ('52000000-0000-4000-8000-000000000003'::uuid, 'game_detail_view', '61000000-0000-4000-8000-000000000002'::uuid, '71000000-0000-4000-8000-000000000002'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, '/games/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '8 hours'),
      ('53000000-0000-4000-8000-000000000001'::uuid, 'game_start', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, '81000000-0000-4000-8000-000000000001'::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '9 hours'),
      ('53000000-0000-4000-8000-000000000002'::uuid, 'game_start', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, '81000000-0000-4000-8000-000000000002'::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '10 hours'),
      ('53000000-0000-4000-8000-000000000003'::uuid, 'game_start', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, null::uuid, '81000000-0000-4000-8000-000000000003'::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '11 hours'),

      -- Four attempts, three ready loads, and continuous P75 = 300ms.
      ('54000000-0000-4000-8000-000000000001'::uuid, 'game_load', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000001'::uuid, null::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '12 hours'),
      ('54000000-0000-4000-8000-000000000002'::uuid, 'game_load', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000002'::uuid, null::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '12 hours 1 minute'),
      ('54000000-0000-4000-8000-000000000003'::uuid, 'game_load', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000003'::uuid, null::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '12 hours 2 minutes'),
      ('54000000-0000-4000-8000-000000000004'::uuid, 'game_load', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000004'::uuid, null::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '12 hours 3 minutes'),
      ('55000000-0000-4000-8000-000000000001'::uuid, 'game_ready', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000001'::uuid, null::uuid, '/play/metrics-fixture', 100, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '13 hours'),
      ('55000000-0000-4000-8000-000000000002'::uuid, 'game_ready', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000002'::uuid, null::uuid, '/play/metrics-fixture', 200, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '14 hours'),
      ('55000000-0000-4000-8000-000000000003'::uuid, 'game_ready', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000003'::uuid, null::uuid, '/play/metrics-fixture', 400, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '15 hours'),
      ('55000000-0000-4000-8000-000000000004'::uuid, 'game_ready', '61000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000001'::uuid, '91000000-0000-4000-8000-000000000001'::uuid, null::uuid, '/play/metrics-fixture', 10000, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '15 hours 30 minutes'),

      -- v2 proves version filtering and repeats the global home denominator.
      ('56000000-0000-4000-8000-000000000001'::uuid, 'game_detail_view', '61000000-0000-4000-8000-000000000003'::uuid, '71000000-0000-4000-8000-000000000003'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000002'::uuid, null::uuid, null::uuid, '/games/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '16 hours'),
      ('56000000-0000-4000-8000-000000000002'::uuid, 'game_start', '61000000-0000-4000-8000-000000000003'::uuid, '71000000-0000-4000-8000-000000000003'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '42000000-0000-4000-8000-000000000002'::uuid, null::uuid, '81000000-0000-4000-8000-000000000004'::uuid, '/play/metrics-fixture', null::integer, null::smallint, '{"environment":"production"}'::jsonb, day_start + interval '17 hours')
  ) as fixture(
    event_id,
    event_type,
    visitor_id,
    session_id,
    game_id,
    game_version_id,
    load_id,
    play_id,
    path,
    duration_ms,
    active_seconds,
    metadata,
    received_at
  );

  -- Exactly 300 seconds, 270 seconds, and 300 seconds split across midnight.
  insert into public.events (
    event_id,
    event_type,
    visitor_id,
    session_id,
    game_id,
    game_version_id,
    play_id,
    path,
    active_seconds,
    metadata,
    occurred_at,
    received_at
  )
  select
    md5('effective-one-' || heartbeat)::uuid,
    'heartbeat',
    '61000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '/play/metrics-fixture',
    30,
    '{"environment":"production"}',
    day_start + interval '18 hours' + heartbeat * interval '30 seconds',
    day_start + interval '18 hours' + heartbeat * interval '30 seconds'
  from generate_series(1, 10) as heartbeat;

  insert into public.events (
    event_id, event_type, visitor_id, session_id, game_id, game_version_id,
    play_id, path, active_seconds, metadata, occurred_at, received_at
  )
  select
    md5('ineffective-' || heartbeat)::uuid,
    'heartbeat',
    '61000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000002',
    '/play/metrics-fixture',
    30,
    '{"environment":"production"}',
    day_start + interval '19 hours' + heartbeat * interval '30 seconds',
    day_start + interval '19 hours' + heartbeat * interval '30 seconds'
  from generate_series(1, 9) as heartbeat;

  insert into public.events (
    event_id, event_type, visitor_id, session_id, game_id, game_version_id,
    play_id, path, active_seconds, metadata, occurred_at, received_at
  )
  select
    md5('cross-midnight-' || heartbeat)::uuid,
    'heartbeat',
    '61000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000003',
    '/play/metrics-fixture',
    30,
    '{"environment":"production"}',
    case when heartbeat <= 5
      then day_start + interval '23 hours 55 minutes' + heartbeat * interval '30 seconds'
      else day_start + interval '1 day 1 hour' + heartbeat * interval '30 seconds'
    end,
    case when heartbeat <= 5
      then day_start + interval '23 hours 55 minutes' + heartbeat * interval '30 seconds'
      else day_start + interval '1 day 1 hour' + heartbeat * interval '30 seconds'
    end
  from generate_series(1, 10) as heartbeat;

  perform public.refresh_daily_game_metrics(summary_date);
  perform public.refresh_daily_game_metrics(summary_date);
end
$$;

do $$
declare
  expected_date date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 2;
  metric public.daily_game_metrics%rowtype;
begin
  select * into strict metric
  from public.daily_game_metrics
  where daily_game_metrics.summary_date = expected_date
    and game_id = '41000000-0000-4000-8000-000000000001'
    and game_version_id = '42000000-0000-4000-8000-000000000001';

  if row(
    metric.home_sessions,
    metric.detail_sessions,
    metric.started_sessions,
    metric.load_attempts,
    metric.ready_loads,
    metric.load_duration_p75_ms,
    metric.started_plays,
    metric.effective_plays
  ) is distinct from row(3, 2, 1, 4, 3, 300, 3, 2) then
    raise exception 'unexpected v1 metric row: %', row_to_json(metric);
  end if;

  if (
    select count(*)
    from public.get_daily_game_metrics(
      expected_date,
      expected_date,
      '41000000-0000-4000-8000-000000000001',
      '42000000-0000-4000-8000-000000000002'
    )
  ) <> 1 then
    raise exception 'game and version filters must return only v2';
  end if;

  if not exists (
    select 1
    from public.event_daily_rollup_status
    where event_daily_rollup_status.summary_date = expected_date
  ) then
    raise exception 'successful refresh must mark the date complete';
  end if;
end
$$;

do $$
declare
  too_recent date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 1;
begin
  begin
    perform public.refresh_daily_game_metrics(too_recent);
    raise exception 'too-recent refresh unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  if exists (
    select 1 from public.event_daily_rollup_status
    where summary_date = too_recent
  ) then
    raise exception 'too-recent refresh must not mark completion';
  end if;
end
$$;

create function pg_temp.reject_failed_metric_refresh()
returns trigger
language plpgsql
as $$
begin
  if new.summary_date =
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 31 then
    raise exception 'forced metric refresh failure';
  end if;
  return new;
end
$$;

create trigger reject_failed_metric_refresh
before insert or update on public.daily_game_metrics
for each row execute function pg_temp.reject_failed_metric_refresh();

do $$
declare
  failed_date date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 31;
begin
  insert into public.events (
    event_id, event_type, visitor_id, session_id, game_id, game_version_id,
    path, metadata, occurred_at, received_at
  ) values (
    '57000000-0000-4000-8000-000000000001',
    'game_detail_view',
    '61000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '/games/metrics-fixture',
    '{"environment":"production"}',
    failed_date::timestamp at time zone 'Asia/Shanghai',
    failed_date::timestamp at time zone 'Asia/Shanghai'
  );

  begin
    perform public.refresh_daily_game_metrics(failed_date);
    raise exception 'forced refresh unexpectedly succeeded';
  exception
    when others then
      if sqlerrm <> 'forced metric refresh failure' then
        raise;
      end if;
  end;

  if exists (
    select 1 from public.event_daily_rollup_status
    where summary_date = failed_date
  ) then
    raise exception 'failed refresh must not mark completion';
  end if;

  perform public.cleanup_summarized_events();

  if not exists (
    select 1 from public.events
    where event_id = '57000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'failed refresh must not make raw events deletable';
  end if;
end
$$;

drop trigger reject_failed_metric_refresh on public.daily_game_metrics;

select public.run_event_retention_maintenance();

do $$
declare
  recovered_date date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 31;
begin
  if not exists (
    select 1 from public.event_daily_rollup_status
    where summary_date = recovered_date
  ) then
    raise exception 'maintenance must backfill a missed finalizable date';
  end if;

  if exists (
    select 1 from public.events
    where event_id = '57000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'recovered old raw event must be deleted after summary';
  end if;

  perform public.refresh_daily_game_metrics(recovered_date);

  if not exists (
    select 1 from public.daily_game_metrics
    where summary_date = recovered_date
      and game_id = '41000000-0000-4000-8000-000000000001'
      and game_version_id = '42000000-0000-4000-8000-000000000001'
      and detail_sessions = 1
  ) then
    raise exception 'refresh after raw cleanup must preserve long-term metrics';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from (
      values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher')
    ) as roles(role_name)
    cross join (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      role_name,
      'public.daily_game_metrics',
      privilege_name
    )
  ) then
    raise exception 'application roles must not access daily metrics directly';
  end if;

  if not has_function_privilege(
    'moyufun_web',
    'public.get_daily_game_metrics(date,date,uuid,uuid)',
    'execute'
  ) then
    raise exception 'web role must execute the metrics reader';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_publisher')) as roles(role_name)
    where has_function_privilege(
      role_name,
      'public.get_daily_game_metrics(date,date,uuid,uuid)',
      'execute'
    )
  ) then
    raise exception 'other application roles must not read metrics';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher')) as roles(role_name)
    where has_function_privilege(
      role_name,
      'public.refresh_daily_game_metrics(date)',
      'execute'
    )
  ) then
    raise exception 'application roles must not refresh metrics';
  end if;
end
$$;

rollback;
