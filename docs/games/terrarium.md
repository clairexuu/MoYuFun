# 生态瓶 (`terrarium`)

**Status:** Implemented 2026-10-02 (`games/terrarium/v1/`), released locally; production publish follows (`pnpm game publish terrarium v1`). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A sealed-jar ecosystem sim built around one up-front decision. With a budget of 100 贝壳, put organisms and materials into a glass jar, pick its light, and seal the lid. After that you can only watch (and change the speed) while 100 days play out. The jar wins if animals and plants are both still alive on day 100. If it collapses, the end screen shows the population curves and a plain-language cause of death. Mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/tile-stack/v1/index.html` (SDK block, `resize()`/`view`, audio helper `tone`, repeated `ready`), `games/slash/v4/test_headless.js` and `games/tile-stack/v1/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/terrarium/v1/index.html`, vanilla JS and canvas, no dependencies or assets. Copy from 摸了个鱼 v1 only the SDK block, `resize()`/`view` and `tone()`. | Same package contract. Everything here is shapes, gradients and emoji drawn with `fillText`. |
| D2 | The whole game is one decision: the setup. After `封瓶` the player cannot change the jar. The only controls are pause, the speed (1×/2×/4× days per second) and `跳到结局`. | This is the core mechanic. Watching the consequences unfold is the payoff, and the diagnosis teaches the next setup. |
| D3 | The model is a fixed set of difference equations, stepped **hourly** (explicit Euler, `dt = 1/24` day, 2,400 steps per round). It uses **no randomness**. `rng()` (default `Math.random`, seeded `mulberry32` in tests) is used only for sprite placement and motion. | Same setup, same outcome, every time. That makes the jar a puzzle you can reason about, and lets the test assert outcomes exactly. Hourly steps give a real day/night swing in oxygen. |
| D4 | The gases form one sealed pool: `O + C = 20` at all times (`C = 20 − O` after every step). Photosynthesis turns C into O; respiration and decomposition turn O into C. | "Sealed" becomes concrete: the jar has only 20 units of gas to share. The small pool makes night-time drops dangerous, and it gives the test an invariant. |
| D5 | Producer growth (`mu`) and oxygen output (`pi`) are separate terms. Animals are counted in individuals (births and deaths); producers and bacteria in biomass. | A carbon-conserving prototype rebalanced itself so well that oxygen never ran out. Separate terms make "producer capacity vs. consumer demand" the thing that decides oxygen, which is the lesson the game teaches. |
| D6 | The light setting is chosen before sealing, and it sets intensity, hours and **heat** (a multiplier on all respiration). | Light is the one non-organism lever. Heat makes `灯下` a real trade-off rather than strictly better. |
| D7 | The round ends at the end of the first day on which every animal species or every producer species is extinct (loss), or at the end of day 100 (win). Bacteria count for neither side. | "Animals and producers alive on day 100" is the brief's win rule, and ending early avoids watching an empty jar. |
| D8 | The cause of death is computed, not guessed. Every animal death is booked as hypoxia, poison or starvation, weighted by body biomass. The largest bucket wins, and hypoxia that began while algae was ≥ 40 is relabelled 藻华. | The diagnosis is honest and reproducible, and the test can assert it. |
| D9 | Score (wins only) = 100 × species alive on day 100 + 3 × healthy days (max 1,000). A day is healthy when its lowest O is ≥ 8 and its highest W is < 15. | Rewards both biodiversity and stability, as the brief asks. |
| D10 | Sprites are a view of the populations: each species' sprite count comes from its population every frame, never the reverse. | The model stays pure and testable; the jar always shows the truth. |
| D11 | `ready` is sent on load and again at 0.5, 2 and 5 s. `start` is sent on `封瓶`. A round's messages end at the outcome; `再来一瓶` returns to setup with the last setup preselected (in memory only). | Same lifecycle fix as 升官记 D8. Preselecting makes "tweak one thing and retry" cheap, which is how players learn the system. |
| D12 | Input uses Pointer Events (`pointerup` on buttons). | One code path for mouse and touch. |

## Out of scope

Intervening after sealing (feeding, opening the lid), random events, seasons or temperature beyond the light's heat, more than one jar, a sandbox for editing coefficients, saving or sharing setups between page loads, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/terrarium/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "terrarium",
  "name": "生态瓶",
  "shortDescription": "封瓶前定好一切，然后只能看着它活下去，或者崩溃。",
  "description": "用 100 贝壳往玻璃瓶里放藻类、水草、苔藓、小虾、螺、跳虫和细菌，铺上沙和炭，选好光照，然后封上盖子。之后的一百天你只能旁观：氧气、养分和废物此消彼长，任何失衡都可能让它崩溃。撑到第 100 天就算成功；失败时会告诉你它是怎么死的。",
  "tags": ["模拟", "生态", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "增减生物、选光照、封瓶、调速度" },
    { "input": "Enter", "action": "封瓶 / 再来一瓶" },
    { "input": "空格", "action": "暂停或继续" },
    { "input": "1 / 2 / 3", "action": "1× / 2× / 4× 速度" },
    { "input": "S", "action": "跳到结局" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "瓶", "eyebrow": "SEALED ECOSYSTEM", "accent": "#4caf7a", "accentSecondary": "#a3e0ff" },
  "sortOrder": 190,
  "achievements": [
    { "key": "sealed_100", "name": "百日生机", "description": "生态瓶撑到第 100 天。", "symbol": "生" },
    { "key": "full_house", "name": "七族同瓶", "description": "第 100 天时七种生物全部存活。", "symbol": "七" },
    { "key": "frugal", "name": "小本经营", "description": "花费不超过 60 贝壳，撑到第 100 天。", "symbol": "俭" },
    { "key": "shade_win", "name": "背阴之地", "description": "选背阴光照，撑到第 100 天。", "symbol": "阴" },
    { "key": "calm", "name": "风平浪静", "description": "100 天里每天都健康：氧气不低于 8，废物低于 15。", "symbol": "静" }
  ],
  "stats": [
    { "key": "rounds", "name": "封瓶", "maxPerRound": 1 },
    { "key": "wins", "name": "成功", "maxPerRound": 1 },
    { "key": "days", "name": "存活天数", "maxPerRound": 100 },
    { "key": "species", "name": "存活物种", "maxPerRound": 7 }
  ]
}
```

