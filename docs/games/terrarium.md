# 生态瓶 (`terrarium`)

**Status:** v2 implemented and published to production 2026-10-05 (`pnpm game publish terrarium v2`; www.moyufuns.com/play/terrarium). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A sealed-jar ecosystem sim disguised as an Excel workbook (`实验数据_生态系统稳定性.xlsx`). Each sheet tab 实验1–实验5 is one jar with its own budget, light, required species, scheduled disturbance and goals. The player fills in a table (物种 / 数量 / 单价 / 小计), picks the light in a dropdown cell, starts the run, and then watches an Excel-style dashboard: KPI cells with conditional formats and three line charts. Three one-time interventions (补种水草, 开盖通气, 遮光一天) rescue a jar whose charts turn yellow. A jar is rated 1–3 stars. Mouse, keyboard or touch; single-player.

**What v1 was and why it changed.** v1 (`games/terrarium/v1/`, published) was one decision: spend 100 贝壳 on a jar in a cartoon setup screen, seal it, then watch 100 days of emoji sprites with only speed controls. The owner found it boring: after the setup there was nothing to do, and a good setup could be found once and replayed forever. v2 keeps v1's deterministic compartment model unchanged (its five reference setups give identical results) and adds agency (three interventions during the run), goals (five jars with stars) and pressure (scheduled disturbances that a setup alone cannot absorb). The cute jar is gone; the game is an office spreadsheet (`docs/design/office-camouflage.md` M7, 生态瓶 v2).

Read first: `docs/design/office-camouflage.md` (D2 `disguise`, D6 conventions, D7 Excel chrome, D8 conditional-format colours), `games/prototype-skins/index.html` variant C (the chrome this file copies), `docs/design/game-release.md`, `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/terrarium/v1/index.html` (the model).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/terrarium/v2/index.html`, vanilla JS and canvas. Excel chrome copied from the prototype's variant C. | Same package contract; the prototype is the approved look. |
| D2 | The v1 model is kept line for line. v2 only adds two things to `stepHour`: scheduled **events** and **interventions**. With no events and no interventions the result is identical to v1. | Reuses a tested, balanced model; the v1 reference table still holds and is in the v2 test. |
| D3 | Interventions, each once per jar, usable only during the run, effective immediately: **补种水草** `plant += 15`; **开盖通气** for 48 h, after each hour's update `O += (16 − O) × 0.3`; **遮光一天** for 24 h, light 0, respiration heat 0.8 instead of the light's heat, algae extra death 0.5/day. `O + C = 20` still holds. | Each one answers one failure mode the charts show: low O₂ (vent), algae bloom (shade), dying plants (replant). Shade also lowers O₂, so it has a real cost. 48 h for the lid because disturbances last 2 days; with 24 h the intervening bot could not cover them (balance sim). |
| D4 | Five jars with fixed **events** (disturbances): 空调停机 multiplies all respiration for N days; 水草病害 removes a share of plant and moss biomass into waste. Events are listed in the sheet's 扰动 row before the run. | Without them an optimiser always finds a setup that needs no intervention (tested: with constraints only, best no-intervention = best intervening in every jar). Known in advance, they are a puzzle (prepare or react), not luck. |
| D5 | Stars: collapse (all animals or all producers extinct, v1 rule) → 0 stars. Reaching the jar's day count → ★, plus one star for each of two jar-specific goals met on the last day. Required species are a setup minimum only; they need not survive. | Lenient ★ keeps every jar reachable; the extra goals carry the difficulty. Requiring survival of required species made jar 3 almost unwinnable in the sim. |
| D6 | Run speed: 40 model hours per second at 1× (100 days ≈ 60 s), with 2× and 4×. The run pauses itself on window `blur`. | The brief's pace. Pausing on blur stops a jar dying while the player is in another window. |
| D7 | One round = one jar run: `start` on `开始实验`, achievements then `stats` then `end` at the outcome. Setup edits do not start a round. | Players flip between tabs and edit freely; counting that as rounds would leave rounds without an `end`. Same choice as v1 D11. |
| D8 | Best stars per jar are saved in `localStorage` `moyufun:terrarium:v2` (array of 5), with try/catch. All five tabs are open from the start. | A reason to replay (15 stars) without a lock screen. Storage failure only loses the stars display. |
| D9 | The sheet is drawn at a zoom `s = clamp(min(w / 884, (h − 184) / 594), 0.35, 1.5)`, shown in the status bar as `93%`. Chrome (title, ribbon, formula bar, tabs, status bar) is drawn at 1:1 and fills the window. | Looks like Excel's zoom; any iframe size works. Phones get a tiny but complete sheet. |
| D10 | Clickable areas come from `targets()`, computed from the current state on every click and every draw; never from the last frame. | The v1 gotcha (a click in the same frame as the state change was ignored). |
| D11 | Disguise per office-camouflage D6: `ready` at load, 0.5, 2 and 5 s, each followed by `disguise('excel', '实验数据_生态系统稳定性.xlsx - Excel')`. Esc is the boss key: time freezes and the sheet shows a plain 部门费用 table (tabs 汇总 / 明细). Sound is off until `M`. The first frame is 实验1's setup table. | Binding conventions. |
| D12 | `rng()` (seedable `mulberry32`) is used only for the boss sheet's numbers (fixed seed); the model has no randomness. | Same setup and same clicks give the same jar, which the test asserts. |

## Out of scope

Random events, more than five jars, unlocking jars, editing coefficients, VS Code skin, a drawn jar or sprites, sharing setups, cross-round achievements (the 15-star total is only shown), mobile-specific layout.

## Architecture

### Package

```text
games/terrarium/
  game.json
  v1/            published, immutable
  v2/index.html
  v2/test_headless.js
  v2/README.md
