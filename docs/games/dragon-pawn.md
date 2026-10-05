# 当铺账房 (`dragon-pawn`)

**Status:** v2 (当铺账房) implemented and published to production 2026-10-05 (`pnpm game publish dragon-pawn v2`; www.moyufuns.com/play/dragon-pawn). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

A fast audit game disguised as an Excel ledger. The player is the clerk (账房) of the pawnshop at the dungeon mouth. Each customer is a new row at the bottom of `典当登记台账_10月.xlsx`: item, workshop, mine, mark, motto, gem, material, market value and asking price. The audit rules sit in a frozen header above the ledger and grow by one or two each day. The player marks each row 收 (accept), 拒 (reject) or 压价 (counter) before the backlog overflows. At day end a 对账 sheet shows what every decision earned or lost and why. Five days, about 5–6 minutes. The score is 净利润 (net profit). Keyboard, mouse or touch, single-player.

Read first: `docs/design/office-camouflage.md` (D2 `disguise`, D6 conventions, D7 Excel chrome, D8 colours, D9 no logos), `docs/design/game-release.md` (package contract, `check`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/prototype-skins/index.html` variant C (the chrome this game refines), `games/tile-stack/v1/` (SDK block, `resize()`, test stub pattern).

## Why v2 (what v1 was)

v1, 龙的当铺, was a portrait 540 × 960 shop scene: a dragon pawnbroker inspected a drawn treasure part by part with a loupe, cross-checked it against a four-tab 鉴定手册 (6 workshops × mark, motto, materials; 5 mines × gem colours), confronted forgers, haggled with a slider, and gambled on heroes dying in the dungeon over 7 days. Playtesting said it was boring: appraising meant slowly cross-checking a manual like homework, and the treasure art and emoji heroes were the cute look the site has moved away from.

v2 keeps the world (workshops, mines, marks, mottos, gems, materials, item types) and drops everything else. Every fact the player needs is in the row or in a one-line rule above it, so a check takes a glance instead of a manual lookup. The pressure comes from rows arriving, not from reading. The game is renamed **当铺账房** because the player is no longer a dragon haggling over one treasure; they are a clerk working down a ledger, and a catalog name that describes an office job fits the disguised games next to it. The slug stays `dragon-pawn` so v1's players, stats and achievements stay attached.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/dragon-pawn/v2/index.html`, vanilla JS, one full-window `<canvas>`. The Excel chrome is drawn as in the prototype (variant C): green title bar, ribbon, name box + `fx`, column letters and row numbers on `#f3f3f3`, gridlines `#e1e1e1`, sheet tabs, green status bar. | office-camouflage D1/D7. Canvas keeps the grid pixel-exact at any size; the prototype is the approved look. |
| D2 | The sheet is a model (`ledgerModel`, `reconModel`, `bossModel`) of frozen rows, body rows and cells. `layout(model)` computes zoom and visible rows; `drawSheet` draws it and `onPointer` hit-tests by calling `layout(currentModel())` again. | One code path for drawing and clicking means a click always hits what is on screen now (the stale-hit-test bug from earlier games). |
| D3 | Zoom `z = min(width fit, height fit for frozen rows + 7 body rows)`, floored to 5 %, clamped to 45–150 %, shown as the status bar's zoom %. The chrome is never scaled. | The disguise fills any iframe like a real window; only the cells scale, the way Excel zoom does. |
| D4 | Rules are pure predicates on a row (`RULES`, `judge`). 9 rules arrive over 5 days: 2, +2, +2, +2, +1. Each compares two cells of the row, checks one cell against a constant, or is a one-cell condition. | Each rule must be checkable in about 2 seconds from the row alone; the challenge is the growing list and the pace, not lookup. |
| D5 | `makeRow(day)` builds a fully genuine row, then either forges it (breaking one active rule, chosen with weight 2 for today's new rules and 1 for older ones) or prices it fair or high. The row is kept only if `judge(row, today's rules)` and `judge(row, all rules)` agree with the intended class, and a fair or high ask is at least 5 % of the value away from the counter line. | Rules not yet announced can never make the player wrong (e.g. the closed workshop never appears before day 3, and 秘银 items never sit in the 50–70 % band before rule 7). The 5 % gap keeps the price check a glance. New rules get exercised the day they appear. |
| D6 | Decisions resolve immediately to money (`settle`): 收 pays the ask; 压价 pays `round5(ask × 0.6)`, except that a fair-priced customer walks away (no deal); 拒 pays nothing. A genuine item is worth its 行情; a fake is worth 0. Profit = worth − paid. | Three choices with distinct payoffs: accepting an overpriced item still earns a little or loses, countering a fair one loses the deal, any deal on a fake loses money. The rule-following choice is always the best one. |
| D7 | Outcomes are hidden until the day's 对账 sheet, except that a walked-away counter shows `压价 · 没谈成` in the ledger. | The brief: wrong calls show up at night. A walk-away is what the clerk would see anyway. |
| D8 | Pace: day n has `PLAN[n].n` rows (10, 12, 13, 14, 15) arriving every `gap × U(0.8, 1.2)` seconds (gap 4.5, 4.8, 4.8, 4.6, 4.4). Day 1's first row is waiting on the first frame; from day 2 the first row comes 3 s after the day opens. When more than 5 rows are pending, the oldest one times out (`超时`, −30). | About 290 s of shop time plus reading the 对账 sheets, so 5–6 minutes. The headless test shows a 3.5 s-per-row player never times out and an 8 s-per-row player does. |
| D9 | The clock does not run until the first decision (which sends `start`), while the boss screen is up, while the 对账 sheet is shown, or while the window is blurred (`paused`; any key or click resumes). | No title screen (office-camouflage D6): the first frame is the ledger with one row and a status-bar hint, and nothing happens until the player acts. Leaving the window must not cost rows. |
| D10 | Score is `total` = sum of profits over 5 days. The monthly target is 3,000 (stat `wins`, achievement `target`). Simulation through the real code (300 seeds): a perfect rule-follower averages ~4,400; one that picks a wrong answer on 10 % of rows ~3,700, on 20 % ~3,000, on 30 % ~2,300; one that only ever learns day 1's two rules ~2,600. Accept-everything averages about −180 and random about −320. | The target sits where a careful player usually makes it and a player who stops learning rules usually does not. Every seed has a different closed workshop and rows, and the best total is kept, so there is a reason to replay. |
| D11 | Esc is the boss key: the screen becomes `2026年度区域销售汇总_v3_终版.xlsx` (a static region × month sheet with real row totals), time freezes, input other than Esc is ignored, and `disguise` is re-sent with that title. Esc again restores both. | office-camouflage D2 and D6. The tab title follows the window title. |
| D12 | `ready` on load and at 0.5, 2 and 5 s, each followed by `emitMoYuFunDisguise('excel', title)`. | office-camouflage D2; the lost-`ready` fix from 升官记. |
| D13 | Sound is off until `M`. Sounds are short sine tones: a faint tick when a row arrives, a click per decision (pitch per choice), a low thud on a timeout, two notes at day end. | office-camouflage D6. |
| D14 | Randomness goes through `rng()` (default `Math.random`, `mulberry32(seed)` in tests). Logic never touches the canvas; time moves only through `update(dt)`. | Headless tests and bots drive the whole month. |
| D15 | The best `total` is kept in `localStorage` under `moyufun:dragon-pawn:best` (reads and writes wrapped in `try`). | A personal best on the month summary; storage failure just hides nothing important. |

## Out of scope

Negotiation beyond one fixed counter, per-customer patience timers, hiding outcomes inside the ledger with a separate "submit day" step, user-chosen difficulty, a VS Code skin, mobile-specific layout (on a phone the sheet zooms down to 45 % and is small), cross-round achievements, carrying money between rounds.

## Architecture

### Package

```text
games/dragon-pawn/
  game.json
  v1/…                 immutable, published
  v2/index.html
  v2/test_headless.js
  v2/README.md
```

`game.json`:

```json
{
  "slug": "dragon-pawn",
  "name": "当铺账房",
  "shortDescription": "一张典当登记台账：照着表头的规则，一行行收、拒、压价。",
  "description": "你是地牢门口那家当铺的账房。客人一个接一个来押宝物，每位都是台账底部新的一行：物品、工坊、矿脉、印记、铭文、宝石、材质、行情、要价。表头冻结着审核规则，每天多一两条。赝品总会在这一行里露出破绽，要价太高就压价，公道的照收。客人不停地来，待处理超过 5 行最早的那位就会走。每晚的对账表会算清每一笔：赚了多少、收了赝品亏了多少、错过了多少。五天一个月，净利润达到 3,000 即完成指标。整个界面就是一张 Excel 表格，Esc 一键切到销售汇总。",
  "tags": ["审计", "伪装", "单人"],
  "controls": [
    { "input": "1 / A", "action": "收" },
    { "input": "2 / S", "action": "压价（按要价六折还价）" },
    { "input": "3 / D", "action": "拒" },
    { "input": "↑ ↓", "action": "选择待处理的行" },
    { "input": "鼠标 / 触摸", "action": "点处理格里的按钮，或点一行选中它" },
    { "input": "Enter", "action": "对账后进入下一天" },
    { "input": "Esc", "action": "老板键：切到销售汇总表并暂停" },
    { "input": "M", "action": "打开或关闭声音（默认关）" }
  ],
  "cover": { "symbol": "账", "eyebrow": "LEDGER", "accent": "#217346", "accentSecondary": "#ffeb9c" },
  "sortOrder": 110,
  "achievements": [
    { "key": "full_month", "name": "月末结账", "description": "做完五天的台账。", "symbol": "月" },
    { "key": "sharp_eye", "name": "火眼金睛", "description": "一局内拒收 15 件赝品。", "symbol": "眼" },
    { "key": "bargain", "name": "砍价高手", "description": "一局内对要价虚高的真品压价成交 10 次。", "symbol": "砍" },
    { "key": "clean_day", "name": "账实相符", "description": "某一天的处理全部正确。", "symbol": "符" },
    { "key": "target", "name": "完成指标", "description": "一个月净利润达到 3,000。", "symbol": "标" },
    { "key": "perfect", "name": "零差错", "description": "五天的处理全部正确。", "symbol": "零" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "完成指标", "maxPerRound": 1 },
    { "key": "fakes", "name": "拒收赝品", "maxPerRound": 64 },
    { "key": "profit", "name": "净利润", "maxPerRound": 50000 }
  ]
}
```

Publishing v2 retires v1's achievements `first_hoard`, `big_haul`, `loan_shark`, `win`, `clean_win` and the stat `hoard` (kept, not deleted). `sharp_eye`, `rounds`, `wins` and `fakes` keep their keys with v2 meanings. Gotcha: `pnpm game check dragon-pawn v1` now fails D11 of game-release (v1's runtime does not contain the new keys); that is expected, since v1 is already published and `switch` does not re-check.

### World data

| table | values |
| --- | --- |
| `WORKSHOPS` | 炉心 霜语 月匠 山根 星斗 龟甲 (mark = first character) |
| `LOOKALIKE` (rule 1 forgeries from day 4, 50 %) | 炉→护, 霜→雷, 月→用, 山→出, 星→昱, 龟→电 |
| `MINES` | 赤岭 青崖 紫渊 碧林 白沙 金谷 (gem = first character) |
| `MATERIALS` (value multiplier) | 青铜 0.6, 银 1, 黑铁 1.2, 金 1.5, 秘银 2 |
| `TYPES` (base value) | 戒指 80, 护符 100, 酒杯 120, 长剑 160, 圆盾 180, 王冠 240 |
| `MOTTOS` | 百炼成锋 寒光映雪 清辉满庭 稳如磐石 斗转星移 万古长存 金石为开 福寿绵长 光照四方 无往不利 |

`行情 = round10(base × multiplier)`, so 50–480. `closed` (the workshop of rule 5) is picked per round.

### Rules

| id | day | text (shown in the header) | broken when | forgery |
| --- | --- | --- | --- | --- |
| 1 | 1 | `印记 = 工坊的第一个字（炉心 → 炉）` | mark ≠ workshop[0] | another workshop's first character; from day 4, half are lookalikes |
| 2 | 1 | `要价 > 行情的一半 → 压价` | (price) | — |
| 3 | 2 | `宝石 = 矿脉的第一个字（赤岭 → 赤）` | gem ≠ mine[0] | another mine's first character |
| 4 | 2 | `铭文必须是 4 个字` | motto length ≠ 4 | drop one character, or insert one of 之 永 大 天 |
| 5 | 3 | `{closed}工坊已停业：它的货一律拒收` | workshop = closed | workshop and mark set to the closed one |
| 6 | 3 | `王冠只用金打造` | 王冠 and material ≠ 金 | 王冠 in 青铜/银/黑铁/秘银 |
| 7 | 4 | `例外：秘银货要价 ≤ 行情七成 → 照收` | (price: limit 0.7 for 秘银) | — |
| 8 | 4 | `青铜货的行情不会超过 200` | 青铜 and 行情 > 200 | 青铜 with 行情 220–400 (genuine 青铜 tops out at 110) |
| 9 | 5 | `金宝石不会镶在金器上` | gem 金 and material 金 | mine 金谷, gem 金, material 金 |

`judge(row, rules)` → `{ verdict, broken, limit }`: `拒` if any fake rule is broken, else `压价` if `ask > limit × 行情` (limit 0.7 for 秘银 once rule 7 is active, else 0.5), else `收`.

`makeRow(day)`: genuine base (type, workshop, mine, motto uniform; 王冠 is always 金; mark and gem derived), retried until it breaks no rule. Then with `FAKE_RATE = [0.30, 0.33, 0.36, 0.38, 0.40]` it is forged and asks `U(0.45, 0.95) × 行情`; otherwise it is high-priced with probability 0.35 (`U(limit + 0.08, 1.10)`) or fair (`U(0.25, limit − 0.06)`), asks rounded to 5, limit from all rules. Kept per D5.

### Money

| truth \ decision | 收 | 压价 | 拒 | 超时 |
| --- | --- | --- | --- | --- |
| 收 (fair genuine) | 行情 − ask | 0, walked | 0 | −30 |
| 压价 (high genuine) | 行情 − ask | 行情 − counter | 0 | −30 |
| 拒 (fake) | −ask | −counter | 0 | −30 |

`counter = round5(ask × 0.6)`. `best` is the profit of the right decision; `missed = best − max(profit, 0)` when the decision was wrong and that is positive.

### Screens

All screens are one Excel window titled `典当登记台账_10月.xlsx - Excel`.

- **台账 sheet (day).** Row 1: `典当登记台账 · 10月12日 周一` (days are 10月12–16日, 周一–周五) and, on the right, `开门 09:00` before the first action, then `营业中 hh:mm` (09:00–17:00 mapped onto the day). Row 2: `处理：1 收 · 2 压价（按要价六折还价）· 3 拒　　违反任一条规则 → 拒`. Then one row per active rule, `规则N` + text, with a `今日新增` cell in neutral yellow on the day it arrives. Then the column header row (`序号 物品 工坊 矿脉 印记 铭文 宝石 材质 行情 要价 处理`, light green), then the frozen-pane line. Below, the ledger rows, scrolled so the newest is at the bottom; row numbers jump like a frozen sheet. A pending row's 处理 cell holds three buttons `1 收` `2 压价` `3 拒`; a decided one shows `收 120` (green), `压价 72` / `压价 · 没谈成` (yellow), `拒` (red) or `超时` (grey). The selected pending row has a green range border and a grey tint; its row number and column K are highlighted; the name box shows `K{row}` and the formula bar `=审核(A{row}:J{row})`, or for 1.2 s after a decision `=收(J{row})    → 120`. A new row flashes light green for 0.6 s.
- **Status bar.** Left: before the first action `就绪　　1 收 · 2 压价 · 3 拒 · ↑↓ 选行 · Esc 隐藏 · M 声音`; during the day `就绪　　待处理 n/5`, plus `　再多客人就要走了` at 4 or 5; when blurred `就绪　　已暂停，点表格或按任意键继续`. Right: `平均值 / 计数 / 求和` of today's paid amounts, the zoom slider and zoom %.
- **对账 sheet (night).** The `对账` tab becomes active. Row 1 `对账 · 10月12日 周一`; rows 2–3 KPIs: 当日净利润 (green/red), 正确率 `13/15（87%）` (green ≥ 90 %, yellow ≥ 70 %, red below), 本月累计 with a data bar towards the target, 月度目标 `3,000`. Header `序号 物品 处理 成交价 实情 应为 盈亏 错失 说明`, then one row per customer: 实情 is 真品 / 赝品 / 要价虚高, 应为 is bold red when the decision was wrong, 盈亏 green/red, 错失 yellow, 说明 names the rule (`规则3：宝石「紫」≠ 矿脉首字「赤」`, `规则2：要价 190 > 行情一半 95`, `规则7：秘银要价 150 ≤ 行情七成 168`, `要价本就公道，还价把客人气走了`, `每条规则都符合，是真品`, `客人等太久走了，赔偿 30`). A 合计 row, then a hyperlink cell `→ 开始 10月13日 周二 台账（Enter）`, selected, with `=HYPERLINK(…)` in the formula bar. Status: `就绪　　按 Enter 进入下一天`. ↑/↓ or the wheel scroll when it does not fit.
- **月末 (after day 5).** The same sheet plus `本月合计  净利润 N　·　五天正确率 P%　·　历史最佳 B` (green if the target was met, else yellow) and `→ 新建下月台账（Enter）`, which starts a new round with a fresh seed.
- **Boss screen.** See D11; tabs `汇总 明细 Q3对账 +`, status `就绪`.

### Functions

- `mulberry32(seed)`, `rng`, `pick(a)`, `round5(x)`, `setValue(row)`
- `rulesFor(day)`, `priceLimit(row, rules)`, `judge(row, rules)`, `makeRow(day)`
- `counterPrice(row)`, `outcome(row, d)`, `settle(row, d)` → `{ paid, profit, walked?, best, missed }`
- `startRound()`: picks `closed`, resets totals and `roundAchievements`, `startDay(1)`. Does not send `start`.
- `startDay(d)`: makes the day's rows, resets the clock, and lets due rows arrive (day 1's first row at once).
- `arrivals()`: moves due rows from `queue` to `rows`; times out the oldest pending row when more than `BACKLOG` are pending.
- `decide(row, d)`: settles one pending row; the first call in a round sends `start`. `selected()`, `pending()`, `moveSel(dir)`.
- `update(dt)`: animation time always (except in boss mode); clock, arrivals and the end-of-day wait only while playing. Calls `endDay()` 0.8 s after the last row is decided.
- `endDay()`: summary into `log`, totals, day-end achievements, then `finishRound()` after day 5.
- `finishRound()`: month achievements, best score, `stats`, `end`; `phase = 'over'`.
- `nextDay()`, `toggleBoss()`, `onKey(e)`, `onPointer(x, y)`
- `ledgerModel()`, `reconModel()`, `bossModel()`, `currentModel()`, `layout(model)`, `drawSheet(model, L)`, `drawChrome(info)`, `chromeInfo(L)`, `draw()`, `resize()`

### Achievements

Through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `clean_day` | `endDay()`: every row of the day decided correctly (no timeouts). |
| `sharp_eye` | `endDay()`: fakes rejected this round reach 15. |
| `bargain` | `endDay()`: correct counters (压价 on a high-priced genuine item) this round reach 10. |
| `full_month` | `finishRound()`. |
| `target` | `finishRound()`: `total ≥ 3000`. |
| `perfect` | `finishRound()`: every day was a `clean_day`. |

Order within `endDay()`: `clean_day`, `sharp_eye`, `bargain`; then on day 5 `full_month`, `target`, `perfect`.

### Stats

In `finishRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: total >= 3000 ? 1 : 0, fakes: fakesCaught, profit: clamp(total, 0, 50000) })`. Stats are non-negative, so a losing month adds 0 profit.

### Headless test

`v2/test_headless.js` evals the inline script with a canvas stub (a `Proxy` 2D context whose `measureText` returns a width), stubbed `localStorage`, `setTimeout` and `requestAnimationFrame`, and a `parent.postMessage` recorder.

- **Load:** exactly `ready, disguise` (five keys, `app: 'excel'`, the ledger title); day 1 shows one row; `update(30)` before any decision moves nothing.
- **Generator:** seeds 1–3 × days 1–5 × 3000 rows: today's and all rules agree with `truth`; fakes break the rule they planted and only active rules are planted; genuine rows break nothing; asks are ≥ 5 % of the value from both limits; the closed workshop never shows before day 3; every active fake rule is forged at least once a day; the fake share is within 4 points of `FAKE_RATE`; the 秘银 exception occurs on days 4–5.
- **Settle:** the money table above, cell by cell.
- **Backlog:** with no decisions, pending never exceeds 5 and the oldest rows time out at −30.
- **Input:** default selection is the oldest pending row, `↓` moves it, `2` counters it, a click on a `1 收` button (coordinates from `layout`) accepts that row, a click elsewhere in a row selects it.
- **Boss key:** Esc sends `disguise` with the boss title, freezes the clock and arrivals, ignores `1`; Esc again restores the title.
- **Sound:** off by default; `M` toggles.
- **Deterministic month** (seed 7, the rule-following bot through `update(0.25)`): all correct, sequence `start, clean_day, sharp_eye, bargain, full_month, target, perfect, stats, end`, stats keys `rounds, wins, fakes, profit` with `wins 1`, best score saved; then Enter starts a new round without `start`.
- **Losing month** (accept everything, seed 7): `full_month` but no `target`, `wins 0`, `profit = max(0, total)`.
- **Balance** (seeds 1–200, same rows for every bot): the rule-following bot (`judge` on the day's rules, visible fields only) beats accept-everything and random on every seed, its mean is ≥ 3× theirs, it is above 1.3 × target and accept-everything is below half the target. Last run: rule 4,384 · 15 % noise 3,683 (175/200 meet the target) · accept-all −178 · random −321.
- **Pace** (seeds 1–20): a rule bot taking 3.5 s per row never times out; at 8 s per row it does (96 timeouts); shop time per month is 270–360 s (last run 290 s).
- Every SDK message has exactly its protocol keys.

## Milestones

Each milestone ends with `node games/dragon-pawn/v2/test_headless.js` passing.

**M1 · Playable ledger.** Rules, generator, settle, arrivals and backlog, ledger and 对账 sheets, Excel chrome, boss key, sound, keyboard/mouse/touch, zoom.
Done when: a full month plays in a browser and the generator, settle, backlog, input, boss and balance tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic and losing months, `README.md`.
Done when: `pnpm game check dragon-pawn v2` passes.

**M3 · Release.** `pnpm game:local publish dragon-pawn v2 --yes`, browser check in normal and 伪装 mode, then production publish.
Done when: `/play/dragon-pawn` serves v2, 伪装 mode shows the ledger title and Excel icon, a logged-in month unlocks `full_month` and updates the stats board.

## Implementation notes

- Code: `games/dragon-pawn/v2/index.html` (one file, ~655 lines). Test: `node games/dragon-pawn/v2/test_headless.js`; package: `pnpm game check dragon-pawn v2` (Node 24).
- Cells are `{ t, al, b, size, fg, bg, span, chips, bar, u }`. A cell with `span` paints white across the spanned columns to hide gridlines, the way overflowing text looks in Excel; text is clipped to its cell or span.
- The status bar's `求和` and the formula bar never show profit, only cash paid out, so they do not leak which decisions were right (D7).
- The first frame's row is flagged with the arrival flash, which fades once `update` runs (animation time runs before the first decision; the shop clock does not).
- Bots in the balance test must not call `rng` between days, or later days' rows change between bots; the random bot uses its own `mulberry32(seed + 1000)`.
- Checked in headless Chrome at 1280 × 760 and 1100 × 700: first frame, a day-5 backlog of 5 with buttons, a mistaken day-1 对账, the month summary and the boss sheet all render as intended. Zoom lands at 105–150 % on desktop sizes.

## Open items

- Balance and pace come from bots, not people. Owner, M3 playtest: whether day 5 with 9 rules at 4.4 s per row feels tense but fair, and whether 3,000 is the right target (a player who misses 20 % of rows averages about 3,000).
- The lookalike marks (护/炉, 雷/霜, 用/月, 出/山, 昱/星, 电/龟) at 13 px × zoom. Owner, M3 browser check: swap any pair that is unreadable or identical in the system font.

### M3 notes (v2)

- Local publish registered v2 and the renamed catalog entry. On `/play/dragon-pawn` in 伪装 the tab read `典当登记台账_10月.xlsx - Excel`; the first frame is the ledger with day 1's two rules marked 今日新增 and the first row waiting.
- Row 01 (月匠, 印记 月, 行情 80, 要价 30) was accepted with a real click on `1 收`, and the cell became the green `收 30`. Esc swapped to the 销售汇总 decoy and the browser tab title followed it to `2026年度区域销售汇总_v3_终版.xlsx - Excel` (a fresh `disguise`), and back on the second Esc.
- The day clock and row arrivals looked slow in the browser pane only because the pane throttles `requestAnimationFrame` when it is in the background; the headless test covers timing.