### Setup: items, costs, light

Budget: **100 贝壳**. A setup is `{ algae, plant, moss, shrimp, snail, spring, bact, sand, char, light }`, with counts in portions (default all 0, `light: 'window'`). `+` is disabled when the item is at its max or its cost exceeds the remaining budget. `封瓶` is enabled only when at least one animal (虾/螺/跳虫) and one producer (藻/水草/苔藓) are placed; otherwise the button reads `至少放一种动物和一种植物`.

| key | name | icon | cost | portion = | max | hint (shown on tap) |
| --- | --- | --- | --- | --- | --- | --- |
| `algae` | 藻类 | 🟢 | 3 | 10 biomass | 9 | 长得最快，小虾和螺的口粮。没人吃就会疯长成藻华。 |
| `plant` | 水草 | 🌿 | 8 | 10 biomass | 6 | 产氧主力，螺会啃它。铺沙能长得更大。 |
| `moss` | 苔藓 | 🍀 | 6 | 10 biomass | 6 | 耐阴，长在石头上，是跳虫的家和口粮。怕灯下暴晒。 |
| `shrimp` | 小虾 | 🦐 | 6 | 1 individual | 9 | 只吃藻类，呼吸量大。 |
| `snail` | 螺 | 🐌 | 5 | 1 individual | 9 | 吃藻类也啃水草，慢悠悠。 |
| `spring` | 跳虫 | 🦗 | 4 | 10 individuals | 6 | 吃废物和苔藓，帮忙打扫。 |
| `bact` | 细菌 | 🦠 | 4 | 10 biomass | 6 | 把废物分解成养分，但分解时要耗氧。 |
| `sand` | 沙 | 🟨 | 8 | 1 layer | 2 | 水草能长得更大，细菌有更多地方住。 |
| `char` | 炭 | ⬛ | 10 | 1 piece | 1 | 吸附毒素：废物到 60 才致毒（原本 30）。 |

