# 摸了个鱼 (`tile-stack`)

**Status:** Implemented and published to production 2026-10-01 (`pnpm game publish tile-stack v1`; the play page loads at www.moyufuns.com/play/tile-stack). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A layered tile-matching game in the style of 羊了个羊. Click uncovered tiles from a messy office desk into a 7-slot tray, where three of a kind clear, and empty the desk before the tray fills. There are two levels: an easy tutorial and a hard second level. Mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/tile-stack/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 only the SDK block, the `resize()`/`view` pattern and the audio helpers. | Same package contract; the gameplay shares nothing with 乱刃. |
| D2 | Tiles are drawn as rounded cards with an emoji (`fillText`) on a pastel background. The emoji set is fixed (below). | No image assets. Emoji render on every current desktop and mobile OS. |
| D3 | Every level is generated from a **fixed seed** with a seeded PRNG (`mulberry32`), so every player sees the same layout, as in the original. | Shared difficulty ("I beat level 2 too") and deterministic tests. |
| D4 | Levels are **guaranteed solvable**. Generate the positions, simulate removing a random uncovered tile until none remain (that is the removal order), then assign types in blocks of 9 consecutive removals, each block holding 3 complete triples in shuffled order. Following that order never holds more than 6 tiles in the tray, and the tray is empty after each block. | The original is notorious for unwinnable layouts. Hard but fair suits a site that wants players to come back. |
| D5 | Each level is one round: `start` when the level begins, `end` when it is won or lost. After winning level 1, a `第二关` button starts level 2 as a new round. `再试一次` after a loss restarts the same level. | `start`/`end` and stats stay one per level; players don't replay the tutorial to retry level 2. |
| D6 | There are three power-ups, each usable once per level: 移出, 撤回 and 洗牌. Level 1 shows them disabled with the hint `第二关可用`. | Same power-ups as the original. The tutorial teaches the basic rule first. |
| D7 | Input uses Pointer Events (`pointerup` on a tile). Hover highlighting is for mouse only. | One code path for mouse and touch. |

## Out of scope

More than 2 levels, a daily level, lives or ads to revive, 复活, leaderboards, saving progress between page loads, cross-round achievements.

## Architecture

### Package

```text
games/tile-stack/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "tile-stack",
  "name": "摸了个鱼",
  "shortDescription": "三个一样就消除，赶在老板回来前清空桌面。",
  "description": "桌上堆满了咖啡、键盘、外卖和奶茶。点击没有被压住的牌放进下方槽位，三张相同即可消除，槽位放满七张就输了。第一关热身，第二关才是真正的挑战。",
  "tags": ["休闲", "消除", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点击牌放入槽位" },
    { "input": "道具按钮", "action": "移出 / 撤回 / 洗牌（每关各一次）" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "鱼", "eyebrow": "TILE MATCH", "accent": "#5dbb63", "accentSecondary": "#ffd24d" },
  "sortOrder": 30,
  "achievements": [
    { "key": "tutorial", "name": "入职", "description": "通过第一关。", "symbol": "职" },
    { "key": "clear", "name": "下班", "description": "通过第二关。", "symbol": "班" },
    { "key": "no_props", "name": "赤手空拳", "description": "不用任何道具通过第二关。", "symbol": "拳" },
    { "key": "combo_5", "name": "手速惊人", "description": "10 秒内消除 5 组。", "symbol": "速" },
    { "key": "close_call", "name": "悬崖勒马", "description": "槽位一度只剩 1 格，仍然通过第二关。", "symbol": "悬" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "通关", "maxPerRound": 1 },
    { "key": "tiles", "name": "消除", "maxPerRound": 108 }
  ]
}
```

### Tile types

`TYPES` (12): `☕` 咖啡, `⌨️` 键盘, `🖱️` 鼠标, `🪪` 工牌, `🥡` 外卖, `🧋` 奶茶, `📎` 回形针, `📱` 手机, `🎧` 耳机, `🍪` 饼干, `📅` 日历, `🐟` 鱼.

### Board and levels

- **Logical area:** 480 × 800 portrait. Tiles are 56 × 64 units with a 4 px darker bottom edge for depth.
- **Positions** are in half-tile grid units: `x = gx × 28`, `y = gy × 32`, plus the board offset.
- **Coverage:** a tile is covered when any tile on a higher layer overlaps its rectangle with positive area. Covered tiles are drawn at 55% brightness and are not clickable.
- **Side stacks** are two piles in the lower corners. Only the top tile of each pile is face up and uncovered.

| level | seed | types | tiles | main pile | side stacks |
| --- | --- | --- | --- | --- | --- |
| 1 | `1` | 3 (☕ ⌨️ 🐟) | 18 | 2 layers of 9 tiles on 3 × 3 grids, layer 1 offset by half a tile | none |
| 2 | `20260930` | 12 | 108 | 6 layers of `[20, 18, 16, 14, 12, 10]` tiles, placed at random non-overlapping cells inside a 7 × 7 tile region; odd layers offset by half a tile | 2 × 9 |

`generateLevel(n)` returns `{ tiles: [{ id, type, layer, gx, gy, stack: null | 0 | 1, stackIndex }], solution: [tileId…] }`, following D4.

Type assignment:
1. Split the removal order into blocks of 9.
2. Each block takes the next 3 types from a type queue. The queue is the 12 types shuffled, repeated 3 times, so every type appears in exactly 3 blocks and has 9 tiles.
3. Shuffle the block's 9 type slots.

Level 1 uses blocks of 9 over its 3 types.

### Tray and rules

