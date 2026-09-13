create table public.daily_game_metrics (
  summary_date date not null,
  game_id uuid not null,
  game_version_id uuid not null,
  home_sessions bigint not null check (home_sessions >= 0),
  detail_sessions bigint not null check (detail_sessions >= 0),
  started_sessions bigint not null check (started_sessions >= 0),
  load_attempts bigint not null check (load_attempts >= 0),
  ready_loads bigint not null check (ready_loads >= 0),
  load_duration_p75_ms integer
    check (load_duration_p75_ms is null or load_duration_p75_ms >= 0),
  started_plays bigint not null check (started_plays >= 0),
  effective_plays bigint not null check (effective_plays >= 0),
  computed_at timestamptz not null default statement_timestamp(),
  primary key (summary_date, game_id, game_version_id),
  foreign key (game_id, game_version_id)
    references public.game_versions (game_id, id)
    on update restrict
    on delete restrict
);

alter table public.daily_game_metrics enable row level security;

revoke all on public.daily_game_metrics
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

create or replace function public.refresh_daily_game_metrics(
  p_summary_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_heartbeat_end timestamptz;
begin
  if p_summary_date is null then
    raise not_null_violation using message = 'summary date is required';
  end if;

  if p_summary_date >
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 2 then
    raise check_violation using
      message = 'summary date is not finalizable';
  end if;

  v_day_start := p_summary_date::timestamp at time zone 'Asia/Shanghai';
  v_day_end :=
    (p_summary_date + 1)::timestamp at time zone 'Asia/Shanghai';
  v_heartbeat_end :=
    (p_summary_date + 2)::timestamp at time zone 'Asia/Shanghai';

  if v_day_start < statement_timestamp() - interval '30 days'
    and exists (
      select 1
      from public.event_daily_rollup_status as status
      where status.summary_date = p_summary_date
    ) then
    return;
  end if;

  delete from public.daily_game_metrics
  where summary_date = p_summary_date;

  insert into public.daily_game_metrics (
    summary_date,
    game_id,
    game_version_id,
    home_sessions,
    detail_sessions,
    started_sessions,
    load_attempts,
    ready_loads,
    load_duration_p75_ms,
    started_plays,
    effective_plays,
    computed_at
  )
  with production_day as (
    select e.*
    from public.events as e
    where e.received_at >= v_day_start
      and e.received_at < v_day_end
      and e.metadata ->> 'environment' = 'production'
  ),
  dimensions as (
    select distinct e.game_id, e.game_version_id
    from production_day as e
    where e.event_type in (
      'game_detail_view',
      'game_load',
      'game_ready',
      'game_start'
    )
  ),
  home as (
    select count(distinct e.session_id) as sessions
    from production_day as e
    where e.event_type = 'page_view'
  ),
  daily_counts as (
    select
      e.game_id,
      e.game_version_id,
      count(distinct e.session_id)
        filter (where e.event_type = 'game_detail_view') as detail_sessions,
      count(distinct e.session_id)
        filter (where e.event_type = 'game_start') as started_sessions,
      count(distinct e.load_id)
        filter (where e.event_type = 'game_load') as load_attempts,
      count(distinct e.load_id)
        filter (where e.event_type = 'game_ready') as ready_loads,
      count(distinct e.play_id)
        filter (where e.event_type = 'game_start') as started_plays
    from production_day as e
    where e.game_id is not null
      and e.game_version_id is not null
    group by e.game_id, e.game_version_id
  ),
  started_play_keys as (
    select distinct
      e.game_id,
      e.game_version_id,
      e.play_id
    from production_day as e
    where e.event_type = 'game_start'
  ),
  ready_stats as (
    select
      samples.game_id,
      samples.game_version_id,
      round(
        percentile_cont(0.75) within group (order by samples.duration_ms)
      )::integer as load_duration_p75_ms
    from (
      select distinct on (e.game_id, e.game_version_id, e.load_id)
        e.game_id,
        e.game_version_id,
        e.load_id,
        e.duration_ms
      from production_day as e
      where e.event_type = 'game_ready'
      order by
        e.game_id,
        e.game_version_id,
        e.load_id,
        e.received_at,
        e.id
    ) as samples
    group by samples.game_id, samples.game_version_id
  ),
  play_activity as (
    select
      started.game_id,
      started.game_version_id,
      started.play_id,
      coalesce(sum(heartbeat.active_seconds), 0) as active_seconds
    from started_play_keys as started
    left join public.events as heartbeat
      on heartbeat.event_type = 'heartbeat'
      and heartbeat.metadata ->> 'environment' = 'production'
      and heartbeat.game_id = started.game_id
      and heartbeat.game_version_id = started.game_version_id
      and heartbeat.play_id = started.play_id
      and heartbeat.received_at >= v_day_start
      and heartbeat.received_at < v_heartbeat_end
    group by started.game_id, started.game_version_id, started.play_id
  ),
  effective_counts as (
    select
      activity.game_id,
      activity.game_version_id,
      count(*) filter (where activity.active_seconds >= 300) as effective_plays
    from play_activity as activity
    group by activity.game_id, activity.game_version_id
  )
  select
    p_summary_date,
    dimensions.game_id,
    dimensions.game_version_id,
    home.sessions,
    coalesce(daily_counts.detail_sessions, 0),
    coalesce(daily_counts.started_sessions, 0),
    coalesce(daily_counts.load_attempts, 0),
    coalesce(daily_counts.ready_loads, 0),
    ready_stats.load_duration_p75_ms,
    coalesce(daily_counts.started_plays, 0),
    coalesce(effective_counts.effective_plays, 0),
    statement_timestamp()
  from dimensions
  cross join home
  left join daily_counts
    on daily_counts.game_id = dimensions.game_id
    and daily_counts.game_version_id = dimensions.game_version_id
  left join effective_counts
    on effective_counts.game_id = dimensions.game_id
    and effective_counts.game_version_id = dimensions.game_version_id
  left join ready_stats
    on ready_stats.game_id = dimensions.game_id
    and ready_stats.game_version_id = dimensions.game_version_id
  on conflict (summary_date, game_id, game_version_id) do update set
    home_sessions = excluded.home_sessions,
    detail_sessions = excluded.detail_sessions,
    started_sessions = excluded.started_sessions,
    load_attempts = excluded.load_attempts,
    ready_loads = excluded.ready_loads,
    load_duration_p75_ms = excluded.load_duration_p75_ms,
    started_plays = excluded.started_plays,
    effective_plays = excluded.effective_plays,
    computed_at = excluded.computed_at;

  insert into public.event_daily_rollup_status (summary_date, completed_at)
  values (p_summary_date, statement_timestamp())
  on conflict (summary_date) do update set
    completed_at = excluded.completed_at;
end
$$;

revoke all on function public.refresh_daily_game_metrics(date)
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

create or replace function public.get_daily_game_metrics(
  p_from date default null,
  p_to date default null,
  p_game_id uuid default null,
  p_game_version_id uuid default null
)
returns table (
  summary_date date,
  game_id uuid,
  game_version_id uuid,
  game_slug text,
  game_name text,
  version_key text,
  home_sessions bigint,
  detail_sessions bigint,
  started_sessions bigint,
  load_attempts bigint,
  ready_loads bigint,
  load_duration_p75_ms integer,
  started_plays bigint,
  effective_plays bigint,
  computed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_latest date;
  v_from date;
  v_to date;
begin
  select max(metrics.summary_date)
  into v_latest
  from public.daily_game_metrics as metrics;

  v_to := coalesce(p_to, v_latest);
  v_from := coalesce(p_from, v_to);

  if v_from is null or v_to is null then
    return;
  end if;

  if v_from > v_to then
    raise check_violation using
      message = 'metrics date range is invalid';
  end if;

  return query
  select
    metrics.summary_date,
    metrics.game_id,
    metrics.game_version_id,
    game.slug,
    game.name,
    version.version_key,
    metrics.home_sessions,
    metrics.detail_sessions,
    metrics.started_sessions,
    metrics.load_attempts,
    metrics.ready_loads,
    metrics.load_duration_p75_ms,
    metrics.started_plays,
    metrics.effective_plays,
    metrics.computed_at
  from public.daily_game_metrics as metrics
  join public.games as game on game.id = metrics.game_id
  join public.game_versions as version
    on version.game_id = metrics.game_id
    and version.id = metrics.game_version_id
  where metrics.summary_date between v_from and v_to
    and (p_game_id is null or metrics.game_id = p_game_id)
    and (
      p_game_version_id is null
      or metrics.game_version_id = p_game_version_id
    )
  order by metrics.summary_date, game.sort_order, game.slug, version.version_key;
end
$$;

revoke all on function public.get_daily_game_metrics(date, date, uuid, uuid)
  from public, anon, authenticated, moyufun_publisher;
grant execute on function public.get_daily_game_metrics(date, date, uuid, uuid)
  to moyufun_web;

create or replace function public.run_event_retention_maintenance()
returns table (
  deleted_events bigint,
  deleted_rate_limit_buckets bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_finalizable_date date :=
    (statement_timestamp() at time zone 'Asia/Shanghai')::date - 2;
  v_summary_date date;
begin
  for v_summary_date in
    select pending.summary_date
    from (
      select distinct
        (events.received_at at time zone 'Asia/Shanghai')::date as summary_date
      from public.events as events
      where events.received_at <
        (v_finalizable_date + 1)::timestamp at time zone 'Asia/Shanghai'

      union

      select v_finalizable_date
    ) as pending
    where pending.summary_date = v_finalizable_date
      or not exists (
        select 1
        from public.event_daily_rollup_status as status
        where status.summary_date = pending.summary_date
      )
    order by pending.summary_date
  loop
    perform public.refresh_daily_game_metrics(v_summary_date);
  end loop;

  deleted_events := public.cleanup_summarized_events();
  deleted_rate_limit_buckets := public.cleanup_expired_event_rate_limits();
  return next;
end
$$;

revoke all on function public.run_event_retention_maintenance()
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

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
