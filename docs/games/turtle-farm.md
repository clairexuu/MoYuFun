# 玄武农场 (`turtle-farm`)

**Status:** v2 implemented and published to production 2026-10-05 (`pnpm game publish turtle-farm v2`; www.moyufuns.com/play/turtle-farm). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A farming game disguised as an Excel purchase plan. Your 4 × 4 field is a block of cells that rides the turtle 玄武 for 30 days across 草原, 雨林, 沙漠 and 雪原, stopping at a 集市 every sixth day. Each crop grows fast in the land it likes and withers if it spends too long in land it hates, and the route is visible only 5 days ahead in a header row. So you plant now for the land the field will cross while the crop grows, and harvest in time to sell at the next market. Earn 800 金币 by the end of day 30. Mouse or touch, single-player, about 4–5 minutes.

This is version 2, a rework under `docs/design/office-camouflage.md` (M7). v1 is described at the end (*v1 and why it changed*).

Read first: `docs/design/office-camouflage.md` (D2 `disguise`, D6 conventions, D7 Excel chrome, D8 colours), `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/turtle-farm/v1/` (the rules v2 keeps), `games/prototype-skins/index.html` variant C (the chrome v2 copies).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/turtle-farm/v2/index.html`, vanilla JS and canvas, no dependencies. The Excel chrome is copied from the prototype's variant C. v1 stays untouched. | Same package contract as v1; the prototype is the approved look. |
| D2 | v1's route generation, growth points, harm, ripening and rot rules are kept unchanged (*Rules*). | They are tested and balanced; the problems were pacing and presentation, not the model. |
| D3 | The whole game is one worksheet, `玄武物流`. The field is the cell block B9:E12, the forecast is a header row of dates over a row of land names, the seed list and the 仓库 are two small tables. Coins are in K1 and in the status bar's 求和. There is no drawn turtle, emoji or game art; the turtle survives only in text (`玄武物流`). | A passer-by sees a spreadsheet. Every piece of game state has an ordinary spreadsheet form. |
| D4 | Crop state is conditional formatting (office-camouflage D8): growing is a neutral data bar (`#ffeb9c`), turning bad (`#ffc7ce`) once the crop has taken harm; ripe is good (`#c6efce`); withered is bad. A 3-arrow icon set shows today's land for that crop (green ▲ 喜, yellow ▶ 平, red ▼ 忌). | These are formats real sheets are full of. The icon tells the player what today's tick will do without leaving the cell. |
| D5 | A market day stops the clock until the player clicks `离开集市` (or presses Enter). Leaving ends the market day at once: its growth tick (平 for every crop) runs and the next day starts. On day 30 the button reads `靠岸结算`. | v1's markets passed on a timer, so a player could miss one and wait six days. Ending the day on leave keeps a voyage at 25 timed days plus market time. |
| D6 | A 收购商 buys any crop on any day at `floor(sell / 2)`. On market days the market price applies instead (hot ×2, cold ×0.5, else `sell`). | The player is never stuck with goods and no coins. Half price is break-even for 土豆 (cost 3, buys at 3), so it is a safety net, not a strategy. |
| D7 | Start with 40 金. A day is `DAY_SECONDS = 8`. There is no 2× speed. | v1's 20 金 left no margin for an early mistake. 8 s × 25 timed days ≈ 3.3 minutes plus markets, about 4–5 minutes in all. With the market stop a fast-forward has little left to skip. |
| D8 | There is no title screen. The page opens in phase `ready`: the route is generated and the sheet is drawn, the clock does not run, and the status bar says how to start. The first plant sends `start` and starts the clock. | office-camouflage D6: the first frame is a plausible document. The first plant is the round's first real action. |
| D9 | Feedback is office-plausible only: a short fading tint on a cell when it changes, a counting-up 余额, status-bar messages instead of toasts, a formula bar that describes the active cell, and a grey form button for `离开集市`. No particles, confetti or flying items. | Feedback must survive a glance from a colleague. |
| D10 | `Esc` is the boss key: it switches to the sheet tab `采购汇总`, a plain table of numbers, hides the field, flashes and the end dialog, and freezes time. `Esc` again, or clicking the `玄武物流` tab, returns. Clicking `采购汇总` also hides. Sound is off until `M`. | office-camouflage D6. The tab click gives a mouse-only boss key. |
| D11 | Balance from the headless bots over seeds 1–200 (bots under *Headless test*): `forecastBot(5)` reaches 800 in 99.5% (1500 in 37.5%, median 1382); `forecastBot(3)` 62%; `forecastBot(0)` 0.5%; `potatoBot` 3.5% (median 468); `randomBot` 0% (median 110). The targets stay 800 / 1500. | Reading the full forecast still clearly beats the naive bots. The greedy bot plants every slot instantly; humans with 8 s days will be well below it, so 800 is kept as the human target rather than raised to keep the bot near 94%. |
| D12 | Achievements keep all five v1 keys, unchanged. | All five still make sense under the new rules; the market stop makes `hot_seller` fairer, not trivial. |
| D13 | Input uses Pointer Events. Pressing a field cell acts on it (plant on empty, harvest on ripe, clear on withered) and dragging repeats that action on each new field cell, drawn as a selected range. Clicking a seed-table row selects that seed. `卖出` / `全部卖出` cells are hyperlink-styled. Everything acts on `pointerdown`, and every hit test reads the current state and the current window size. Window `blur` ends a drag. | Drag-planting is the spreadsheet's fill gesture. Acting on down keeps one code path for mouse and touch. |
| D14 | `ready` is sent on load and at 0.5, 2 and 5 s, each followed by `emitMoYuFunDisguise('excel', '农产品采购计划_2026.xlsx - Excel')`. The title never changes. | office-camouflage D2. |