- **Tray:** 7 slots at the bottom. A picked tile is inserted right after the last tray tile of the same type, or at the end if there is none. This mirrors the original's grouping.
- **Clearing:** after each insert, if a type has 3 tiles in the tray, they are removed with a 0.25 s pop and the rest slide left. Then `triples++` and `tilesCleared += 3`.
- **Loss:** the tray holds 7 tiles after the clear check.
- **Win:** the board, the side stacks, the 移出 row and the tray are all empty.
- `trayPeak` records the largest tray count seen after the clear check.

Power-ups:
- **移出:** moves the first 3 tray tiles (or fewer) to a holding row above the tray. Tiles there are always clickable and go back into the tray when clicked.
- **撤回:** returns the last picked tile to its board position. It is disabled when the last pick caused a clear, or when there is no pick yet.
- **洗牌:** randomly permutes the types among the remaining board and side-stack tiles, keeping positions. This uses `Math.random`, so the D4 guarantee no longer holds after a shuffle. The tooltip `洗牌后不保证有解` says so.

### Screens

- **Start:** title `摸了个鱼`, subtitle `赶在老板回来之前，把桌面收拾干净`, and a `开始` button.
- **HUD:** `第 1 关` / `第 2 关` and `剩余 N 张` at the top, with three power-up buttons above the tray showing `移出 1`, `撤回 1`, `洗牌 1`, greyed when used.
- **Won level 1:** `入职成功！` with a `第二关` button.
- **Won level 2:** `下班！桌面清空了` showing time taken and power-ups used.
- **Lost:** `槽位满了` with a `再试一次` button.

### Functions

- `startLevel(n)`: resets state and `roundAchievements`, then sends `start`.
- `isCovered(tile)`
- `pick(tileId)`: returns `false` if the tile is not clickable.
- `useProp(name)`
- `winLevel()`
- `loseLevel()`
- `update(dt)`: advances `gameT` and animations.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `combo_5` | A clear where the last 5 clear times (`clearTimes`, in `gameT`) span ≤ 10 s. Either level. |
| `tutorial` | `winLevel()` on level 1. |
| `clear` | `winLevel()` on level 2. |
| `no_props` | `winLevel()` on level 2 with no power-ups used. |
| `close_call` | `winLevel()` on level 2 with `trayPeak >= 6`. |

The win achievements are sent in the order `clear, no_props, close_call`.

### Stats

In `winLevel()`/`loseLevel()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, tiles: tilesCleared })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern.

**Generator:**
- For both levels, `generateLevel` is deterministic: the same output twice.
- Every type count is a multiple of 3, and level 2 has 9 tiles of each of the 12 types.
- Replaying `solution` with `pick` wins with `trayPeak <= 6`, and every pick in it is clickable when made.

**Random play.** On level 2, picking random clickable tiles ends in a win or a loss, and the tray never exceeds 7.

**Deterministic level 1.** `startLevel(1)`, then replay the solution with `gameT` frozen. Expected sequence: `start, combo_5, tutorial, stats, end`. Level 1 has 6 triples, all at `gameT = 0`.

**Deterministic level 2.** `startLevel(2)`, then replay the solution with `gameT` frozen, setting `trayPeak = 6` before the last pick. Expected sequence: `start, combo_5, clear, no_props, close_call, stats, end`. Expected stats: `{ rounds: 1, wins: 1, tiles: 108 }`.

**Power-ups:**
- 撤回 restores the board position and tray length.
- 移出 puts 3 tiles in the holding row, and they are clickable.
- After any power-up is used, a win sends no `no_props`.

**Loss.** Filling the tray with 7 distinct types sends `stats` with `wins: 0`, then `end`.

## Milestones

Each milestone ends with `node games/tile-stack/v1/test_headless.js` passing.

**M1 · Playable levels.** Generator, coverage, tray, power-ups, both levels, screens, sounds (click, pop, fail).
Done when: both levels play in a browser, and the generator tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic tests, `README.md`.
Done when: `pnpm game check tile-stack v1` passes.

**M3 · Local release.** `pnpm game:local publish tile-stack v1 --yes`.
Done when: `/play/tile-stack` plays locally, and a logged-in level 1 win unlocks `tutorial` and updates the board. The owner runs the production publish.

## Open items

- Level 2's difficulty depends on the layout drawn from seed `20260930`. If playtests in M1 find it too easy or too hard, the owner picks another seed or changes the layer counts; tests follow the new seed automatically.

## Implementation notes

- `resize()` sizes the canvas from `document.documentElement.clientWidth/Height`, not 乱刃's `innerWidth/innerHeight`. On phones an oversized canvas inflates `innerWidth` (750 vs 375 CSS px in the emulator), which locked the game into a zoomed-in crop.
- Power-up keys are the Chinese names: `useProp('移出' | '撤回' | '洗牌')`. 移出 clears the last pick, so 撤回 is disabled until the next pick.
- The 洗牌 hint is a caption under the button rather than a hover tooltip, so touch players see it too.
- The level 2 win screen has a `再玩一次` button (restarts level 2) so it is not a dead end.
- Random clicking wins 0 of 20 level 2 rounds in the headless test. That is expected for random play and says nothing about human difficulty (Open items).

### M3 notes

- Local publish registered the game, five achievements and three stats. A logged-in level 1 win on `/play/tile-stack`, played with real clicks, unlocked `combo_5` and `tutorial` (the site showed the popup) and wrote `rounds 1, wins 1, tiles 18` to `user_game_stats`.
- Production publish passed upload, verify, register, revalidate and smoke; the play page loads on www.moyufuns.com. Level 2 difficulty from seed `20260930` still needs a human playtest.