| light | card | hint | intensity `I` | lit hours (clock) | heat |
| --- | --- | --- | --- | --- | --- |
| `shade` | 🌥️ 背阴 | 光弱，日照 10 小时，瓶里凉快，大家呼吸都慢。苔藓最爱。 | 0.5 | 07:00–17:00 | 0.8 |
| `window` | 🪟 窗边 | 日照 12 小时，不冷不热。 | 1.0 | 06:00–18:00 | 1.0 |
| `lamp` | 💡 灯下 | 强光 16 小时，长得快也更热：呼吸加快，苔藓会被晒伤。 | 1.6 | 05:00–21:00 | 1.2 |

### Model

State `jar`: `{ hour, day, O, C, N, W, algae, plant, moss, shrimp, snail, spring, bact, sand, char, light, cause: { hypo, tox, starve }, aHyp, hypDay, dayMinO, dayMaxW, healthy, history }`. `O`/`C` are oxygen/CO₂ (shared pool of 20), `N` is nutrients, and `W` is waste/detritus. Model hour 0 is clock 06:00 on day 1, and each day ends at 06:00 the next morning. `history` holds one row per day end, plus row 0 at creation: `{ day, O, Omin, N, W, algae, plant, moss, shrimp, snail, spring, bact }`.

This is the normative model. The implementation transcribes it as is, including the order of operations: every rate is computed from the state at the start of the hour, then all changes are applied at once.