## Out of scope

Watering, tools, upgrades, more plots, choosing the route, a 2× speed, a mid-voyage restart, saving between page loads, a best-score display, a VS Code skin, a portrait/mobile layout, cross-round achievements.

## Architecture

### Package

```text
games/turtle-farm/
  game.json
  v1/…            (published, immutable)
  v2/index.html
  v2/test_headless.js
  v2/README.md
```

`game.json` (shared by both versions; v2's copy below):

```json
{
  "slug": "turtle-farm",
  "name": "玄武农场",
  "shortDescription": "一张采购计划表：看准地形预报再播种，赶在集市前收成。",
  "description": "打开是一张农产品采购计划表。4 × 4 的地块跟着玄武走过草原、雨林、沙漠和雪原，表头一行是前方五天的地形预报。每种作物都有喜欢和讨厌的地形：在喜欢的地方长得快，在讨厌的地方待久了就会枯萎。集市日时间停下来让你慢慢卖，平时收购商随时半价收货。三十天内攒够 800 金币。按 Esc 一键切到普通表格。",
  "tags": ["种田", "策略", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点空白地块播种，点成熟作物收获（可拖动连续操作）" },
    { "input": "种子目录 / 1–8", "action": "选择种子" },
    { "input": "仓库「卖出」", "action": "卖出作物：集市日按行情价，平时收购商半价" },
    { "input": "「离开集市」/ 回车", "action": "卖完离开集市，继续上路" },
    { "input": "空格", "action": "暂停或继续" },
    { "input": "Esc", "action": "切换到普通表格（老板键），再按一次回来" },
    { "input": "M", "action": "打开或关闭声音（默认关）" }
  ],
  "cover": { "symbol": "龟", "eyebrow": "SHELL FARMING", "accent": "#6fbf4a", "accentSecondary": "#4ab0bf" },
  "sortOrder": 100,
  "achievements": [
    { "key": "thrive", "name": "风调雨顺", "description": "收获一株全程都在喜欢的地形里长大的作物。", "symbol": "顺" },
    { "key": "hot_seller", "name": "抢手货", "description": "在一次集市上卖出至少 5 个热销作物。", "symbol": "抢" },
    { "key": "voyage", "name": "满载而归", "description": "航程结束时金币达到 800。", "symbol": "归" },
    { "key": "no_loss", "name": "寸草不枯", "description": "达到 800 金币，且整趟没有作物枯萎或烂掉。", "symbol": "枯" },
    { "key": "tycoon", "name": "富甲一方", "description": "航程结束时金币达到 1500。", "symbol": "富" }
  ],
  "stats": [
    { "key": "rounds", "name": "航程", "maxPerRound": 1 },
    { "key": "wins", "name": "满载", "maxPerRound": 1 },
    { "key": "harvests", "name": "收获", "maxPerRound": 300 },
    { "key": "coins", "name": "金币", "maxPerRound": 1000000 }
  ]
}
```

The `harvests` cap is 16 plots × 15 two-day radish cycles = 240, rounded up. Publishing v2 replaces the catalog text and controls; v1 players see the new copy.

### Lands and crops

`BIOMES`: `grass` 草原, `rain` 雨林, `desert` 沙漠, `snow` 雪原, `market` 集市.

`CROPS` (index 0–7 = keys 1–8), unchanged from v1 except that 仙人掌果 is renamed 仙人掌 so every name fits a field cell. Lands in neither list are 平.

| # | key | name | cost | days | sell | 喜 likes | 忌 hates | tough |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `radish` | 萝卜 | 2 | 2 | 5 | snow | desert | 1 |
| 2 | `corn` | 玉米 | 4 | 3 | 10 | grass | snow | 1 |
| 3 | `mushroom` | 蘑菇 | 5 | 3 | 13 | rain | grass, desert | 1 |
| 4 | `cactus` | 仙人掌 | 3 | 4 | 9 | desert | rain | 2 |
| 5 | `melon` | 西瓜 | 6 | 4 | 18 | desert | rain, snow | 1 |
| 6 | `banana` | 香蕉 | 8 | 5 | 26 | rain | desert, snow | 1 |
| 7 | `icegrape` | 冰葡萄 | 10 | 5 | 34 | snow | grass, rain, desert | 0 |
| 8 | `potato` | 土豆 | 3 | 4 | 7 | — | — | 99 |

### Route

`genRoute(rnd) → { route, markets }`, as v1: `route[1..30]` from segments of 2–3 days (first `grass`, never the same land twice in a row), `route[d] = 'market'` for `MARKET_DAYS = [6, 12, 18, 24, 30]`, and each market draws `hot`, then a different `cold`.

### State and rules

```js
state = {
  phase: 'ready' | 'play' | 'end', day: 1..30, dayT: 0, paused: false,
  coins: 40, route, markets, selected: 0..7,
  plots: [16 × null | { crop, pts, harm, ripe, age, allLiked, withered }],
  barn: [8 ints], harvests: 0, lost: 0, soldHotToday: 0,
}
```

`boss` and the feedback state (`flashes`, `msg`, `dispCoins`, `active`, `drag`) live outside `state`, so the rules stay testable.

- `relation(c, biome) → 2 | 1 | 0` (喜 / 平 / 忌); `market` is always 1.
- `price(c, d)`: on a market day `sell × 2` if hot, `floor(sell / 2)` if cold, else `sell`; on any other day `floor(sell / 2)` (收购商).
- `plant(i, c)`: in `ready` it first calls `beginPlay()`. Needs `phase === 'play'`, an empty plot and `coins ≥ cost`; otherwise the status bar says `余额不足：<name>进价 N，当前 N` and K1 and the seed's 进价 cell flash red.
- `harvest(i)`: clears a withered plot (returns false) or moves a ripe crop to `barn`, `harvests++`, and unlocks `thrive` if `allLiked`.
- `sell(c)`: any day while playing; sells the whole stack at `price(c, day)`. On a market day, hot sales add to `soldHotToday` and unlock `hot_seller` at 5. `sellAll()` sells every stack.
- `leaveMarket()`: only on a market day while playing; sets `dayT = 0` and runs `endOfDay()`.
- `endOfDay()`: as v1. Clears plots withered earlier; ripe crops age and rot at `RIPE_WAIT = 3`; growing crops get +3 / +2 / harm by today's relation and wither when `harm > tough`; `pts ≥ 2 × days` ripens. Then day 30 calls `finishVoyage()`, otherwise `day++` and `soldHotToday = 0`, and arriving at a market says so in the status bar.
- `update(dt)`: always runs feedback animation (frozen under the boss key). The clock moves only in `play`, not paused, not `boss` and not on a market day. It adds `dt` to `dayT` and runs `endOfDay()` per `DAY_SECONDS`, stopping at a market day even inside one large `dt`.
- `newRound()`: new `state` in `ready` with a new route, new `roundAchievements`, feedback reset. `beginPlay()`: `ready → play` and sends `start`. `startRound()` = both (used by the tests).
- `finishVoyage()`: `phase = 'end'`, then achievements `voyage` (≥ 800), `no_loss` (≥ 800 and `lost === 0`), `tycoon` (≥ 1500), then `stats`, then `end`.
- `togglePause()`, `selectSeed(c)`, `toggleBoss()`.
- Pausing on `visibilitychange` to hidden, as v1.

### Window (Excel chrome, office-camouflage D7)

The canvas fills the window. From the top: green title bar (34 px, `农产品采购计划_2026.xlsx - Excel`, window buttons), ribbon tabs with `开始` active, ribbon groups (hidden when the window is under 560 px tall), name box + `fx` formula bar, then the grid, then sheet tabs (`玄武物流`, `采购汇总`, `供应商`, `+`) and the green status bar. The chrome is drawn at 1:1; only the grid zooms, by `z = min(fit width, fit height)` floored to 5% and clamped to 50–160%, shown at the status bar's right end. Columns and rows past the used block are drawn empty to fill the window. `frame(widths)` computes all of this from the window size, and both drawing and hit tests call it.

Columns (logical px at 100%): A 60 · B–G 60 · H 12 · I 22 · J 60 · K–M 36 · N 44 · O 90 · P 30 · Q 12 · R 40 · S 50 · T 56. Rows: 1 is 26, the rest 22.

### Sheet `玄武物流`

| Range | Content |
| --- | --- |
| A1 | `玄武物流 · 农产品采购计划` (bold). J1:O1 `余额` N (counts up), `目标` 800, `进度` `第 N / 30 天`. |
| A2:G6 | Forecast. Row 2 `日期`: `今天`, `第N天`…; past day 30 `—`. Row 3 `地形`: land names, markets bold; today's cell carries a blue data bar for the day's progress, or `集市 ⏸` on a market day. Row 4 `适宜度`: 喜 (good) / 平 (grey text) / 忌 (bad) for the selected seed. Rows 5–6 `热销` / `滞销`: on market columns `<name> ↑` (good) and `<name> ↓` (bad). |
| A8:E12 | Field. Header `地块 甲 乙 丙 丁`, row labels `1 垄`…`4 垄`. Cells per D4: growing `<icon> <name>` with a data bar of `pts / (2 × days)`; ripe `<name> ✓`, or `<name> 快烂` in red on its last day; withered `<name> 枯萎`. |
| F9:G10 | On a market day, a grey form button `离开集市` / `靠岸结算` with a softly pulsing green outline. |
| I2:P10 | 种子目录: a checkbox column (the selected seed is ticked and its name bold), `品种` (`N 名称`), `进价` (bad format when unaffordable), `周期`, `售价`, `喜`, `忌` (names joined with `/`), `耐`; 土豆 shows `—`. |
| R2:T11 | 仓库, aligned with the seed rows: `库存`, `收购价` or `集市价` (header changes on market days; hot good with ↑, cold bad with ↓), `操作` = a `卖出` link when stock > 0. Row 11: `合计`, total value at today's price, `全部卖出`. |
| A14 | Grey note: market and 收购商 prices, the market pause, 喜/忌. |

The formula bar shows the active cell (the last clicked cell, default A1). Each cell carries a formula-style description: `=生长("西瓜", 6/8, 受损 1/2, 今日雨林 忌)`, `=成熟("西瓜")  ' 还能放 2 天，点击收获`, `=种子("西瓜", 进价 6, 周期 4, 售价 18, 喜 "沙漠", 忌 "雨林/雪原", 耐 1)`, `=收购价("西瓜")  ' 售价 18 的一半`, and so on. The active cell's column letter and row number are highlighted.

Status bar left: a message for 3 s after an event (sales, losses, market arrival, `余额不足`, pause, sound), otherwise `就绪  按 1–8 选种子，点空白地块播种开始；Esc 切换工作表` (ready), `就绪  第 N 天 NN%` (play), `集市（时间暂停）  卖完点「离开集市」或回车`, `已暂停  空格继续`, `结算完成  回车或点「新建计划」再来一趟`. Right: `平均值` (mean growth of growing crops), `计数` (planted plots), `求和` (coins), zoom.

End: a plain dialog `结算报告` over the sheet: `第 30 天已结束。余额 N，目标 800。`, then `已达成目标。` / `超过 1500，富甲一方。` / `未达成目标，还差 N。`, then `收获 N，损失 N。`, and a `新建计划` button (or Enter), which calls `newRound()`.

Boss sheet `采购汇总`: `2026 年农产品采购汇总（单位：千元）`, 13 regions × 9 months of hashed numbers, `合计`, and a `同比` column in good/bad formats; status bar `就绪` with fixed sums.

Sounds (only after `M`): plant, harvest, sell, wither, market arrival, not enough coins, win, lose; v1's tones at lower volume.

### Input

- `pointerdown` on a field cell: plant, harvest or clear as D13, sets the active cell, starts a drag. On a growing crop it only selects the cell (the formula bar explains it).
- `pointermove` during a drag: each new field cell gets the drag's action; the range from the start cell is shaded.
- `pointerdown` on a seed-table row: `selectSeed`. On `卖出`: `sell(c)`. On `全部卖出`: `sellAll()`. On the market button: `leaveMarket()`. On tab `采购汇总` / `玄武物流`: boss on / off. In `end`, only the dialog button works.
- Keys: `1`–`8` select, Space pause, Enter leave market / new plan, `Esc` boss, `M` sound. Under the boss key only `Esc` and `M` work.
- `pointerup`, `pointercancel` and window `blur` end the drag. The mouse cursor is `cell` over the grid and `pointer` over links and the button.

### Achievements

| key | Trigger |
| --- | --- |
| `thrive` | `harvest(i)` of a crop with `allLiked`. |
| `hot_seller` | `soldHotToday ≥ 5` within one market day. |
| `voyage` | `finishVoyage()` with `coins ≥ 800`. |
| `no_loss` | `finishVoyage()` with `coins ≥ 800` and `lost === 0`. |
| `tycoon` | `finishVoyage()` with `coins ≥ 1500`. |

### Stats

In `finishVoyage()`, after achievements and before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, harvests: min(harvests, 300), coins: min(coins, 1000000) })`.

### Headless test

`v2/test_headless.js` uses v1's stub pattern (a `Proxy` 2D context, stubbed `parent.postMessage`, `setTimeout` that never fires) at a 1000 × 625 window. `DS = DAY_SECONDS`.

- **Load:** exactly `ready, disguise` with `app: 'excel'` and the window title; phase `ready` with a route; `update(100)` does nothing; selecting a seed sends nothing; the first `plant` sends `start` and the clock then runs.
- **Route:** v1's checks for seeds 1–50.
- **Growth:** v1's hand-set route cases at `update(DS)` (radish on snow, melon in rain, ice grape on grass, potato everywhere, rot after 3 day-ends), `update` stops while paused and under the boss key, and plant/harvest/sell refuse invalid moves.
- **收购商:** 3 bananas sell for 39 on a plain day; a radish buys at 2.
- **Market:** after 5 day-ends the clock stops on day 6 (`update(1000)` changes nothing), `sellAll()` pays hot/cold/normal prices, `leaveMarket()` runs day 6's tick (+2) and is refused on other days, and one huge `update` stops at the market.
- **Balance bots** (seeds 1–200, `update(DS)` per day, `leaveMarket()` on market days). Each day a bot harvests every ripe or withered plot, sells on market days (`forecastBot` keeps the cold crop unless it is day 30), then fills empty plots in index order. Bots never sell to the 收购商. `randomBot` picks uniformly among affordable crops with `day + days ≤ 30`; `potatoBot` plants 土豆 while `day + 4 ≤ 30`; `forecastBot(K)` simulates each affordable crop over `route[day..day+K]` (later days 平), skips crops that wither or ripen on day ≥ 30, values them at the first market after ripening if visible else `sell`, and plants the best positive `(value − cost) / (ripeDay − day + 1)`.

| bot | must reach 800 in | measured |
| --- | --- | --- |
| `forecastBot(5)` | ≥ 95% | 99.5% (1500: 37.5%, median 1382) |
| `forecastBot(0)` | ≤ 5% | 0.5% |
| `potatoBot` | ≤ 5% | 3.5% (median 468) |
| `randomBot` | ≤ 5% | 0% (median 110) |

- **Deterministic voyage:** v1's scripted voyage with the new numbers (day 1 coins 40 → 21; day 6 `sellAll()` = 53 → 74), then `coins = 1600` and 25 more days. Sequence `start, thrive, hot_seller, voyage, tycoon, stats, end`; stats `{ rounds: 1, wins: 1, harvests: 6, coins: 1600 }`. After the end nothing can be planted, sold or left, and `newRound()` returns to `ready` silently.
- **Clean win** (`coins = 800`, 30 idle days): `start, voyage, no_loss, stats, end`. **Loss** (30 idle days): `start, stats, end`, `coins: 40`.
- **Layout:** at 1000×625, 800×500, 1440×820, 375×667 and 320×240 the zoom stays in 50–160%, a click at C10's centre hits plot 5, and `draw()` runs.
- Every message has exactly the protocol's keys, including `disguise`.

## Milestones

Each milestone ends with `node games/turtle-farm/v2/test_headless.js` passing.

**M1 · Playable sheet.** Rules carried over from v1 plus the market stop, 收购商, 40 金 and 8 s days; the Excel chrome, sheet, boss sheet, end dialog, input, sounds; the route, growth, market and balance tests.
Done when: a voyage plays in a browser with mouse, and the balance table passes.

**M2 · Package.** `game.json`, achievements and stats, `disguise`, the deterministic, win, loss and layout tests, `README.md`.
Done when: `pnpm game check turtle-farm v2` passes.

**M3 · Release.** `pnpm game:local publish turtle-farm v2 --yes`, a browser check on local `/play/turtle-farm` including 伪装 mode, then the production publish.
Done when: production serves v2 and camouflage mode works with it.

## Implementation notes

- Measured balance is in D11; the test reproduces it exactly. An earlier bot rule that sold everything to the 收购商 whenever coins ran low cut `forecastBot(5)` to 74–80% and pinned `potatoBot` at its starting 40 (it sold each potato crop back at cost just before a market), which is what showed the 收购商 is break-even. So the bots sell only at markets.
- Text widths are clipped per cell instead of measured, except for the hyperlink underline, which uses v1's character-class estimate, so the headless stub can draw every screen.
- The visual check used a separate headless Chrome on a scratch copy: screenshots of the ready, play, market, boss and end states at 1000×625, 800×500 (compact ribbon, 80% zoom) and 1440×820, plus a CDP-driven session with real mouse and key events (key 8, a drag-plant across six cells, seed-row click, Space, Esc twice, market arrival with the clock stopped for 1 s, click-harvest, `全部卖出`, `离开集市`). No real touch device was used.

## Open items

- The 800 target and 8 s day come from bots, not people. The owner plays a few voyages; if humans land far from 800 either way, adjust `TARGET` (and the achievement copy) or `DAY_SECONDS`, and leave the bot bands as they are.

## v1 and why it changed

v1 (`games/turtle-farm/v1/`, published 2026-10-02) drew the field on a cartoon turtle shell with emoji crops, a forecast strip of land tiles, seed buttons and a market panel, on a 480 × 800 portrait canvas with a title screen. Days were 12 s with a 2× toggle, the player started with 20 金, and goods could only be sold on market days, which passed on the timer. Its balance was `forecastBot(5)` 94% ≥ 800.

The user rejected the cute emoji look, and the v1 playtest found the pacing problem: a player who reached a market with nothing ripe, or let it pass, waited six days, and with no coins could not plant meanwhile. v2 keeps the rules and fixes both: the office-camouflage Excel skin (D3, D4, D9, D10), markets that wait for the player (D5), the 收购商 (D6), and a faster, richer start (D7).

### M3 notes (v2)

- Local publish registered v2. On `/play/turtle-farm` the game entered 伪装 on load (preference on) with the tab title `农产品采购计划_2026.xlsx - Excel`. Real clicks planted 萝卜 in three cells (余额 40 → 34, yellow growth bars, formula bar `=生长("萝卜", 0/4, 受损 0/2, 今日草原 平)`).
- In the standalone page, fast-forwarding with `update(0.1)` reached the day-6 market, after which 30 more simulated seconds left `day` and `dayT` unchanged; the sheet showed `离开集市` and the status bar `集市（时间暂停）`.
- Gotcha for testing: when the browser pane is in the background it throttles `requestAnimationFrame` to ~1.5 fps, and the game caps `dt` at 0.1 s, so the day clock looks several times too slow there. At a normal frame rate a day is 8 s (headless test).

