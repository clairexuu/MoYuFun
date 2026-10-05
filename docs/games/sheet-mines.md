# 表格扫雷 (`sheet-mines`)

**Status:** Implemented and published to production 2026-10-05 (`pnpm game publish sheet-mines v1`; www.moyufuns.com/play/sheet-mines). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

Minesweeper disguised as an Excel reconciliation sheet. The minefield is a block of grey cells in `供应商对账明细_2026Q3.xlsx`; revealed numbers look like conditionally formatted figures, flags are bad-red cells with a comment marker, and a mine shows `#N/A`. The first click is always safe and opens an area, and every board is generated so that it can be cleared by logic alone. Three difficulties are three sheet tabs. Mouse, keyboard or touch, single-player.

Read first: `docs/design/office-camouflage.md` (D2 `disguise`, D6 conventions, D7 Excel chrome, D8 colours, D9 no logos), `docs/design/game-release.md` (package contract, `check`), `docs/design/accounts-achievements.md` → Game protocol, `docs/design/game-stats.md` → Protocol, `games/prototype-skins/index.html` variant C (chrome source), `games/tile-stack/v1/` (SDK block, repeated `ready`, `resize()`, headless stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/sheet-mines/v1/index.html`, vanilla JS on one full-window canvas. The Excel chrome is copied from the prototype's variant C and refined (window controls, undo/redo glyphs, name-box arrow, `✕ ✓ fx`, sheet-tab arrows, zoom slider, collapsed ribbon below 520 px height). | The prototype is the approved look; canvas draws chrome and grid with one code path and no DOM layout surprises inside the iframe. |
| D2 | The sheet always fills the window. The grid area zooms (5 % steps, 10 %–140 %) so the whole board plus two header rows fits; the zoom shows in the status bar like Excel's. Columns and rows past the board are drawn empty to the window edge. | A real Excel window never letterboxes; zoom is how Excel itself fits a range. |
| D3 | Cell encoding (D8 colours): hidden = `#e7e6e6` (Office theme "Background 2") with white borders; revealed number = right-aligned bold digit, 1 `#0070c0`, 2 `#008a3e`, 3 `#c00000`, 4 `#7030a0`, 5 `#9c5700`, 6 `#008080`, 7 `#404040`, 8 `#808080`; revealed 0 = blank white cell; flag = `#ffc7ce` fill with a red comment triangle; hit mine = `#N/A` in `#9c0006` on `#ffc7ce`; other mines after a loss = `#N/A` on grey; wrong flags after a loss = `#REF!` on `#ffeb9c`; after a win every mine turns `#c6efce`, row by row. | Everything reads as ordinary formatting. `#f2f2f2` (the brief's first suggestion) was too close to white to tell hidden from revealed blanks in a screenshot; the white borders make cells countable, like a styled input range. |
| D4 | First click: mines are never placed on the clicked cell or its 8 neighbours, so it is always a 0 and floods open. Mines are placed lazily on that click. | Classic "safe start", and a guaranteed opening area. |
| D5 | **No-guess boards.** `generateBoard` places mines with `rng()` and runs a deterministic solver from the first click; it repeats until the solver clears the board, up to `MAX_ATTEMPTS = 1000`. If none succeeds, the last board is used (`noGuess = false`). Solver rules: (1) single cell: remaining mines 0 → all unknown neighbours safe; = unknown count → all mines. (2) pairs, including subsets: for overlapping constraints A, B within 2 cells, if `B.m − A.m = |B∖A|` then `B∖A` are mines and `A∖B` safe. (3) global count: remaining mines 0 → all unknown safe; = unknown count → all mines. | Guessing is the least fun part of minesweeper. Measured success rates (50 boards each): 初级 1.2 attempts avg (max 2), 中级 1.6 (max 5), 高级 9.1 (max 57), about 2 ms per 高级 board, so 1000 attempts (~250 ms worst case) is effectively never reached; the fallback only keeps the game from hanging. |
| D6 | Primary action `act(i)`: hidden → reveal (flood fill on 0); revealed number whose flagged neighbours equal it → chord (reveal the other hidden neighbours); after a round ends → new board on the same sheet (ignored for 0.4 s after the end). Flagged cells cannot be revealed. Flags are not allowed before the first click. | One action covers click, Space and Enter; the 0.4 s guard stops a double-click from skipping the result. |
| D7 | Input: left click / tap reveals on release (same cell only); right click flags on press; touch long-press (0.45 s, timed in `update(dt)`) flags; arrows move the selected cell, Space/Enter act, F flags; sheet tabs or PageUp/PageDown change difficulty. Window blur and `pointercancel` drop a held press. | Desktop players get classic controls, touch players get long-press, keyboard players can play blind of the mouse. Long-press is touch/pen only so slow mouse clicks never flag. |
| D8 | Rounds: `start` on the first reveal of a board. A round ends on win or loss (`achievement…`, `stats`, `end`), or when the player switches sheet mid-round, which counts as a loss (`stats` with `wins: 0`, `end`). | The lifecycle ignores a second `start` while a round is open, so an abandoned round must be closed; counting it keeps `rounds` honest. |
| D9 | Status bar: left is `就绪` plus a short state hint; right is `平均值` = progress (opened / safe cells), `计数` = mines minus flags, `求和` = whole seconds. A flood of ≥ 12 cells briefly shows `计算(4 个处理器): 100%`. Formula bar: hidden cell `=IFERROR(VLOOKUP($A{row},台账!$A:$AF,{col},FALSE),"")`, flag `="待核实"`, revealed `=COUNTIF({3×3 range},"#N/A")` (the true neighbourhood, clipped to the board), mine after a loss `=NA()`. | The counters are what minesweeper needs, dressed as Excel's own aggregate readout; the formula bar reacts to the selection with formulas that are literally true. |
| D10 | Feedback stays office-plausible: newly revealed cells fade in from `#bdd7ee` with a 15 ms-per-step ripple from the click; flags flash the same way; a loss staggers `#N/A` outward from the hit; a win sweeps the mines green. Sound is off until `M`: a short tick per reveal (pitch rises with flood size), a softer tick per flag, a low buzz on loss, a rising tone on win. | Satisfying but small, the kind of redraw a recalculating sheet does. |
| D11 | Esc (boss key) freezes the timer, blocks all input but Esc, and draws a different document: `供应商对账汇总` with 22 fictional suppliers, balances, a `差异` column and `已核对` / `待核实` status cells, sheet tabs `汇总 明细 Q3对账`, A1 selected, plausible 平均值/计数/求和. Esc again returns. | D6 of office-camouflage; the board and difficulty tabs must not be visible at all. |
| D12 | `rng()` wraps a `mulberry32` seeded from `Math.random`; `setSeed(n)` reseeds for tests. The board is re-generated per round, not per day. | Deterministic tests; endless fresh boards are the replay reason. |
| D13 | Everything is redrawn every frame from current state; `geom()` is recomputed for both drawing and hit tests. | No cached layout that could go stale after a resize or sheet switch. |

## Out of scope

Best times saved across page loads, custom board sizes, a `?` mark, undo, daily seeds, leaderboards, scrolling the sheet (the board always fits by zoom), a VS Code skin, mobile-specific layout (hard mode on a phone is tiny).

## Architecture

### Package

```text
games/sheet-mines/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "sheet-mines",
  "name": "表格扫雷",
  "shortDescription": "藏在对账表里的扫雷，每一盘都能纯靠推理解开。",
  "description": "看起来是一份供应商对账明细，其实是扫雷。灰色单元格是待核对的数据，翻开后的数字是周围藏着的 #N/A 个数。第一下一定安全并展开一片，每一盘都保证不用猜，只靠推理就能清完。初级、中级、高级三张工作表，状态栏的计数是剩余雷数，求和是用时。按 Esc 一键切回正经报表。",
  "tags": ["益智", "扫雷", "单人"],
  "controls": [
    { "input": "左键 / 轻触", "action": "翻开单元格；点满足条件的数字展开周围" },
    { "input": "右键 / 长按 / F", "action": "标记或取消标记" },
    { "input": "方向键 + 空格 / Enter", "action": "移动选中格并翻开" },
    { "input": "工作表标签 / PageUp / PageDown", "action": "切换初级、中级、高级" },
    { "input": "Esc", "action": "老板键：切到普通报表，再按一次回来" },
    { "input": "M", "action": "打开或关闭声音（默认关闭）" }
  ],
  "cover": { "symbol": "雷", "eyebrow": "SHEET MINES", "accent": "#217346", "accentSecondary": "#ffc7ce" },
  "sortOrder": 15,
  "achievements": [
    { "key": "win_easy", "name": "初审通过", "description": "赢下一局初级。", "symbol": "初" },
    { "key": "win_medium", "name": "复核通过", "description": "赢下一局中级。", "symbol": "复" },
    { "key": "win_hard", "name": "终审通过", "description": "赢下一局高级。", "symbol": "终" },
    { "key": "no_flags", "name": "心中有数", "description": "一个标记都不插，赢下中级或高级。", "symbol": "心" },
    { "key": "quick_easy", "name": "手快", "description": "20 秒内赢下初级。", "symbol": "快" },
    { "key": "quick_hard", "name": "准点下班", "description": "5 分钟内赢下高级。", "symbol": "准" },
    { "key": "batch", "name": "批量处理", "description": "一局内用数字展开周围 15 次。", "symbol": "批" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "获胜", "maxPerRound": 1 },
    { "key": "cells", "name": "翻开格子", "maxPerRound": 381 }
  ]
}
```

### Levels

| Sheet tab | Columns × rows | Mines |
| --- | --- | --- |
| 初级 | 9 × 9 | 10 |
| 中级 | 16 × 16 | 40 |
| 高级 | 30 × 16 | 99 |

The page opens on 初级.

### Sheet layout

- Chrome (fixed size): title bar 34 px `#217346` with `供应商对账明细_2026Q3.xlsx - Excel` centred (hidden under 520 px width); ribbon 64 px (30 px tabs-only when the window is under 520 px tall); formula bar 34 px; column letters 22 px; row numbers 40 px; sheet tabs 28 px; status bar 24 px.
- Grid at 100 %: column A 96 px (60 px when the window is under 600 px wide), board columns 36 px, rows 22 px, text 11 px; all scale with zoom.
- A1: `供应商对账明细（2026Q3，单位：元）` (bold, overflows to the right). Row 2: `供应商编号`, then `7/1` … `7/{cols}` on `#ddebf7`. Column A from row 3: `GYS-1001`, `GYS-1008`, … (step 7). The board occupies B3 onward.
- Name box: the selected board cell's address (`B3` at start).

### Screens and copy

All in the status bar (no overlays):

| State | Left text |
| --- | --- |
| Before the first click | `就绪    单击灰色单元格开始核对；右键标记` |
| Playing | `就绪` (or the flood / sound note for ~1 s) |
| Won | `就绪    核对完成，用时 {s} 秒；单击表格再来一份` |
| Lost | `#N/A 引用错误；单击表格重新核对` |
| `M` pressed | `声音: 开` / `声音: 关` |

When the left text is long, the right-hand figures drop `平均值`, then disappear, rather than overlap.

### Functions

Pure rules (no DOM, no globals except `HIDDEN/OPEN/FLAG`):

- `neighbors(cols, rows, i) → index[]`
- `placeMines(cols, rows, mines, first, rnd) → Uint8Array`
- `countAdj(cols, rows, mine) → Int8Array`
- `solves(cols, rows, mine, first) → boolean` (throws if a rule ever opens a mine)
- `makeBoard(level) → { cols, rows, mines, mine, adj, st, opened, flags, hit, attempts, noGuess }`
- `generateBoard(b, first, rnd, maxAttempts = 1000)`
- `openCells(b, i) → [[index, depth]…]` (sets `b.hit` on a mine)
- `toggleFlag(b, i) → boolean`
- `chordCells(b, i) → [[index, depth]…] | null`

Game layer: `newRound(level)`, `switchLevel(level)`, `abandon()`, `act(i)`, `flag(i)`, `win()`, `lose()`, `toggleBoss()`, `update(dt)` (seconds; advances `clock`, `gameT` while playing and not in boss mode, notes, long-press), `draw()`, `geom()`, `cellRect(c, r)`, `cellAt(x, y)`, `tabAt(x, y)`, `rng()`, `setSeed(n)`.

### Achievements

Sent through `unlock(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `batch` | The 15th chord in a round that opened at least one cell (sent mid-round). |
| `win_easy` / `win_medium` / `win_hard` | `win()` on that level. |
| `no_flags` | `win()` on 中级 or 高级 with no flag placed this round. |
| `quick_easy` | `win()` on 初级 with `gameT ≤ 20`. |
| `quick_hard` | `win()` on 高级 with `gameT ≤ 300`. |

Win order: `win_*`, `no_flags`, `quick_*`.

### Stats

At win, loss or abandon, before `end`: `emitMoYuFunStats({ rounds: 1, wins: 0|1, cells })`, where `cells` is the number of safe cells opened this round (max 30 × 16 − 99 = 381).

### SDK

`announce()` = `ready` then `disguise('excel', TITLE)`, on load and at 0.5, 2 and 5 s. `TITLE` never changes (the boss sheet keeps the same file name).

### Headless test

`v1/test_headless.js` stubs canvas, window and `setTimeout` (recording timers and handlers) and evals the inline script with a driver that checks:

- Load: `ready, disguise`; the three timers repeat the pair; the disguise has exactly five keys; sound starts muted.
- Rules: `neighbors`, `colName`; a hand-built 50/50 (2 × 3, one mine in the last row) is reported unsolvable and the two-mine variant solvable by the global rule; 15 seeds × 3 levels generate no-guess boards with the right mine count, a 0 first click, and a flood of more than one cell; the attempt cap falls back with `noGuess = false`.
- Rounds: 初级 clean win → `start, win_easy, quick_easy, stats, end`, stats `{1, 1, 71}`; 中级 → `start, win_medium, no_flags, stats, end`; 高级 with a flag and `update(301)` → `start, win_hard, stats, end`, cells 381; 高级 with 15 chords → `start, batch, win_hard, quick_hard, stats, end`.
- Unsatisfied chord does nothing; a mine → `stats(wins 0), end`, `#N/A`, `=NA()`, 0.4 s restart guard; wrong flags + chord → loss and `#REF!`.
- Sheet switch mid-round → `stats, end`; idle switches send nothing.
- Boss key freezes `gameT`, blocks input, shows the A1 document; Esc resumes.
- Keyboard (arrows clamp, name box, Space, F, M, PageDown) and pointer (left click, right click, touch long-press, blur release, mouse hold does not flag, drag-off does not reveal, tab click ends the round).
- At 1280×720, 1100×620, 800×600, 375×667, 1920×1080 the whole board of each level fits above the sheet tabs, and `cellAt` hits the last cell at every size including 320×240.

## Milestones

Each milestone ends with `node games/sheet-mines/v1/test_headless.js` passing.

**M1 · Playable.** Rules, solver, generator, three sheets, chrome, input, boss key, sound.
Done when: all three levels play in a browser and the rule tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, `README.md`, full headless test.
Done when: `pnpm game check sheet-mines v1` passes.

**M3 · Release.** `pnpm game:local publish sheet-mines v1 --yes`, browser check including camouflage mode, then production publish (coordinator).
Done when: `/play/sheet-mines` plays locally and in production, `伪装` appears and works, and a logged-in win unlocks `win_easy` and updates stats.

## Open items

- Time thresholds (`quick_easy` 20 s, `quick_hard` 300 s) and the `batch` count (15) need a human playtest; change them in `win()` / `act()` and `game.json` together.
- Whether the default `#e7e6e6` hidden fill is too conspicuous on a real monitor (owner, during M3).

## Implementation notes

- The solver is the generator's gate, so its soundness matters more than its strength: it throws if a rule ever opens a mine, and the test runs it on 45 generated boards.
- `openCells` marks cells `OPEN` when queued, so a flood never queues a cell twice; flagged cells stop the flood (classic behaviour).
- Reveal animation is render-only: the state is updated immediately and `flashAt[i]` holds when the cell may be drawn as open, so rules and tests never wait for animation.
- The timer is the sum of `update(dt)` with `dt` capped at 0.1 s; a hidden tab stops `requestAnimationFrame`, so time away from the tab is not counted.
- The prototype's `innerWidth` sizing was replaced with `document.documentElement.clientWidth/Height` (tile-stack's fix for phones).

### M3 notes

- Local publish registered the game, its achievements and stats. With the camouflage preference on, `/play/sheet-mines` entered 伪装 on load and the tab read `供应商对账明细_2026Q3.xlsx - Excel`.
- Played 初级 with real clicks: the first click opened an area, a right-click flagged a provable mine (red fill, comment triangle, `="待核实"`, no browser context menu, 计数 10 → 9), and clicking the satisfied number chorded the remaining neighbour. Esc showed the 供应商对账汇总 sheet with no game traces. `game_ready`, `game_start` and heartbeats reached the local events table; no console errors. No account was logged in, so achievements were covered by the headless test only.
- Gotcha for automated testing: right after a right-click in the browser pane, the next synthetic key press can be swallowed; a second press works. Real keyboards were not affected.

