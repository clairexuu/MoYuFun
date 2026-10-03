# 影子行者 (`shadow-walk`)

**Status:** Implemented 2026-10-02 (`games/shadow-walk/v1/`), released locally; production publish follows (`pnpm game publish shadow-walk v1`). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A one-screen-per-level platformer where the ground is shadow. You are a small shadow creature who can only stand in shadow. Drag a lantern along its rail, and the shadows of crates, planks and windmill blades stretch, tilt and swing into bridges, ramps and lifts; lit space is air, and you fall through it. Ten hand-made levels make one round. Mouse or touch, with keyboard for movement; single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/shadow-walk/v1/index.html`, vanilla JS and canvas, no dependencies or assets. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, `resize()`/`view` (摸了个鱼's, which reads `document.documentElement.clientWidth/Height`) and the audio helpers (`tone`, plus `noiseHit` from 乱刃). | Same package contract; the gameplay shares nothing with either. |
| D2 | **Solid = ink ∪ shadow.** *Ink* (墨石, "solidified shadow") is static ground that is always solid and casts no shadow. *Props* (crates, planks, blades) block the light; a cell is shadow when it is inside a prop or the segment from the lamp to it crosses a prop. | In prototyping, ground that cast shadows threw huge wedges that buried every exit. With ink not casting, the designer controls exactly which objects make terrain, and the lamp is always what changes it. |
| D3 | Collision uses an **occupancy grid** of 6 px cells (160 × 90), rebuilt every tick by rasterizing shadow polygons at cell centres. The player collides with cells, tile style. | Polygon collision against shapes that change every frame is the bug magnet. 14,400 cells and at most ~8 polygons per tick is cheap. |
| D4 | The lamp lights the whole level: shadows have no falloff and run to the level edge. | With falloff, the far darkness would be solid ground. |
| D5 | Fixed 60 Hz tick with the exact physics below. Logic has no randomness; `rng()` (default `Math.random`, seeded `mulberry32` in tests) is used only for decorative dust motes. | Recorded solutions must replay frame-exactly in the headless test. |
| D6 | **Moving ground:** nothing carries the player. When solid appears inside the player's box, the push-out list (Physics) moves them up to 24 px, preferring up; if no offset frees them, they are **crushed** (death). | Shadows are a field with no identity or velocity, so "carried along" has no meaning. Being pushed up by a rising shadow is how lifts work (levels 3, 5, 8). |
| D7 | The lamp sits on a **rail** (a polyline). It moves toward a target point on the rail at most 240 px/s (4 px per tick). Pressing anywhere on the play area that is not a button sets the target to the nearest rail point; dragging updates it. | The speed cap keeps shadow edges moving a few px per tick, so push-out works and a fast flick does not teleport walls into the player. Pressing anywhere is easy on touch. |
| D8 | A round is the 10 levels in order. Death restarts the level (lamp, props and player reset; the level timer keeps running). `跳过` appears after 3 deaths or 60 s on a level. No level select. | A full run is about 5–8 min for a first-time player, and no saving means every round starts at level 1. Skip prevents a hard wall from ending the fun. |
| D9 | Each cleared level gets a medal by its time: 金 ≤ gold par, 银 ≤ silver par, else 铜. | A replay goal without leaderboards. |
| D10 | Every level ships a **recorded solution**. The headless test replays it and must reach the exit within gold par, and the same replay with the lamp frozen at its start must not. All 10 levels and solutions below were verified with a reference simulation of exactly the rules in this doc. | Guarantees each level is solvable and that moving the lamp is the puzzle, not decoration. |
| D11 | Input: A/D or ←/→ move; Space/W/↑ jump; Q/E move the lamp back/forward along the rail; pointer drag moves the lamp; on touch, on-screen ◀ ▶ 跳 buttons. | Mouse-and-keyboard is the natural split (hands on both), and touch gets the same actions. |
| D12 | `ready` is sent on load and again at 0.5, 2 and 5 s; a round's `start` is sent on its first input (move, jump or lamp). | The site listens only after hydration (promotion-2048 D8). |

## Out of scope

Level select or editor, more than one lamp, coloured lights, scrolling levels, gamepad, saving progress between page loads, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/shadow-walk/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "shadow-walk",
  "name": "影子行者",
  "shortDescription": "拖动灯笼，让影子替你铺路。",
  "description": "你是一只只能踩在影子上的小影怪。拖动轨道上的灯笼，箱子、木板和风车投下的影子会跟着伸长、倾斜、转动，变成桥、坡道和升降台。被照亮的地方踩不住，掉下去就重来。一共十关，走到每关的门口就算过关。",
  "tags": ["闯关", "解谜", "单人"],
  "controls": [
    { "input": "A / D 或 ← / →", "action": "左右移动" },
    { "input": "空格 / W / ↑", "action": "跳" },
    { "input": "鼠标或手指拖动", "action": "沿轨道移动灯笼" },
    { "input": "Q / E", "action": "用键盘移动灯笼" },
    { "input": "屏幕按钮 ◀ ▶ 跳", "action": "触屏移动和跳" },
    { "input": "R", "action": "重来本关" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "影", "eyebrow": "SHADOW PLATFORMER", "accent": "#ffcf5a", "accentSecondary": "#3a2f6b" },
  "sortOrder": 120,
  "achievements": [
    { "key": "halfway", "name": "半影", "description": "通过第 5 关。", "symbol": "半" },
    { "key": "crushed", "name": "被挤扁了", "description": "被移动的影子挤扁一次。", "symbol": "扁" },
    { "key": "gold_5", "name": "疾影", "description": "一局内拿到 5 枚金牌。", "symbol": "金" },
    { "key": "clear", "name": "影归", "description": "不跳过任何一关，走完全部十关。", "symbol": "归" },
    { "key": "deathless", "name": "不见光", "description": "一次都没掉落或被挤扁，走完全部十关。", "symbol": "暗" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "通关", "maxPerRound": 1 },
    { "key": "levels", "name": "过关", "maxPerRound": 10 },
    { "key": "golds", "name": "金牌", "maxPerRound": 10 }
  ]
}
```

