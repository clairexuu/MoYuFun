# 蚁后 (`ant-queen`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A real-time colony defence game where you never command an ant. You paint pheromone trails with the pointer: green 觅食 trails lead workers to food, red 进攻 trails send soldiers out to fight. Trails evaporate, paint costs a regenerating ink meter, and the queen turns delivered food into new ants. Survive 8 waves of beetles, spiders and a rival colony (about 7 minutes) with the queen alive. Mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers `tone`/`noiseHit`), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/ant-queen/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, the `resize()`/`view` pattern (`document.documentElement.clientWidth/Height`) and the audio helpers `tone`/`noiseHit`. | Same package contract; the gameplay shares nothing with either game. |
| D2 | Control is indirect only. The player has three brushes (觅食, 进攻, 擦除) and one production toggle. Ants cannot be selected, and there is no rally point, pause or speed control. | The whole game is reading the map and drawing good trails. Any direct command would make trails optional. |
| D3 | Pheromone lives in two `Float32Array` grids (`fieldFood`, `fieldAttack`) of 12 px cells. Painting raises cells to 1.0, and every cell decays as `v *= exp(-dt / τ)` (τ 30 s green, 12 s red); values under 0.05 snap to 0. Ants treat a cell as trail at ≥ 0.12. | 80 × 50 cells is cheap to decay and render every frame. τ sets how long a trail commits ants: a full green trail lasts 64 s, a red one 25 s. |
| D4 | Ants never deposit pheromone. They steer with three forward sensors on the field of their colour and keep their momentum; homebound workers follow the same trail back with a bias toward the nest, and beeline home when they lose it. | The map shows exactly what the player drew, so trails don't snowball on their own. Sensor steering works on undirected trails, so strokes can be drawn in either direction and around corners. |
| D5 | No income without trails. Idle ants wander within 90 px of the nest, and food never spawns closer than 200 px. Ants on a trail move 1.75 × faster than wandering ants. | Trail drawing is the economy, not a bonus on top of it. |
| D6 | Ink: max 100, starts full, regenerates 3/s. Painting a cell costs `(1 − old) × rate`, with rate 0.25 for green and 0.5 for red. Erasing is free. | Refreshing a half-faded trail costs half as much as a new one, so maintaining good routes beats scribbling. Red is expensive and short-lived: attacks are deliberate commitments. |
| D7 | Soldiers defend the nest automatically: idle soldiers engage enemies within 130 px of the nest. Red trails extend their reach, and a soldier that starts a fight from a red trail gets 冲锋 (×1.5 damage for 4 s). | Automatic defence is the floor, so a new player survives wave 1. Trails are the ceiling: interceptions far from the nest protect workers and the queen and hit harder. |
| D8 | Rival fire ants (火蚁) that come within 60 px of a green trail follow it to the nest. | Long-lived green trails become a liability during raids, which gives the 擦除 brush and trail timing a purpose. |
| D9 | The queen hatches from a repeating pattern chosen by the toggle: 工蚁多 `[W,W,W,S]`, 均衡 `[W,S]` (default), 兵蚁多 `[S,S,S,W]`. | One button, deterministic and easy to test; the pattern pointer never needs explaining. |
| D10 | Waves follow a fixed table. Each wave's edges are drawn by `rng()` and announced 8 s ahead. The round is won when wave 8 has fully spawned and no enemy is alive, and lost when the queen's HP reaches 0. | A fixed table makes balance testable. The warning gives the player time to pre-paint red trails, which rewards planning. |
| D11 | The logical map is 960 × 600 when the client area is at least as wide as it is tall, otherwise 600 × 960, decided in `startGame()` and kept for the round. The nest is at the centre. Letterboxed with `view.s`. | Phones held upright get a usable map instead of a 0.39 × scale strip. All positions derive from `W`, `H`, so both orientations share code. |
| D12 | `ready` is sent on load and again at 0.5, 2 and 5 s. `start` is sent when `开始` or `再来一局` is pressed, which starts the clock. | Same as 升官记 D8: the site may miss an early `ready`. |
| D13 | Randomness goes through `rng()` (default `Math.random`, seeded `mulberry32` in tests). The rAF loop calls `update(1/60)` in fixed steps (at most 4 per frame, skipping gaps over 0.25 s); the test calls `update` directly. Rendering only reads state. | Deterministic tests, and a hidden tab doesn't fast-forward a wave. |
| D14 | Performance caps: at most 300 ants (production pauses with `蚁巢已满`) and at most 80 enemies. Enemies find ants through 48 px buckets rebuilt each step; ants scan the enemy list. Budget: `update` ≤ 4 ms at 300 ants on a mid laptop. | Keeps the worst case at 300 × 80 distance checks per step. |

