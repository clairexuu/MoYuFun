with slash_game as (
  select id
  from public.games
  where slug = 'slash'
),
inserted_version as (
  insert into public.game_versions (
    game_id,
    version_key,
    entry_path,
    file_size_bytes,
    release_notes
  )
  select
    id,
    'v2',
    '/games/slash/v2/index.html',
    36481,
    '接入 MoYuFun SDK v1：就绪、开始和结束事件。'
  from slash_game
  on conflict (game_id, version_key) do nothing
  returning game_id, id
),
target_version as (
  select game_id, id
  from inserted_version

  union all

  select v.game_id, v.id
  from public.game_versions v
  join slash_game g on g.id = v.game_id
  where v.version_key = 'v2'
    and not exists (select 1 from inserted_version)
)
update public.games g
set
  current_version_id = v.id,
  is_listed = true,
  updated_at = now()
from target_version v
where g.id = v.game_id;

do $$
begin
  if not exists (
    select 1
    from public.games g
    join public.game_versions v
      on v.game_id = g.id
      and v.id = g.current_version_id
    where g.slug = 'slash'
      and g.is_listed
      and v.version_key = 'v2'
      and v.entry_path = '/games/slash/v2/index.html'
      and v.file_size_bytes = 36481
  ) then
    raise exception 'slash v2 must be the listed current version';
  end if;
end
$$;