```

`game.json` (v2 replaces v1's achievements and the `species` stat; publish retires them):

```json
{
  "slug": "terrarium",
  "name": "生态瓶",
  "shortDescription": "五个实验瓶，配好物种，再盯着图表在它崩溃前出手。",
  "description": "一份看起来像 Excel 的生态瓶实验报告。每个实验有不同的预算、光照、必选物种和扰动（空调停机、水草病害）。在表格里配好藻类、水草、苔藓、小虾、螺、跳虫、细菌、沙和炭，开始实验后盯住监测面板和折线图：O₂ 变黄就开盖通气，藻类疯长就遮光一天，植物不行了就补种水草。三种干预每瓶各一次，按目标拿 1–3 星。",
  "tags": [
    "模拟",
    "生态",
    "单人"
  ],
  "controls": [
    {
      "input": "鼠标 / 触摸",
      "action": "点 ▲▼ 调数量、选光照、开始实验、执行干预、切换实验"
    },
    {
      "input": "↑ ↓ / + −",
      "action": "选行 / 增减数量"
    },
    {
      "input": "Enter",
      "action": "开始实验 / 再做一次"
    },
    {
      "input": "空格 / 1 2 3",
      "action": "暂停 / 1× 2× 4× 速度"
    },
    {
      "input": "Q / W / E",
      "action": "补种水草 / 开盖通气 / 遮光一天"
    },
    {
      "input": "PageUp / PageDown",
      "action": "切换实验"
    },
    {
      "input": "Esc",
      "action": "老板键"
    },
    {
      "input": "M",
      "action": "开关声音（默认关）"
    }
  ],
  "cover": {
    "symbol": "瓶",
    "eyebrow": "SEALED ECOSYSTEM",
    "accent": "#4caf7a",
    "accentSecondary": "#a3e0ff"
  },
  "sortOrder": 190,
  "achievements": [
    {
      "key": "first_star",
      "name": "初步结论",
      "description": "任一实验拿到至少一星。",
      "symbol": "初"
    },
    {
      "key": "full_marks",
      "name": "满分报告",
      "description": "任一实验拿到三星。",
      "symbol": "满"
    },
    {
      "key": "rescue",
      "name": "绝处逢生",
      "description": "在 O₂ 低于 4 时出手干预，最后仍拿到至少一星。",
      "symbol": "救"
    },
    {
      "key": "all_hands",
      "name": "三管齐下",
      "description": "一瓶里三种干预都用上，并拿到至少一星。",
      "symbol": "三"
    },
    {
      "key": "hands_off",
      "name": "无为而治",
      "description": "不用任何干预拿到三星。",
      "symbol": "无"
    },
    {
      "key": "finale",
      "name": "综合实验",
      "description": "实验 5 拿到三星。",
      "symbol": "综"
    }
  ],
  "stats": [
    {
      "key": "rounds",
      "name": "实验",
      "maxPerRound": 1
    },
    {
      "key": "wins",
      "name": "达标",
      "maxPerRound": 1
    },
    {
      "key": "stars",
      "name": "星数",
      "maxPerRound": 3
    },
    {
      "key": "days",
      "name": "存活天数",
      "maxPerRound": 100
    }
  ]
}
```

### Items and lights (unchanged from v1)

| key | name | cost | portion | max |
| --- | --- | --- | --- | --- |
| `algae` | 藻类 | 3 | 10 biomass | 9 |
| `plant` | 水草 | 8 | 10 biomass | 6 |
| `moss` | 苔藓 | 6 | 10 biomass | 6 |
| `shrimp` | 小虾 | 6 | 1 | 9 |
| `snail` | 螺 | 5 | 1 | 9 |
| `spring` | 跳虫 | 4 | 10 | 6 |
| `bact` | 细菌 | 4 | 10 biomass | 6 |
| `sand` | 沙 | 8 | 1 layer | 2 |
| `char` | 炭 | 10 | 1 piece | 1 |

Lights: 背阴 `I 0.5, 07–17, heat 0.8`; 窗边 `I 1.0, 06–18, heat 1.0`; 灯下 `I 1.6, 05–21, heat 1.2`.

### Model

The v1 model (`LIGHTS`, `PROD`, `ANIM`, `BACT`, `ENV`, `PORTION`, `stepHour`, `endDay`, `diagnose`) is copied unchanged from `games/terrarium/v1/index.html`; see that file and this doc's git history (v1 version) for the term-by-term description. In short: hourly explicit Euler, a sealed gas pool `O + C = 20`, producers grow and make O₂ in light, everything respires, animals eat with refuges and starve, bacteria turn waste into nutrients using O₂, waste above `30 × (1 + char)` poisons animals, a day is healthy when its lowest O ≥ 8 and highest W < 15, and the cause of death is booked by biomass (hypo / tox / starve, hypo with algae ≥ 40 at first hypoxia → bloom; no producers → withered).

v2 additions, in `stepHour` order:

```js
const ACT = { plant: 15, ventH: 48, vent: 0.3, darkH: 24, darkHeat: 0.8, darkKill: 0.5 };
// createJar(setup, events) adds: events, vent: 0, dark: 0, used: {}, rescued: false
// 1. at the start of the hour, apply every event whose start hour (day − 1) × 24 equals j.hour:
//    blight: plant and moss each lose share `loss`, the lost biomass goes to W
// 2. I = dark ? 0 : lightAt(light, hour)
//    resp = heatAt(j) × (dark ? 0.8 : light.heat) × O / (O + 1)   // heatAt = product of active heat events
// 3. algae die term gets + 0.5 while dark
// 4. after O is updated: if (vent > 0) { O += (16 − O) × 0.3; vent−− }; if (dark > 0) dark−−; C = 20 − O
function act(j, key) // once per key: used[key] = day + 1; rescued |= O < 4; plant += 15 | vent = 48 | dark = 24
function outcome(def, j) // after each day end: collapse → { stars: 0, day, diagnosis }; day ≥ def.days → { stars: 1 + goals met, day, diagnosis: null }
```

### Jars

| tab | name | budget | light | required (minimum portions) | days | events | ★★ | ★★★ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 实验1 | 对照组 | 60 | any | 小虾 2 | 60 | — | 第 60 天 小虾 ≥ 1.5 | 健康天数 ≥ 55 |
| 实验2 | 高温 | 70 | 窗边 | 小虾 3 | 100 | 第 30–31 天 空调停机：呼吸 ×4 | 小虾 ≥ 1 | 健康天数 ≥ 90 |
| 实验3 | 灯下 | 80 | 灯下 | 藻类 4、小虾 2 | 100 | — (the forced algae blooms under the lamp) | 小虾 ≥ 2 | 健康天数 ≥ 80 |
| 实验4 | 病害 | 80 | any | 水草 2、螺 3 | 100 | 第 35 天 水草病害：损失 90% | 螺 ≥ 1.5 | 健康天数 ≥ 80 |
| 实验5 | 综合 | 100 | any | 小虾 2、螺 2、苔藓 1 | 100 | 第 40 天 病害 80%；第 70–71 天 空调停机 ×3 | 健康天数 ≥ 80 | 7 种全部存活 |

A jar's setup starts at its required minimums (light 窗边 when allowed, else the fixed light) and is remembered in memory per tab. `adjust` refuses below the minimum, above the item max and over budget. `setupProblem(def, setup)` returns the first of `{name}至少 n 份`, `超出预算`, `至少放一种动物和一种植物`, or `''`.

### Balance (throwaway sim, 2026-10-05)

The sim (scratch, not committed) used exactly this model. Two bots play the **same setups**: one never intervenes; the other checks every hour and uses 开盖通气 when O < 5, 遮光一天 when algae > 40 and O > 8, 补种水草 when plant + moss < 15 or has halved since the last day end.

Reference setups (asserted by the headless test):

| jar | setup (cost) | no intervention | intervening bot |
| --- | --- | --- | --- |
| 1 | 藻1 水草1 虾2 螺1 跳虫2 细菌2 沙1, 灯下 (52) | ★ (day 60) | ★★★, 补种 day 1 |
| 2 | 藻1 水草1 苔藓3 虾3 螺1 跳虫1 细菌1 沙1, 窗边 (68) | 0, starve day 66 | ★★★, 开盖 day 30 |
| 3 | 藻4 水草3 苔藓1 虾2 螺1 细菌2 沙1, 灯下 (75) | 0, hypo day 11 | ★★★, 遮光 + 开盖 day 1 |
| 4 | 水草3 苔藓2 螺3 跳虫2 细菌1 沙2, 灯下 (79) | 0, starve day 39 | ★★★, 补种 day 35, 开盖 day 38 |
| 5 | 藻1 水草1 苔藓3 虾4 螺2 跳虫1 细菌1 沙2 炭1, 灯下 (97) | 0, starve day 45 | ★★★, 补种 + 开盖 day 40 |
| total | | 1 / 15 | 15 / 15 |

Best achievable stars, hill-climbing over setups (30 random starts, ±1 and swap moves, any allowed light): without interventions 3 / 2 / 3 / 2 / 2 (= 12), with the intervening bot 3 / 3 / 3 / 3 / 3. So jars 2, 4 and 5 cannot be fully solved by setup alone; jars 1 and 3 can, by an expert.

Typical setups: 150 random setups per jar that survive 100 calm days (no events, no interventions), then played with events: mean stars without / with interventions 1.66 / 1.83, 1.00 / 1.61, 1.87 / 2.00, 0.30 / 1.49, 0.18 / 0.89 (campaign 5.0 vs 7.8 of 15). Uniform random setups (each count ≤ 5) using 50–100 % of the budget, share reaching ★: 25 % / 57 %, 21 % / 46 %, 1 % / 33 %, 6 % / 23 %, 4 % / 16 %.

## Screens

Everything is one Excel window (D7 chrome of office-camouflage): title bar `实验数据_生态系统稳定性.xlsx - Excel`, ribbon, name box + `fx` formula bar, column letters / row numbers, gridlines, sheet tabs 实验1–实验5 and ⊕, green status bar.

**Sheet** (rows of 22 px, columns A 92, B 78, C 52, D 60, E 72, F 14, G–L 76):

| rows | left (A–E) | right (G–L) |
| --- | --- | --- |
| 1 | `实验n · 名称`, E1 `最佳 ★★☆` | `监测面板` |
| 2–3 | 条件 (budget, days, required); 扰动 (event text; yellow 5 days before, red while active) | KPI header and values: 天数, O₂ (red < 4, yellow < 6, else green), CO₂, 废物 (red > limit, yellow > 70 %), 藻类 (yellow > 40), 水草+苔藓 (yellow < 15) |
| 4–13 | table header (blue `#4472c4`) and the nine items, banded: 数量 with a ▲▼ spin control (setup only), 单价, 小计, 当前 (live value; `灭绝` in red; algae yellow > 40) | — |
| 5–12, 13–20, 21–28 | | Excel line charts 生物量 (藻类 水草 苔藓 细菌), 动物数量 (小虾 螺 跳虫÷10), 气体与废物 (daily min O₂, 20 − that, W; red dashed line at O₂ 4; event days shaded red; dashed markers labelled 补种/开盖/遮光 at intervention days). Office palette `#4472c4 #ed7d31 #a5a5a5 #ffc000`. Each chart plots the day-end history plus the current hour as a live tip. |
| 14–15 | 合计 (green when the setup can start, yellow otherwise, red flash on refusal) `/ budget`; 光照 dropdown cell (locked jars show `（实验条件）`) | |
| 17 | setup: `开始实验` button + problem text; run: 速度 ⏸ 1× 2× 4×; end: `再做一次`, `下一个：实验n ▸` | |
| 19–22 | 干预 table: name, effect, `执行 Q/W/E` button during the run, `第 n 天` once used | |
| 24–27 | 目标 table: ★ / ★★ / ★★★, text, result (`进行中` / `现 1.2` / `49 / 90` yellow, `达成` green, `未达成` / `失败` red) | |
| 28–29 | 结论: during the run a hint; at the end the diagnosis and tip, or the star line | |

