create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  key text not null
    check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and length(key) <= 40),
  name text not null check (char_length(name) between 1 and 20),
  description text not null check (char_length(description) between 1 and 60),
  symbol text not null check (char_length(symbol) between 1 and 2),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (game_id, key),
  unique (game_id, id)
);

create table public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null,
  game_id uuid not null,
  game_version_id uuid not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id),
  foreign key (game_id, achievement_id)
    references public.achievements (game_id, id)
    on delete restrict,
  foreign key (game_id, game_version_id)
    references public.game_versions (game_id, id)
    on delete restrict
);

create index user_achievements_user_game_idx
  on public.user_achievements (user_id, game_id);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

revoke all on public.achievements
  from public, anon, authenticated;
revoke all on public.user_achievements
  from public, anon, authenticated, moyufun_web, moyufun_publisher;

grant select on public.achievements to moyufun_web;
grant select, insert, update on public.achievements to moyufun_publisher;

create policy achievements_web_select
  on public.achievements
  for select
  to moyufun_web
  using (
    is_active
    and exists (
      select 1
      from public.games g
      where g.id = achievements.game_id
        and g.is_listed
        and g.current_version_id is not null
    )
  );

create policy achievements_publisher_select
  on public.achievements
  for select
  to moyufun_publisher
  using (true);

create policy achievements_publisher_insert
  on public.achievements
  for insert
  to moyufun_publisher
  with check (true);

create policy achievements_publisher_update
  on public.achievements
  for update
  to moyufun_publisher
  using (true)
  with check (true);

-- The game decides the unlock (D6); the site only checks the key exists and is active.
create or replace function public.unlock_achievement(
  p_user_id uuid,
  p_game_id uuid,
  p_game_version_id uuid,
  p_key text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_achievement_id uuid;
  v_inserted boolean;
begin
  if p_user_id is null or p_game_id is null
    or p_game_version_id is null or p_key is null then
    raise not_null_violation using message = 'achievement unlock fields are required';
  end if;

  if not exists (
    select 1
    from public.game_versions v
    where v.id = p_game_version_id
      and v.game_id = p_game_id
  ) then
    return 'unknown';
  end if;

  select a.id
  into v_achievement_id
  from public.achievements a
  where a.game_id = p_game_id
    and a.key = p_key
    and a.is_active;

  if v_achievement_id is null then
    return 'unknown';
  end if;

  insert into public.user_achievements (
    user_id,
    achievement_id,
    game_id,
    game_version_id
  )
  values (p_user_id, v_achievement_id, p_game_id, p_game_version_id)
  on conflict do nothing
  returning true into v_inserted;

  return case when coalesce(v_inserted, false) then 'unlocked' else 'already_unlocked' end;
end
$$;

create or replace function public.get_user_achievements(
  p_user_id uuid,
  p_game_id uuid default null
)
returns table (game_id uuid, key text, unlocked_at timestamptz)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select ua.game_id, a.key, ua.unlocked_at
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
  where ua.user_id = p_user_id
    and (p_game_id is null or ua.game_id = p_game_id)
  order by ua.unlocked_at, a.key;
$$;

-- Owner (postgres) may delete from auth.users; unlocks cascade (D14).
create or replace function public.delete_user_account(p_user_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from auth.users where id = p_user_id;
$$;

revoke all on function public.unlock_achievement(uuid, uuid, uuid, text)
  from public, anon, authenticated, moyufun_publisher;
revoke all on function public.get_user_achievements(uuid, uuid)
  from public, anon, authenticated, moyufun_publisher;
revoke all on function public.delete_user_account(uuid)
  from public, anon, authenticated, moyufun_publisher;

grant execute on function public.unlock_achievement(uuid, uuid, uuid, text)
  to moyufun_web;
grant execute on function public.get_user_achievements(uuid, uuid)
  to moyufun_web;
grant execute on function public.delete_user_account(uuid)
  to moyufun_web;

do $$
begin
  if not has_table_privilege('moyufun_web', 'public.achievements', 'select') then
    raise exception 'moyufun_web must be able to read achievements';
  end if;

  if has_table_privilege('moyufun_web', 'public.achievements', 'insert')
    or has_table_privilege('moyufun_publisher', 'public.achievements', 'delete') then
    raise exception 'achievement write privileges are too broad';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_web'), ('moyufun_publisher'))
      as roles(role_name)
    cross join (values ('select'), ('insert'), ('update'), ('delete'))
      as privileges(privilege_name)
    where has_table_privilege(role_name, 'public.user_achievements', privilege_name)
  ) then
    raise exception 'application roles must not access user_achievements directly';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated'), ('moyufun_publisher')) as roles(role_name)
    cross join (
      values
        ('public.unlock_achievement(uuid,uuid,uuid,text)'),
        ('public.get_user_achievements(uuid,uuid)'),
        ('public.delete_user_account(uuid)')
    ) as functions(function_name)
    where has_function_privilege(role_name, function_name, 'execute')
  ) then
    raise exception 'only moyufun_web may execute achievement functions';
  end if;

  if not has_function_privilege('moyufun_web', 'public.unlock_achievement(uuid,uuid,uuid,text)', 'execute')
    or not has_function_privilege('moyufun_web', 'public.get_user_achievements(uuid,uuid)', 'execute')
    or not has_function_privilege('moyufun_web', 'public.delete_user_account(uuid)', 'execute') then
    raise exception 'moyufun_web must execute achievement functions';
  end if;
end
$$;