## Out of scope

Selecting or commanding single ants, terrain obstacles, upgrades or a tech tree, difficulty levels, pause, multiplayer, saving between page loads, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/ant-queen/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "ant-queen",
  "name": "蚁后",
  "shortDescription": "不指挥任何一只蚂蚁，只靠画下的气味守住蚁巢。",
  "description": "你是花园土壤下的蚁后。拖动画出绿色觅食信息素，工蚁会沿着它找到食物运回蚁巢；画出红色进攻信息素，兵蚁会沿着它出击。信息素会慢慢挥发，墨水也有限。用食物孵化更多蚂蚁，挡住甲虫、蜘蛛和敌对火蚁的八波进攻。",
  "tags": ["策略", "即时战略", "单人"],
  "controls": [
    { "input": "鼠标拖动 / 手指拖动", "action": "画信息素路线" },
    { "input": "1 / 2 / 3 或工具栏", "action": "切换觅食 / 进攻 / 擦除" },
    { "input": "Q 或产卵按钮", "action": "切换工蚁与兵蚁的孵化比例" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R", "action": "结束后再来一局" }
  ],
  "cover": { "symbol": "蚁", "eyebrow": "PHEROMONE RTS", "accent": "#c0392b", "accentSecondary": "#7a5230" },
  "sortOrder": 140,
  "achievements": [
    { "key": "first_food", "name": "第一口粮", "description": "工蚁第一次把食物运回蚁巢。", "symbol": "粮" },
    { "key": "colony_50", "name": "蚁丁兴旺", "description": "同时拥有 50 只蚂蚁。", "symbol": "旺" },
    { "key": "highway", "name": "蚁流不息", "description": "30 秒内运回 45 份食物。", "symbol": "流" },
    { "key": "ambush", "name": "半路截杀", "description": "在离蚁巢 220 像素以外消灭 10 个敌人。", "symbol": "截" },
    { "key": "victory", "name": "王朝延续", "description": "撑过全部 8 波进攻。", "symbol": "朝" },
    { "key": "steady_queen", "name": "稳坐巢中", "description": "赢下一局，且蚁后生命从未低于一半。", "symbol": "稳" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "守住蚁巢", "maxPerRound": 1 },
    { "key": "food", "name": "运回食物", "maxPerRound": 2000 },
    { "key": "kills", "name": "消灭敌人", "maxPerRound": 500 }
  ]
}
```

### Map and look

- **Map:** `W × H` (D11), soil gradient `#7a5230` → `#5e3d22`, 40 seeded cosmetic pebbles and grass tufts along the edges (no collision).
- **Nest:** at `(W/2, H/2)`, a mound of r 34 with a dark hole and a 👑. A ring of r 40 shows queen HP (green → red). A faint dashed circle of r 90 marks the wander zone, labelled `蚁巢范围` for the first 20 s.
- **Grid:** `gw = W/12`, `gh = H/12` cells. Rendered each frame by writing an `ImageData` of `gw × gh` (green `rgb(90,200,90)` alpha `v × 160`; red `rgb(220,60,50)` alpha `v × 180`; red drawn over green) to an offscreen canvas, then `drawImage` scaled to the map with smoothing on, so trails look soft.
- **Ants** are drawn as shapes, not emoji: three dark-brown (`#3b2414`) ellipses, 8 px long for workers and 11 px with a bigger head for soldiers. A worker carrying food has a 3 px yellow dot. Fire ants are the same shape in `#d23a2a`.
- **Enemies** are emoji via `fillText`: 甲虫 🪲 24 px, 蜘蛛 🕷️ 26 px, 锹甲 🪲 48 px with a dark-red ring. Each has an HP bar when damaged.
- **Food sources** are emoji (🍓 🍞 🍪 chosen by `rng()`, 🍉 for big ones), 24–40 px scaled by remaining amount, with the amount below.

### Pheromone and ink

