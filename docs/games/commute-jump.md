# 通勤跳一跳 (`commute-jump`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A one-button timing game in the style of 微信跳一跳. You're late for work and hop from desk to printer to coffee machine: hold to charge, release to jump, and land near the centre for combo points. A miss ends the run. Keyboard, mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/commute-jump/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 only the SDK block, the `resize()`/`view` pattern and the audio helpers. | Same package contract; the gameplay shares nothing with 乱刃. |
| D2 | The game logic is 2D ground coordinates (`x`, `y`, units). Rendering is isometric: `sx = (x − y) × cos30°`, `sy = (x + y) × sin30° − z`. Blocks are boxes or cylinders drawn with three shaded faces. | All hit tests stay 2D and cheap; the 3D look is purely in `render()`. No WebGL. |
| D3 | Each new block is placed along +x or +y from the current one (50/50), at centre distance 140–260. The jump direction is from the player's position toward the next block's centre. | The same "two directions" rule as the original. Aiming at the centre removes sideways error, so only the charge matters. |
| D4 | Jump distance is `charge × 300` units, with the charge capped at 1.5 s (450 units). | The longest gap plus half the largest block is 315, so a full charge always overshoots and a miss is always possible. |
| D5 | Landing is judged at the landing point only: inside the next block's top, a success; inside the current block's top, nothing happens; elsewhere, a fall that ends the run. | Simpler than the original's edge-tipping physics, and just as readable. |
| D6 | Randomness goes through `rng()`, which defaults to `Math.random`. The test replaces it with a seeded `mulberry32`. | Deterministic tests without seeding every player's run. |

## Out of scope

Edge-tipping physics, skins, music, a revive, leaderboards, saving a run, cross-round achievements.

## Architecture

### Package

```text
games/commute-jump/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "commute-jump",
  "name": "通勤跳一跳",
  "shortDescription": "按住蓄力，松开起跳，一路跳进公司。",
  "description": "上班快迟到了！按住蓄力、松开起跳，在办公桌、打印机和咖啡机之间跳跃。正中中心可以连击加分，在咖啡机或打卡机上停留还有额外奖励，可千万别跳上老板工位。",
  "tags": ["休闲", "单键", "单人"],
  "controls": [
    { "input": "空格 / 鼠标 / 触摸", "action": "按住蓄力，松开起跳" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R", "action": "再来一局" }
  ],
  "cover": { "symbol": "跳", "eyebrow": "ONE BUTTON", "accent": "#6ee7ff", "accentSecondary": "#ff6b9d" },
  "sortOrder": 50,
  "achievements": [
    { "key": "score_50", "name": "准时打卡", "description": "单局得分达到 50。", "symbol": "卡" },
    { "key": "score_200", "name": "全勤奖", "description": "单局得分达到 200。", "symbol": "勤" },
    { "key": "bullseye_5", "name": "稳如老狗", "description": "连续 5 次正中靶心。", "symbol": "稳" },
    { "key": "coffee", "name": "续命", "description": "在咖啡机上停留拿到奖励。", "symbol": "咖" },
    { "key": "boss_desk", "name": "自投罗网", "description": "跳上老板工位。", "symbol": "罗" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "jumps", "name": "跳跃", "maxPerRound": 1000 },
    { "key": "bullseyes", "name": "靶心", "maxPerRound": 1000 }
  ]
}
```

### Blocks

Each block is `{ x, y, shape: 'box' | 'cyl', size, h, kind, color, label, stayT, bonusPaid }`. `size` is the side length of a box or the diameter of a cylinder; `h` is the drawn height, 40–70.

| kind | label (drawn on the top face) | colour | chance | effect |
| --- | --- | --- | --- | --- |
| `desk` | 桌 | `#c9a27a` | rest | — |
| `cabinet` | 柜 | `#8a93a8` | rest | — |
| `printer` | 印 | `#e8ecf4` | rest | — |
| `water` | 水 | `#6ee7ff` (cyl) | rest | — |
| `coffee` | ☕ | `#7a4a2a` (cyl) | 7.5% | Stay 2 s for +10, once; floater `续命 +10` and a sip sound. |
| `clock` | 卡 | `#4a6cff` | 4.5% | Stay 2 s for +15, once; floater `打卡 +15` and a beep. |
| `boss` | 老板 | `#ff5a5a` | 3% | On landing −5 (score floored at 0), floater `被老板发现！-5`. |

The first 5 blocks are always ordinary kinds (desk, cabinet, printer or water, chosen at random). After that, 15% of new blocks are special; the chance column shows each special's overall share, split 50/30/20.