### Level format

Logical area **960 × 540** landscape, letterboxed with `view.s = min(w / 960, h / 540)`. All coordinates are logical px, y down.

```js
{ name, hint, gold, silver,                // pars in seconds
  rail: [[x, y], …],                       // polyline; lamp position = arc length s along it
  lampStart,                               // fraction 0..1 of rail length
  spawn: [x, feetY], exit: [x, floorY],    // door is 24 × 36, bottom-centre at exit
  ink: [[x, y, w, h], …],
  props: [ ['box', x, y, w, h]
         | ['spin', cx, cy, len, thick, a0Deg, degPerSec]       // bar rotating about its centre
         | ['slide', x, y, w, h, dx, dy, periodSec] ] }         // box at (x, y) + (dx, dy)·(1 − cos 2πt/T)/2
```

`spin` corners, with `a = (a0 + w·t)°`, `u = (cos a, sin a)`, `n = (−sin a, cos a)`: `c − u·len/2 − n·thick/2`, `c + u·len/2 − n·thick/2`, `c + u·len/2 + n·thick/2`, `c − u·len/2 + n·thick/2`. `t` is the level clock: 0 at load and restart, advanced before each tick's grid build.

Authoring rules (enforced by the test): no prop side under 8 px (thinner shadows would miss cell centres and leave holes); at `t = 0` with the lamp at `lampStart` the spawn box is free and standing on solid; the rail never enters a prop (sampled every 2 px × every tick of 12 s).

### Levels