**Formula bar** reacts: `=6*B8` on an item, `=开盖通气(第30天)`, `=扰动("第 30–31 天 空调停机：呼吸 ×4")`, `=COUNTIF(E25:E27,"达成")` at the end. **Status bar**: left a 4-second message (event, extinction, intervention, refusal) or `就绪 …` / `计算中 2×` / `已暂停`; right `天数: 23 / 100    健康天数: 20    星数: 7 / 15` and the zoom. Cell flashes (0.6 s) mark changed or refused cells.

**Boss key**: same chrome, sheet = a 12-department Q1–Q4 cost table with 合计 and 环比, name box `A1`, tabs 汇总 / 明细, status `就绪`.

**Diagnosis copy** (结论 row): 缺氧, 藻华, 废物中毒, 饿死, 植物枯死, each with a one-line tip that names the matching intervention (see `DIAG` in the file).

**Sound** (only after `M`): soft click on edits, rising blip on interventions, low blip on events and extinctions, 1–3 note arpeggio for stars, low saw on collapse.

## Functions

Pure: `costOf(setup)`, `setupProblem(def, setup)`, `createJar(setup, events)`, `stepHour(j)`, `act(j, key)`, `outcome(def, j)`, `goalMet(goal, j)`, `diagnose(j, noAnimals)`, `speciesAlive(j)`.

