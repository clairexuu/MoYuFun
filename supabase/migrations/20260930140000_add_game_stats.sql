-- Per-game all-time totals for logged-in players. See docs/design/game-stats.md.
create table public.game_stats (
  game_id uuid not null references public.games(id) on delete restrict,
  key text not null
    check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and length(key) <= 40),
  name text not null check (char_length(name) between 1 and 20),
  max_per_round integer not null check (max_per_round between 1 and 1000000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  primary key (game_id, key)
);

create table public.user_game_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null,
  stat_key text not null,
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, stat_key),
  foreign key (game_id, stat_key)
    references public.game_stats (game_id, key)
    on delete restrict
);

alter table public.game_stats enable row level security;
alter table public.user_game_stats enable row level security;

revoke all on public.game_stats
  from public, anon, authenticated;
revoke all on public.user_game_stats
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

grant select on public.game_stats to moyufun_web;
grant select, insert, update on public.game_stats to moyufun_publisher;

create policy game_stats_web_select
  on public.game_stats
  for select
  to moyufun_web
  using (
    is_active
    and exists (
      select 1
      from public.games g
      where g.id = game_stats.game_id
        and g.is_listed
        and g.current_version_id is not null
    )
  );

create policy game_stats_publisher_select
  on public.game_stats
  for select
  to moyufun_publisher
  using (true);

create policy game_stats_publisher_insert
  on public.game_stats
  for insert
  to moyufun_publisher
  with check (true);

create policy game_stats_publisher_update
  on public.game_stats
  for update
  to moyufun_publisher
  using (true)
  with check (true);

-- One round's counters. Rejects the whole report on any undeclared key or out-of-cap value (D2).
create or replace function public.record_round_stats(
  p_user_id uuid,
  p_game_id uuid,
  p_game_version_id uuid,
  p_stats jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entry record;
  v_cap integer;
  v_value numeric;
begin
  if p_user_id is null or p_game_id is null
    or p_game_version_id is null or p_stats is null then
    raise not_null_violation using message = 'stats report fields are required';
  end if;

  if not exists (
    select 1
    from public.game_versions v
    where v.id = p_game_version_id
      and v.game_id = p_game_id
  ) then
    raise check_violation using message = 'version does not belong to game';
  end if;

  if jsonb_typeof(p_stats) <> 'object'
    or (select count(*) from jsonb_object_keys(p_stats)) not between 1 and 10 then
    raise check_violation using message = 'stats must be an object of 1-10 entries';
  end if;

  for v_entry in select key, value from jsonb_each(p_stats) loop
    select s.max_per_round
    into v_cap
    from public.game_stats s
    where s.game_id = p_game_id
      and s.key = v_entry.key
      and s.is_active;

    if v_cap is null then
      raise check_violation using message = format('unknown stat %s', v_entry.key);
    end if;

    if jsonb_typeof(v_entry.value) <> 'number' then
      raise check_violation using message = format('stat %s must be a number', v_entry.key);
    end if;

    v_value := (v_entry.value)::text::numeric;
    if v_value <> trunc(v_value) or v_value < 0 or v_value > v_cap then
      raise check_violation using message = format('stat %s out of range', v_entry.key);
    end if;

    insert into public.user_game_stats (user_id, game_id, stat_key, value)
    values (p_user_id, p_game_id, v_entry.key, v_value::bigint)
    on conflict (user_id, game_id, stat_key) do update set
      value = public.user_game_stats.value + excluded.value,
      updated_at = now();
  end loop;
end
$$;

create or replace function public.get_user_stats(
  p_user_id uuid,
  p_game_id uuid
)
returns table (stat_key text, value bigint)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select u.stat_key, u.value
  from public.user_game_stats u
  join public.game_stats s on s.game_id = u.game_id and s.key = u.stat_key
  where u.user_id = p_user_id
    and u.game_id = p_game_id
    and s.is_active
  order by s.sort_order, s.key;
$$;

revoke all on function public.record_round_stats(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, moyufun_publisher;
revoke all on function public.get_user_stats(uuid, uuid)
  from public, anon, authenticated, moyufun_publisher;

grant execute on function public.record_round_stats(uuid, uuid, uuid, jsonb)
  to moyufun_web;
grant execute on function public.get_user_stats(uuid, uuid)
  to moyufun_web;

do $$
begin
  if not has_table_privilege('moyufun_web', 'public.game_stats', 'select') then
    raise exception 'moyufun_web must be able to read game_stats';
  end if;

  if has_table_privilege('moyufun_web', 'public.game_stats', 'insert')
    or has_table_privilege('moyufun_publisher', 'public.game_stats', 'delete') then
    raise exception 'game_stats write privileges are too broad';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher'))
      as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(role_name, 'public.user_game_stats', privilege_name)
  ) then
    raise exception 'application roles must not access user_game_stats directly';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_publisher')) as roles(role_name)
    cross join (
      values
        ('public.record_round_stats(uuid,uuid,uuid,jsonb)'),
        ('public.get_user_stats(uuid,uuid)')
    ) as functions(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then
    raise exception 'only moyufun_web may execute stats functions';
  end if;

  if not has_function_privilege('moyufun_web', 'public.record_round_stats(uuid,uuid,uuid,jsonb)', 'execute')
    or not has_function_privilege('moyufun_web', 'public.get_user_stats(uuid,uuid)', 'execute') then
    raise exception 'moyufun_web must execute stats functions';
  end if;
end
$$;