| # | name | hint (shown 4 s on first entry) | gold | silver | what the lamp does |
| --- | --- | --- | --- | --- | --- |
| 1 | 第一盏灯 | 拖动灯笼：灯越低，影子越长 | 15 | 30 | Lower it until the crate's shadow is a gentle ramp across the gap. |
| 2 | 背光 | 影子总是背着光 | 15 | 30 | Carry it to the far side so the crate's shadow points back at you. |
| 3 | 回头 | 灯在下面，影子就往上长 | 15 | 30 | Drop it below the plank; ride the rising shadow, then jump back left onto the ledge. |
| 4 | 两岸 | 过了河，再把灯挪走 | 20 | 40 | Left for bridge 1; from the island, right for bridge 2. No position gives both. |
| 5 | 浮箱 | 箱子在动，影子也在动 | 15 | 30 | Set the height, hop on the bobbing crate, leave when its ramp sweeps low enough. |
| 6 | 风车 | 等风车转到合适的角度 | 15 | 30 | Near the blade's height, its shadow becomes a beam once per half-turn. |
| 7 | 影墙 | 影子也能挡路 | 20 | 40 | Bridge from the left; then take the Z-shaped rail under the hanging block to open its wall. |
| 8 | 大风车 | 大风车会把你托上去 | 15 | 30 | The cross's shadow fan lifts you to the higher ledge. |
| 9 | 之字 | 一层一层往上爬 | 20 | 40 | Low for the first rising beam; re-aim from the middle ledge for the second. |
| 10 | 归影 | 最后一盏灯 | 25 | 50 | Bridge, windmill timing, then under the hanging block to the door. |

```js
const LEVELS = [ // name/hint/gold/silver from the table
  { rail: [[60,60],[60,300]], lampStart: 0, spawn: [60,360], exit: [900,360],
    ink: [[0,360,300,180],[720,360,240,180]], props: [['box',240,312,48,48]] },
  { rail: [[120,200],[880,200]], lampStart: 0, spawn: [60,360], exit: [900,360],
    ink: [[0,360,240,180],[660,360,300,180]], props: [['box',660,312,48,48]] },
  { rail: [[120,300],[120,470]], lampStart: 0, spawn: [60,480], exit: [520,170],
    ink: [[0,480,960,60],[460,170,200,16]], props: [['box',240,420,96,12]] },
  { rail: [[40,210],[920,210]], lampStart: 0.25, spawn: [60,360], exit: [900,360],
    ink: [[0,360,220,180],[400,360,160,180],[740,360,220,180]], props: [['box',172,312,48,48],['box',740,312,48,48]] },
  { rail: [[60,100],[60,330]], lampStart: 0, spawn: [60,360], exit: [900,360],
    ink: [[0,360,300,180],[720,360,240,180]], props: [['slide',252,300,48,48,0,-60,3]] },
  { rail: [[60,150],[60,350]], lampStart: 0, spawn: [60,360], exit: [900,360],
    ink: [[0,360,240,180],[720,360,240,180]], props: [['spin',270,354,72,10,0,60]] },
  { rail: [[40,200],[300,200],[300,340],[920,340]], lampStart: 0, spawn: [60,360], exit: [900,360],
    ink: [[0,360,220,180],[400,360,560,180]], props: [['box',172,312,48,48],['box',620,230,40,100]] },
  { rail: [[60,150],[60,350]], lampStart: 0, spawn: [60,360], exit: [900,300],
    ink: [[0,360,240,180],[720,300,240,240]], props: [['spin',270,354,72,10,0,60],['spin',270,354,72,10,90,60]] },
  { rail: [[100,260],[100,490]], lampStart: 0, spawn: [40,498], exit: [460,60],
    ink: [[0,498,960,42],[300,270,150,14],[420,60,160,14]], props: [['box',200,440,80,12],['box',330,222,60,12]] },
  { rail: [[40,160],[40,250],[700,250],[700,345],[940,345]], lampStart: 0, spawn: [60,360], exit: [920,360],
    ink: [[0,360,200,180],[360,360,200,180],[760,360,200,180]], props: [['box',152,312,48,48],['spin',590,342,72,10,0,60],['box',830,246,40,90]] },
];
```

### Shadow grid