- `paintStroke(kind, points)` with `kind` `'food' | 'attack' | 'erase'` walks the polyline in 6 px steps and calls `paintAt(kind, x, y)`. The pointer handlers call it with each segment from the last point.
- `paintAt` touches every cell whose centre is within 14 px of the point (about 3 cells wide). For `food`/`attack` it raises the cell to 1.0 if `ink ≥ (1 − v) × rate`, paying that cost; otherwise it skips the cell and the ink bar flashes red for 0.3 s. `erase` sets both fields to 0 at no cost.
- A straight 300 px green stroke touches about 75 cells and costs about 19 ink; red costs about 38.
- `sample(field, x, y)` returns the value of the cell containing the point, or 0 outside the map.

### Ants

`{ id, kind: 'worker' | 'soldier', x, y, heading, hp, state, carrying, target, t, chargeT }`

| | 工蚁 worker | 兵蚁 soldier |
| --- | --- | --- |
| HP | 6 | 20 |
| wander speed / trail speed | 40 / 70 | 45 / 79 |
| damage per second | 1 (only against an enemy attacking it) | 4, ×1.5 while `chargeT > 0` |
| radius | 4 | 5 |
| cost / hatch time | 5 food / 2 s | 10 food / 2 s |

**Sensors.** Three points 18 px ahead at `heading − 0.6`, `heading`, `heading + 0.6`. If the centre value is at least both sides, keep heading. Otherwise turn toward the larger side at up to 5 rad/s. Add jitter `(rng() − 0.5) × 0.4 × dt` to heading every step. An ant is *on trail* while any sensor reads ≥ 0.12. Ants are clamped to the map.

**Worker states.**
- `idle`: random walk (heading jitter ±1.5 rad/s) inside r 90 of the nest; turns back toward the nest at the edge. If any green sensor reads ≥ 0.12: `out`, with heading set to the angle from the nest to the ant.
- `out`: follows the green trail at trail speed. If it loses the trail: `forage`.
- `forage`: random walk at wander speed within 40 px of where it lost the trail, for 3 s; then heading += π and back to `out` if a sensor sees trail, else `home` (empty).
- Any time in `out` or `forage`, a food source with `amount > 0` within 30 px: stop 0.5 s, take 1 (`amount--`), `carrying = true`, heading += π, `home`.
- `home`: follows the green trail with sensors, but when left and right differ by less than 0.1 it picks the side closer to the nest. Off trail, it beelines to the nest at wander speed. Within 24 px of the nest: 0.3 s pause, then `deliverFood()` if carrying, and `idle`.

**Soldier states.**
- `idle`: wanders within r 70. Engages any enemy within 60 px of itself or within 130 px of the nest (`fight`).
- `out`: as a worker's `out`, on the red field. Engages enemies within 70 px with `chargeT = 4`. Losing the trail: `hold`.
- `hold`: patrols within 50 px of the trail tip while `sample(fieldAttack, tip) ≥ 0.12`, engaging enemies within 80 px with `chargeT = 4`. When the tip evaporates: `return`.
- `fight`: moves to the target at trail speed and deals damage while in range (centre distance ≤ sum of radii + 4). When the target dies, picks the nearest enemy within 80 px; if none, back to `out` if on a red trail, else `return`.
- `return`: beelines to the nest at wander speed, then `idle`.

### Enemies

`{ id, type, x, y, hp, maxHp, target }`. Contact range is the sum of radii + 4. Any enemy within 34 px of the nest that is not already fighting an ant attacks the queen.

| type | name | HP | speed | dps | radius | behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| `beetle` | 甲虫 | 60 | 22 | 6 | 14 | Walks straight to the nest. Stops to fight the nearest ant in contact. |
| `spider` | 蜘蛛 | 40 | 50 | 8 | 12 | Every 0.5 s targets the nearest ant within 160 px and chases it; with none, walks to the nest. |
| `fire` | 火蚁 | 8 | 55 | 2 | 5 | With green ≥ 0.12 within 60 px, follows the green trail with the nest-bias rule; otherwise walks to the nest. Bites any ant in contact. |
| `stag` | 锹甲 | 400 | 18 | 15 | 22 | As `beetle`, but its bite hits every ant in contact. |

**Queen:** 200 HP, no attack. Regenerates 1 HP/s while no enemy is within 60 px of the nest. `queenMinHp` tracks the lowest value of the round.

### Waves

The warning appears 8 s before each wave: an arrow on each chosen edge, a banner `第 N 波 · 来自东方：甲虫 ×3 · 蜘蛛 ×1`, and two low tones. At the wave time, its units enter evenly over 3 s at random points along the middle 60% of the chosen edges, split round-robin between edges. Edges are 北 (top), 南, 东 (right), 西, distinct within a wave.

