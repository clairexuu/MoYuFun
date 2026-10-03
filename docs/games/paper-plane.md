# 纸飞机邮差 (`paper-plane`)

**Status:** Implemented and published to production 2026-10-02 (`pnpm game publish paper-plane v1`; the play page loads at www.moyufuns.com/play/paper-plane). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A one-button glide race. You are a paper airplane carrying letters over a rooftop town: hold to pitch the nose up, release to let it dip. Diving buys speed, climbing spends it, and chimney smoke lifts you back up. Fly through the zone above each mailbox to deliver, and reach the post office fast. A day is three routes in a row, each with medal times. Mouse, touch or Space, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers `tone`/`noiseHit`), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/paper-plane/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, `resize()`/`view` (with `document.documentElement.clientWidth/Height`) and `ensureAudio`/`tone`/`noiseHit`. | Same package contract; the gameplay shares nothing with them. |
| D2 | The simulation runs at a fixed 120 Hz step in a pure function `stepRun(run, hold)` that mutates a plain `run` object and returns events. Rendering only reads `run`. `update(dt)` feeds whole steps from an accumulator. | Recorded input scripts replay bit-for-bit, and the test needs no canvas. |
| D3 | Flight model: the plane flies where its nose points (no angle of attack). Holding pulls the pitch toward +40°, releasing toward −30°, at fixed rates. Speed changes by gravity along the path minus quadratic drag. Below 110 the plane stalls: input is ignored and the nose drops until speed is back to 170. | One button then gives a continuous trade between height and speed: the best glide is about 8:1 at ~170, and a full dive settles near 354. A stall punishes greed without killing you outright. |
| D4 | Thermals (chimney smoke) and wind zones are kinematic: they add a velocity to the position, not to the airspeed. There is no thrust. | Easy to read and predict. Thermals are the race's only energy source: they give height, and diving turns height into speed. Slowing down in the smoke (holding) lifts you higher, which is the skill to learn. |
| D5 | The three courses are hand-authored data (below), checked by recorded scripts. Gameplay uses no randomness. `rng()` (default `Math.random`, seeded `mulberry32` in tests) only jitters smoke puffs and birds. | Everyone races the same course, so medal times mean something. |
| D6 | The route clock is flight time plus penalties. Missing a mailbox costs +5 s. A crash costs +3 s plus a 1 s pause while the clock keeps running, then a respawn at the last checkpoint. Each route has a time cap. Reaching it ends the day as a loss. | A crash costs about 4 s plus the lost ground, so there is no hard fail. The cap ends rounds where the player is stuck on an obstacle and keeps the round under 10 minutes. |
| D7 | One round is one day: routes 1 → 2 → 3 in order. Winning means finishing route 3. `start` is sent on the first launch of route 1. `stats`/`end` are sent on the win, on a loss (cap), or on `R` after the start. | One round lasts 3–6 minutes at normal pace and 8:05 at most (the three caps). Medals give each route its own goal. |
| D8 | Input: hold = Space down, or any pointer down on the canvas that is not on a button (Pointer Events with capture; `pointerup`/`pointercancel` release). `blur` releases everything. | One code path for mouse and touch. Several fingers on a phone don't confuse the hold state. |
| D9 | `ready` is sent on load and again at 0.5, 2 and 5 s, as in 升官记 D8. | The site may miss a single early `ready`. |
| D10 | Medal times are set from the recorded scripts: gold ≈ script × 1.1, silver × 1.3, bronze × 1.6, cap = bronze + 60 s. | The scripts come from a search with perfect knowledge of the course, so gold is a real stretch. With the input limited to one change per 0.3 s the same search still beats gold by about 3 s (48.3, 67.2, 86.3 s). |

## Out of scope

Picking or practising a single route, ghosts and replays, saving best times between page loads, leaderboards, moving obstacles (birds and cats are decoration only), more than three routes, tilt controls, cross-round achievements.

## Architecture

### Package