`buildGrid(level, lamp, t) → Uint8Array(160 × 90)`, pure:
1. Fill every ink rect.
2. For each prop polygon `P` (convex, 4 vertices): if the lamp is inside `P`, fill `P` only. Otherwise find the silhouette vertices: `a` is the vertex with no other vertex strictly on the positive side of `cross(lamp, a, v) > 1e-9`, `b` the one with none strictly negative. Fill `P` and the quad `[a, b, far(b), far(a)]`, where `far(v) = v + 10000 · unit(v − lamp)`.
3. Fill = scanline at row centres `y = r·6 + 3`: an edge counts when `y1 ≤ y < y2` (either direction); for each sorted pair `[xa, xb]` set cells `ceil(xa/6 − 0.5) … floor(xb/6 − 0.5)`, clipped to the grid.

Lookups: a column outside 0..159 is solid (side walls); a row outside 0..89 is empty (open sky, open pit).

### Physics

Player: a box 18 × 24 px, stored as `x` (centre) and `y` (feet). It overlaps cell columns `floor((x−9)/6) … floor((x+9−0.001)/6)` and rows `floor((y−24)/6) … floor((y−0.001)/6)`. Constants: run 180 px/s (3 px/tick, no acceleration), gravity 1800 px/s², jump velocity 540 px/s (≈ 81 px high), max fall 720 px/s, coyote 0.08 s, jump buffer 0.1 s, auto step-up 6 or 12 px.

`tick()` (one 1/60 s step, only in phase `play`):
1. `levelT += 1/60`. Apply input: a new lamp target, or Q/E (`target = s ∓ 4`), clamped to `[0, railLength]`. Move `s` toward `target` by at most 4.
2. `t += 1/60`; `grid = buildGrid(level, lampPos(rail, s), t)`.
3. **Push-out.** If the box overlaps solid, try offsets in order `(0,−6) (0,−12) (0,−18) (0,−24) (−6,0) (6,0) (−12,0) (12,0) (0,6) (0,12)`; apply the first that is free (moving up also sets `vy = min(vy, 0)`). If none is free → `die('crush')` and stop.
4. **Horizontal.** `dx = 3 × (right − left)`. If the box at `x + dx` is free, move. Otherwise, if `grounded` (from the last tick), try `y' = floor((y − 6)/6)·6` then `floor((y − 12)/6)·6`, and take the first free one together with the move. Otherwise stay.
5. **Jump.** `buffer = jumpPressed ? 0.1 : max(0, buffer − 1/60)`. If `buffer > 0` and (`grounded` or `coyote > 0`): `vy = −540`, `buffer = coyote = 0`.
6. **Vertical.** `vy = min(720, vy + 30)`; `grounded = false`; move `vy/60` in sub-steps of at most 3 px. On a blocked sub-step: if moving down, `grounded = true` and `y = floor((y + step)/6)·6`; `vy = 0`; stop. Then if not grounded and the box at `y + 1` overlaps solid, `grounded = true`.
7. `coyote = grounded ? 0.08 : max(0, coyote − 1/60)`.
8. `y − 24 > 560` → `die('fall')`. `|x − exitX| ≤ 12` and `exitY − 36 ≤ y − 12 ≤ exitY` → `clearLevel()`.

`update(dt)` (rAF, dt clamped to 0.1) runs `tick()` from an accumulator, and advances the overlays: `dead` lasts 0.6 s then `restartLevel()`; `clear` lasts 1.5 s (or until a click) then the next level or `endRound(true)`.

### Recorded solutions

`SOLUTIONS[i]` is a list of runs `[frames, keys, lamp?]`: hold `L`/`R` for `frames` ticks; `J` means jump pressed on the run's first tick only; `lamp` (rail fraction) is set as the target on the run's first tick. Re-record any level with `?rec` in the URL: every tick's input is run-length encoded, and on clear the list is logged with `console.log`.

