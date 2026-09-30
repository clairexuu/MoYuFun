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
    'v3',
    '/games/slash/v3/index.html',
    37508,
    '新增六项单局成就，并通过 SDK 上报解锁。'
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
  where v.version_key = 'v3'
    and not exists (select 1 from inserted_version)
),
inserted_achievements as (
  insert into public.achievements (game_id, key, name, description, symbol, sort_order)
  select g.id, a.key, a.name, a.description, a.symbol, a.sort_order
  from slash_game g
  cross join (
    values
      ('first_blood', '初见血', '取得一次击杀。', '血', 1),
      ('first_win', '首胜', '赢下一局。', '胜', 2),
      ('flawless', '无伤', '不死一次赢下一局。', '完', 3),
      ('rampage', '连斩', '中途不死连续击杀 5 次。', '连', 4),
      ('swift', '速战', '在 120 秒内获胜。', '速', 5),
      ('ranged', '远斩', '以剑气加穿刺获胜。', '远', 6)
  ) as a(key, name, description, symbol, sort_order)
  on conflict (game_id, key) do nothing
  returning id
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
      and v.version_key = 'v3'
      and v.entry_path = '/games/slash/v3/index.html'
      and v.file_size_bytes = 37508
  ) then
    raise exception 'slash v3 must be the listed current version';
  end if;

  if (
    select count(*)
    from public.achievements a
    join public.games g on g.id = a.game_id
    where g.slug = 'slash' and a.is_active
  ) <> 6 then
    raise exception 'slash must have six active achievements';
  end if;
end
$$;