```text
games/paper-plane/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "paper-plane",
  "name": "纸飞机邮差",
  "shortDescription": "按住上扬，松开俯冲，驾着纸飞机把信送遍屋顶小镇。",
  "description": "你是一架载着信件的纸飞机。按住让机头上扬，松开让它俯冲：俯冲换速度，爬升耗速度，太慢就会失速。钻进烟囱冒出的炊烟能被托上高空，穿过邮筒上方的投递区就算送达。一天三条线路，争取每一程都盖上金邮戳。",
  "tags": ["竞速", "单键", "单人"],
  "controls": [
    { "input": "按住鼠标 / 触摸 / 空格", "action": "机头上扬" },
    { "input": "松开", "action": "机头下沉、俯冲加速" },
    { "input": "R", "action": "重新开始这一天" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "信", "eyebrow": "GLIDE RACE", "accent": "#f4f1e8", "accentSecondary": "#e25c3c" },
  "sortOrder": 180,
  "achievements": [
    { "key": "updraft", "name": "扶摇直上", "description": "在同一股炊烟里被连续托升 300。", "symbol": "扶" },
    { "key": "deliver_all", "name": "一封不落", "description": "一程之内送达全部信件。", "symbol": "封" },
    { "key": "gold", "name": "金邮戳", "description": "任意一程跑进金牌时间。", "symbol": "金" },
    { "key": "all_gold", "name": "金牌邮差", "description": "同一天三程全部金牌。", "symbol": "冠" },
    { "key": "flawless", "name": "毫发无伤", "description": "送完一整天，一次也没撞毁。", "symbol": "安" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "送完一天", "maxPerRound": 1 },
    { "key": "letters", "name": "送达信件", "maxPerRound": 20 },
    { "key": "golds", "name": "金邮戳", "maxPerRound": 3 }
  ]
}
```

### Units, view and camera

- **World:** x to the right, **y up**, ground at `y = 0`, ceiling `CEIL = 1000` (y is clamped there). One world unit is one logical pixel.
- **Logical view:** 960 × 540 landscape, scaled by `view.s = min(w/960, h/540)` and centred with letterboxing (`#151a24` bars). Portrait phones get a small letterboxed view and the start screen hint `横过来更好玩`.
- **Camera:** `camX = run.x − 280` (no smoothing, so the plane sits at screen x 280 with 680 units of lookahead). `camY` is the world y at the bottom of the screen: its target is `clamp(run.y − 220, 0, 460)`, approached with `camY += (target − camY)·(1 − e^(−5·dt))` per frame. It snaps on launch and respawn. Screen position: `(x − camX, 540 − (y − camY))`.

### Flight model

Constants (angles in radians, written as `deg * (Math.PI / 180)`):

| name | value | name | value |
| --- | --- | --- | --- |
| `DT` | `1/120` s | `G` | 300 |
| `DRAG` | 0.0012 | `V_MAX` | 450 |
| `UP_TARGET`, `UP_RATE` | 40°, 120°/s | `DOWN_TARGET`, `DOWN_RATE` | −30°, 90°/s |
| `STALL_TARGET`, `STALL_RATE` | −50°, 150°/s | `V_STALL`, `V_RECOVER` | 110, 170 |
| `R` (plane radius) | 7 | `LAUNCH_V`, `RESPAWN_V` | 260, 240 |
| `CRASH_PAUSE` | 1.0 s | `CRASH_PEN`, `MISS_PEN` | 3 s, 5 s |

`run`: `{ course, x, y, th, v, stalled, t, pen, state: 'fly'|'crash', pause, cp: {x, y}, cpi: -1, mail: [null…], crashes, misses, delivered, rise, done }`. `newRun(course)` puts the plane at `course.start` with `th = 0`, `v = LAUNCH_V`, `cp = course.start`.

`approach(a, target, rate)` moves `a` toward `target` by at most `rate·DT`. `stepRun(run, hold)` runs these steps in this order:

```js
run.t += DT;
if (run.state === 'crash') {                       // clock keeps running
  run.rise = 0;
  if ((run.pause -= DT) <= 0) { respawn at run.cp: th = 0, v = RESPAWN_V, stalled = false, state = 'fly'; event 'respawn' }
  return;
}
th = approach(th, stalled ? STALL_TARGET : hold ? UP_TARGET : DOWN_TARGET, stalled ? STALL_RATE : hold ? UP_RATE : DOWN_RATE);
v += (-G * Math.sin(th) - DRAG * v * v) * DT;
v = Math.min(v, V_MAX);
if (!stalled && v < V_STALL) { stalled = true; event 'stall' }
if (stalled && v >= V_RECOVER) stalled = false;
v = Math.max(v, 40);
fyT = sum of lift of thermals with |x − t.x| ≤ t.w/2 and t.roof ≤ y ≤ t.top;   // old position
fx = sum of wx, fy = fyT + sum of wy over wind zones with x0 ≤ x ≤ x1 and y0 ≤ y ≤ y1;
rise = fyT > 0 ? rise + fyT * DT : 0;  if (rise >= 300) event 'updraft';
x += (v * Math.cos(th) + fx) * DT;
y = Math.min(CEIL, y + (v * Math.sin(th) + fy) * DT);
mailboxes in order, skipping decided ones: inside zone → mail[i] = true, delivered++, event 'deliver';
  else if x > m.x + 50 → mail[i] = false, pen += MISS_PEN, misses++, event 'miss';
checkpoints: for each i > cpi with x >= c.x → cpi = i, cp = c, event 'checkpoint';
if (hits(run)) { state = 'crash', pause = CRASH_PAUSE, pen += CRASH_PEN, crashes++, event 'crash'; return }
if (x >= course.finish) { done = true; event 'finish' }
```

`routeTime(run) = run.t + run.pen`. **Collision** (`hits`), with the plane as a circle of radius `R`:
- the ground, when `y ≤ R`;
- a building, when `x + R > b.x && x − R < b.x + b.w && y − R < b.h`;
- a chimney, when `|x − t.x| < 12 + R && y − R < t.roof + 36` (24 × 36 brick stack under each thermal);
- a wire, when the distance to its segment is `< R + 2`;
- a wire pole: each wire end `(px, py)` with `py > roofAt(px)` has a pole from the roof up to the end, and the plane hits it when `|x − px| < R + 2 && y > roofAt(px) && y − R − 2 < py`;
- a lantern, when the distance to its centre is `< R + 16`.

### Course format

```js
// row: [w, h, gapAfter = 40] buildings left to right from x = -200.
// t: chimneys/thermals on building indices; rise = top − roof, riseAt overrides per index.
// m: mailboxes, c: checkpoints (building indices). w: wires [x1,y1,x2,y2]. l: lanterns [x,y]. z: wind [x0,x1,y0,y1,wx,wy].
buildCourse(src) → {
  b: [{x, w, h}],  start: {x: mid(0), y: b[0].h + 80},  finish: last.x + 40,
  t: src.t.at.map(i => ({ x: mid(i), w: src.t.width, roof: b[i].h, top: b[i].h + (src.t.riseAt[i] ?? src.t.rise), lift: src.t.lift })),
  m: src.m.map(i => ({ x: mid(i), roof: b[i].h })),      // zone: |x − m.x| ≤ 50, roof + 20 ≤ y ≤ roof + 160
  c: src.c.map(i => ({ x: mid(i), y: b[i].h + 150 })),
  w, l, z }                                              // mid(i) = b[i].x + b[i].w / 2; roofAt(x) = h of the building containing x, else 0
```

The last building of each row is the post office (`邮局` sign; the finish line is drawn 40 units into its roof).

### Courses

**Route 1 · 晨雾小镇** (dawn sky `#ffd9b0 → #f4f1e8`):

```js
row: [[400,300],[220,180],[260,140],[200,220],[300,160],[240,260],[260,180],[220,120,300],[300,200],[260,240],[240,160],[300,140],[220,320],[260,200],[240,120],[300,180],[220,240],[260,160],[240,140,300],[300,220],[220,180],[260,120],[240,200],[300,260],[220,160],[260,140],[240,220],[300,180],[220,120],[260,200],[240,240],[300,160],[220,140],[260,220],[240,180],[300,120],[220,200],[260,260],[240,160],[300,140],[400,300]],
t: { at: [2,5,8,11,15,18,19,22,24,27,29,31,34,36,38], rise: 260, lift: 450, width: 140, riseAt: {} },
m: [4,10,17,26,33], c: [10,20,30],
w: [[2180,230,2480,310],[5720,260,6020,340]], l: [[6700,330],[6950,420]], z: [[8000,9500,0,1000,120,0]]
```