```js
const LIGHTS = { shade: { I: 0.5, on: 7, off: 17, heat: 0.8 }, window: { I: 1.0, on: 6, off: 18, heat: 1.0 }, lamp: { I: 1.6, on: 5, off: 21, heat: 1.2 } };
const PROD = { // per day; mu growth, pi O output, rho respiration, dth death, K capacity, Isat light saturation
  algae: { mu: 1.2,  pi: 0.9, rho: 0.30, dth: 0.05, K: 100, Isat: 1.2, crowd: 3.0, burn: 0 },
  plant: { mu: 0.4,  pi: 0.6, rho: 0.06, dth: 0.01, K: 60,  Isat: 0.8, crowd: 0,   burn: 0 },
  moss:  { mu: 0.25, pi: 0.4, rho: 0.04, dth: 0.01, K: 40,  Isat: 0.4, crowd: 0,   burn: 0.15 },
};
const ANIM = { // per individual per day: c food eaten when sated, b births, m death, sg starvation death, rho O used, w body biomass
  shrimp: { food: ['algae'],          R: [5],     h: 5,  c: 3.0, b: 0.10, m: 0.01, sg: 0.05, rho: 0.5,  w: 2,   cap: 12 },
  snail:  { food: ['algae', 'plant'], R: [5, 15], h: 10, c: 2.0, b: 0.05, m: 0.01, sg: 0.04, rho: 0.4,  w: 3,   cap: 8 },
  spring: { food: ['W', 'moss'],      R: [0, 10], h: 3,  c: 0.1, b: 0.15, m: 0.03, sg: 0.10, rho: 0.03, w: 0.1, cap: 80 },
};
const BACT = { k: 1.0, hW: 10, kO: 2, y: 0.3, rho: 0.05, od: 1.0, dth: 0.05, K: 30 };
const ENV = { T: 20, O0: 16, N0: 15, kC: 2, kN: 2, nu: 0.2, kappa: 0.5, Olow: 4, hypo: 1.5, Wtox: 30, tox: 0.5, turbA: 60 };
const PORTION = { algae: 10, plant: 10, moss: 10, shrimp: 1, snail: 1, spring: 10, bact: 10 };
const SPECIES = ['algae', 'plant', 'moss', 'shrimp', 'snail', 'spring', 'bact'];
const ANIMALS = ['shrimp', 'snail', 'spring'], PRODUCERS = ['algae', 'plant', 'moss'];

function createJar(setup) // O = 16, C = 4, N = 15, W = 0, each species = setup[k] * PORTION[k], dayMinO = 20, history = [row 0]
function stepHour(j) {
  const dt = 1 / 24, L = LIGHTS[j.light], h = (j.hour + 6) % 24;
  const I = h >= L.on && h < L.off ? L.I : 0;
  const fC = j.C / (j.C + ENV.kC), fN = j.N / (j.N + ENV.kN), resp = L.heat * j.O / (j.O + 1);
  const turb = 1 / (1 + j.algae / ENV.turbA);                    // algae clouds the water for every producer
  const d = { O: 0, N: 0, W: 0, algae: 0, plant: 0, moss: 0, shrimp: 0, snail: 0, spring: 0, bact: 0 };
  for (const k of PRODUCERS) {
    const p = PROD[k], X = j[k]; if (X <= 0) continue;
    const K = p.K * (k === 'plant' ? 1 + 0.5 * j.sand : 1);
    const fI = Math.min(1, I / p.Isat) * turb;
    const grow = p.mu * X * fI * fN * fC * Math.max(0, 1 - X / K);
    const die = (p.dth + p.burn * Math.max(0, I - 1) + p.crowd * Math.max(0, X / K - 0.5)) * X;
    d[k] += grow - die; d.N -= ENV.nu * grow; d.W += die;
    d.O += p.pi * X * fI * fC - p.rho * X * resp;
  }
  const hyp = j.O < ENV.Olow ? ENV.hypo * (1 - j.O / ENV.Olow) : 0;  // extra death rate per day
  if (hyp > 0 && j.aHyp === null) { j.aHyp = j.algae; j.hypDay = j.day + 1; }
  const Wt = ENV.Wtox * (1 + j.char);
  const tox = j.W > Wt ? ENV.tox * Math.min(1, (j.W - Wt) / Wt) : 0;
  for (const k of ANIMALS) {
    const a = ANIM[k], n = j[k]; if (n <= 0) continue;
    const avail = a.food.map((f, i) => Math.max(0, j[f] - a.R[i]));  // R: refuge the animal can't reach
    const F = avail[0] + (avail[1] || 0), sat = F / (F + a.h), eat = a.c * n * sat;
    if (F > 0) a.food.forEach((f, i) => { d[f] -= eat * avail[i] / F; });
    const starve = a.sg * (1 - sat);
    const deaths = (a.m + starve + hyp + tox) * n;
    d[k] += a.b * n * sat * Math.max(0, 1 - n / a.cap) - deaths;
    d.W += ENV.kappa * eat + a.w * deaths; d.N += ENV.nu * (1 - ENV.kappa) * eat;
    d.O -= a.rho * n * resp;
    j.cause.hypo += hyp * n * a.w * dt; j.cause.tox += tox * n * a.w * dt; j.cause.starve += starve * n * a.w * dt;
  }
  const B = j.bact;
  if (B > 0) {
    const dec = BACT.k * B * j.W / (j.W + BACT.hW) * j.O / (j.O + BACT.kO);
    d.bact += BACT.y * dec * Math.max(0, 1 - B / (BACT.K * (1 + j.sand))) - BACT.dth * B;
    d.W -= dec; d.N += ENV.nu * dec; d.O -= BACT.od * dec + BACT.rho * B * resp;
  }
  for (const k of SPECIES) j[k] = Math.max(0, j[k] + d[k] * dt);
  j.O = Math.min(ENV.T, Math.max(0, j.O + d.O * dt)); j.C = ENV.T - j.O;
  j.N = Math.max(0, j.N + d.N * dt); j.W = Math.max(0, j.W + d.W * dt);
  j.dayMinO = Math.min(j.dayMinO, j.O); j.dayMaxW = Math.max(j.dayMaxW, j.W);
  j.hour++;
  if (j.hour % 24 === 0) endDay(j);
}
function endDay(j) {
  j.day++;
  for (const k of SPECIES) if (j[k] > 0 && j[k] < 0.5) { j.W += j[k] * (ANIM[k] ? ANIM[k].w : 1); j[k] = 0; } // extinction
  if (j.dayMinO >= 8 && j.dayMaxW < 15) j.healthy++;
  j.history.push(row(j)); j.dayMinO = ENV.T; j.dayMaxW = 0;
}
function outcome(j) { // called after every endDay
  const noA = ANIMALS.every(k => j[k] === 0), noP = PRODUCERS.every(k => j[k] === 0);
  if (noA || noP) return { win: false, day: j.day, diagnosis: diagnose(j, noA) };
  return j.day >= 100 ? { win: true, day: 100, diagnosis: null } : null;
}
function diagnose(j, noAnimals) {
  if (!noAnimals) return 'withered';
  const c = j.cause, top = ['hypo', 'tox', 'starve'].reduce((a, b) => (c[b] > c[a] ? b : a));
  return top === 'hypo' && j.aHyp >= 40 ? 'bloom' : top;
}
```