```js
const SOLUTIONS = [
  [[61,'',0.8],[1,'RJ'],[57,'R'],[1,'RJ'],[167,'R'],[1,'RJ'],[68,'R']],
  [[201,'',1],[1,'RJ'],[275,'R']],
  [[45,'R'],[1,'RJ'],[25,'R'],[61,'',1],[150,'R'],[1,'LJ'],[63,'L']],
  [[101,'',0],[1,'RJ'],[35,'R'],[1,'RJ'],[84,'R'],[1,'RJ'],[18,'R'],[60,''],[251,'',1],[1,'RJ'],[152,'R']],
  [[91,'',0.5],[45,'R'],[1,'RJ'],[20,'R'],[1,''],[120,'R'],[1,'RJ'],[89,'R']],
  [[52,'',0.7],[1,'RJ'],[68,'R'],[1,'RJ'],[212,'R']],
  [[201,'',0],[1,'RJ'],[35,'R'],[1,'RJ'],[83,'R'],[1,'RJ'],[29,'R'],[301,'',0.6],[1,'RJ'],[142,'R']],
  [[52,'',0.8],[1,'RJ'],[55,'R'],[1,'RJ'],[165,'R'],[1,'RJ'],[63,'R']],
  [[45,'R'],[1,'RJ'],[15,'R'],[81,'',1],[120,'R'],[1,'LJ'],[50,'L'],[30,''],[91,'',0.2],[34,'L'],[1,'RJ'],[104,'R'],[1,'LJ'],[47,'L']],
  [[61,'',0.037],[1,'RJ'],[100,'R'],[1,'RJ'],[48,'R'],[122,'',0.194],[1,'RJ'],[99,'R'],[60,''],[301,'',1],[1,'RJ'],[5,'R'],[1,'RJ'],[41,'R']],
];
```

In the reference simulation these clear in 356, 477, 346, 705, 368, 334, 795, 338, 621 and 842 ticks, all under gold par.

### Input

- Keys: `KeyA`/`ArrowLeft`, `KeyD`/`ArrowRight` held; `Space`/`KeyW`/`ArrowUp` keydown (not repeat) sets `jumpPressed` for the next tick; `KeyQ`/`KeyE` held; `KeyR` `restartLevel()` (not a death); `KeyM` mute; `KeyG` toggles a debug overlay of solid cells.
- Pointer Events on the canvas, tracked by `pointerId`. A press on a HUD or touch button belongs to that button until release. Any other press drives the lamp: the target is the nearest point on any rail segment to the pointer in logical coordinates.
- The touch buttons ◀ (20–100), ▶ (110–190) and 跳 (860–940), all at y 450–530 and 40% opaque, are drawn once any `pointerType === 'touch'` event has been seen.

### Screens and look

- **Title:** `影子行者`, `只能踩在影子上的小家伙，要靠一盏灯回家`, button `开始` (or Space/Enter), line `拖动灯笼改变影子 · A/D 移动 · 空格 跳`.
- **Play:** a warm wall (radial gradient `#fff3c4` → `#e9d9a8` centred on the lamp). Ink `#1d1830`. Shadow polygons are drawn from the same body + quad as the grid, `#3a2f6b` at 0.92 alpha (smooth; the grid differs by ≤ 3 px). Crates and planks are `#8a5a2b` with a `#c98b4a` edge on the lamp side; blades are `#6b4a2b` with a pivot dot. The rail is a dashed `#5a4a2a` line, and the lamp is a 🏮 (`fillText` 28 px) with a soft glow. The door is a dark arch with a `#ffcf5a` frame. The player is a `#0b0a12` rounded box with two `#ffcf5a` eyes looking where it moves.
- **HUD:** `第 3 关 · 回头` top-left; top-right `12.4 秒`, `金 15 秒` and `跌落 2`; buttons `重来`, `放弃`, and `跳过` when allowed (D8).
- **Death flash** (0.6 s): `掉进光里了` (fall) or `被影子挤扁了` (crush).
- **Clear** (1.5 s): `第 3 关 通过`, `用时 8.2 秒 · 🥇` (🥈 silver, 🥉 bronze).
- **End:** won `回家了`; finished with skips `走完了，但跳过了 N 关`; quit `今天先到这里`. Below: total time `m:ss`, the row of 10 medals (— for skipped or unplayed), `金牌 N · 跌落 N`, and `再来一局`.