**Route 2 · 风车坡** (afternoon `#bfe3ff → #f4f1e8`, windmills turning on the parallax hills; *changed in M1*, see Implementation notes):

```js
row: [[400,320],[240,200],[260,160],[220,260],[300,180],[240,380],[260,220],[220,160,360],[300,240],[240,200],[260,420],[220,180],[300,140],[240,260],[260,200,300],[220,320],[300,160],[240,140],[260,440],[220,200],[300,180],[240,240,400],[260,160],[220,300],[300,200],[240,140],[260,380],[220,220],[300,160],[240,260],[260,180,300],[220,420],[300,200],[240,140],[260,240],[220,300],[300,160],[240,200],[260,360],[220,180],[300,240],[240,160],[260,140],[220,280],[400,320]],
t: { at: [2,4,7,9,13,14,17,20,22,25,28,30,33,36,39,42], rise: 260, lift: 420, width: 120, riseAt: {9:360, 17:380, 30:440} },
m: [6,12,16,21,27,32,40], c: [11,22,33],
w: [[2220,280,2580,360],[6960,360,7360,280],[9980,300,10280,400]], l: [[8000,420],[8200,330],[11800,400],[12050,320]],
z: [[4400,5600,0,1000,-80,0],[9060,9440,350,1000,0,-100],[11000,12300,0,1000,100,0]]
```

**Route 3 · 灯会夜** (night `#1d2340 → #3a2f5b`, lit windows, lantern glow):

```js
row: [[400,360],[220,240],[260,180],[240,320],[300,200],[220,460],[260,240],[240,160,380],[300,280],[220,200],[260,480],[240,220],[300,160],[220,260],[260,240,320],[240,180],[300,500],[220,260],[260,160],[240,300],[300,200,420],[220,440],[260,220],[240,160],[300,360],[220,240],[260,180],[240,500],[300,260],[220,180,360],[260,320],[240,200],[300,160],[220,460],[260,240],[240,180],[300,340],[220,220,400],[260,160],[240,480],[300,240],[220,180],[260,300],[240,200],[300,160],[220,420],[260,260],[240,180],[300,320],[400,360]],
t: { at: [2,4,8,13,15,20,23,25,26,28,31,32,35,38,43,44,47], rise: 300, lift: 420, width: 100, riseAt: {15:400, 20:340, 38:420} },
m: [7,12,19,22,30,34,41,46], c: [12,24,36],
w: [[2220,200,2600,300],[4640,360,4960,300],[9720,300,10080,440]], l: [[4800,470],[6780,360],[6960,500],[9900,520],[12500,380],[12650,300],[12700,480]],
z: [[3500,4600,0,1000,-90,0],[7400,7700,380,1000,0,-120],[11500,12500,0,1000,-80,0],[15000,16100,0,1000,120,0]]
```

Derived values (the test asserts them to catch transcription errors):

| route | buildings | finish | start | mailbox x | checkpoints | thermals | script time | gold / silver / bronze | cap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 41 | 12300 | (0, 380) | 1190, 3240, 5310, 8220, 10290 | (3240,310) (6470,330) (9400,390) | 15 | 47.09 s | 52 / 62 / 75 s | 135 s |
| 2 | 45 | 14120 | (0, 400) | 1830, 3910, 5350, 6840, 8950, 10690, 13050 | (3610,330) (7490,310) (11000,290) | 16 | 63.28 s | 70 / 84 / 100 s | 160 s |
| 3 | 50 | 16120 | (0, 440) | 2100, 3930, 6260, 7530, 10210, 11390, 13830, 15290 | (3930,310) (8130,510) (11990,490) | 17 | 81.26 s | 90 / 106 / 130 s | 190 s |

A medal is earned when `routeTime ≤` its threshold.

### Drawing

