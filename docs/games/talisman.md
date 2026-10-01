# 符斗 · 道术对决 (`talisman`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A top-down Taoist duel in the style of 乱刃: pick 2 of 6 talismans, fight 5 AI in a free-for-all, first to 10 kills wins. Talismans leave element marks, and hitting a marked target with the right second element triggers a reaction, so a loadout is a pair of elements that work together. Single-player only, keyboard and mouse only.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html`, `games/slash/v4/test_headless.js`, `games/slash/game.json`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game is `games/talisman/v1/index.html`, one file, started as a copy of `games/slash/v4/index.html`. Keep its SDK block, audio, canvas/view, input, main loop, effects, killfeed, respawn, obstacles, spawn points and loadout menu; replace the slash definitions, `doStrike`, damage, AI casting and HUD. | Games cannot share files (each version uploads alone). 乱刃's FFA rules (HP 100, 10 kills, 2.5 s respawn, 1.5 s invulnerability) carry over unchanged. |
| D2 | A target holds at most one mark `{ el, src, t }`, which lasts 3 s. A hit with element B on a target marked A: if `{A, B}` is a reaction pair, the reaction fires, the mark is consumed and no new mark is applied; otherwise the mark is replaced by B. | One mark keeps the rules readable on screen and the code a single field. |
| D3 | There are 4 reaction pairs out of 15 possible loadouts: 火+风, 水+雷, 土+水, 火+雷. The menu shows `可触发：<反应名>` under the slots when the chosen pair reacts, and `无元素反应` otherwise. | Reactions reward a deliberate loadout without making non-reacting pairs useless: 定身符 combines with anything. |
| D4 | Kill credit goes to whoever dealt the final damage, including burn ticks and reaction damage (credited to the reaction's triggering caster). Each kill also records the talisman key that dealt it; a reaction counts as its triggering talisman. | Needed for `pure`, and fair to fire users. |
| D5 | Reactions, burn ticks and wall damage skip invulnerable fighters, like any hit. Death and respawn clear the mark, burn, slow and freeze. | Keeps 乱刃's spawn protection intact. |
| D6 | New AI names: 玄清, 青霄, 紫阳, 丹鼎, 白鹤, reusing 乱刃's five colours in the same order. | Keeps the style of the series. |

## Out of scope

Multiplayer, touch controls, more than 6 talismans or 4 reactions, mana or resources, pickups, teams, cross-round achievements.

## Architecture

### Package

```text
games/talisman/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "talisman",
  "name": "符斗 · 道术对决",
  "shortDescription": "搭配两道符咒，用元素反应击败五名 AI 道士。",
  "description": "从火、风、雷、水、土与定身六道符咒中挑选两种，与五名 AI 道士混战。符咒会在敌人身上留下元素印记，用相生的另一道符咒命中即可触发火旋风、雷链等元素反应。率先取得十次击杀即可获胜。",
  "tags": ["动作", "单人", "键鼠"],
  "controls": [
    { "input": "WASD / 方向键", "action": "移动" },
    { "input": "鼠标", "action": "瞄准" },
    { "input": "鼠标左键 / J", "action": "使用左槽符咒" },
    { "input": "鼠标右键 / K", "action": "使用右槽符咒" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R / B", "action": "再战 / 返回配装" }
  ],
  "cover": { "symbol": "符", "eyebrow": "ELEMENTAL DUEL", "accent": "#ff5a5a", "accentSecondary": "#4dd2ff" },
  "sortOrder": 30,
  "achievements": [
    { "key": "first_blood", "name": "开坛", "description": "取得一次击杀。", "symbol": "坛" },
    { "key": "first_win", "name": "道法自然", "description": "赢下一局。", "symbol": "道" },
    { "key": "reaction", "name": "相生", "description": "触发一次元素反应。", "symbol": "生" },
    { "key": "chain_3", "name": "天雷引", "description": "一道雷链同时命中三人。", "symbol": "雷" },
    { "key": "pure", "name": "一以贯之", "description": "全部击杀都用同一道符咒并获胜。", "symbol": "一" },
    { "key": "frozen_kill", "name": "定！", "description": "击杀一名被定身的对手。", "symbol": "定" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "胜利", "maxPerRound": 1 },
    { "key": "kills", "name": "击杀", "maxPerRound": 10 },
    { "key": "reactions", "name": "元素反应", "maxPerRound": 500 }
  ]
}
```

### Talismans

`TALISMANS` replaces `SLASHES` and keeps its field names (`cd`, `windup`, `range`, `dmg`, `knock`, `moveMul`, `color`, `glyph`, `desc`), adding `el` (`'fire' | 'wind' | 'thunder' | 'water' | 'earth' | null`) and `kind`.

| key | name | glyph | el | kind | cd | windup | numbers | effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fire` | 火符 | 火 | fire | projectile | 0.9 | 0.10 | speed 480, range 380, r 8, dmg 10, knock 120 | Burn: 3 dmg/s for 3 s (refreshes, doesn't stack). |
| `wind` | 风符 | 风 | wind | melee arc | 0.8 | 0.08 | range 110, arc 140°, dmg 8, knock 380 | — |
| `thunder` | 雷符 | 雷 | thunder | targeted | 1.6 | 0.10 | The cursor point is clamped to 360 from the caster. A 0.45 s telegraph circle of r 50 appears, then strikes for 16 dmg, knock 150. | Hits everyone except the caster inside the circle. |
| `water` | 水符 | 水 | water | projectile | 1.1 | 0.12 | speed 380, range 320, r 14, dmg 9, knock 100, pierces | Slow to 60% speed for 1.5 s. |
| `earth` | 土符 | 土 | earth | wall | 3.0 | 0.15 | Wall 100 × 22, centred 90 ahead, perpendicular to facing, lasts 4 s | Blocks movement and all projectiles (added to the obstacle checks while alive). Fighters overlapping the wall when it rises take 10 dmg, knock 260 away from the wall's centre line, and the earth mark. |
| `bind` | 定身符 | 定 | null | projectile | 2.5 | 0.10 | speed 600, range 340, r 7, dmg 4, knock 0 | `frozenT = 1.0`: no movement, no casting. No mark. |

Card descriptions:
- 火符 `火球命中后灼烧三秒。`
- 风符 `近身风刃，大范围击退。`
- 雷符 `在准星处降下天雷，稍有延迟。`
- 水符 `穿透水波，减速敌人。`
- 土符 `升起石墙阻挡法术，压伤墙上之人。`
- 定身符 `定住一名敌人一秒，可接任何符咒。`

### Reactions

`REACTIONS` is keyed by the sorted pair `'a+b'`. `react(src, tgt, pairKey, talismanKey)` applies the reaction; `talismanKey` is the triggering talisman, used for kill credit (D4).

| pair | name | effect |
| --- | --- | --- |
| `fire+wind` | 火旋风 | 22 dmg to every fighter within 100 of the target except `src`, including the target. |
| `thunder+water` | 雷链 | 14 dmg to the target, then jumps up to 2 more times to the nearest not-yet-hit fighter (not `src`) within 240 of the previous one, 14 dmg each. Draw a jagged line per jump. |
| `earth+water` | 泥沼 | 8 dmg and slow to 35% speed for 2.5 s. |
| `fire+thunder` | 爆燃 | 26 dmg to the target. |

A reaction shows its name as a floater in the pair's colour and plays a louder hit sound. `src.reactions++` for every reaction.

Marks are drawn as a small coloured glyph (火/风/雷/水/土) orbiting the fighter, fading over the last 0.5 s.

### AI

Start from 乱刃's `aiThink`, with these changes:

- **Ranges:** `thunder` 360, projectiles their `range`, `wind` 110, `earth` 150.
- **Earth:** cast when an enemy projectile is within 200 and heading toward it (dot product > 0.8), or when an enemy is within 120 in front.
- **Bind:** only when no other slot is ready.
- **Thunder:** aim at the target's position plus velocity × 0.45 (leading), with ±20 px jitter.
- **Reactions:** prefer a slot whose element reacts with the target's current mark.
- **Loadouts:** `randomPair()` as in 乱刃.

### Achievements

Emitted through 乱刃's `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `first_blood` | The player kills anyone. |
| `reaction` | `react()` is called with `src === player`. |
| `chain_3` | One 雷链 from the player hits 3 distinct fighters (the target plus 2 jumps). |
| `frozen_kill` | The player kills a fighter whose `frozenT > 0`. |
| `first_win` | The player reaches 10 kills. |
| `pure` | At the win, `player.killsBy` (`{ [talismanKey]: count }`) has exactly one key. |

`kill(src, tgt, talismanKey)` replaces 乱刃's `kill(src, tgt)`.

### Stats

At round end, after achievements and before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, kills: player.kills, reactions: Math.min(player.reactions, 500) })`.

### Headless test

`v1/test_headless.js` keeps 乱刃 v4's stubs, simulation and SDK shape assertions, with these additions:

- **Simulation:** asserts at least one kill and at least one reaction across all fighters in 4 minutes. Walls must expire (`walls.length` never exceeds 6).
- **Deterministic round** (loadout `fire` + `bind`):
  1. `kill(player, ai, 'fire')`.
  2. `react(player, ai2, 'fire+wind', 'fire')`.
  3. Place two more AIs within 240 of each other, then `react(player, ai3, 'thunder+water', 'fire')`.
  4. Set `ai4.frozenT = 1`, then `kill(player, ai4, 'fire')`.
  5. Set `player.kills = 9` and `player.killsBy = { fire: 9 }`, then `kill(player, ai5, 'fire')`.

  Expected sequence: `start, first_blood, reaction, chain_3, frozen_kill, first_win, pure, stats, end`.
- **Mixed-talisman win:** a win with `killsBy = { fire: 5, bind: 5 }` sends no `pure`.
- **Lost round:** asserts `wins: 0`. `backToMenu()` mid-round sends nothing.

## Milestones

Each milestone ends with `node games/talisman/v1/test_headless.js` passing.

**M1 · Playable round.** Copy slash v4, then build talismans, marks, reactions, walls, burn, slow and freeze, the AI, the HUD, and menu copy (title `符 斗`, subtitle `TOP-DOWN 道术对决 · 选两道符咒，与 5 名 AI 道士斗法`, plus the reaction hint line).
Done when: a browser round ends with a winner, and all four reactions can be triggered by hand.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md` (with the reaction table).
Done when: `pnpm game check talisman v1` passes.

**M3 · Local release.** `pnpm game:local publish talisman v1 --yes`.
Done when: `/play/talisman` plays locally, and a logged-in round unlocks `first_blood` and updates the board. The owner runs the production publish.

## Open items

- Balance numbers are starting points. The owner accepts the feel after M1 playtests.