Game: `selectJar(i)` (refused during a run), `adjust(key, ±1)`, `setLight(key)`, `cycleLight(±1)`, `run()`, `setSpeed(0|1|2|4)`, `togglePause()`, `intervene(key)`, `update(dt)` (clamps dt to 0.1 s; adds `dt × 40 × speed` hours and steps while ≥ 1 − 1e-9), `finish(o)`, `again()`, `toggleBoss()`, `toggleMute()`, `targets()`, `draw()`.

Keys: Esc boss; M sound; PageUp/PageDown tabs; setup: ↑↓ select row (items and 光照), + / − / ← / → adjust or cycle light, Enter start; run: Space pause, 1/2/3 speed, Q/W/E interventions; end: Enter again.

## Achievements

In `finish()`, only when stars ≥ 1, in this order, before `stats` / `end`:

| key | trigger |
| --- | --- |
| `first_star` | stars ≥ 1 |
| `full_marks` | stars = 3 |
| `rescue` | an intervention was used while O < 4 |
| `all_hands` | all three interventions used |
| `hands_off` | stars = 3 and no intervention used |
| `finale` | stars = 3 on 实验5 |

## Stats

`emitMoYuFunStats({ rounds: 1, wins: stars ? 1 : 0, stars, days: o.day })`.