| wave | time | units | edges |
| --- | --- | --- | --- |
| 1 | 0:45 | beetle ×2 | 1 |
| 2 | 1:30 | fire ×8 | 1 |
| 3 | 2:15 | beetle ×3, spider ×1 | 1 |
| 4 | 3:00 | fire ×14 | 2 |
| 5 | 3:45 | spider ×3, beetle ×2 | 2 |
| 6 | 4:30 | fire ×16, beetle ×2 | 2 |
| 7 | 5:15 | spider ×4, beetle ×4 | 3 |
| 8 | 6:00 | stag ×1, fire ×20, beetle ×3, spider ×2 | 3 |

`wave` counts waves started (0–8); `spawnQueue` holds units still to enter. Win check in `update`: `wave === 8 && spawnQueue.length === 0 && enemies.length === 0`.

### Food and the queen

- **Start:** 15 food in the store, 12 workers and 4 soldiers around the nest, and 3 sources of 40 at distance 200–260 from the nest, at angles at least 90° apart.
- **Spawns:** every 35 s from 0:35. A source goes at a random point 200–420 px from the nest, ≥ 80 px from other sources and ≥ 40 px from the edges (30 tries, then skip), with `30 + floor(rng() × 21)` units. Every 4th spawn is a 🍉 of 120 at distance ≥ 340. Spawns are skipped while 5 sources exist. A source at 0 is removed.
- **Hatching:** when no egg is in progress, the next kind in the pattern (D9) is affordable, and ants < 300, the queen pays the cost and hatches it 2 s later at a random point 30 px from the nest. Changing the ratio resets the pattern pointer.

### Screens and HUD

- **Start:** title `蚁后`, subtitle `你不能指挥任何一只蚂蚁，只能画下气味。`, three lines with coloured swatches: `拖动画出绿色觅食路线，工蚁会沿着它找到食物`, `画出红色进攻路线，兵蚁会沿着它出击`, `信息素会挥发，墨水会慢慢恢复`. Button `开始`.
- **HUD (top, 40 px, over the map):** `工蚁 N · 兵蚁 N`, `食物 N`, the queen HP bar `蚁后 N/200`, and `第 N/8 波 · 下一波 0:21` (after wave 8: `最后一波`).
- **Toolbar (bottom, 56 px, over the map):** brush buttons `🌿 觅食`, `⚔️ 进攻`, `🧽 擦除` (the selected one is highlighted), the ink bar `信息素 72`, and the production button `产卵：均衡` with a ring showing egg progress (`蚁巢已满` at the cap). Pointer down on the toolbar or HUD never paints.
- **Win:** `王朝延续！` with `撑过 8 波 · 运回食物 N · 消灭敌人 N · 最多蚂蚁 N` and `再来一局`.
- **Loss:** `蚁后陨落` with `第 N 波 · 蚁巢失守`, the same line, and `再来一局`.
- **Sounds:** paint tick (`tone` 900→700, 0.03 s, every 0.15 s while painting), delivery (660→880), hatch (400→800), wave warning (two 160 Hz tones), queen hit (`noiseHit`, at most every 0.3 s), enemy death (`noiseHit`), win and loss jingles.
- Input uses Pointer Events on the canvas with `setPointerCapture` and `touch-action: none`. Keyboard adds `1`/`2`/`3` brushes, `Q` ratio, `M` mute, `R` restart after the round.

### Functions

- `startGame()`: picks the orientation, resets every state and `roundAchievements`, places the start, then sends `start`.
- `update(dt)`, in this order: ink regen, field decay, wave warning/spawn, food spawns, hatching, ants, enemies, removing the dead, achievement checks, end check.
- `paintStroke(kind, points)`, `paintAt(kind, x, y)`, `sample(field, x, y)`
- `spawnAnt(kind, x?, y?)`, `spawnEnemy(type, x, y)`, `addFoodSource(x, y, amount, big)`
- `damageEnemy(e, amount)` → calls `killEnemy(e)` at HP ≤ 0, which does `kills++` and, if the enemy is ≥ 220 px from the nest, `ambushKills++`.
- `deliverFood()`: `food++`, `delivered++`, pushes `t` to `deliveryTimes`.
- `setBrush(kind)`, `cycleRatio()`, `endGame(won)`

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `first_food` | `delivered` reaches 1. |
| `colony_50` | Living ants ≥ 50, checked each `update`. |
| `highway` | In `deliverFood`, the deliveries with time > `t − 30` number ≥ 45. |
| `ambush` | `ambushKills` reaches 10. |
| `victory` | `endGame(true)`. |
| `steady_queen` | `endGame(true)` with `queenMinHp ≥ 100`. |