What the terms mean, for the hints and the README: producers make oxygen only in light and only while CO₂ is left (`fC`), and everything breathes day and night (`resp`). Dense algae (above half of `K`) dies off in heaps, and decomposing it costs oxygen. Animals breed only when fed, and starve when food sits near their refuge `R`. Bacteria turn waste into nutrients, using oxygen to do it. With no decomposers, waste piles up past `Wt` and poisons the animals.

### Reference setups

These numbers come from a prototype of exactly the code above. The headless test asserts them (D3).

| name | setup | cost | light | outcome |
| --- | --- | --- | --- | --- |
| 稳定瓶 (known good) | 藻 2, 水草 3, 苔藓 2, 虾 3, 螺 2, 跳虫 1, 细菌 2, 沙 1 | 90 | 窗边 | Win. All 7 species alive; healthy days 93, score 979. Day-100 values ≈ algae 8.2, plant 30.8, moss 11.7, shrimp 1.26, snail 2.21, spring 25.3, bact 14.9. Each single ±1 change to one item (17 neighbours) also wins. |
| 背阴小瓶 (known good) | 水草 3, 苔藓 2, 跳虫 2, 细菌 1 | 48 | 背阴 | Win. 4 species alive, healthy days 100, score 700. |
| 动物园 (known failing) | 藻 1, 虾 8, 螺 6, 细菌 2 | 89 | 窗边 | Collapses on day 4: `hypo` (algae 5.6 at first hypoxia). |
| 灯下藻华 (known failing) | 藻 2, 水草 3, 螺 1, 细菌 2 | 43 | 灯下 | Collapses on day 11: `bloom` (algae 48.5 at first hypoxia). |
| 无人打扫 (known failing) | 藻 2, 水草 2, 虾 3, 螺 2 | 50 | 窗边 | Collapses on day 18: `tox` (W ≈ 51). |

### Diagnosis and end copy

| diagnosis | title | text | 建议 |
| --- | --- | --- | --- |
| win | 🌿 生机盎然 | 第 100 天，瓶中依然生机勃勃。 | — |
| `hypo` | 😮‍💨 缺氧 | 动物、细菌和植物夜里都在呼吸，白天的光合作用补不回来。第 {hypDay} 天氧气跌破警戒线，动物窒息了。 | 少放些动物，或多放水草和苔藓。细菌分解废物也要耗氧。 |
| `bloom` | 🟢 藻华 | 藻类疯长，把水染成浑绿，挡住了别的植物的光；太密的藻类成片死去腐烂，夜里和细菌一起把氧气耗尽。 | 多放小虾和螺来吃藻，少放藻类，或换弱一点的光。 |
| `tox` | ☠️ 废物中毒 | 排泄物和尸体没人分解，在瓶底越堆越多，超过 {Wt} 后开始毒害动物。 | 放些细菌和跳虫当分解者，或放一块炭。 |
| `starve` | 🍽️ 饿死 | 动物找不到足够的食物：小虾只吃藻类，螺吃藻类和水草，跳虫吃废物和苔藓。 | 给每种动物配上它吃的东西，食物要比动物多。 |
| `withered` | 🥀 植物枯死 | 植物死得比长得快，最后一种也没了。可能是光太弱、养分耗尽，或苔藓在灯下被晒伤。 | 换个光照，或放些细菌把废物变回养分。 |

The loss subtitle is `第 {day} 天，生态瓶崩溃了`. The win score line is `物种 {n} × 100 + 健康天数 {h} × 3 = {score}`, with stars: ★ for a win, ★★ at score ≥ 700, ★★★ at ≥ 900.

### Screens and drawing

**Logical area:** 480 × 800 portrait, scaled by `view.s = min(w/480, h/800)` and centred, with `resize()` copied from 摸了个鱼. Pointer coordinates map back through `view`.