## Headless test

`v2/test_headless.js` (stub pattern of v1, window 1280 × 800, `localStorage` stub):

- Load sends exactly `ready, disguise` with the exact five-key disguise.
- The five v1 reference setups (no events, no interventions): collapse days 4 / 11 / 18 with `hypo` / `bloom` / `tox`, 稳定瓶 healthy 93 with 7 species, 背阴小瓶 healthy 100; `O + C = 20` and all values finite and ≥ 0 every hour.
- The five campaign reference setups: stars and end day without interventions, 3 stars with the bot, which interventions it used; the same invariants every hour.
- Setup rules (minimums, max, budget, locked light, no intervention before the run), time (1 s at 1× = 40 h, at 4× = 160 h, dt clamp, pause, boss freezes time, no tab switch during a run, intervention once).
- Driving the game loop (one hour per `update`) with the bot calling `intervene()` reproduces the pure model's history exactly.
- Sequences: 实验2 with the bot `start, first_star, full_marks, stats, end` and stats `{1, 1, 3, 100}`, best saved; without the bot `start, stats, end` with `{1, 0, 0, 66}`; 实验5 adds `finale`; 实验1 no-intervention 3★ setup adds `hands_off`; `rescue` flag; `all_hands` when all three are used and a star is earned. Every message has exact keys.

