# 合成大鲲 (`kun-merge`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A physics merge game in the style of 合成大西瓜. Drop fish into a tank; two identical fish that touch merge into the next tier, from 鱼苗 up to 鲲. The game ends when the tank overflows. Mouse, keyboard or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/kun-merge/v1/index.html`, vanilla JS and canvas, no dependencies. Copy only these parts of 乱刃 v4: the SDK block (`MOYUFUN_PARENT_ORIGIN`, `emitMoYuFun*`, `unlockAchievement`), the `resize()`/`view` scaling pattern, and `ensureAudio`/`tone`/`noiseHit`. Everything else is new. | Same package contract and SDK; the gameplay shares nothing with 乱刃. |
| D2 | Hand-written circle physics instead of a physics library: gravity, wall and floor collisions, pairwise circle push-apart with mass ∝ r², 4 substeps per frame. | About 80 lines does it. Matter.js would be a 90 KB dependency for circles only. |
| D3 | The tank is a 480 × 720 logical portrait area, scaled to fit the iframe with `resize()`. | Portrait like the original, readable at any iframe size. |
| D4 | Input uses Pointer Events (aim on move, drop on `pointerup`) plus A/D or ←/→ to aim and Space to drop. | One code path covers mouse and touch for free. |
| D5 | Two 鲲 merging both vanish for a +1000 bonus, as two watermelons do in the original. | Keeps the board from ending in a 鲲 jam, and gives expert players a goal. |
| D6 | A round is one tank, from `开始` (or `R`) to overflow. There is no time limit and no pause. | Matches the original's flow; `start`/`end` map one-to-one onto it. |

## Out of scope

Leaderboards, saving a run, power-ups (hammer, shake), skins, a daily mode, cross-round achievements.

## Architecture

### Package

```text
games/kun-merge/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "kun-merge",
  "name": "合成大鲲",
  "shortDescription": "北冥有鱼，两两相合，终成鲲。",
  "description": "把小鱼丢进鱼缸，两条相同的鱼碰到一起就会合成更大的鱼。从鱼苗一路合成鲸，再合成传说中的鲲。鱼堆过红线就输了。",
  "tags": ["休闲", "合成", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "瞄准，松开投放" },
    { "input": "A / D 或 ← / →", "action": "左右瞄准" },
    { "input": "空格", "action": "投放" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R", "action": "再来一局" }
  ],
  "cover": { "symbol": "鲲", "eyebrow": "MERGE", "accent": "#4a6cff", "accentSecondary": "#b78cff" },
  "sortOrder": 20,
  "achievements": [
    { "key": "first_koi", "name": "锦鲤附体", "description": "合成第一条锦鲤。", "symbol": "锦" },
    { "key": "whale", "name": "鲸落", "description": "合成一头鲸。", "symbol": "鲸" },
    { "key": "kun", "name": "鲲之大", "description": "合成鲲。", "symbol": "鲲" },
    { "key": "chain", "name": "连锁反应", "description": "一次投放引发 4 次合成。", "symbol": "连" },
    { "key": "score_3000", "name": "年年有余", "description": "单局得分达到 3000。", "symbol": "余" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "merges", "name": "合成", "maxPerRound": 2000 },
    { "key": "kun", "name": "鲲", "maxPerRound": 20 }
  ]
}
```

### Tiers

`TIERS` (index = tier). Creating tier `t` by a merge scores `(t + 1)(t + 2) / 2` points (triangular, as in the original).

| t | name | r | colour | points |
| --- | --- | --- | --- | --- |
| 0 | 鱼苗 | 16 | `#a8e6ff` | — |
| 1 | 虾米 | 22 | `#ff9e9e` | 3 |
| 2 | 小丑鱼 | 30 | `#ff8a3d` | 6 |
| 3 | 金鱼 | 38 | `#ffd24d` | 10 |
| 4 | 锦鲤 | 48 | `#ff5a5a` | 15 |
| 5 | 河豚 | 58 | `#c9e86b` | 21 |
| 6 | 海龟 | 70 | `#5dbb63` | 28 |
| 7 | 鲨鱼 | 84 | `#7a8ca8` | 36 |
| 8 | 鲸 | 100 | `#4a6cff` | 45 |
| 9 | 鲲 | 118 | `#b78cff` | 55 |

Each fish is a filled circle in its colour, with a simple fish silhouette (body ellipse, tail triangle, eye) drawn at radius `r` and its name in small text. The silhouette faces the direction of horizontal velocity, defaulting to right.

The dropped tier is random over tiers 0–4 with weights `[30, 25, 20, 15, 10]`. The next fish is shown top right as `下一条`.

### Physics

Constants:
- `W = 480`, `H = 720`
- `LINE_Y = 120` (red dashed line), `DROP_Y = 60`
- `GRAVITY = 1800`
- `RESTITUTION = 0.15`, `DAMPING = 0.995` per substep
- `SUBSTEPS = 4`
- `DROP_COOLDOWN = 0.5` s