**Setup screen:**
- Title `生态瓶`, subtitle `封上盖子之后，你就再也不能插手了。`, and a chip `🐚 剩余 {n}` (top, y 0–60).
- A jar preview (y 70–390) shows the placed items live, with the cork lid hovering open.
- A hint line (y 400) shows the hint for the last item or light tapped.
- The light cards are 3 × 140 × 56 at y 420.
- The item cards are a 3 × 3 grid of 140 × 74 at y 490/570/650. Each shows the icon, name, `🐚 {cost}`, the count, and 40 × 32 `−`/`+` buttons.
- `封瓶` is a 440 × 52 button at y 740.

**Run screen:**
- HUD (y 0–56): `第 {day} 天`, ☀️/🌙 with the clock `HH:00`, and buttons `⏸ 1× 2× 4× ⏭` (44 × 36).
- The jar is drawn at x 60–420, y 70–600.
- Four gauges (y 610–690): 氧气 0–20, 二氧化碳 0–20, 养分 0–40 and 废物 0–60. 氧气 turns red below 4; 废物 turns red above `Wt`.
- A species row (y 700–790) shows 7 chips: icon plus `round(value)`, with springtails as individuals.
- Toasts appear at the top of the jar for 2.5 s: `第 {d} 天：{name}灭绝了`, `氧气告急！` (the first hour O < 4), `废物超标！` (the first hour W > `Wt`).

**Jar drawing** (inside the jar rectangle, bottom up):
- Layers: sand (18 px per layer, tan gradient), charcoal (10 px, `#222`), and sediment (`min(W, 60)/60 × 24` px, `#6d4c41`).
- A grey rock on the left third of the floor, where moss and springtails live.
- Water: `#a3e0ff` at alpha 0.35, plus green `#4caf50` at alpha `min(0.55, algae/90)` and brown `#7a5a3a` at alpha `min(0.35, W/150)`.
- Behind the jar, the background crossfades over 1 model hour at the light's on/off times between a day gradient (`#cfefff → #f7fbff`) and night (`#0e1a33 → #1d2c4f`). 灯下 also draws a lamp above the jar that glows while lit.
- The cork lid drops shut with the seal sound.

**Sprites** (D10). Each frame, the target count per species is:

| species | target count | sprite |
| --- | --- | --- |
| shrimp | `round(n)` | 🦐 |
| snail | `round(n)` | 🐌 |
| spring | `min(40, round(n / 2))` | grey 2 px dots |
| algae | `min(30, round(algae / 3))` | green 3 px specks |
| plant | `min(8, ceil(plant / 10))` stalks | stalks of height `min(240, 40 + 4 × plant / stalks)`, drawn as quadratic curves |
| moss | `min(12, ceil(moss / 4))` | bumps of radius `min(14, 8 + moss / 10)` on the rock |
| bact | `min(12, round(bact / 3))` | sparkles at alpha 0.4 at sediment level |

When a sprite is missing, a new one spawns at an `rng()` position in its zone. Surplus sprites flip upside down, sink and fade over 1 s. The motion is cosmetic and runs in real time:
- Shrimp swim with a sine wobble, turn at the walls and face their direction.
- Snails crawl 6 px/s along the floor and walls.
- Springtails hop every 0.5–2 s, timed with `rng()`.
- While lit, O₂ bubbles rise from producer sprites at 0.5 per second per unit of `pi·X·fI·fC`, at most 20 alive.

**End overlay** (a 440 × 720 panel), in this order:
1. Title, subtitle and score line (wins only).
2. The diagnosis card: title, text and 建议.
3. The chart (400 × 260).
4. The `再来一瓶` button.

**Chart:** x is day 0–100, always the full width.
- Top panel `种群`: one polyline per species from `history`, each scaled to its own maximum (the legend shows the emoji and the peak value). Colours: algae `#7cb342`, plant `#2e7d32`, moss `#9ccc65`, shrimp `#ff7043`, snail `#a1887f`, spring `#78909c`, bact `#ab47bc`.
- Bottom panel `环境`: `Omin` (blue `#3b82f6`, 0–20) with a dashed line at 4, and `W` (brown `#8d6e63`, 0–60, clamped).
- A collapse draws a red dashed vertical line at its day.