All shapes, with emoji drawn through `fillText`:
- **Buildings:** flat fronts in two alternating tones per route, with window grids, a darker roof cap and parallax hills behind (0.3× camera speed).
- **Chimneys:** brick stacks with smoke puffs rising at the thermal's lift speed, spread over its width (`rng` jitter) up to `top`, at 25% alpha.
- **Wind zones:** drifting streaks along `(wx, wy)`.
- **Wires:** lines with their poles, and small clothes hanging up to 6 units below (the collision distance covers them).
- **Lanterns:** 🏮 at 32 px with a soft glow.
- **Mailboxes:** a red (`#e25c3c`) box on the roof, with the zone as a dashed rounded rectangle. It pulses while pending, turns green with ✉ flying in on delivery, and grey when missed.
- **Checkpoints:** a 🚩 on the roof that turns gold when passed.
- **Decoration:** a 🐈 on every building with `i % 5 === 3` that has no chimney, mailbox or checkpoint. Four 🐦 drift left at `y = 700 + 40·sin(t + k)`.
- **Plane:** an off-white paper dart (`#f4f1e8` with a crease line) rotated by `−th`, with a trail of its last 40 positions. While stalled it wobbles ±6° and shows `失速！`. A crash plays a paper-crumple burst.

### Screens and HUD

- **Start:** title `纸飞机邮差`, subtitle `按住上扬，松开俯冲，把信送到每个邮筒`, the three routes with their gold times, and a `出发` button.
- **Route intro** (plane resting on the launch roof): `第 1 程 · 晨雾小镇`, `金 52.0 秒 · 银 62.0 · 铜 75.0`, hint `按住任意处起飞`. The first press calls `launch()`, and that press counts as holding.
- **HUD:** top-left `第 1 程 · 晨雾小镇`; top-centre the clock (`routeTime`, one decimal) and below it the next medal still reachable (`金 52.0`, then `银 …`, `铜 …`, then `天黑 135.0`); top-right `✉ 3/5`, a speed readout `速度 270`, and a 40 × 40 mute button (🔊/🔇). Floating texts near the plane: `+5 秒 漏信` (red), `+3 秒 撞毁` (red), `送达！` (green), `检查点`.
- **Route finished:** `送达！` with the time, the medal (`金邮戳` / `银邮戳` / `铜邮戳` / `没有邮戳`), `飞行 x 秒 · 漏信 n × 5 · 撞毁 n × 3`, and a `下一程` button (Enter also works; input is locked for 0.5 s).
- **Day won:** `今日邮件全部送达`, the three times with medals and the total, `再送一天`.
- **Lost** (cap): `天黑了，信还没送完`, `再送一天`.

### Functions

- `buildCourse(src)`, `newRun(course)`, `stepRun(run, hold) → events[]`, `routeTime(run)`, `medalFor(route, time) → 'gold'|'silver'|'bronze'|null`, `decodeScript(hex) → bits` (4 bits per hex digit, most significant first): all pure.
- `startRound()`: resets `route = 0`, the per-route results and `roundAchievements`, and shows the intro. It sends nothing.
- `launch()`: creates `run`. On the round's first launch it sends `start`.
- `tick(hold)`: one game step. It calls `stepRun`, handles the events (sounds, floating texts, `unlockAchievement('updraft')`), calls `finishRoute()` on `finish`, and calls `endRound(false)` when `routeTime ≥ cap`.
- `update(dt)`: adds `min(dt, 0.25)` to the accumulator, then runs `tick(holding)` per whole `DT`.
- `finishRoute()`: stores `{ time, medal, delivered, crashes }`. Achievements for the route, then on route 3 the day achievements, then `endRound(true)`.
- `nextRoute()`
- `endRound(won)`
- `restart()`: bound to `R`. After the start it calls `endRound(false)`. Then it calls `startRound()`.

Sounds: launch whoosh (noise, 0.2 s), delivery ding `tone(880, 1320, 0.12)`, miss `tone(300, 200, 0.2)`, crash `noiseHit(0.25, 0.5, 600)`, stall warble, medal stamp (`noiseHit` plus `tone(660, 990)`).

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `updraft` | A `stepRun` event `updraft`: the accumulated thermal lift of one unbroken stay in smoke reaches 300. Any route. |
| `deliver_all` | `finishRoute()` with `misses === 0`. |
| `gold` | `finishRoute()` with `medalFor(route, time) === 'gold'`. |
| `all_gold` | `finishRoute()` on route 3 with all three medals gold. |
| `flawless` | `finishRoute()` on route 3 with 0 crashes across all three routes. |