## Milestones

**M1 · Playable.** Model with events and interventions, the sheet, dashboard, charts, tabs, boss key. Done when: the five reference setups play with the stated results and the model and time tests pass. ☑

**M2 · Package.** `game.json`, achievements and stats, README, sequence tests. Done when: `pnpm game check terrarium v2` passes. ☑

**M3 · Release** (coordinator). `pnpm game:local publish terrarium v2 --yes`, a browser check of the camouflage mode and a full jar, then production publish. Done when: `/play/terrarium` serves v2 and a logged-in round writes stars and achievements.

## Open items

- Playtest the pace (60 s per 100 days at 1×) and whether the warning thresholds give enough time to react at 2× and 4×. Owner, after M3.
- On phones the sheet is drawn at 35–45 % zoom and is hard to tap. A narrow layout (dashboard below the table) would fix it; deferred with mobile-specific disguises.

## Implementation notes

- The v1 achievements (`sealed_100` …) and the `species` stat are retired by the v2 publish. `pnpm game check terrarium v1` would now fail D11 (its keys are gone from `game.json`); v1 is already published and is never re-checked. After a `switch` back to v1 the site shows v2's achievements (game-release D8).
- Gridlines are drawn before cell content; filled and merged cells cover them, as in Excel.
- The bot that defines the balance uses O < 5 for 开盖; the dashboard turns O₂ yellow at 6 and red at 4, so a player reacting to yellow is a little ahead of the bot.
- In 实验1 the bot replants on day 1 (plant + moss starts at 10 < 15); in 实验3 it shades and vents on day 1 because 40 algae bloom at once under the lamp. Both are legitimate plays.
- Layout was checked with screenshots of a scratch copy in a separate headless Chrome at 1280 × 800 (setup, run, end, boss) and 390 × 844.

### M3 notes (v2)

- Local publish registered v2 and its new achievements and stats. On `/play/terrarium` in 伪装 the tab read `实验数据_生态系统稳定性.xlsx - Excel`; the first frame is 实验1's setup sheet next to an empty 监测面板.
- With real clicks on the ▲ spin controls the jar got 藻类 1, 水草 2, 苔藓 1, 螺 1, 细菌 1 on top of the required 小虾 2; `开始实验` started the run (KPI cells with conditional fills, three charts plotting, `执行 Q/W/E` buttons, goals marked 进行中). `执行 W` on day 3 set its status to `第 3 天`, the formula bar to `=开盖通气(第3天)` and annotated the gas chart. No console errors.
- Gotcha for testing: in a background browser pane the page redraws at ~1.5 fps, so clicks take effect but look ignored until the next frame. Check state, not the first screenshot.