**Sound** (`tone`):
- `+`: 660→880 Hz triangle, 0.06 s. `−`: 520→400 Hz, 0.06 s.
- Seal: 180→90 Hz square, 0.15 s, then a 1400→1300 Hz sine ring, 0.6 s.
- Sunrise (1× only): 880→1320 Hz, 0.12 s.
- Extinction: 400→200 Hz sine, 0.4 s.
- Win: arpeggio 523/659/784/1046 Hz, 0.12 s apart.
- Collapse: 220→110 Hz sawtooth, 0.8 s.

### Functions

Pure model, with no DOM, canvas or rng: `costOf(setup) → number`, `sealProblem(setup) → '' | '至少放一种动物和一种植物'`, `createJar(setup)`, `stepHour(jar)`, `outcome(jar)`, `diagnose(jar, noAnimals)`, `scoreOf(jar) → { species, healthy, score }`.

Game:
- `adjust(key, delta)`: setup phase only. Respects the max and budget; returns `false` if refused.
- `setLight(key)`.
- `seal()`: calls `createJar`, resets `roundAchievements`, sends `start`, and sets the phase to `'run'` with speed 1.
- `setSpeed(0 | 1 | 2 | 4)`.
- `update(dt)`: clamps `dt` to 0.1 s and advances sprites. In `'run'`, it adds `dt × 24 × speed` to an hour accumulator and calls `stepHour` while the accumulator is ≥ 1. After each day end it checks `outcome`, and a result calls `finish`.
- `skipToEnd()`: steps until `outcome` is non-null, then calls `finish`.
- `finish(result)`: sends achievements, `stats` and `end`, plays the sound and shows the end overlay.
- `backToSetup()`: keeps the last setup.

### Achievements

Emitted through `unlockAchievement(key)` (once per round), all in `finish()` on a win, in this order, before `stats`/`end`:

| key | Trigger |
| --- | --- |
| `sealed_100` | The round is won. |
| `full_house` | Won with all 7 species `> 0` on day 100. |
| `frugal` | Won with `costOf(setup) <= 60`. |
| `shade_win` | Won with `light === 'shade'`. |
| `calm` | Won with `healthy === 100`. |

### Stats

In `finish()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: win ? 1 : 0, days: result.day, species: <count of SPECIES with value > 0> })`.

### Headless test

`v1/test_headless.js` uses the stub pattern (`document.documentElement.clientWidth/Height` = 480/800, `requestAnimationFrame` and `setTimeout` as no-ops). `rng = mulberry32(1)`.

**Model:**
- For all five reference setups, every hour: `O + C === 20` (±1e-9), and every number in the jar is finite and ≥ 0.
- **Determinism:** running a setup twice gives an identical `history` (`JSON.stringify` equal). Running it with `rng = mulberry32(2)` and with sprites updated in between also gives an identical history, which proves `rng` never reaches the model.
- **Outcomes** for the reference table:
  - Win/loss and diagnosis match exactly.
  - Collapse days are within ±1 of the table.
  - 稳定瓶 has 7 species and `85 <= healthy < 100`.
  - 背阴小瓶 has 4 species and `healthy === 100`.
  - All 17 single-item neighbours of 稳定瓶 win.

**Setup rules:**
- `costOf` of the reference setups matches the table.
- `adjust` refuses past an item's max and past the budget.
- `sealProblem` rejects a jar with no animal or no producer.

**Time:**
- After `seal()` at 1×, `update(0.1)` ten times advances exactly 24 hours. At 4× it advances 96.
- Speed 0 advances nothing.
- `skipToEnd()` reaches the outcome.

**Load.** Only `ready` messages are sent until `seal()`.

**Sequences:**
- 稳定瓶: `start, sealed_100, full_house, stats, end`, with stats `{ rounds: 1, wins: 1, days: 100, species: 7 }`.
- 背阴小瓶: `start, sealed_100, frugal, shade_win, calm, stats, end`, with stats `{ rounds: 1, wins: 1, days: 100, species: 4 }`.
- 动物园: `start, stats, end`, with stats `{ rounds: 1, wins: 0, days: 4, species: 2 }`.
- After `backToSetup()` the setup is unchanged, and a second `seal()` sends `start` again.

