create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'moyufun_web') then
    create role moyufun_web nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'moyufun_publisher') then
    create role moyufun_publisher nologin noinherit;
  end if;
end
$$;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  short_description text not null,
  description text not null,
  tags text[] not null default '{}',
  controls jsonb not null default '[]'::jsonb
    check (jsonb_typeof(controls) = 'array'),
  cover jsonb not null
    check (jsonb_typeof(cover) = 'object'),
  sort_order integer not null default 0,
  is_listed boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_listing_idx
  on public.games (is_listed, sort_order, slug);

create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  version_key text not null
    check (version_key ~ '^v[0-9]+(?:[.-][a-z0-9]+)*$'),
  entry_path text not null unique
    check (entry_path ~ '^/games/[a-z0-9-]+/[a-z0-9.-]+/index\.html$'),
  file_size_bytes bigint
    check (file_size_bytes is null or file_size_bytes between 0 and 31457280),
  release_notes text,
  created_at timestamptz not null default now(),
  unique (game_id, version_key),
  unique (game_id, id)
);

alter table public.games
  add constraint games_current_version_fk
  foreign key (id, current_version_id)
  references public.game_versions (game_id, id)
  on update restrict
  on delete restrict;

create index game_versions_game_created_idx
  on public.game_versions (game_id, created_at desc);

create table public.events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  event_type text not null check (
    event_type in (
      'page_view',
      'game_detail_view',
      'game_load',
      'game_ready',
      'game_start',
      'game_end',
      'heartbeat'
    )
  ),
  visitor_id uuid not null,
  session_id uuid not null,
  game_id uuid,
  game_version_id uuid,
  load_id uuid,
  play_id uuid,
  path text,
  duration_ms integer
    check (duration_ms is null or duration_ms >= 0),
  active_seconds smallint
    check (active_seconds is null or active_seconds between 0 and 60),
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 8192
    ),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),

  foreign key (game_id, game_version_id)
    references public.game_versions (game_id, id)
    on delete restrict,

  check (
    event_type = 'page_view'
    or (game_id is not null and game_version_id is not null)
  ),
  check (
    event_type not in ('game_load', 'game_ready')
    or load_id is not null
  ),
  check (
    event_type not in ('game_start', 'game_end', 'heartbeat')
    or play_id is not null
  )
);

create index events_received_at_idx
  on public.events (received_at);

create index events_type_time_idx
  on public.events (event_type, occurred_at desc);

create index events_game_version_time_idx
  on public.events (game_id, game_version_id, occurred_at desc)
  where game_id is not null;

create index events_visitor_time_idx
  on public.events (visitor_id, occurred_at desc);

create index events_play_time_idx
  on public.events (play_id, occurred_at)
  where play_id is not null;

alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.events enable row level security;

revoke all on public.games from public, anon, authenticated;
revoke all on public.game_versions from public, anon, authenticated;
revoke all on public.events from public, anon, authenticated;
revoke all on sequence public.events_id_seq
  from public, anon, authenticated;

grant usage on schema public to moyufun_web, moyufun_publisher;

grant select on public.games, public.game_versions
  to moyufun_web;
grant insert on public.events
  to moyufun_web;
grant usage, select on sequence public.events_id_seq
  to moyufun_web;

grant select, insert, update on public.games
  to moyufun_publisher;
grant select, insert on public.game_versions
  to moyufun_publisher;

create policy games_web_select
  on public.games
  for select
  to moyufun_web
  using (is_listed and current_version_id is not null);

create policy versions_web_select
  on public.game_versions
  for select
  to moyufun_web
  using (
    exists (
      select 1
      from public.games g
      where g.id = game_versions.game_id
        and g.is_listed
        and g.current_version_id = game_versions.id
    )
  );

create policy events_web_insert
  on public.events
  for insert
  to moyufun_web
  with check (true);

create policy games_publisher_select
  on public.games
  for select
  to moyufun_publisher
  using (true);

create policy games_publisher_insert
  on public.games
  for insert
  to moyufun_publisher
  with check (true);

create policy games_publisher_update
  on public.games
  for update
  to moyufun_publisher
  using (true)
  with check (true);

create policy versions_publisher_select
  on public.game_versions
  for select
  to moyufun_publisher
  using (true);

create policy versions_publisher_insert
  on public.game_versions
  for insert
  to moyufun_publisher
  with check (true);
