# 玄武农场 (`turtle-farm`)

**Status:** Implemented and published to production 2026-10-02 (`pnpm game publish turtle-farm v1`; the play page loads at www.moyufuns.com/play/turtle-farm). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A farming game on the back of a walking giant turtle. Your 4 × 4 field rides 玄武 across 草原, 雨林, 沙漠 and 雪原 for 30 days, stopping at a 集市 every sixth day. Each crop grows fast in the land it likes and withers if it spends too long in land it hates, and the route is visible only 5 days ahead. So you plant now for the land the field will cross while the crop grows, and harvest in time to sell at the next market. Earn 800 金币 by the end of day 30. Mouse or touch, single-player, about 6 minutes at 1×.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/turtle-farm/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, the `resize()`/`view` pattern (`document.documentElement.clientWidth/Height`) and the audio helpers. Crops and biomes are emoji drawn with `fillText`; the turtle, plots and UI are canvas shapes. | Same package contract; the gameplay shares nothing with either game. |
| D2 | The rules are pure functions over one `state` object (below), separate from `render()`. Time moves only through `update(dt)`. Randomness goes through `rng()` (default `Math.random`, `mulberry32` in tests). | The headless test drives whole voyages, including the balance bots, without a canvas. |
| D3 | A voyage is 30 days. A day lasts `DAY_SECONDS = 12` at 1× and 6 at 2×, so a round runs 6 minutes at 1× and 3 at 2×. ⏸ pauses the clock. Planting, harvesting and selling all work while paused. The game pauses itself on `visibilitychange` to hidden. | Pausing is thinking time in a planning game, so it should not lock the field. 2× is for players who plan fast. |
| D4 | Growth is integer points. At the end of each day, every growing crop gets 3 points if it likes that day's land (喜), 2 if neutral (平), and 0 plus one harm if it hates it (忌). It ripens at `2 × days` points. It withers when `harm > tough`, and harm never heals. A 集市 day counts as 平 for every crop. | Integer points make "X days" exact on neutral land and about a third faster on liked land. Harm that never heals makes long crops through mixed land a real gamble. |
| D5 | A ripe crop waits on its plot for 3 day-ends. On the third it rots and is lost. Harvested goods go to the 仓库, which has no capacity limit and no decay. | Harvest timing matters without adding a storage minigame. Holding goods for a better market is a legitimate choice. |
| D6 | The only inputs are plant, harvest and sell. There is no watering, fertiliser, tools or upgrades. | The one skill is reading the route. Every extra verb would dilute it. |
| D7 | Markets are on fixed days 6, 12, 18, 24 and 30. All other days come from seeded segments (rules below), and the first segment is always 草原. Each market rolls one 热销 crop (price ×2) and a different 滞销 crop (price ×0.5, floored). Selling happens only on market days. | Fixed market days give a predictable cash cycle, so the planning centres on the land. Hot and cold crops reward planting for a market you can already see. |
| D8 | The forecast strip shows today plus the next 5 days. A market tile shows its 热销 and 滞销 emoji. Tapping a seed tints every forecast tile by that crop's relation: green 喜, grey 平, red 忌. There is no automatic "will ripen on day N" readout. | The six visible day-ends cover a 5-day crop only when it never stalls; any 忌 day pushes its ripening past the strip, so slow crops planted into mixed land carry a blind tail. Players do the point arithmetic themselves; that is the skill. |
| D9 | The player starts with 20 金币, the target is 800 and 富甲一方 needs 1500. Balance from a prototype simulation over seeds 1–200 (bots defined under Headless test): the greedy forecast bot ends ≥ 800 in 94% of voyages; the same bot seeing only today wins 0%, and seeing 3 days ahead wins 38%; potato-only wins 0% (median 356); random planting wins 0% (median 47). The forecast bot reaches 1500 in 15%. | Planting blindly or only safely loses; reading the full strip wins. The headless test enforces these bands (with margin), so tuning cannot quietly break them. |
| D10 | `ready` is sent on load and again at 0.5, 2 and 5 s. `start` is sent when `启程` is pressed (the round's first real action). | The repo convention since 升官记 D8: the site listens only after hydration. |
| D11 | Input uses Pointer Events. Tapping a plot acts on it. Dragging from a plot repeats that action on each new plot the pointer enters: planting the selected seed on empty plots, or harvesting ripe ones. The action is fixed by the first plot. | Planting 16 plots one tap at a time is tedious on touch; a drag sweep is natural for a field. |

## Out of scope

Watering, tools, upgrades, buying more plots, weather events beyond the land types, choosing the route, saving between page loads, a best-score display, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/turtle-farm/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "turtle-farm",
  "name": "玄武农场",
  "shortDescription": "在神龟背上种田，看准前方地形再播种。",
  "description": "上古玄武驮着你的田地穿过草原、雨林、沙漠和雪原。每种作物都有喜欢和讨厌的地形：在喜欢的地方长得快，在讨厌的地方待久了就会枯萎。看准前方五天的路线再播种，赶在集市前收成卖掉，三十天内攒够 800 金币。",
  "tags": ["种田", "策略", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "选种子，点空地播种，点成熟作物收获（可拖动连续操作）" },
    { "input": "集市面板", "action": "卖出作物" },
    { "input": "1–8", "action": "选择种子" },
    { "input": "空格", "action": "暂停或继续" },
    { "input": "F", "action": "切换 1× / 2× 速度" },
    { "input": "M", "action": "静音或恢复声音" }
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

The `harvests` cap is 16 plots × 15 two-day radish cycles = 240, rounded up.

### Lands

`BIOMES` (key → name, emoji, ground colour):

| key | name | emoji | ground |
| --- | --- | --- | --- |
| `grass` | 草原 | 🌾 | `#8fd16a` |
| `rain` | 雨林 | 🌴 | `#2f8f5b` |
| `desert` | 沙漠 | 🏜️ | `#e9c46a` |
| `snow` | 雪原 | ❄️ | `#e8f1f8` |
| `market` | 集市 | 🏮 | `#f4a261` |

### Crops

`CROPS` (index 0–7 = keys 1–8): `{ key, name, emoji, cost, days, sell, likes: [biome…], hates: [biome…], tough }`. Lands in neither list are 平.

| # | key | name | emoji | cost | days | sell | 喜 likes | 忌 hates | tough |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `radish` | 萝卜 | 🥕 | 2 | 2 | 5 | snow | desert | 1 |
| 2 | `corn` | 玉米 | 🌽 | 4 | 3 | 10 | grass | snow | 1 |
| 3 | `mushroom` | 蘑菇 | 🍄 | 5 | 3 | 13 | rain | grass, desert | 1 |
| 4 | `cactus` | 仙人掌果 | 🌵 | 3 | 4 | 9 | desert | rain | 2 |
| 5 | `melon` | 西瓜 | 🍉 | 6 | 4 | 18 | desert | rain, snow | 1 |
| 6 | `banana` | 香蕉 | 🍌 | 8 | 5 | 26 | rain | desert, snow | 1 |
| 7 | `icegrape` | 冰葡萄 | 🍇 | 10 | 5 | 34 | snow | grass, rain, desert | 0 |
| 8 | `potato` | 土豆 | 🥔 | 3 | 4 | 7 | — | — | 99 |

The seed hint line for the selected crop reads `🍉 西瓜 · 6 金 · 4 天 · 喜 沙漠 · 忌 雨林 雪原 · 耐 1 天`. For 土豆 it reads `· 不挑地形`, and for 冰葡萄 `· 耐 0 天`.

### Route

`genRoute(rnd) → { route, markets }`. `route[1..30]` holds biome keys (index 0 unused). `markets[d] = { hot, cold }` holds crop indices.
1. Build segments until 30 days are filled. The first segment is `grass`. Each later segment draws uniformly from the other three land types, redrawing on a repeat of the previous one. Each length is 2 or 3 (`2 + floor(rnd() × 2)`). The last segment is cut at day 30.
2. Set `route[d] = 'market'` for d in `MARKET_DAYS = [6, 12, 18, 24, 30]`. Each market draws `hot = floor(rnd() × 8)`, then redraws `cold` until it differs from `hot`.

`price(cropIdx, day)` is `sell × 2` if hot, `floor(sell / 2)` if cold, else `sell`. `startRound()` calls `genRoute(rng)`.

### State and rules

```js
state = {
  phase: 'title' | 'play' | 'end', day: 1..30, dayT: 0, speed: 1 | 2, paused: false,
  coins: 20, route, markets, selected: 0..7,
  plots: [16 × null | { crop, pts, harm, ripe, age, allLiked, withered }],
  barn: [8 ints], harvests: 0, lost: 0, soldHotToday: 0, roundAchievements: Set,
}
```

- `relation(cropIdx, biome) → 2 | 1 | 0` (喜 / 平 / 忌). `market` is always 1.
- `plant(i, cropIdx) → bool`: the plot must be empty, `coins ≥ cost` and `phase === 'play'`. Subtracts the cost, creates `{ crop, pts: 0, harm: 0, ripe: false, age: 0, allLiked: true, withered: false }`, and plays the plant sound. A failure on an empty plot toasts `金币不够`.
- `harvest(i) → bool`: on a withered plot, clears it and returns false. On a ripe plot: `barn[crop]++`, `harvests++`, clears the plot, and unlocks `thrive` if `allLiked`. Otherwise it returns false. Tapping a growing plot shows its seed hint as a toast instead.
- `sell(cropIdx) → gained`: only on a market day. Sells the whole barn stack at `price`. Adds `n` to `soldHotToday` if the crop is today's hot crop, and unlocks `hot_seller` once that reaches 5. `sellAll()` sells every stack in index order.
- `endOfDay()`, for the current day `d`:
  1. Clear plots withered on an earlier day.
  2. For each ripe crop, `age++`. At 3 it rots: `lost++`, the plot clears, and the game toasts `<name>烂在地里了`.
  3. For each growing crop, take `r = relation(crop, route[d])`. If `r = 2`, add 3 points. If `r = 1`, add 2 and set `allLiked = false`. If `r = 0`, `harm++` and `allLiked = false`, and `harm > tough` sets `withered = true` and `lost++` (shown as 🥀 for the next day). Then `pts ≥ 2 × days` sets `ripe = true`.
  4. `day++` and `soldHotToday = 0`. Past day 30 it calls `finishVoyage()` instead.
- `update(dt)`: only while playing and not paused. Adds `dayT += dt × speed`, and while `dayT ≥ DAY_SECONDS` it subtracts `DAY_SECONDS` and runs `endOfDay()`. It also advances animations.
- A crop planted at any moment of day `d` receives day `d`'s tick.

### Screen (logical 480 × 800, portrait)

Scaled with `view.s = min(w/480, h/800)` and centred. Landscape iframes get letterboxing filled with the current land's ground colour.

- **HUD (y 0–56):** `第 7 / 30 天` with a thin day-progress bar, `💰 123 / 800`, and buttons `⏸` and `1×`/`2×`.
- **Forecast strip (y 64–168):** 6 tiles of 72 × 96 with 6 px gaps. Today is outlined white and labelled `今天`, the others `+1`…`+5`. Each tile shows the land emoji and name. A market tile adds `🔥<hot emoji>` and `❄<cold emoji>`. When a seed is selected, each tile gets a 4 px border: `#4caf50` 喜, `#9e9e9e` 平, `#e53935` 忌. Past day 30 the tiles show `终点`.
- **Turtle (y 176–560):** the field rides on a shell ellipse (`#4f7d3a`, hex pattern) with a head and four legs that step once per day. The ground behind it is the current land's colour, crossfading over 0.6 s at day change.
  - The 4 × 4 plots are 80 × 80 with 8 px gaps, centred on the shell.
  - A growing crop's emoji grows from 20 to 44 px with `pts`, with a progress bar under it and red harm pips (`harm` filled of `tough + 1`).
  - A small dot in the corner shows today's relation, in the strip colours.
  - Ripe crops sparkle, and blink on their last day (`age === 2`). Withered crops show 🥀.
- **Seeds (y 570–690):** 8 buttons of 110 × 56 in 2 rows, each showing emoji, name and `N 金 · N 天`. The selected seed is outlined. Unaffordable seeds are dimmed but still selectable for their hint. The seed hint line sits under the buttons.
- **仓库 (y 700–792):** 8 counts as `emoji ×n`. On a market day it becomes `集市`: each crop with stock shows its price (hot in red with 🔥, cold in blue) and is tappable to sell, and a `全部卖出` button appears. On day 30 the panel also shows `靠岸结算`, which calls `finishVoyage()`, and the header line `最后一站！卖不掉的都带不走`.
- **Title:** `玄武农场`, subtitle `在神龟背上种田，赶在下一个集市前收成`, three rule lines, and an `启程` button. The rule lines are `选种子，点空地播种；点成熟的作物收获。`, `看前方的路线：作物在喜欢的地形长得快，在讨厌的地形会枯萎。` and `到集市卖掉收成，三十天内攒够 800 金币。`
- **Pause overlay:** `暂停中`, with `继续` and `重新开始`. *Changed in M1:* it does not cover the screen, because D3 keeps the field, seeds and market usable while paused. The HUD's `⏸`/`1×` buttons become `重新开始` and `▶ 继续`, the ground dims, and a pill `⏸ 暂停中 · 仍可播种、收获、卖出` sits above the field.
- **End:** a win shows `满载而归！`, a loss shows `盘缠不够……`. Both show `金币 N / 800`, `收获 N`, `损失 N` and `再来一趟`, which starts a new route.
- **Sounds:** plant (short low blip), harvest (rising pop), sell (two-note coin), wither (falling tone), market arrival (two-tone horn at the start of a market day) and a soft step at each day change.

Keyboard: `1`–`8` select a seed, Space pauses, `F` toggles speed, `M` mutes. Plant, harvest and sell stay pointer-only.

### Functions

- `startRound()`: resets `state` and `roundAchievements`, runs `genRoute(rng)`, sets `phase = 'play'` and sends `start`. Called by `启程` and `再来一趟`.
- `genRoute(rnd)`, `relation(c, b)`, `price(c, d)`, `plant(i, c)`, `harvest(i)`, `sell(c)`, `sellAll()`, `endOfDay()` and `update(dt)`, as above.
- `finishVoyage()`: sets `phase = 'end'`, then sends achievements, `stats` and `end`, in that order.
- `restart()`: during play it sends `stats` with `wins: 0` and then `end`. Then it returns to the title screen.

### Achievements

Emitted through `unlockAchievement(key)` (adds to `roundAchievements`, sends once per round), before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `thrive` | `harvest(i)` of a crop with `allLiked` (every growth tick was 喜). |
| `hot_seller` | `soldHotToday ≥ 5` within one market day. |
| `voyage` | `finishVoyage()` with `coins ≥ 800`. |
| `no_loss` | `finishVoyage()` with `coins ≥ 800` and `lost === 0`. |
| `tycoon` | `finishVoyage()` with `coins ≥ 1500`. |

End-of-voyage achievements are sent in the order `voyage, no_loss, tycoon`.

### Stats

In `finishVoyage()` and `restart()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, harvests: Math.min(harvests, 300), coins: Math.min(coins, 1000000) })`. `wins` is 1 only from `finishVoyage()` with `coins ≥ 800`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern. Each case sets `rng = mulberry32(seed)` before `startRound()`.

**Load.** Only `ready` is sent until `startRound()`.

**Route.** For seeds 1–50, `genRoute` is deterministic (the same output twice), and markets fall on exactly days 6, 12, 18, 24 and 30. Days 1–2 are `grass`. Every run of one land type between changes is 2 or 3 days long; a run may be cut short by a market day or day 30. Two consecutive segments are never the same land. Hot and cold differ.

**Growth rules.** On a hand-set route:
- 萝卜 planted on a 雪原 day ripens after 2 day-ends.
- 西瓜 survives 1 雨林 day-end and withers on the second.
- 冰葡萄 withers on its first 草原 day-end.
- 土豆 ripens after 4 day-ends on any land.
- A ripe crop left for 3 day-ends rots, with `lost === 1`.
- `update(12)` at 1× and `update(6)` at 2× each run exactly one `endOfDay()`. While paused, `update` does nothing.

**Balance bots.** Each bot plays seeds 1–200 through `plant`/`harvest`/`sell`/`update(12)`. At the start of each day it:
1. Harvests every ripe plot and clears withered ones.
2. On a market day, sells: `forecastBot` sells everything except the cold crop (unless it is day 30), the others sell everything.
3. Fills empty plots in index order with its chosen crop while it can afford it.

The bots:
- `randomBot`: a uniform pick from crops with `cost ≤ coins` and `day + days ≤ 30`, using `mulberry32(seed ^ 0x9e37)`.
- `potatoBot`: 土豆 while `day + 4 ≤ 30`.
- `forecastBot(K)`: for each affordable crop, simulates points and harm from today using `route[day..day+K]`, treating later days as 平. It skips crops that would wither or ripen on day ≥ 30. Value is `price` at the first market after the ripe day if that market is ≤ `day + K`, else `sell`. It plants the best positive `(value − cost) / (ripeDay − day + 1)`.

| bot | must reach 800 in |
| --- | --- |
| `forecastBot(5)` | ≥ 85% of seeds |
| `forecastBot(0)` | ≤ 5% |
| `potatoBot` | ≤ 5% |
| `randomBot` | ≤ 5% |

Throughout, `coins ≥ 0`, the barn counts are ≥ 0, and every voyage ends with `…, stats, end`.

**Deterministic voyage.** `startRound()`, then overwrite the route:
- `route` = days 1–2 `snow`, 3–5 `desert`, 7–29 `grass`, with the market days kept.
- `markets[6] = { hot: 0 (萝卜), cold: 7 (土豆) }`; the other markets are `{ hot: 1, cold: 2 }`.

Then:
1. Day 1: plant 萝卜 in plots 0–4, 西瓜 in plot 5 and 土豆 in plot 6 (coins 20 → 1). Run `update(12)` twice: the radishes ripen, and the melon withers (2 snow harms > tough 1).
2. Day 3: harvest plots 0–4. The first harvest sends `thrive`. Run `update(12)` twice; the potato ripens at the end of day 4.
3. Day 5: harvest plot 6. Run `update(12)` to reach day 6.
4. Day 6: `sellAll()`. The radishes give 5 × 10, sending `hot_seller`, and the potato gives 3, for coins = 54.
5. Set `coins = 1600` and run `update(12)` until `phase === 'end'` (25 calls).

Expected sequence: `start, thrive, hot_seller, voyage, tycoon, stats, end` (no `no_loss`: the melon withered). Expected stats: `{ rounds: 1, wins: 1, harvests: 6, coins: 1600 }`.

**Clean win.** `startRound()`, set `coins = 800`, then 30 × `update(12)`. Expected: `start, voyage, no_loss, stats, end`, with stats `{ rounds: 1, wins: 1, harvests: 0, coins: 800 }`.

**Loss and restart.** Thirty idle days give `start, stats, end` with `wins: 0, coins: 20`. `restart()` mid-round gives `stats, end`. On the title screen it sends nothing.

## Milestones

Each milestone ends with `node games/turtle-farm/v1/test_headless.js` passing.

**M1 · Playable voyage.** Route generation, growth rules, plant/harvest/sell, forecast strip with seed tint, turtle and field rendering, drag actions, pause and speed, title/pause/end screens, sounds, and the route, growth and balance-bot tests.
Done when: a full voyage plays in a browser with mouse and touch (mobile emulator), and the balance table passes.

**M2 · Achievements, stats, package.** `game.json`, emission, the deterministic, clean-win and loss tests, `README.md`.
Done when: `pnpm game check turtle-farm v1` passes.

**M3 · Local release.** `pnpm game:local publish turtle-farm v1 --yes`.
Done when: `/play/turtle-farm` plays locally, and a logged-in round unlocks `thrive` and updates the board. The owner runs the production publish.

### M3 notes

- Local publish registered the game, its achievements and stats; the smoke test found `/play/turtle-farm` serving v1.
- Played a voyage to day 18 in the browser with real clicks: planting single plots, a drag-plant sweep (with stepwise pointer moves) that stopped at `金币不够`, harvesting ripe crops into the 仓库, 2× speed, pausing and the paused top bar, and the day-18 market (`到集市了！`, 🔥/❄ prices, `全部卖出` turning 2 萝卜 + 4 玉米 at the cold price into 30 金). No console errors.
- On `/play/turtle-farm`, 启程 then pause and `重新开始` wrote `game_ready`, `game_start` and `game_end` to the local events table. No account was logged in, so the achievement popup and stats board were not exercised in the browser.
- Gotcha for automated testing: the browser pane's built-in drag jumps from start to end, so a drag-plant only hits the first and last plot; real pointers send intermediate moves.
- Markets do not pause the game. A player who reaches a market with no crops, or lets it pass, waits six days for the next one, and with no coins can't plant meanwhile. Worth watching in the owner's playtest (Open items).

## Open items

- The 800 target and the 12 s day were set from bot simulations, not people. After M1 the owner playtests a few voyages at 1×. If humans fall far from the bot (target too hard, or 16 plots too busy in 12 s), the owner adjusts `TARGET` or `DAY_SECONDS`, and the bot bands in the test stay as they are.

## Implementation notes

D1–D11 hold as written. The model is the prototype's, and the headless test reproduces the D9 numbers exactly: `forecastBot(5)` 94.0% ≥ 800 (15.0% ≥ 1500, median 1157), `forecastBot(0)` 0%, `potatoBot` 0% (median 356), `randomBot` 0% (median 47). The prototype's potato bot also held back the cold crop; the test follows this doc (only `forecastBot` holds it), which changes nothing.

- Changed in M1: the pause overlay is non-blocking (see Screen). The doc's two requirements (an overlay with 继续/重新开始, and the field working while paused) could not both hold with a full-screen card.
- Layout moved a few pixels to fit everything in 800: strip tiles at y 62–158, seed buttons 110 × 52 at y 568 and 624, hint line at y 684, 仓库 card at y 702–794. The shell is a superellipse (n = 6) around the 344 px field, so the head and legs only peek out at the screen edges.
- `update(dt)` always advances animations; only the clock stops while paused or off `play`. Animation state (particles, flying emoji, toasts, strip slide, ground crossfade) lives outside `state`, so the rules stay testable and `update(12)` in the bots simply flushes it.
- `roundAchievements` is the SDK block's global (as in other games), not a `state` field.
- Additions not in the doc: 仓库 cells show the base sell price (seed buttons show only cost and days, so the player had no other way to learn it before the first market); a `下个集市：第 N 天（还有 N 天）` line; a 喜/平/忌 letter badge on each strip tile, so the tint does not rely on colour alone; `快烂了` on a ripe crop's last day; toasts for withering and market arrival; rot and wither toasts merge per crop per day (`萝卜×3 烂在地里了`); `金币不够` also flashes the coin counter red; small key numbers on seed buttons; a `🔇` corner mark while muted.
- Input: plots act on `pointerdown` (so a drag starts at once); buttons fire on `pointerup` only when the press started in the same button, and every button function re-checks the current state, so a stale frame cannot fire a disabled action. Taps outside plots and buttons do nothing. A drag that starts on a growing plot shows its hint and does nothing else.
- Text width is estimated by character class instead of `measureText`, so the headless stub can draw every screen; the test draws the title, play, paused, market and end screens.
- The visual check used screenshots from a separate headless Chrome on a scratch copy, plus synthetic pointer events (start, seed select, drag-plant, drag-harvest, empty tap, pause, plant while paused). A real touch device and the mobile emulator were not used; that is part of M3's browser playtest.