## Milestones

Each milestone ends with `node games/terrarium/v1/test_headless.js` passing.

**M1 · Playable jar.** The model, setup screen, sealing, the run screen with sprites, gauges, day/night, speeds and toasts, the end overlay with diagnosis and chart, and sounds.
Done when: all five reference setups play in a browser with the stated outcomes, and the model and time tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, sequence tests, `README.md` (setups worth trying, the model in brief).
Done when: `pnpm game check terrarium v1` passes.

**M3 · Local release.** `pnpm game:local publish terrarium v1 --yes`.
Done when: `/play/terrarium` plays locally, and a logged-in 稳定瓶 round unlocks `sealed_100` and `full_house` and writes the stats. The owner runs the production publish.

### M3 notes

- Local publish registered the game, five achievements and four stats; the smoke test found `/play/terrarium` serving v1.
- Built 稳定瓶 in the browser with real clicks (花费 90 / 100, 窗边), sealed it, watched the first days at 1×, then skipped to the end: `封瓶成功`, three stars, `物种 7 × 100 + 健康天数 93 × 3 = 979`, matching the reference table. No console errors.
- On `/play/terrarium`, a 1 藻类 + 1 小虾 jar sealed and skipped ended `封瓶失败` on day 22 with the 废物中毒 diagnosis, and `game_ready`, `game_start` and `game_end` reached the local events table. No account was logged in, so the achievement popup and stats board were not exercised in the browser; the headless test covers the message sequence.
- Gotcha for automated testing: canvas buttons take their enabled state from the last drawn frame, so a click in the same frame as the `+` that makes the jar sealable is ignored. Humans can't click that fast.

## Open items

- Balance is tuned by a prototype only: about 42% of random full-budget setups win under 窗边, 38% under 灯下 and 16% under 背阴, and hypoxia is the most common death. If M1 playtests find the jar too harsh or too easy, the owner adjusts `ENV.T`, `ENV.Olow` or the animals' `rho`. The reference table and test expectations must then be re-measured in the same change.

## Implementation notes

No decision changed. The model is the code above, transcribed line for line; the headless test reproduces the reference table exactly (稳定瓶 healthy 93 / score 979, 背阴小瓶 700, 动物园 day 4 `hypo`, 灯下藻华 day 11 `bloom`, 无人打扫 day 18 `tox`), and all 17 neighbours of 稳定瓶 win.

- `lightAt(light, hour)` is factored out of `stepHour` so the view (sun/moon, lamp glow, O₂ bubbles) uses the same lit test as the model. History row 0 uses `Omin = O0` (the doc left it open; `dayMinO` starts at 20).
- The hour accumulator compares against `1 − 1e-9`: ten `update(0.1)` calls at 1× sum to slightly less than 24 in floating point and would otherwise step only 23 hours.
- `advanceHour(live)` wraps `stepHour` with the toasts and sounds; `skipToEnd()` passes `live = false`, so skipping shows no toast burst. `氧气告急！` and `废物超标！` fire once per round (first hour the condition holds), not on every night's dip, which at 4× would spam.
- `togglePause()` (space, `⏸`) remembers the last non-zero speed. Enter on the end overlay works only once it has slid in (0.45 s), so a held Enter from sealing cannot skip it.
- `adjust` refusals still show the item's hint; a refusal for budget flashes the `🐚 剩余` chip red. A disabled `+` keeps a hit area for that feedback.
- Additions not in the doc: 花费 and 光照 chips beside the setup jar; overlay titles `封瓶成功` (subtitle `撑过了 100 天`) / `封瓶失败`; a `这一瓶` recap line (items, light, cost) between the chart and `再来一瓶`, to support "tweak one thing and retry" (D11); a `🔇` corner mark while muted; a thin day-progress bar under the HUD.
- Wrapping in the end card estimates width by character class (CJK = font size, ASCII = half) instead of `measureText`, so the headless stub can draw every screen.
- The test's canvas stub returns itself from every method so gradients (`createLinearGradient(...).addColorStop`) run headless.
- Visual check was done with screenshots from a separate headless Chrome on a scratch copy, not in the shared browser. Sprite counts follow D10; the lid drops in 0.35 s with a small shake and dust burst.
