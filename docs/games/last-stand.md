# 江湖夜雨 · 毒雾大逃杀 (`last-stand`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A last-one-standing battle royale built on 乱刃's slashes. The player and 11 AI swordsmen are trapped in a bamboo forest as poison fog closes in. Each fighter has one life, starts with one random slash, and learns more from scrolls on the ground. Single-player only, keyboard and mouse only.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html`, `games/slash/v4/test_headless.js`, `games/slash/game.json`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game is `games/last-stand/v1/index.html`, one file, started as a copy of `games/slash/v4/index.html`. `SLASHES`, `tryCast`, `doStrike`, projectiles, player control, audio and effects stay. The loadout menu becomes a start screen, since the loadout is built during the round. | Games cannot share files; 乱刃's combat is reused unchanged. |
| D2 | The arena stays 1100 × 700 with a fixed view and no camera. 12 fighters and 18 bamboo clumps fit, and the fog does the crowding. | A scrolling camera and a minimap would double the rendering work for little gain at this size. |
| D3 | Bamboo clumps are circles (r 22–40) at 18 fixed positions listed in `BAMBOO`. They block movement (circle–circle push) and projectiles. The AI only targets fighters it can see: within 380, with the line between them not crossing any clump. The player always sees everything. | Sight lines give cover and ambushes without rendering fog of war. |
| D4 | One life each, and 100 HP with no regeneration. A kill heals the killer 25, capped at 100. The round ends when the player dies (lose) or is the last one alive (win). The player's placement is 1 + the number of fighters still alive when they die. | Ending on the player's death keeps rounds short. The kill heal rewards fighting over hiding. |
| D5 | The fog is a safe circle. It starts at centre (550, 350), r 660, which covers the whole arena. Every 30 s it shrinks over 10 s to 65% of its radius around a new centre chosen at random so the new circle lies inside the old one. The 6th shrink goes to r 0 over 20 s. Outside the circle a fighter takes 4 dmg/s in phases 1–2, 8 dmg/s in phases 3–4 and 15 dmg/s after that. | Standard battle-royale pacing. The round lasts at most about 3.5 minutes. |
| D6 | A fog death credits the last fighter who hit the victim within 5 s. Otherwise nobody gets the kill. | The same credit-window idea as 擂台's ring-outs. |
| D7 | Every fighter starts with one random slash in the left slot and an empty right slot. There are 8 scrolls at start at random free positions, plus 1 more every 15 s inside the current safe circle, with a maximum of 10 on the ground. A scroll holds a random slash key. | Building a loadout during the round is the hook that sets this apart from 乱刃. |
| D8 | Pick up with `E` while touching a scroll. It fills the empty right slot. If both slots are full, it replaces the right slot and the old slash drops as a scroll. Picking up a slash the fighter already has does nothing. | Making pick-up an explicit key keeps `no_scroll` a deliberate choice. |
| D9 | The 11 AI names are 赤瞳, 青岚, 紫电, 金铃, 翠羽, 夜雨, 孤鸿, 寒江, 断云, 听竹 and 残月. The first five keep 乱刃's colours; the rest use `#ff8a3d`, `#6ee7ff`, `#c792ea`, `#5dffa0`, `#ff6b9d`, `#e8ecf4`. | Recurring 乱刃 fighters give the series continuity. |
| D10 | Fighters spawn at 12 points evenly spaced on the ellipse centred (550, 350) with radii 470 × 280, starting at angle 0. The player takes a random one and the AI fill the rest. Any point inside a clump is pushed out along the ellipse normal. | Even spacing gives everyone a few seconds before the first fight. |

## Out of scope

Multiplayer, touch controls, a camera or bigger map, fog of war rendering, items other than scrolls, armour, spectating after death, cross-round achievements.

## Architecture

### Package

```text
games/last-stand/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "last-stand",
  "name": "江湖夜雨 · 毒雾大逃杀",
  "shortDescription": "十二名剑客困于竹林，毒雾合围，只活一人。",
  "description": "每人只有一条命，开局仅会一种斩击，拾取地上的秘籍学会新招。毒雾每三十秒收缩一次，竹林遮挡视线与剑气。坚持到最后一人即为胜者。",
  "tags": ["动作", "大逃杀", "单人", "键鼠"],
  "controls": [
    { "input": "WASD / 方向键", "action": "移动" },
    { "input": "鼠标", "action": "瞄准" },
    { "input": "鼠标左键 / J", "action": "使用左槽斩击" },
    { "input": "鼠标右键 / K", "action": "使用右槽斩击" },
    { "input": "E", "action": "拾取秘籍" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R / B", "action": "再战 / 返回首页" }
  ],
  "cover": { "symbol": "雨", "eyebrow": "LAST ONE STANDING", "accent": "#5dffa0", "accentSecondary": "#b78cff" },
  "sortOrder": 60,
  "achievements": [
    { "key": "top_3", "name": "三强", "description": "进入最后三人。", "symbol": "三" },
    { "key": "first_win", "name": "独步江湖", "description": "成为最后的幸存者。", "symbol": "独" },
    { "key": "pacifist", "name": "坐山观虎斗", "description": "零击杀成为最后的幸存者。", "symbol": "观" },
    { "key": "kills_5", "name": "血雨腥风", "description": "单局击杀 5 人。", "symbol": "腥" },
    { "key": "no_scroll", "name": "从一而终", "description": "不拾取任何秘籍成为最后的幸存者。", "symbol": "终" },
    { "key": "fog_kill", "name": "借刀杀人", "description": "击杀一名身处毒雾中的对手。", "symbol": "借" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "吃鸡", "maxPerRound": 1 },
    { "key": "kills", "name": "击杀", "maxPerRound": 11 },
    { "key": "top3", "name": "三强", "maxPerRound": 1 }
  ]
}
```