The win achievements are sent in the order `victory, steady_queen`.

### Stats

In `endGame(won)`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: won ? 1 : 0, food: Math.min(delivered, 2000), kills: Math.min(kills, 500) })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `rng = mulberry32(seed)` and `clientWidth/Height` 1280 × 800 (landscape). Expected sequences ignore `ready`. Nest is `(480, 300)`.

**Load.** Only `ready` is sent before `startGame()`.

**Fields and ink.** A green `paintStroke` from (500, 300) to (800, 300) at full ink costs 15–25 ink; repainting it at once costs 0; after 30 s of `update` repainting costs 63% ± 10% of the first. A red stroke over fresh cells costs twice as much. With `ink = 0` the stroke changes no cell. A painted cell reads `e^−1 ± 0.01` after 30 s (green) and 12 s (red). `erase` zeroes both fields.

**Trails pay.** Three fresh games with `nextWaveAt = foodSpawnAt = Infinity`, the start sources removed, and one source of 200 added. Over 60 s:
- no trail, source at (720, 300): `delivered === 0`;
- straight trail (510, 300)→(720, 300), source at (720, 300): `delivered ≥ 15`;
- L-shaped trail (510, 300)→(630, 300)→(630, 480), source at (630, 480): `delivered ≥ 10`.

**Simulation.** Seeds 1, 2, 3, each played twice to the end (game time ≤ 12 min):
- a painting bot: every 4 s, for the 2 nearest sources with amount > 0, if `sample(fieldFood, source) < 0.5`, it paints green from the nest to the source; while any enemy is alive, every 6 s it paints red from the nest toward the nearest enemy, capped at 320 px; the ratio stays 均衡.
- an idle bot that never paints.
Assert: no `NaN` position, ants ≤ 300, every game ends with `…, stats, end`, the painting bot wins at least 2 of 3, and the idle bot loses all 3.

**Deterministic round.** `startGame()`, then `nextWaveAt = foodSpawnAt = Infinity`, add a source of 200 at (720, 300) and paint green (510, 300)→(720, 300).
1. `update(1/60)` until `delivered ≥ 1` (≤ 30 s) → `first_food`.
2. `spawnAnt('worker')` 34 times, then `update(1/60)` → `colony_50`.
3. `update(1/60)` for 45 s → `highway` (repaint the trail every 20 s).
4. `spawnEnemy('fire', 780, 300)` 10 times, `damageEnemy(e, 999)` on each → `ambush`.
5. Set `wave = 8`, `spawnQueue = []`, then `update(1/60)`.

Expected sequence: `start, first_food, colony_50, highway, ambush, victory, steady_queen, stats, end`. Expected stats: `rounds: 1, wins: 1, kills: 10`, and `food` equals `delivered` (≥ 46).

**Loss.** `startGame()`, `nextWaveAt = Infinity`, `ants = []`, `queenHp = 5`, `spawnEnemy('beetle', 500, 300)`, `update` until over (≤ 5 s). Expected sequence: `start, stats, end`, with `wins: 0, kills: 0`.

## Milestones

Each milestone ends with `node games/ant-queen/v1/test_headless.js` passing.

**M1 · Playable colony.** Map, fields and painting, ink, ant and enemy behaviour, food, hatching, waves, HUD, screens, sounds, both orientations.
Done when: a browser round plays to a win or loss with mouse and with touch, and the field, trails-pay and simulation tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic and loss tests, `README.md`.
Done when: `pnpm game check ant-queen v1` passes.

**M3 · Local release.** `pnpm game:local publish ant-queen v1 --yes`.
Done when: `/play/ant-queen` plays locally, and a logged-in round unlocks `first_food` and updates the board. The owner runs the production publish.

## Open items

- The unit stats, wave table, ink rates and decay times are first guesses; the simulation's win/lose assertions are the balance gate. If M1 tuning can't satisfy them, the implementer changes the numbers (not the assertions) and updates the tables here. The owner accepts the difficulty after a human playtest in M1.
