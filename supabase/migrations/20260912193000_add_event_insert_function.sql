create or replace function public.record_event(
  p_event_id uuid,
  p_event_type text,
  p_visitor_id uuid,
  p_session_id uuid,
  p_game_id uuid,
  p_game_version_id uuid,
  p_load_id uuid,
  p_play_id uuid,
  p_path text,
  p_duration_ms integer,
  p_active_seconds smallint,
  p_occurred_at timestamptz,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_environment not in ('production', 'preview', 'development') then
    raise check_violation using message = 'invalid event environment';
  end if;

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
    occurred_at
  )
  values (
    p_event_id,
    p_event_type,
    p_visitor_id,
    p_session_id,
    p_game_id,
    p_game_version_id,
    p_load_id,
    p_play_id,
    p_path,
    p_duration_ms,
    p_active_seconds,
    jsonb_build_object('environment', p_environment),
    p_occurred_at
  )
  on conflict (event_id) do nothing;
end
$$;

revoke insert on public.events from moyufun_web;
revoke usage, select on sequence public.events_id_seq from moyufun_web;

revoke all on function public.record_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  smallint,
  timestamptz,
  text
) from public, anon, authenticated, moyufun_publisher;

grant execute on function public.record_event(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  smallint,
  timestamptz,
  text
) to moyufun_web;

do $$
begin
  if has_table_privilege('moyufun_web', 'public.events', 'insert') then
    raise exception 'moyufun_web must not insert events directly';
  end if;

  if not has_function_privilege(
    'moyufun_web',
    'public.record_event(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer,smallint,timestamp with time zone,text)',
    'execute'
  ) then
    raise exception 'moyufun_web must execute record_event';
  end if;
end
$$;