### State and functions

State:
- `zone = { cx, cy, r, fromCx, fromCy, fromR, toCx, toCy, toR, phase, t }`
- `scrolls = [{ x, y, key }]`
- Per fighter: `slots` (right slot may be `null`), `lastHitBy`, `lastHitT`, `scrollsPicked`, `kills`

Functions:
- `updateZone(dt)`
- `inZone(e)`
- `canSee(a, b)`
- `spawnScroll(inZone)`
- `pickUpScroll(e, scroll)`
- `kill(src, tgt)`
- `aliveCount()`
- `endRound(won)`

`tryCast` ignores a `null` slot.

Keep 乱刃's `applyDamage` and set `tgt.lastHitBy = src` and `tgt.lastHitT = gameT` on each hit. Fog damage goes through `applyFog(e, dmg)`: if HP reaches 0, it calls `kill(src, e)`, where `src` is `lastHitBy` when `gameT - lastHitT <= 5`, otherwise `null`.

### Rendering and HUD

- **Bamboo** is drawn as dark green clusters of 3–5 stalks.
- **Fog** is a translucent purple layer outside the circle, with a white dashed ring at the next circle's position while shrinking.
- **Rain** is a light layer of diagonal streaks for mood, 60 particles recycled.
- **Scrolls** are a small parchment with the slash glyph in its colour, and an `E 拾取` prompt when the player touches one.
- **Top-left HUD:** `存活 N / 12`, `击杀 N`, and `毒雾收缩 0:12` or `毒雾收缩中`.
- **Bottom centre:** 乱刃's HP bar and two slot icons, with the empty slot showing `空`.
- **Killfeed:** 乱刃's, plus `<name> 死于毒雾`.
- **End banners:** `独步江湖！ 击杀 N` on a win, or `第 N 名 · 击杀 N` on a loss.

The start screen keeps 乱刃's menu styling but has no cards: title `江湖夜雨`, subtitle `毒雾大逃杀 · 十二人一条命，拾取秘籍学新招`, a help line, and one `进入竹林` button.

### AI

Priorities, re-evaluated every 0.3 s:

1. **Outside the zone, or in the path of the next circle while it shrinks:** move toward the zone centre. Attack only enemies directly in the way.
2. **HP < 30 and a visible enemy within 200:** retreat directly away from it, and flee toward the zone centre if the retreat would leave the zone.
3. **Empty right slot and a scroll within 300** (or both slots full, a scroll within 150, and a 30% roll once per scroll): walk to it and pick it up.
4. **Otherwise:** 乱刃's target-and-strafe behaviour against the nearest visible enemy. Wander toward the zone centre when no enemy is visible.

The AI fights other AI fighters as freely as the player.

### Achievements

Emitted through 乱刃's `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `fog_kill` | `kill(player, tgt)` where `!inZone(tgt)` at that moment. |
| `kills_5` | `player.kills` reaches 5. |
| `top_3` | After any death, `player.alive && aliveCount() <= 3`. |
| `first_win` | The player is the last one alive. |
| `pacifist` | At the win, `player.kills === 0`. |
| `no_scroll` | At the win, `player.scrollsPicked === 0`. |

A fighter's own death is processed before `top_3` is checked, so the player's death can't trigger it.

### Stats

In `endRound`, after achievements and before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, kills: player.kills, top3: <reached top 3 ? 1 : 0> })`.

### Headless test

`v1/test_headless.js` keeps 乱刃 v4's stubs and SDK shape assertions.

**Simulation.** Up to 5 minutes, with random input and `E` held. Assert:
- the round ends, because the fog guarantees it
- no `NaN`
- `zone.r` never increases
- no alive fighter overlaps a bamboo clump by more than 2 px
- at least one scroll was picked up by some AI

**Deterministic round 1** (win with kills):
1. `pickUpScroll(player, scroll)`, so the win sends no `no_scroll`.
2. Move `ai1` outside the zone, then `kill(player, ai1)` → `fog_kill`.
3. Four more `kill(player, …)` calls → `kills_5`.
4. Kill AIs by `kill(null, …)` until 3 remain → `top_3`.
5. Kill the last two.

Expected sequence: `start, fog_kill, kills_5, top_3, first_win, stats, end`. Expected stats: `{ rounds: 1, wins: 1, kills: 5, top3: 1 }`.

**Deterministic round 2** (pacifist win): kill every AI with `kill(null, …)`. Expected sequence: `start, top_3, first_win, pacifist, no_scroll, stats, end`.

**Other cases:**
- A round where `pickUpScroll(player, …)` is called before winning sends no `no_scroll`.
- `kill(ai, player)` with 9 alive ends the round with `wins: 0` and `top3: 0`.
- `backToMenu()` mid-round sends nothing.

## Milestones

Each milestone ends with `node games/last-stand/v1/test_headless.js` passing.

**M1 · Playable round.** Copy slash v4, then build bamboo, sight lines, the fog zone, scrolls and pick-up, one life, the AI priorities, the HUD, rain, and the start screen.
Done when: a browser round ends by win or death; the fog always ends it within about 3.5 minutes; the AI picks up scrolls and fights each other.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic tests, `README.md`.
Done when: `pnpm game check last-stand v1` passes.

**M3 · Local release.** `pnpm game:local publish last-stand v1 --yes`.
Done when: `/play/last-stand` plays locally, and a logged-in round updates the board. The owner runs the production publish.

## Open items

- `BAMBOO` positions are laid out by the implementer in M1. They must leave every spawn reachable and no clump within 60 of another, and the owner reviews the layout in the M1 playtest.
- Fog timings and damage are a first pass. The owner accepts pacing after M1.