Sounds: jump `tone(420, 640, 0.08, 'square', 0.2)`; land `noiseHit(0.04, 0.15, 1200)`; fall `tone(300, 60, 0.4, 'triangle', 0.5)`; crush `noiseHit(0.2, 0.5, 500)`; clear: `tone` 523, 659 and 784 Hz, 0.1 s apart.

### Functions

- `propPoly(prop, t)`, `shadowPolys(poly, lamp)`, `buildGrid(level, lamp, t)`, `railLength(rail)`, `lampPos(rail, s)`, `nearestOnRail(rail, x, y) → s`, `boxFree(grid, x, y)`, `medalFor(i, seconds) → 'gold' | 'silver' | 'bronze'`: pure.
- `startRound()`: resets round state and `roundAchievements`, then loads level 0. Sends nothing.
- `loadLevel(i)`, `restartLevel()`, `tick()`, `update(dt)`.
- `die(cause)`: `deaths++`; for a crush, `unlockAchievement('crushed')`; then phase `dead`.
- `clearLevel()`: `medals[i] = medalFor(i, levelT)`, `levelsCleared++`, and `golds++` on gold. Then, in order: `gold_5` if `golds >= 5`, and `halfway` if `i === 4`.
- `canSkip()`, `skipLevel()` (marks the level skipped and loads the next, or ends the round after level 10).
- `endRound(finished)`: `won = finished && no skips`. If won: `clear`, then `deathless` if `deaths === 0`. Then, if the round has started, `emitMoYuFunStats({ rounds: 1, wins: won ? 1 : 0, levels: levelsCleared, golds })` and `end`. Then the end screen.
- `quitRound()`: `endRound(false)`. Before the first input it just returns to the title.

### Achievements

Each is sent once per round through `unlockAchievement(key)` (one literal `emitMoYuFunAchievement` per key, D11 of game-release), always before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `crushed` | Any `die('crush')`. |
| `gold_5` | `clearLevel()` with `golds >= 5`. |
| `halfway` | `clearLevel()` on level 5 (index 4). |
| `clear` | `endRound(true)` with no skipped level. |
| `deathless` | `clear`, and `deaths === 0`. |

### Stats

`rounds` 1; `wins` 1 for a full clear with no skips; `levels` cleared levels (0–10, skipped ones do not count); `golds` gold medals (0–10).

### Headless test

`v1/test_headless.js` uses 摸了个鱼's stub pattern (plus `location.search = ''`). A helper `runInputs(runs)` feeds one tick per frame through the same input object the DOM handlers write, stopping when the phase leaves `play`.

**Load.** Only `ready` is sent until the first input.

**Level rules** (every level): prop sides ≥ 8 px; the spawn box is free and grounded at `t = 0` with the lamp at `lampStart`; the rail never enters a prop.

**Solutions** (every level, `loadLevel(i)` then `runInputs(SOLUTIONS[i])`): the phase becomes `clear` exactly on the last tick, with `levelT ≤ gold`. The same runs with every lamp target dropped never reach `clear`.

**Full round.** `startRound()`, then for each level `runInputs(SOLUTIONS[i])` and `update(1.6)`. Expected sequence: `start, gold_5, halfway, clear, deathless, stats, end`. Expected stats: `{ rounds: 1, wins: 1, levels: 10, golds: 10 }`.

**Crush.** `startRound(); loadLevel(6); runInputs([[1,'',1],[300,'']])`: the lamp sweeps the crate's shadow over the spawn, giving a crush by tick 208. Then `quitRound()`. Expected sequence: `start, crushed, stats, end`. Expected stats: `{ rounds: 1, wins: 0, levels: 0, golds: 0 }`.

**Fall, restart, skip.** `startRound()`, then `runInputs([[45,'R'],[1,'RJ'],[120,'R']])` falls on level 1 (at tick 159). `update(0.7)` restores the spawn, the lamp at `lampStart` and `t = 0`, while `levelT` keeps counting. After 3 falls `canSkip()` is true. `skipLevel()` loads level 2. `quitRound()` then sends `stats` with `levels: 0, wins: 0` and no `clear`.

