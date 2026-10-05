# 表格贪吃蛇 (`sheet-snake`)

**Status:** Implemented and published to production 2026-10-05 (`pnpm game publish sheet-snake v1`; www.moyufuns.com/play/sheet-snake). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

Snake that looks like office software. In the Excel skin the selected cell is the head, the body is a run of green conditional-format cells, food is a red cell and a timed bonus is a yellow cell, all inside a believable sales workbook. In the VS Code skin the cursor is the head, the selection is the body and food is a red error squiggle. `F2` switches skins, `Esc` hides everything, and there is no sound until `M`. Keyboard or swipe, single-player, rounds of one to three minutes.

This game is also the **reference implementation** of the Excel and VS Code chrome (`docs/design/office-camouflage.md` D7). Later disguised games copy its chrome sections.

Read first: `docs/design/office-camouflage.md` (binding: D2 `disguise`, D6 conventions, D7 chrome, D8 colours, D9 no logos), `docs/design/game-release.md` (package contract, `check`), `docs/design/accounts-achievements.md` → Game protocol, `docs/design/game-stats.md` → Protocol, `games/prototype-skins/index.html` (the approved look, variants C and D), `games/tile-stack/v1/` (SDK block, `resize()`, test stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/sheet-snake/v1/index.html`, vanilla JS and canvas, no dependencies. It starts from the prototype's variants C and D. The neon and pixel variants and the pink switcher bar are dropped. | The prototype's look is approved. Canvas lets one code path draw both skins at any size. |
| D2 | The chrome lives in three delimited sections: `画布小工具` (shared helpers), `// ---------- Excel chrome ----------` and `// ---------- VS Code chrome ----------`. Each skin has `<skin>ContentRect(box)`, which takes the window box and returns the game-area rect, and `draw<Skin>Chrome(ctx, box, ui)`, which draws everything outside that rect from a plain `ui` object. Game code never draws chrome. | D7 makes this the reference. Other games copy whole sections and fill `ui`, so the chrome cannot drift and holds no game state. |
| D3 | Rules are pure functions over one game object `g` (`newGame`, `turn`, `step`, `freeCell`). Randomness goes through `rng()` (`Math.random`, `mulberry32` in tests). Time moves only through `update(dt)`. | The headless test drives whole rounds without a canvas. |
| D4 | The grid size is fixed when a round is created, from the current skin's content rect: Excel `cols = clamp(floor(w / 72), 8, 26)`, `rows = clamp(floor(h / 22), 8, 30)`; VS Code one cell = 2 characters by one line, `cols = clamp(floor(w / 2ch), 12, 40)`, `rows = clamp(floor(h / 19), 8, 30)`. Excel cells stretch to fill the rect exactly. VS Code text stays at 13 px / 19 px and shrinks uniformly only when the grid does not fit. While the round is still `ready`, a resize or skin switch recreates it at the new size; during play the grid keeps its size. | Wide windows get more columns, as in a real sheet, while each round's rules stay fixed and testable. Entering the site's camouflage mode resizes the iframe, usually before the first key. |
| D5 | Walls are the sheet's visible edge in Excel, and the 80-column ruler plus the file's last numbered line in VS Code. | The player must be able to see the walls. A ruler at column 80 is a common editor setting. |
| D6 | The snake starts with length 3 at the grid centre, facing right. The first direction key, swipe, Space or tap starts it and sends `start`. A reverse direction before the start flips the snake instead of being ignored. During play, reversing is ignored, and up to 3 turns are queued. | Any first key counts as intent, and a player who presses ← first should not crash. The queue makes quick double turns reliable. |
| D7 | Speed: one step every `max(0.065, 0.15 − 0.004 × eaten)` s, where `eaten` counts normal food. Food is worth 10. | It reaches top speed at the 22nd food, about a minute in, so the ramp is felt every round. |
| D8 | Bonus: after every 4th normal food a bonus spawns on a free cell for 6 s of game time. It is worth `20 + 5 × ceil(ttl)` points (50 down to 25) and blinks in its last 2 s. Excel draws it as a neutral `#ffeb9c` / `#9c5700` cell whose value is its current points; VS Code draws a yellow `#cca700` squiggle. Eating it grows the snake but does not speed it up. | A visible countdown makes a detour a choice between risk and points, which is the replay hook beyond survival. |
| D9 | Death by wall shows `#REF!` in the head cell (bad format, Excel error triangle), `=SUM(#REF!)` in the formula bar and `公式引用无效    按空格重算` in the status bar. Death by self shows `循环引用: C7`. In VS Code the terminal prints `TypeError: Cannot read properties of undefined (reading 'x')` or `RangeError: Maximum call stack size exceeded` with a stack line pointing at the head, and the status bar shows `⊗ 1`. Space (or a tap) starts a new round. Filling the board ends the round as `full` with no error. | Errors are what these apps really show, so a crash reads as an ordinary mistake on screen. |
| D10 | Score and feedback stay inside the disguise. Excel: the name box shows the head's address, the formula bar `=SUM(<tail>:<head>)`, and the status bar `平均值 / 计数 (length) / 最大值 (best this session) / 求和 (score)`. VS Code: `⚠ <score>` in the status bar and on the 问题 badge, line and column of the head, and one `✓ <test name> (<points> ms)` line in the terminal per item eaten, with a `Tests: N passed` summary and `(最佳 N)`. An eaten cell flashes for 0.3 s. | Immediate feedback that a passer-by would read as normal app activity. |
| D11 | `Esc` is the boss key (office-camouflage D6). It freezes the game and draws the same window with no snake, food, bonus, flashes or scores: Excel shows A1 selected, `就绪` and an empty statistics area; VS Code shows the cursor at 1:1, `⊗ 0 ⚠ 0` and a `pnpm dev` terminal. `Esc` again shows the round, paused; the next direction key resumes it. Window blur also pauses. | Resuming straight into motion would crash the snake the moment the boss leaves. |
| D12 | `F2` toggles the skin at any time, including mid-round and in boss mode. It saves `sheet-snake:skin` in `localStorage` (errors ignored), sets `document.title` and sends `disguise`: `excel` / `2026年度区域销售汇总_v3_终版.xlsx - Excel` or `vscode` / `report.service.ts - moyufun-admin - Visual Studio Code`. | D2 of office-camouflage requires a new `disguise` on every skin change. Players keep the skin they chose. |
| D13 | Sound is off until `M`. Three short tones: eat, bonus, crash. | Office-camouflage D6. |
| D14 | Touch: a 24 px drag turns at once and re-anchors at the current point, so one continuous drag can make several turns; a tap without a drag acts as Space. Mouse drags work the same way. | Waiting for pointer-up makes swipes feel late in a fast game. |
| D15 | Achievements are all mid-round conditions and are emitted at the step that meets them (so always before `stats`/`end`). | No end-of-round bookkeeping, and the order is deterministic for the test. |

## Out of scope

Pause menu, difficulty settings, walls or obstacles inside the grid, wrap-around edges, high-score persistence across page loads, leaderboards, cross-round achievements, Word or other skins, sound effects beyond three tones.

## Architecture

### Package

```text
games/sheet-snake/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "sheet-snake",
  "name": "表格贪吃蛇",
  "shortDescription": "长得像 Excel 和 VS Code 的贪吃蛇，坐在工位上也能玩。",
  "description": "选中的单元格就是蛇头：用方向键在销售汇总表里穿行，吃掉标红的单元格变长，黄色单元格是限时奖励，越早吃分越高。越吃越快，撞墙就是 #REF!。按 F2 切换成 VS Code 代码编辑器，按 Esc 一键隐藏。",
  "tags": ["休闲", "贪吃蛇", "伪装", "单人"],
  "controls": [
    { "input": "方向键 / WASD", "action": "转向" },
    { "input": "滑动屏幕", "action": "转向" },
    { "input": "空格 / 轻点", "action": "开始 / 结束后重来" },
    { "input": "F2", "action": "切换 Excel / VS Code 外观" },
    { "input": "Esc", "action": "老板键：隐藏游戏并暂停" },
    { "input": "M", "action": "开启或关闭声音（默认关闭）" }
  ],
  "cover": { "symbol": "蛇", "eyebrow": "SHEET SNAKE", "accent": "#217346", "accentSecondary": "#007acc" },
  "sortOrder": 5,
  "achievements": [
    { "key": "len_10", "name": "小计", "description": "蛇身长到 10 格。", "symbol": "计" },
    { "key": "len_30", "name": "合计", "description": "蛇身长到 30 格。", "symbol": "合" },
    { "key": "bonus_3", "name": "超额完成", "description": "一局吃到 3 个黄色限时奖励。", "symbol": "超" },
    { "key": "full_speed", "name": "满负荷", "description": "达到最高速度。", "symbol": "满" },
    { "key": "score_500", "name": "季度冲刺", "description": "一局得到 500 分。", "symbol": "冲" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "foods", "name": "吃到", "maxPerRound": 1200 },
    { "key": "bonus", "name": "限时奖励", "maxPerRound": 1200 }
  ]
}
```

The largest grid is 40 × 30 = 1200 cells, which bounds both stats.

### Chrome (the reference for other games)

`box` is the window rect in CSS pixels (`{ x: 0, y: 0, w: clientWidth, h: clientHeight }`).

**Excel** (`XL` constants, `XL_FORMAT` = D8 colours):

| Band | Height | Contents |
| --- | --- | --- |
| Title bar | 32 | `#217346`; `自动保存 ◯ 关` (≥ 640 px wide), centred title (truncated with `…`), — ☐ ✕ |
| Ribbon | 28 + 64 | `#f3f3f3`; tabs `文件 开始 插入 页面布局 公式 数据 审阅 视图 帮助` with 开始 active; the 开始 groups (剪贴板 字体 对齐方式 数字 样式 单元格 编辑) as grey line icons, `等线` / `11` / `常规` boxes and glyph buttons, as many as fit. Below 560 px tall only the tabs row is drawn. |
| Formula bar | 30 | name box (90 px), `⋮ ✕ ✓ fx`, formula box |
| Column headers | 20 | letters `A…`, selected column `#d2d2d2` with a green bottom edge; row numbers in a 40 px column the same way |
| Cells | rest | gridlines `#e1e1e1`; vertical scrollbar 14 px on the right |
| Sheet tabs | 26 | ◀ ▶, tabs (active white, green bold, green underline), ⊕, horizontal scrollbar |
| Status bar | 24 | `#217346`; left status text; right statistics parts (dropped from the front when narrow), view icons and zoom slider (≥ 640 px), `100%` |

Functions: `excelContentRect(box)`, `drawExcelChrome(ctx, box, ui)` with `ui = { title, nameBox, formula, statusLeft, statusRight: string[], cols, rows, selCol, selRow, sheets: string[], activeSheet }`, `excelCellRect(rect, cols, rows, x, y)` (integer pixels, tiles the rect exactly), `excelColName(i)`, `drawExcelGridlines(ctx, rect, cols, rows)`, `drawExcelCell(ctx, r, text, { fill, color, bold, align })` (numbers right, errors centred, text left; a number that does not fit shows `###`, text is cut), `drawExcelSelection(ctx, r)` (2 px green frame and fill handle), `drawExcelErrorMark(ctx, r)`.

**VS Code** (Dark+, `VS` constants):

| Area | Size | Contents |
| --- | --- | --- |
| Title bar | 30 | `#3c3c3c`; menu `文件 编辑 选择 查看 转到 运行 终端 帮助` (`≡` below 760 px), centred title, — ☐ ✕ |
| Activity bar | 48 wide | `#333`; generic line icons (files active with a white edge, search, source control, run, extensions; account and gear at the bottom) |
| Explorer | 220 wide, only when ≥ 760 px | `#252526`; `资源管理器`, `▾ MOYUFUN-ADMIN`, file tree with the active file on `#37373d`, `▸ 大纲`, `▸ 时间线` |
| Tabs | 35 | `#252526` strip, active tab `#1e1e1e`, inactive `#2d2d2d`, `TS` / `{}` file marks |
| Breadcrumbs | 22 | `src › services › report.service.ts › summarize` |
| Editor | rest | 64 px gutter with line numbers (current line brighter), current-line frame `#282828`, Menlo/Consolas 13 px, line height 19 |
| Panel | `clamp(0.28 h, 96, 220)` | `问题` with a count badge, `输出`, `调试控制台`, `终端` (active); the last lines of `ui.terminal` |
| Status bar | 22 | `#007acc`; `⎇ main    ⊗ e  ⚠ w`; right `行 L，列 C    空格: 2    UTF-8    LF    TypeScript` (middle parts dropped when narrow) |

Functions: `vscodeContentRect(box)`, `drawVSCodeChrome(ctx, box, ui)` with `ui = { title, project, files, tabs, crumbs, lineCount, lineHeight, fontSize, cursorLine, problems, terminal: [{ text, color }], status: { branch, errors, warnings, line, col, language } }`, `drawCodeLine(ctx, line, x, y, chw)` (Dark+ TypeScript colours from a small regex tokenizer), `drawSquiggle(ctx, x, y, w, color)`, `drawCaret(ctx, x, y, h)`.

No vendor logos or product icons anywhere (office-camouflage D9).

### Disguise content

- `SHEET`: 30 rows × 26 columns (A–Z). Row 1 is `门店, 1月 … 12月, Q1 … Q4, 全年, 目标, 完成率, 同比, 环比, 排名, 负责人, 状态, 备注`; 29 stores below. Values come from a fixed hash and add up (quarters are sums of months, 全年 the sum of quarters, 排名 ranks 全年).
- `CODE`: 30 lines of a TypeScript `report.service.ts` (imports, a cache, `summarize`, `groupBy`), every line under 80 characters.

### Rules

`g = { cols, rows, snake: [{x, y}…] (head first), dir, queue, food, bonus: { x, y, ttl } | null, score, eaten, bonusEaten, gain, interval, acc, t, state: 'ready' | 'play' | 'over', cause }`.

- `newGame(cols, rows)`: snake `(⌊cols/2⌋, ⌊rows/2⌋)` plus two cells to its left, facing right, food on a random free cell.
- `freeCell(g)`: a uniformly random cell not on the snake, food or bonus; `null` when none.
- `turn(g, x, y)` (D6) returns whether the turn was accepted.
- `step(g)`: applies the next queued turn and moves the head. Returns `wall` (head left in place), `self` (moving into the tail cell is allowed because the tail moves away), `bonus`, `eat`, `full` (an eat after which neither food nor bonus can be placed) or `move`. Eating sets `gain`, adds score, grows the snake, re-places food and, for food, applies D7 and D8.
- `update(dt)` (flow): ages flashes; when `play` and not paused or boss, advances `t`, ages the bonus (on expiry, places food if there is none), and runs `step` every `interval` seconds.

### Flow and input

- `reset()`: new round at the current skin's grid size (D4), clears achievements, pause, flashes and the terminal log.
- `act(x?, y?)`: ignored in boss mode or `over`; queues the turn, clears pause, and on `ready` switches to `play` and sends `start`.
- `onStep(ev)`: on eat adds a flash and a terminal line, plays a tone and checks achievements; on `wall` / `self` / `full` calls `endRound`.
- `endRound(cause)`: `state = 'over'`, updates `best`, sends `stats` then `end`.
- Keys: arrows / WASD (by `code`, so any keyboard layout) → `act`; Space → `act()` or `reset()` after `over`; `Esc` → boss; `F2` → skin; `M` → sound. Arrows, Space, `Esc` and `F2` call `preventDefault`.
- Pointer: D14. Blur pauses and drops the drag.
- SDK: `ready` then `disguise` on load and again at 0.5, 2 and 5 s; `disguise` again on every `F2`.

### Achievements

Emitted through `unlockAchievement(key)` (once per round), checked after every eat in this order:

| key | Trigger |
| --- | --- |
| `len_10` | snake length ≥ 10 |
| `len_30` | snake length ≥ 30 |
| `bonus_3` | `bonusEaten ≥ 3` |
| `full_speed` | `interval` reached 0.065 s |
| `score_500` | `score ≥ 500` |

### Stats

In `endRound`, before `end`: `emitMoYuFunStats({ rounds: 1, foods: eaten + bonusEaten, bonus: bonusEaten })`.

### Headless test

`v1/test_headless.js` uses the 摸了个鱼 stub pattern with a recording `ctx` proxy (`measureText` = 7 px per character) and captured `keydown`, `blur` and canvas pointer listeners, at a 1280 × 720 viewport.

- **Load:** exactly `ready, disguise(excel, exact title)`; sound off; skin `excel`.
- **Layout:** Excel grid 17 × 22 and VS Code 40 × 21 at 1280 × 720; both skins give a non-empty content rect and an in-range grid at 375 × 667, 320 × 400, 960 × 600 and 2560 × 1440; `excelCellRect` tiles the rect; `SHEET` is 30 × 26.
- **Rules:** start position, reverse-before-start flip, no reverse or repeat in play, queue of 3, move, eat (score, length, speed), wall, self, tail chase, bonus spawn on the 4th food and its points, `full` on a 4 × 2 board, and 200 random rounds keeping the snake unique, in bounds and off the food.
- **Full round:** first arrow sends `start` (once). Feeding 24 food and each bonus right after it spawns gives score 540 and the sequence `start, len_10, bonus_3, len_30, full_speed, score_500, …, stats, end` with stats `{ rounds: 1, foods: 30, bonus: 6 }`, within the `game.json` caps. Death texts (`=SUM(#REF!)`, terminal error, `⊗ 1`) are checked.
- **Controls:** no restart by arrow after `over`; Space restarts and then starts; a straight run into the wall sends only `stats, end`; bonus expiry; boss mode freezes time and input and its texts carry no score, count or test log; leaving it pauses until a direction key; blur pauses; `F2` sends both `disguise` messages with exact titles and keeps the grid mid-round but re-sizes it at `ready`; `M` toggles; swipe turns and starts, a second swipe turns again, a tap restarts after `over`.
- **Drawing:** both skins in play, death, boss and at 375 × 667 run without errors.
- Every SDK message has exactly its protocol keys.

## Milestones

Each milestone ends with `node games/sheet-snake/v1/test_headless.js` passing.

**M1 · Playable.** Rules, both skins with the full chrome, input, boss key, sound, feedback.
Done when: both skins play in a browser at desk and phone sizes and the rule tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic tests, `README.md`.
Done when: `pnpm game check sheet-snake v1` passes.

**M3 · Release.** `pnpm game:local publish sheet-snake v1 --yes`, a browser check on local `/play/sheet-snake` including camouflage mode, then the production publish. The prototype is removed from the working tree (office-camouflage M3).
Done when: it plays locally and in production, and camouflage mode switches its tab title and icon on `F2`.

## Open items

- Speed curve and bonus timing (D7, D8) need a human playtest: whether 65 ms is too fast on wide Excel cells (each step crosses ~72 px horizontally but ~22 px vertically), and whether 6 s is enough to reach a bonus on a 26 × 30 grid. Owner, during M3.

## Implementation notes

- D1–D15 hold as written.
- The chrome code paints full-window bands every frame; there are no redraw caches, so no stale-cache sentinel is needed.
- `CHAR_W` is measured once from `13px` Menlo/Consolas at load; the headless stub reports 7 px, which is why the test's VS Code grid is 40 wide at 1280 px.
- Narrow layouts were checked in headless Chrome inside fixed-size iframes (headless Chrome enforces a minimum window width, so `--window-size=375,…` alone gives a clipped, wider viewport). Checked: 1280 × 720 both skins in play, death and boss; 375 × 667 both skins; 520 × 420 VS Code paused; 900 × 480 Excel with the collapsed ribbon. Real touch devices were not used.
- Headless Chrome resizes the viewport after scripts run, so a round started by an injected script kept its first grid size and stretched (tall Excel rows) — the D4 mid-round rule working as intended. In a real iframe the size is known at load, and the site's camouflage resize happens while the round is still `ready`.
- `localStorage` is per origin, so the skin chosen in one tab is the starting skin in every later load of the game, including the site's iframe.

### M3 notes

- Local publish registered the game. On `/play/sheet-snake` with the camouflage preference on, the page entered 伪装 on load with the tab title `2026年度区域销售汇总_v3_终版.xlsx - Excel`; the first frame is a full workbook with the hint `方向键开始 · F2 切换视图 · Esc 隐藏` in the status bar.
- F2 inside the iframe switched to the VS Code skin and the tab title followed (`report.service.ts - moyufun-admin - Visual Studio Code`); the arrow key started the snake as a code selection.
- The prototype `games/prototype-skins/` was moved to branch `prototype/office-skins` and removed from `main`, as `docs/design/office-camouflage.md` M3 says.