In `finishRoute()` the order is `deliver_all, gold`, then on route 3 `all_gold, flawless`.

### Stats

In `endRound(won)`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: won ? 1 : 0, letters, golds })`. `letters` is the letters delivered over all routes flown this round (≤ 20). `golds` is the number of gold medals (≤ 3).

### Recorded scripts

`SCRIPTS[i]` is a hex string, one bit per 0.1 s decision: bit `k` is the hold state for steps `12k … 12k+11` after `launch()`. Past the last bit the input is released. They were recorded with exactly the model above and must reproduce to within 0.01 s.

```js
const SCRIPTS = [
  '25520c0d2a54d4406952a52ab000aa952a2a4b5451952aaa02a4aa64d0355420655292644552a811a9530153232310552aa92232a54054990466a4',
  '25255602cc640e54908aa8e54990536c053298aa8cd5005801c9545554c82a691cae02d1a98100c8ccac32660032a434aa4e3465040120d4aae006329a90a14d1a55310e8a9658001549552ac2aaaa0',
  '254aa9065651471a942c606748c7507811aaa8a83a24a9955465352a5401054caa54d5415555481633255546a0698d529932810aac46559440487d02d400234aa952b014644c83d0cc0202ac0d2a94b0535165553c81d4d302a954e52a4301521cc910632d30',
];
```

**Re-recording.** `node test_headless.js --record` re-records the scripts and prints them. Use it if M1 tuning changes a constant or a course; script 1 survives ±0.5% changes to `G`/`DRAG`, but scripts 2 and 3 do not.

The recorder is a beam search over 0.1 s decisions (hold or release):
- Each state expands into both children, simulated for 12 steps with a safety margin: `R + 12` for every collision, and mail zones shrunk by 12 on every side.
- Children that crash or miss a letter are dropped.
- The survivors are deduplicated by `(round(y/12), round(v/12), round(th/0.07), round(x/30))`, keeping the best score in each bucket. The score is `x − 220·pen + (y + v²/600)`.
- The best 400 are kept.
- The first child to finish wins, and its bits are the script.

After re-recording, update the medal times per D10 and the derived table.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `rng` seeded.

- **Courses.** The derived table matches exactly.
- **Course rules.** For every course:
  - gaps are ≥ 40;
  - no building has both a chimney and a mailbox;
  - every index is in range;
  - `hits()` is false at the start and at every checkpoint spawn;
  - every wire, lantern and wind zone lies within `[0, finish]`.
- **Model.** On an empty course from (0, 500):
  - 240 steps released give `th = −30°` exactly and `v = 328.39 ± 0.01`;
  - 360 steps held enter a stall at step 91 and recover at step 194.
- **Scripts.** Each script, replayed from `launch()` with `tick`, finishes its route with 0 crashes, every letter delivered, and `routeTime` equal to the table's script time ± 0.01. Each time is below that route's gold. Script 1 sends `updraft` at step 781.
- **Load.** Only `ready` messages are sent until the first `launch()`.
- **Full day.** `startRound()`, then for each route `launch()`, replay its script, and `nextRoute()` between routes.
  - Expected sequence: `start, updraft, deliver_all, gold, all_gold, flawless, stats, end`.
  - Expected stats: `{ rounds: 1, wins: 1, letters: 20, golds: 3 }`.
- **Loss.** `startRound()`, `launch()`, then `tick(false)` until the lost screen. The plane dives into its own launch roof, respawns at the start and repeats until `routeTime ≥ 135`.
  - Expected sequence: `start, stats, end`.
  - Expected stats: `{ rounds: 1, wins: 0, letters: 0, golds: 0 }`.
- **Penalties.** Holding the whole time on route 1 for 60 s gives `pen === 5·misses + 3·crashes` with `misses ≥ 1`.
- **Restart.** `restart()` 1 s after launch sends `stats` (`wins: 0`), then `end`. Restart before any launch sends nothing.

## Milestones

Each milestone ends with `node games/paper-plane/v1/test_headless.js` passing.

**M1 · Playable day.**
Covers:
- `buildCourse`, `stepRun`, collisions and the three courses;
- camera, drawing and HUD;
- input, the screens, and the round flow with medals and caps;
- sounds.

Done when all three routes fly in a browser with mouse, touch and Space, and the course, model and script tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the full-day, loss and restart tests, `README.md`.
Done when: `pnpm game check paper-plane v1` passes.

**M3 · Local release.** `pnpm game:local publish paper-plane v1 --yes`.
Done when `/play/paper-plane` plays locally, and a logged-in route 1 finish with every letter delivered unlocks `deliver_all` and updates the board. The owner runs the production publish.

## Implementation notes

No decision (D1–D10) changed. The model is transcribed line for line; the three recorded scripts replay to 47.09 / 63.28 / 81.26 s with 0 crashes and every letter delivered, and script 1 sends `updraft` at step 781.

- *Changed in M1:* route 2's windmills turn on the parallax hills, not on tall roofs. A windmill on a roof looks like an obstacle the plane would hit, but it has no collision.
- `stepRun` emits `updraft` once, on the step where `rise` crosses 300, not on every step at or above it. The first send is the same step; `tick` shows `扶摇直上！` only the first time in a round.
- `stepRun(run, hold, mg = 0)` and `hits(run, mg = 0)` take the recorder's safety margin (collision radius `R + mg`, mail zones shrunk by `mg`). The game always passes 0.
- `buildCourse` also returns `name`, `medals`, `cap`, `src` (sky, wall and window colours), `bi` (building index) on thermals, mailboxes and checkpoints, and the derived wire `poles`. `roofAt` returns the first building containing `x` (buildings never overlap).
- `node test_headless.js --record` reproduces script 2 bit for bit. Scripts 1 and 3 come out slightly different (47.07 and 81.70 s, both still clean and under gold), so the prototype's search had a different tie-break or score weight. The shipped scripts are the doc's; re-record only after a model or course change.
- Canvas buttons come from `buttons()`, computed from the current state for both drawing and hit-testing. `下一程` / `再送一天` are greyed and inert for the 0.5 s lock.
- Hold = Space or any pointer down off a button, tracked as a set of pointer ids with capture; `pointerup`, `pointercancel` and `lostpointercapture` remove one, and `blur` clears all. Space and Enter ignore key repeat. Space also works as `出发` on the start screen.
- The headless loss test asserts `crashes ≥ 20` (the plane crashes 29 times on its launch roof before 135 s) and `cpi === −1`.
- Additions not in the doc: a route progress bar under the route name (mailbox dots by state, checkpoint ticks), speed lines above 330, a dawn sun / afternoon clouds / night stars and moon, the route 1 intro hint `钻进炊烟被托高 · 穿过虚线框送信 · 太慢会失速`, `✉ n/m` on the route card, `合计 … · 送达 n 封` on the day card, and `第 n 程超过 cap 秒` on the lost card. The day-won card shows a medal disc per route.
- Visual check was done with screenshots from a separate headless Chrome on a scratch copy (start, intro, flight on all three routes, crash, route card, day won, lost), with no console errors. The real mouse / touch / Space playtest is part of M3.

### M3 notes

- Local publish registered the game, its achievements and stats; the smoke test found `/play/paper-plane` serving v1.
- In the browser, route 1's recorded script, fed through the real `requestAnimationFrame` loop one bit per 12 steps, finished in 47.09 s with 0 crashes and 5/5 letters, exactly as in the headless test, and unlocked `updraft`, `deliver_all` and `gold`. The route card and gold stamp render correctly. No console errors.
- On `/play/paper-plane`, a real click on the intro launched the plane and `R` ended the round: `game_ready`, `game_start` and `game_end` reached the local events table. No account was logged in, so the achievement popup and stats board were not exercised in the browser.
- Gotcha for replaying scripts by hand: a script bit covers 0.1 s, i.e. 12 model steps, not one.
- Medal times still need a human playtest (Open items).

## Open items

- Medal times come from a search with perfect knowledge of the course (D10). After the M1 playtest the owner may loosen gold/silver/bronze. The scripts only need to stay under gold.
- If M1 playtests find a constant or a course section unfair, the implementer changes it, re-records with `--record`, and updates this doc's tables in the same change (owner approves feel changes).