**Quit before input.** `startRound(); quitRound()` sends nothing.

## Implementation notes

No decision changed. The recorded solutions replay unchanged in the real game: the headless test clears levels 1–10 in 356, 477, 346, 705, 368, 334, 795, 338, 621 and 842 ticks, matching the reference simulation tick for tick, and none of them clears with the lamp frozen.

Gotchas and details the doc left open:

- **Exact float replay.** `tick()` moves the lamp by `240 * (1/60)` and advances `t += 1/60` exactly as the reference sim did; computing the step differently (e.g. a literal `4`) is harmless today but any change to the order of steps 1–8 means re-recording with `?rec`.
- **`?rec` precision.** Lamp targets are logged as full-precision rail fractions. Rounding them (to 3–6 digits) moves the replayed target by a fraction of a pixel, which can be enough to change a shadow edge by one cell and break the replay.
- **`levelT`** advances only inside `tick()`, so the 0.6 s death overlay and the clear overlay are not counted; it is not reset on death or `R`.
- **`start`** is sent on the first non-empty input to `tick()` after `startRound()` (in tests, also after a bare `loadLevel()`). Skipping a level does not count as input.
- **Land sound and dust** fire only when landing faster than 200 px/s, so being pushed up by a rising shadow or stepping up does not spam `noiseHit`.
- **Shadow drawing.** All bodies and quads go into one path with a normalised winding, then one fill at 0.92 alpha, so overlapping shadows neither darken nor cut holes under the nonzero rule.
- **`tone` takes an optional `delay`** for the clear arpeggio (523/659/784 Hz, 0.1 s apart) instead of `setTimeout`.
- **Extra keys:** Space/Enter also starts a new round from the end screen and skips the clear overlay. Window `blur` clears held keys and pointers so the player does not keep walking after an alt-tab.
- HUD buttons fire on `pointerup` inside the same button; touch ◀ ▶ 跳 act on `pointerdown` and hold until release. A pointer captured for the lamp stays on the lamp even when it drags across a button.
- Portrait phones see a `横过手机来玩更舒服` line on the title screen; the 960 × 540 play area is letterboxed, not rotated.

## Milestones

Each milestone ends with `node games/shadow-walk/v1/test_headless.js` passing.

**M1 · Playable levels.** Grid, physics, lamp and rail, input including touch buttons, all 10 levels, screens, sounds, the `?rec` recorder and the `G` overlay.
Done when: all 10 levels play in a browser with mouse + keyboard and on a touch emulator, and the level-rule and solution tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the round, crush and skip tests, `README.md`.
Done when: `pnpm game check shadow-walk v1` passes.

**M3 · Local release.** `pnpm game:local publish shadow-walk v1 --yes`.
Done when: `/play/shadow-walk` plays locally, and a logged-in round that clears level 5 unlocks `halfway` and updates the stats board. The owner runs the production publish.

### M3 notes

- Local publish registered the game, five achievements and four stats; the smoke test found `/play/shadow-walk` serving v1.
- Level 1 was cleared in the browser with a real lamp drag and held keys: drag the lamp to the bottom of the rail, jump onto the crate's shadow, walk to the door. A round on `/play/shadow-walk` (start, lamp drag, 放弃) wrote `game_ready`, `game_start` and `game_end` events locally. No account was logged in, so the achievement popup and stats board were not exercised in the browser; the headless test covers the message sequence, and the SDK path is the same as 摸了个鱼's.
- Gotcha: a click anywhere on the canvas aims the lamp (the nearest rail point), so tapping to focus the game moves the lamp. This is by design for touch.
- Gotcha: walking into a shadow from the ground is walking into a wall; level 1 needs a jump onto the crate's shadow. The level 1 hint only mentions the lamp.
- Portrait phones see the letterboxed level and the `横过手机来玩更舒服` line, as designed.

## Open items

- Level 9's second jump (from the upper beam back onto the top ledge) has a window of about 24 px of run-up. If a human playtest finds it too fiddly, widen the top ledge leftward or lower it by 6 px, then re-record. Owner, after M1.
