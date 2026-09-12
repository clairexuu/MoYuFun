with upsert_game as (
  insert into public.games (
    slug,
    name,
    short_description,
    description,
    tags,
    controls,
    cover,
    sort_order,
    is_listed
  )
  values (
    'slash',
    '乱刃 · 斩击大乱斗',
    '选两种斩击，与五名 AI 剑客展开快节奏混战。',
    '在六种斩击中自由搭配两种招式，利用走位、突进和击退效果击败对手。率先取得十次击杀即可赢下这场乱斗。',
    array['动作', '单人', '键鼠'],
    '[
      {"input":"WASD / 方向键","action":"移动"},
      {"input":"鼠标","action":"瞄准"},
      {"input":"鼠标左键 / J","action":"使用左槽斩击"},
      {"input":"鼠标右键 / K","action":"使用右槽斩击"},
      {"input":"M","action":"静音或恢复声音"},
      {"input":"R / B","action":"再战 / 返回配装"}
    ]'::jsonb,
    '{
      "symbol":"斩",
      "eyebrow":"TOP-DOWN ARENA",
      "accent":"#6f8cff",
      "accentSecondary":"#9b6dff"
    }'::jsonb,
    10,
    false
  )
  on conflict (slug) do update set
    name = excluded.name,
    short_description = excluded.short_description,
    description = excluded.description,
    tags = excluded.tags,
    controls = excluded.controls,
    cover = excluded.cover,
    sort_order = excluded.sort_order
  returning id
),
upsert_version as (
  insert into public.game_versions (
    game_id,
    version_key,
    entry_path
  )
  select
    id,
    'v1',
    '/games/slash/v1/index.html'
  from upsert_game
  on conflict (game_id, version_key) do update set
    entry_path = excluded.entry_path
  returning game_id, id
)
update public.games g
set
  current_version_id = v.id,
  is_listed = true,
  updated_at = now()
from upsert_version v
where g.id = v.game_id;
