# 擂台 · 拳脚大乱斗 (`brawl`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A top-down unarmed brawl in the style of 乱刃: pick 2 of 6 moves, fight 5 AI on a floating round platform, and win by knocking opponents off the edge. There are no hit points; hits raise a 失衡值 that makes the next knockback fly further. Single-player only, keyboard and mouse only.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html`, `games/slash/v4/test_headless.js`, `games/slash/game.json`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game is `games/brawl/v1/index.html`, one file, started as a copy of `games/slash/v4/index.html`. Keep its SDK block, audio, canvas/view, input, main loop, particles, floaters, killfeed and loadout menu; replace the slash definitions, combat, AI, HUD and win logic. `test_headless.js` starts as a copy of slash v4's. | Every version is uploaded on its own, so games cannot share files, and a shared engine would need a build step. 乱刃 is proven in production. |
| D2 | The platform is a circle centred at (550, 350) with radius `R`: 320 until 90 s, shrinking linearly to 200 between 90 s and 120 s. There are no obstacles. | A circle gives the same distance to the edge in every direction, which keeps the ring-out rule and the AI edge checks to a single `hypot`. Obstacles would block ring-outs. |
| D3 | No HP. Each hit adds the move's `imb` to the target's `imb` (0–200, shown as a percentage). The knockback impulse is `knock × (1 + imb / 100)`, applied after `imb` is added. | This is the whole identity of the game: knockback grows with every hit, like Smash. |
| D4 | Impulse decays with `exp(-3.5 × dt)`, not 乱刃's `exp(-7 × dt)`. A knock `k` then travels about `k / 3.5` px. | With 乱刃's decay, even the heaviest hit travels only ~70 px, so ring-outs would be impossible on a 320 px platform. |
| D5 | You fall only when you are hit off. After movement, if an entity's centre is further than `R` from the platform centre: if its impulse speed `hypot(ivx, ivy)` ≥ 60 it falls; otherwise it is clamped back to distance `R`. | Walking off by accident would feel cheap, and the AI would do it all the time. The shrink can't push anyone off either. |
| D6 | A fall credits a KO to `lastHitBy` if that hit landed within the last 4 s; otherwise nobody scores. First to **8 KOs** wins. There is no time limit. | Same rule as 乱刃's 10 kills, scaled to the slower flow. The shrink makes rounds converge in about 3 minutes. |
| D7 | The faller disappears with a 0.4 s shrink animation, comes back after 2 s at the spawn point furthest from other fighters, with `imb = 0` and 1.5 s invulnerability. Spawn points are 6 points at radius `0.6 × R` (angles 0°, 60°, … 300°), recomputed from the current `R`. | Reuses 乱刃's `pickSpawn`. The spawn ring moves inward as the platform shrinks. |
| D8 | Each cast gets a unique `castId`. A hit stores `lastHitBy`, `lastHitT`, `lastHitCast` and `lastHitCause` (the move key, or `'guard'` for a reflect) on the target. | The achievements (double KO, grab and guard KOs) are judged from this data at the moment of the fall. |
| D9 | New AI names: 铁牛, 飞燕, 石猴, 醉侠, 花拳, reusing 乱刃's five colours in the same order. | Keeps the style of the series; the names fit a brawl. |

## Out of scope