Size: `size = max(50, 110 − score × 0.25) × rng(0.85, 1.15)`.

Gap: `rng(140, 140 + min(120, score × 0.6))`.

Only the last 6 blocks are kept in the `blocks` array.

### Player and jump

- The player is a chess-piece figure: a sphere head on a cone body, dark blue, with a small tie. It stands on the current block at `(px, py)`.
- **Charging:** `pointerdown`/`keydown Space` starts the charge; `charge += dt` up to 1.5. While charging, the figure squashes up to 30% and the block sinks up to 8 units, and a rising tone plays.
- **Jump:** `pointerup`/`keyup` calls `jump(charge)`. The jump direction is the unit vector from `(px, py)` to the next block's centre, and `dist = charge × 300`. The figure flies along a 0.45 s parabolic arc with a flip, then `land(x, y)` runs.

`land(x, y)`:
- **Inside the next block's top** (box: `|dx|, |dy| ≤ size / 2`; cylinder: `hypot ≤ size / 2`), a success:
  1. `jumps++`.
  2. If the distance to the centre is ≤ 10, it's a bullseye: `combo++`, `bullseyes++`, gain `2 × combo`, and show a ripple ring. Otherwise `combo = 0` and gain 1.
  3. Apply the `boss` penalty if the block is the boss desk.
  4. Generate a new next block and pan the camera.
- **Inside the current block:** no score; stay.
- **Otherwise:** the figure falls with a short drop animation, then `gameOver()`.

Standing still accumulates `stayT` on the current block for the coffee and clock bonuses.

### Camera and screens

- **Camera:** eases (0.3 s) so that the midpoint between the current and next block sits at 55% of the screen height.
- **Background:** a vertical gradient office wall with a faint window grid.
- **Start screen:** title `通勤跳一跳`, subtitle `按住蓄力 · 松开起跳 · 别迟到`, and a `开始` button.
- **HUD:** a large score at top left, and `连击 ×N` when `combo ≥ 2`.
- **Game over:** `迟到了！` showing the score, `跳跃 N 次 · 靶心 N 次`, and `R / 点击 再来一局`.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `bullseye_5` | `combo` reaches 5. |
| `coffee` | The coffee bonus is paid. |
| `boss_desk` | Landing on a `boss` block. |
| `score_50` | `score >= 50` after any score change. |
| `score_200` | `score >= 200` after any score change. |

### Stats

In `gameOver()`, before `end`: `emitMoYuFunStats({ rounds: 1, jumps: Math.min(jumps, 1000), bullseyes: Math.min(bullseyes, 1000) })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `rng` replaced by `mulberry32(42)`.

**Simulation.** 50 rounds of random charges between 0.2 and 1.5 s. Every round must end, with no `NaN`, `blocks.length <= 6`, and every next block's centre distance within [140, 260].

**Deterministic round.** `startGame()`, then a helper `perfect()` that calls `jump(hypot(next − player) / 300)` and completes the arc with `update` steps.
1. Five `perfect()` calls → `bullseye_5`.
2. Set the next block's `kind = 'coffee'`, then `perfect()` and `update` for 2.1 s → `coffee`.
3. Set the next block's `kind = 'boss'`, then `perfect()` → `boss_desk`.
4. Set `score = 48`, then `perfect()` → `score_50`.
5. Set `score = 198`, then `perfect()` → `score_200`.
6. `jump(1.5)`, a guaranteed fall.

Set `score = 0` before steps 2 and 3. Otherwise the combo points push the score past 50 early, and `score_50` would fire out of order.

Expected sequence: `start, bullseye_5, coffee, boss_desk, score_50, score_200, stats, end`. Expected stats: `{ rounds: 1, jumps: 9, bullseyes: 9 }`.

**Other cases:**
- `jump(0.05)` lands on the current block: no score change, the round continues.
- After `startGame()`, `roundAchievements` is reset.

## Milestones

Each milestone ends with `node games/commute-jump/v1/test_headless.js` passing.

**M1 · Playable run.** Blocks, isometric rendering, charge and jump, landing, special blocks, camera, screens, sounds.
Done when: a browser run feels responsive (charge to landing in under 0.5 s), a bullseye is reachable by feel, and the simulation passes.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check commute-jump v1` passes.

**M3 · Local release.** `pnpm game:local publish commute-jump v1 --yes`.
Done when: `/play/commute-jump` plays locally, and a logged-in run updates the board. The owner runs the production publish.

## Open items

- The 300 units/s charge rate, the bullseye radius of 10 and the difficulty ramp are first guesses. The owner accepts the feel after M1.