Each fish is `{ id, tier, x, y, vx, vy, r, born, overT }`.

`step(dt)` runs `SUBSTEPS` times with `h = dt / SUBSTEPS`:
1. `vy += GRAVITY × h`, then position += velocity × `h`, then velocity ×= `DAMPING`.
2. **Walls and floor:** clamp the position into `[r, W − r]` × `(−∞, H − r]`. Flip the normal velocity times `−RESTITUTION`.
3. **Pairs**, 3 iterations over all pairs. If `dist < ra + rb`:
   - If the tiers are equal and neither fish is flagged `merged` this step: call `merge(a, b)`.
   - Otherwise: push apart along the normal in proportion to the other fish's mass (`r²`). If the fish are approaching, apply an impulse with `RESTITUTION`.

`merge(a, b)` removes both fish and does the following:
- **Below 鲲:** adds a fish of tier `t + 1` at the midpoint with the averaged velocity and `born = now`, adds its points, `merges++`, `dropMerges++`, plays a pop with a pitch that rises with tier, and spawns particles. If `t + 1 === 9`, also `kunCount++`.
- **Two 鲲:** adds +1000 points and a big particle burst instead of a new fish.

It then runs the achievement checks.

**Game over.** A fish older than 1 s whose top (`y − r`) is above `LINE_Y` adds `dt` to its `overT`; otherwise `overT = 0`. The line flashes red while any `overT > 0`. When any `overT ≥ 2`, call `gameOver()`.

### Flow and UI

- **Start screen** (DOM overlay, styled like 乱刃's menu): title `合成大鲲`, subtitle `北冥有鱼，其名为鲲`, a tier strip showing all 10 fish, and a `开始` button.
- **Playing:**
  - The next fish follows the aim `x` at `DROP_Y` with a faint vertical guide line.
  - `drop()` releases it (`vx = vy = 0`), resets `dropMerges = 0` and starts `DROP_COOLDOWN`.
  - The score is shown top left, and `最大：<tier name>` under it.
- **Game over:** a banner `鱼缸满了` showing the score, the largest fish of the round, `合成 N 次`, and `R / 点击 再来一局`.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, reset in `startGame()`, and before `stats`/`end`.

| key | Trigger (in `merge`) |
| --- | --- |
| `first_koi` | The new tier is 4. |
| `whale` | The new tier is 8. |
| `kun` | The new tier is 9. |
| `chain` | `dropMerges` reaches 4. This counts every merge between one `drop()` and the next. |
| `score_3000` | `score >= 3000` after adding points. |

### Stats

In `gameOver()`, before `end`: `emitMoYuFunStats({ rounds: 1, merges: Math.min(merges, 2000), kun: Math.min(kunCount, 20) })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern: extract the `<script>`, stub `document`, `canvas`, `AudioContext` and `parent.postMessage`, then append a driver.

**Physics simulation.** Drop at a random `x` every 0.6 s of game time, stepping `update(1/60)`, for up to 15 minutes of game time. Assert:
- `phase === 'over'` is reached
- `merges > 0`
- no `NaN`
- every fish satisfies `r − 1 ≤ x ≤ W − r + 1` and `y ≤ H − r + 1`
- the message sequence ends `…, stats, end`

**Deterministic round.** Call `startGame()`. Before each step, clear `fish = []` and add a pair with `addFish(tier, x, y)` overlapping by 4 px. Then:
1. Call `drop()`.
2. A tier 3 pair, then `step(1/60)`.
3. A tier 7 pair, then `step`.
4. A tier 8 pair, then `step`.
5. A tier 0 pair, then `step` (the fourth merge since the drop).
6. Set `score = 2995`, add a tier 0 pair, then `step`.
7. `gameOver()`.

Expected sequence: `start, first_koi, whale, kun, chain, score_3000, stats, end`. Expected stats: `{ rounds: 1, merges: 5, kun: 1 }`.

**鲲 + 鲲.** A tier 9 pair leaves zero fish and adds 1000.

**Restart.** `startGame()` again resets `roundAchievements`, so `first_koi` is sent again.

## Milestones

Each milestone ends with `node games/kun-merge/v1/test_headless.js` passing.

**M1 · Playable tank.** Physics, tiers, drop, merge, game over, start and over screens, sounds.
Done when: a browser round reaches 鲸 with reasonable play, the fish settle without jitter, and the simulation test passes.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check kun-merge v1` passes.

**M3 · Local release.** `pnpm game:local publish kun-merge v1 --yes`.
Done when: `/play/kun-merge` plays locally, and a logged-in round unlocks `first_koi` and updates the board. The owner runs the production publish.

## Open items

- `score_3000` assumes one 鲲 is worth about 2,500–3,500 points. The owner retunes the threshold or the radii after M1 playtests if 鲲 is too easy or too rare.