Multiplayer, touch controls, more than one arena, items, teams, difficulty settings, cross-round achievements, persistent settings (only 乱刃's `M` mute).

## Architecture

### Package

```text
games/brawl/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md          rules, moves, achievements, how to run the test (same sections as games/slash/v4/README.md)
```

`game.json`:

```json
{
  "slug": "brawl",
  "name": "擂台 · 拳脚大乱斗",
  "shortDescription": "赤手空拳，把五名 AI 拳师打下擂台。",
  "description": "从六种拳脚招式中挑选两种，在不断崩塌的浮空擂台上混战。每次受击都会累积失衡值，失衡越高飞得越远。率先将对手击出擂台八次即可赢下这局。",
  "tags": ["动作", "单人", "键鼠"],
  "controls": [
    { "input": "WASD / 方向键", "action": "移动" },
    { "input": "鼠标", "action": "瞄准" },
    { "input": "鼠标左键 / J", "action": "使用左槽招式" },
    { "input": "鼠标右键 / K", "action": "使用右槽招式" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R / B", "action": "再战 / 返回配装" }
  ],
  "cover": { "symbol": "擂", "eyebrow": "RING-OUT BRAWL", "accent": "#ff8a3d", "accentSecondary": "#ffd24d" },
  "sortOrder": 20,
  "achievements": [
    { "key": "first_ko", "name": "出场", "description": "将一名对手击出擂台。", "symbol": "出" },
    { "key": "first_win", "name": "擂主", "description": "赢下一局。", "symbol": "擂" },
    { "key": "unmoved", "name": "稳如泰山", "description": "一次都不掉下擂台赢下一局。", "symbol": "稳" },
    { "key": "double_ko", "name": "一石二鸟", "description": "一招将两名对手击出擂台。", "symbol": "双" },
    { "key": "reversal", "name": "借力打力", "description": "用铁布衫反弹将对手击出擂台。", "symbol": "借" },
    { "key": "redirect", "name": "顺手牵羊", "description": "用擒拿将对手丢出擂台。", "symbol": "牵" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "胜利", "maxPerRound": 1 },
    { "key": "kos", "name": "击飞", "maxPerRound": 8 }
  ]
}
```

### Constants

`ARENA_W = 1100`, `ARENA_H = 700`, `WIN_KOS = 8`, `R0 = 320`, `R1 = 200`, `SHRINK_START = 90`, `SHRINK_END = 120`, `FALL_SPEED = 60`, `CREDIT_WINDOW = 4`, `IMB_MAX = 200`, `IMPULSE_DECAY = 3.5`. Entity radius 16, player speed 238, AI speed 212–236, as in 乱刃.

`platformR()` returns `R0` before `SHRINK_START`, `R1` after `SHRINK_END`, and linear interpolation between them.

### Moves

Same field names as 乱刃's `SLASHES` (`cd`, `windup`, `range`, `arc`, `knock`, `moveMul`, `projectile`, `projSpeed`), with `dmg` replaced by `imb`. The table is `MOVES`.

| key | name | glyph | cd | windup | range | arc | imb | knock | moveMul | special |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jab` | 连拳 | 连 | 0.35 | 0.05 | 70 | 90 | 7 | 90 | 0.7 | — |
| `smash` | 崩拳 | 崩 | 1.8 | 0.35 | 80 | 70 | 12 | 520 | 0.15 | screen shake, like 重斩 |
| `sweep` | 扫堂腿 | 扫 | 1.4 | 0.15 | 86 | 360 | 10 | 260 | 0.4 | — |
| `grab` | 擒拿 | 擒 | 2.0 | 0.10 | 60 | 70 | 10 | 480 | 0.3 | first target hit is held, see below |
| `palm` | 掌风 | 掌 | 1.1 | 0.12 | 360 | 20 | 0 | 300 | 0.5 | projectile, `projSpeed` 520 |
| `guard` | 铁布衫 | 铁 | 3.0 | 0 | — | — | — | — | 0.3 | 0.6 s guard, see below |

Card descriptions for the menu:
- 连拳 `出手极快的连击，积累对手失衡值。`
- 崩拳 `蓄力重拳，失衡越高的对手飞得越远。`
- 扫堂腿 `360° 低扫，被围时逼退四周。`
- 擒拿 `抓住面前一人，片刻后朝准星方向甩出。`
- 掌风 `远程掌力，不增加失衡但能推人。`
- 铁布衫 `短暂护体，受到的近身击退原样奉还。`

**Grab.** On strike, the nearest valid target inside the grab's range and arc becomes `held`: both the grabber and the target stop moving for 0.35 s (`e.grabbing = { tgt, t }`, `tgt.heldBy = e`). When the timer ends, apply the grab's hit (imb 10, knock 480) in the grabber's current `facing`. The player aims with the mouse while holding. The AI sets `facing` to the angle from the platform centre to the target, i.e. straight out. A grab ends early if either side falls.

**Guard.** `e.guardT = 0.6` on cast. While `guardT > 0`, a melee hit (not `palm`) on this entity adds no `imb` and no impulse to it. Instead the attacker receives the impulse `move.knock × (1 + attacker.imb / 100)` pointing away from the guarder, and gets `lastHitBy = guarder`, `lastHitCast = guarder's guard castId`, `lastHitCause = 'guard'`. `palm` is absorbed with no effect. The guarder is drawn with a golden ring while guarding.

### Update changes versus 乱刃 v4

- Remove HP, `hp`, `maxHp`, damage floaters and HP bars. Show `imb` as `NN%` above each fighter, coloured from white (0) through yellow (100) to red (≥150). The player's HUD bar shows the same number.
- Replace the `ARENA_W/H` clamp with the ring-out check from D5, then call `ringOut(e)` for fallers.
- `ringOut(e)`: set `alive = false`, `respawnT = 2`, `deaths++`, `falls++`; credit a KO per D6 (`src.kos++`, killfeed `A 将 B 击出擂台` or `B 跌落擂台`); run the achievement checks below; if `src.kos >= WIN_KOS`, end the round.
- Render: the platform is a stone disc with a crack line at radius `R`; from 88 s to 90 s the ring between `R1` and `R0` flashes as a warning, and the part outside the current `R` is drawn as falling debris. The background outside the disc is dark sky.
- Scoreboard: sort by `kos` then `falls`, showing `KO` and `落`.
- Round end banner: `你成为擂主！` on a win, or `<name> 成为擂主` on a loss, with 乱刃's `R 再战 · B 返回配装` hint.

### AI

Start from 乱刃's `aiThink`, with these changes:

1. **Edge safety first.** If its own distance from the centre is greater than `R − 70`, add a vector toward the centre with weight 1.5 before normalizing.
2. **Target choice.** Score each enemy as `distance − 120 × (enemy distance from centre / R)` and pick the lowest, so enemies near the edge are preferred.
3. **Use the moves.** `palm` only when the target is more than 140 away. `guard` when an enemy within 100 is casting and facing it (angle within 0.5 rad), with probability 0.5 per decision. `grab` throws outward per the grab rule above. `smash` preferably when the target's `imb ≥ 60`, otherwise with probability 0.3 per opportunity.
4. **Loadouts** come from `randomPair()` as in 乱刃.

### Achievements

All are judged in the current round only. Emit them through 乱刃's `unlockAchievement(key)`: at most once per round, reset in `startGame()`, and before `stats`/`end`.

| key | Trigger (inside `ringOut`, when the credited `src` is the player) |
| --- | --- |
| `first_ko` | Any credited KO. |
| `redirect` | The victim's `lastHitCause === 'grab'`. |
| `reversal` | The victim's `lastHitCause === 'guard'`. |
| `double_ko` | Another KO credited to the player earlier this round had the same `lastHitCast`. Keep `koCasts: Map<castId, count>` and fire when the count reaches 2. |
| `first_win` | The player reaches `WIN_KOS`. |
| `unmoved` | At the win, `player.falls === 0`. |

### Stats

At round end, after achievements and before `emitMoYuFunEvent('end')`: `emitMoYuFunStats({ rounds: 1, wins: <player won ? 1 : 0>, kos: player.kos })`. A round abandoned with `B` sends nothing.

### Headless test

`v1/test_headless.js` keeps 乱刃 v4's stubs, simulation loop and SDK shape assertions, with these changes:

- The simulation runs until `phase === 'over'` or 4 minutes. It asserts at least one KO, no `NaN`, and every alive fighter within `platformR() + 1` of the centre.
- The deterministic round starts with loadout `grab` + `guard` and sets `lastHit*` fields by hand before calling `ringOut(victim)`:
  1. KO with cause `grab` and cast 1.
  2. KO with cause `guard` and cast 2.
  3. Two KOs with cause `jab` and cast 3.
  4. Set `player.kos = 7`, then one more KO.

  It asserts the sequence `start, first_ko, redirect, reversal, double_ko, first_win, unmoved, stats, end` and stats `{ rounds: 1, wins: 1, kos: 8 }`.
- A lost round asserts `wins: 0`. `backToMenu()` mid-round must send nothing.
- A fall with `lastHitT` older than 4 s credits nobody and sends no achievement.

## Milestones

Each milestone ends with `node games/brawl/v1/test_headless.js` passing.

**M1 · Playable round.** Copy slash v4, then build the moves, platform, shrink, ring-out, `imb`, AI, HUD and menu copy (title `擂 台`, subtitle `TOP-DOWN 拳脚大乱斗 · 选两种招式，把 5 名 AI 拳师打下擂台`, help line that mentions `8 次击飞` and `失衡值`).
Done when: a round played in a browser from `index.html` ends with a winner, and the simulation part of the test passes.

**M2 · Achievements, stats, package.** Write `game.json`, add the achievement and stats emission, the deterministic test, and `README.md`.
Done when: `pnpm game check brawl v1` passes.

**M3 · Local release.** With local Supabase, `pnpm dev` and `pnpm dev:games`, run `pnpm game:local publish brawl v1 --yes`.
Done when: `http://localhost:3000/play/brawl` plays; a logged-in round unlocks `first_ko` and updates the stats board. The production `pnpm game publish brawl v1` is run by the owner.

## Open items

- Balance (`imb` and `knock` values, fall threshold) is a starting point. Tune after M1 playtests; the owner accepts the feel before M3.
