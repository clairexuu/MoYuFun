# 表格 2048 (`promotion-2048`)

**Status:** v2 implemented and published to production 2026-10-05 (`pnpm game publish promotion-2048 v2`; www.moyufuns.com/play/promotion-2048). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

2048 hidden in an Excel budget sheet. The 4 × 4 board is the block C4:F7 of a quarterly budget table; tile values are ordinary numbers with a 3-colour-scale conditional format, and the totals, shares, formula bar and status bar react to every move. Keyboard or swipe, single-player. This is version `v2`, the Excel reskin planned as M4 of `docs/design/office-camouflage.md`.

**History.** v1 (published 2026-09-30) was 升官记, the same game with job titles (实习生 … 财务自由) on a beige board. It stays published and immutable in `games/promotion-2048/v1/`. Its achievement and stat keys are kept so earned achievements and totals carry over; only their names changed.

Read first: `docs/design/office-camouflage.md` (binding: D2 `disguise`, D6 conventions, D7 Excel chrome, D8 colours, D9 no logos), `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/promotion-2048/v1/index.html` (rules), `games/prototype-skins/index.html` variant C (chrome), `games/tile-stack/v1/` (`resize()`, canvas test stub).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/promotion-2048/v2/index.html`, vanilla JS, **canvas** (v1 was DOM). The Excel chrome is copied from the prototype's variant C and refined. | The chrome must fill the window like a real app, and the prototype's canvas code is the approved look. `update(dt)`/`draw()` make animations testable headlessly. |
| D2 | `slide` and `canMove` are copied verbatim from v1. The board still stores levels (`0` empty, value `2^level`); the score adds `2^level` per merge. | The rules are tested and unchanged; only the skin is new. |
| D3 | The board is C4:F7 of a table B3:H8: header row 成本中心 / Q1 / Q2 / Q3 / Q4 / 合计 / 占比, rows 研发中心 / 市场部 / 销售部 / 行政部, a bold 合计 row 8. G, H and row 8 are computed live from the board. Empty board cells show `-` (accounting format for zero). | Live totals make every move change more than four cells, which reads as real spreadsheet work and gives feedback. |
| D4 | Board fills use a 3-colour number scale: value 2 = `#ffffff`, 64 = `#ffeb84`, 2048 = `#63be7b`, interpolated per level in RGB; values above 2048 stay green. Text stays `#222`. | A colour scale on a numeric block is everywhere in real budgets (D8 of the camouflage doc). Fixed number points keep a tile's colour stable as the board changes. |
| D5 | The rest of the sheet is static: a title and meta line (rows 1–2), C10 累计核减 = score, C11 历史最佳 = best score, and from row 13 a 费用明细 table (日期, 部门, 科目, 金额, 状态 with good/neutral/bad fills, 凭证号, 备注) generated from a fixed hash for rows 15–80. | A sheet that is only a 4 × 4 block looks wrong; plausible surrounding data is the camouflage. |
| D6 | Zoom: column widths and row heights scale by a zoom chosen to fit columns A–H and rows 1–11 (A–F when narrower than 90%), rounded down to 10% and clamped to 60–150%, and shown in the status bar. | The play area scales with the window the way real Excel zoom does; the cap at 150% keeps the sheet looking like a sheet. |
| D7 | Animation: for 90 ms after a move, every tile is drawn as its old coloured cell easing (`p(2−p)`) from its old cell to its new one. Then the new board is drawn; merged cells flash (green tint and border fading over 350 ms) and the spawned value fades in over 150 ms. The C10 score and status-bar 求和 tick toward the score. A key pressed during an animation is applied at once and replaces the animation. | Small, plausible movement; no input is ever dropped (v1 dropped keys pressed during its 100 ms slide). |
| D8 | After a move with merges, the selection jumps to the largest merged cell and the formula bar shows the two source cells, e.g. name box `C4`, `=C4+D4`. After a move without merges, or an undo, it returns to C10 with `=SUM(合并记录!C:C)`. | The formula bar reacts to play and explains the merge in spreadsheet terms; `合并记录` is a real sheet tab. |
| D9 | Status bar: `就绪` (plus `方向键 / 滑动开始 · Esc 隐藏` before the round's first move), then `撤销 1|0`, `平均值`, `计数` (non-empty cells), `最大值` (highest tile) and `求和` (= score), then a zoom slider and `NNN%`. On narrow windows items are dropped from the left; `求和` always stays. | Real Excel shows these aggregates; the brief maps 求和 to the score and 最大值 to the top tile. |
| D10 | One undo per round, one move deep, as in v1: `Ctrl+Z`, `Cmd+Z`, plain `Z`, or the ↶ in the title bar. Shift/Alt+Z do nothing. | Same rule as v1, on Excel's own shortcut. |
| D11 | New round: `Ctrl+N`/`Cmd+N`, `R`, or the 功能区 `新建` button. | Browsers reserve `Ctrl+N` in many setups (it opens a window), so `R` and the button are the reliable paths. |
| D12 | Game over is a modal Excel-style dialog (caption `Microsoft Excel`, yellow warning triangle): `无法完成此操作。` / `区域 C4:F7 中已没有可以合并的单元格（最大值 N，累计核减 S）。` with `确定` (Enter/Space/click) starting a new round. | A believable dialog instead of a game-over screen. |
| D13 | Reaching 2048 opens an info dialog: `C4:F7 中的值已达到 2,048。` / `是否继续计算？选择“停止”将保存当前结果。` with `继续(C)` and `停止(S)`. Both count as a win. `停止` ends the round and shows `计算已完成，结果已保存。` / `累计核减 S，最大值 N。` with `确定` to restart. | v1's 继续卷 / 退休 choice in Excel's voice. |
| D14 | Camouflage conventions (office-camouflage D6): `Esc` toggles the boss key, which freezes animation, hides the dialog, replaces C4:F7 with fixed plain budget numbers (no colour scale), C10/C11 with fixed figures, selects B1 and leaves only `就绪` in the status bar; all input except `Esc` is ignored. Sound is off until `M`. No title screen. | Same conventions as every disguised game. |
| D15 | `ready` is sent on load and at 0.5, 2 and 5 s, each followed by `emitMoYuFunDisguise('excel', 'Q4预算测算_财务部_v7.xlsx - Excel')`. `start` is sent on a round's first move. The title never changes. | v1's D8 (lost single `ready`) plus the disguise protocol. |
| D16 | The best score is kept in `localStorage` key `moyufun:promotion-2048:best` (read and written in try/catch; written at round end). | A reason to replay without any server feature. Storage failure just shows 0. |
| D17 | Input: arrow keys/WASD without Ctrl/Meta/Alt; Pointer Events on the canvas, where a drag over 30 px is a swipe on the dominant axis and a shorter one is a click hit-tested against regions rebuilt every frame. While a dialog is open, only its buttons respond to clicks. Window blur and `pointercancel` drop a half-finished swipe. | One path for mouse and touch; hit regions from the current frame cannot be stale. |

## Out of scope

Board sizes other than 4 × 4, more than one undo, saving the board between page loads, a VS Code skin, editable cells or a real cell cursor, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/promotion-2048/
  game.json
  v1/…                      published 升官记, untouched
  v2/index.html
  v2/test_headless.js
  v2/README.md
```

`game.json` (shared by both versions; publishing v2 renames the game in the catalog):

```json
{
  "slug": "promotion-2048",
  "name": "表格 2048",
  "shortDescription": "伪装成 Excel 预算表的 2048，老板路过按 Esc。",
  "description": "棋盘藏在一张季度预算表里：方向键滑动，两个相同的数合并成两倍，条件格式色阶随数字变绿，合计和占比实时更新。每局可以 Ctrl+Z 撤销一步，合成 2048 后可以继续算下去。默认静音，Esc 一键切回正常表格。",
  "tags": ["益智", "2048", "单人"],
  "controls": [
    { "input": "方向键 / WASD", "action": "滑动" },
    { "input": "拖动 / 滑动屏幕", "action": "滑动" },
    { "input": "Ctrl+Z / Cmd+Z", "action": "撤销一步（每局一次）" },
    { "input": "Ctrl+N / R / 功能区「新建」", "action": "新开一局" },
    { "input": "Esc", "action": "老板键：切回普通表格" },
    { "input": "M", "action": "打开或关闭声音（默认关闭）" }
  ],
  "cover": { "symbol": "表", "eyebrow": "2048", "accent": "#217346", "accentSecondary": "#63be7b" },
  "sortOrder": 60,
  "achievements": [
    { "key": "manager", "name": "合成 32", "description": "合成 32。", "symbol": "32" },
    { "key": "ceo", "name": "合成 512", "description": "合成 512。", "symbol": "百" },
    { "key": "freedom", "name": "合成 2048", "description": "合成 2048。", "symbol": "千" },
    { "key": "double", "name": "双倍合并", "description": "一步之内合成两个 64 或更大的数。", "symbol": "双" },
    { "key": "no_undo", "name": "零撤销", "description": "不撤销合成 512。", "symbol": "稳" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "合成 2048", "maxPerRound": 1 },
    { "key": "merges", "name": "合并", "maxPerRound": 20000 }
  ]
}
```

### Screen layout (CSS px)

- **Title bar** 0–34, `#217346`: save glyph, ↶ (undo, clickable, dimmed when unavailable), ↷ (dimmed), centred title truncated with `…`, window glyphs `— ☐ ✕` when wider than 360 px.
- **Ribbon** 34–98, `#f3f3f3`: tabs 文件 … 帮助 with 开始 active; groups 新建 (clickable), 粘贴, font box 等线 / 11 / B I U, 条件格式 / 套用表格格式, Σ 自动求和 / 排序和筛选, drawn while they fit.
- **Formula bar** 98–132: name box, `✕ ✓ fx`, formula text.
- **Grid** from 132: 22 px column header, 36 px row header, base column widths A 18, B 84, C–F 80, G 88, H 70, others 72; row 1 is 32, others 24; all × zoom. Gridlines `#e1e1e1`, table borders `#a6a6a6`, header fill `#e2efda`, a dark rule above 合计. The active cell has a 2 px green border with a fill handle and highlights its column and row headers.
- **Bottom 50 px:** sheet tabs `Q4测算` (active), `合并记录`, `明细`, `⊕`; green status bar (D9).
- **Dialog:** centred, `min(420, W − 24)` wide, white with a shadow, caption `Microsoft Excel` and `✕`, icon, wrapped text, right-aligned 88 × 26 buttons; the first is the default (green border).

### Functions

- `slide(board, dir)`, `canMove(board)`: pure, from v1.
- `scaleColor(level)`: pure, D4.
- `cellAt(col, row, values)`: pure description of a static or computed cell (`{ t, align, bold, fill, color, size }` or `null`).
- `move(dir)`: ignored while `over`, a dialog is open or the boss key is on. Otherwise as v1: `slide`; if nothing moved, nothing happens; `start` on the round's first move; save `{ board, score }` for undo; apply, spawn, set `anim` and the active cell (D8); run achievement checks; open the 2048 dialog; `endRound()` if no move is possible.
- `undo()`, `retire()` (停止), `continueWork()` (继续), `endRound(retired)`, `startGame()`.
- `update(dt)`: advances `anim.t` and the ticking score; does nothing while the boss key is on.
- `draw()`, `resize()`, `onKey(e)`, `clickAt(x, y)`.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`, checked in `move` after the merge. Triggers are v1's, by level.

| key | Name | Trigger |
| --- | --- | --- |
| `manager` | 合成 32 | `merged` contains level 5 (32). |
| `double` | 双倍合并 | `merged` has ≥ 2 entries at level ≥ 6 (64). |
| `ceo` | 合成 512 | `merged` contains level 9 (512). |
| `no_undo` | 零撤销 | `merged` contains level 9 and the undo has not been used. |
| `freedom` | 合成 2048 | `merged` contains level 11 (2048). Sets `won` and opens the D13 dialog. |

### Stats

In `endRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: won ? 1 : 0, merges: Math.min(merges, 20000) })`. `endRound()` runs on no moves, on 停止, and on a new round started mid-round after at least one move. A new round before any move sends nothing.

### Headless test

`v2/test_headless.js` uses tile-stack's canvas stub (a `Proxy` context whose `measureText` returns 7 px per character), a stub `localStorage`, and a seeded `rng`.

- **Load:** exactly `ready, disguise`, with `app: 'excel'` and the title; sound starts muted; the first `draw()` runs.
- **`slide` table** (v1's four cases × four directions), `canMove`, and the `scaleColor` end points.
- **Simulation:** 20 random rounds until no move, calling `update`/`draw` through animations; levels stay 0–11; each round ends with the `over` dialog and `stats, end`; the best score is saved.
- **Dialog click:** the `确定` region from the last `draw()` starts a new round.
- **Deterministic round** with spawning stubbed into a corner: `[4,4]`, `[5,5]×2`, `[8,8]`, `[10,10]` moved left, then `S`. Expected `start, manager, double, ceo, no_undo, freedom, stats, end`, stats `{ rounds: 1, wins: 1, merges: 5 }`; the first merge sets the active cell to `C4` / `=C4+D4`; moves are ignored while the 2048 dialog is open; `Enter` then restarts. `C` continues a round after 2048.
- **Undo:** `Cmd+Z` restores board and score exactly; a second `Ctrl+Z` does nothing; a 512 after an undo sends only `ceo`.
- **Boss key:** `Esc` freezes `anim.t`, blocks moves, undo and clicks, and draws no dialog; `Esc` again resumes and the animation and score finish.
- **Keys:** `Ctrl+A` does not move, `A` does; `M` unmutes; `Ctrl+N` mid-round sends `stats, end` with `wins: 0`; the `新建` region with no move sends nothing; the next move sends `start`.
- **Sizes:** 320×260, 375×667, 800×600, 1920×1080 and 3000×400 all lay out with zoom in 0.6–1.5 and draw with and without a dialog.
- Every message has exactly the protocol keys.

## Milestones

Each milestone ends with `node games/promotion-2048/v2/test_headless.js` passing.

**M1 · Playable sheet.** Chrome, sheet content, board rendering with colour scale, animations, input, dialogs, boss key.
Done when: a round plays in a browser with keys and swipes, and the `slide` table passes.

**M2 · Achievements, stats, package.** `game.json` renamed, emission, deterministic tests, `README.md`.
Done when: `pnpm game check promotion-2048 v2` passes.

**M3 · Release.** `pnpm game:local publish promotion-2048 v2 --yes`, a browser check including camouflage mode, then the production publish.
Done when: `/play/promotion-2048` plays v2 locally and in production, `伪装` appears and works, and a logged-in round unlocks `manager`.

## Open items

- Playtest at real desk sizes whether 150% max zoom feels right, and whether the 90 ms slide reads as movement or as flicker. Owner, at M3.

## Implementation notes

- After `switch` back to v1 the catalog still says 表格 2048 with the new achievement names (game-release D8); the keys mean the same thing in both versions.
- `Ctrl+N` is usually swallowed by the browser before the page sees it (opens a new window); that is why `R` and the ribbon button exist (D11).
- Headless Chrome screenshots at narrow sizes need a wrapper page with a 375 px iframe: `--window-size` below ~500 px still lays out at the minimum window width.
- Drawing redraws the whole canvas every frame; there is no "changed" cache to go stale. If CPU use in an idle tab ever matters, skip `draw()` when nothing changed.
- The random simulation reaches 256 at best; reaching 2048 is covered by the deterministic round.

### M3 notes

- Local publish registered v2 and the renamed catalog entry (表格 2048, renamed achievements and stats). On `/play/promotion-2048` the toolbar showed `伪装`; turning it on filled the window, set the tab title to `Q4预算测算_财务部_v7.xlsx - Excel` and swapped the icon; the hover strip's `退出伪装` restored both, and with the preference saved a reload re-entered camouflage on the first `disguise`.
- Played with real keys inside camouflage: tiles slide, a merge flashes the cell and the formula bar shows `=D7+E7`, the 合计/占比 columns update, and Esc turns the board into a plain budget table with no game traces; Esc again resumes. `game_ready` and `game_start` reached the local events table. No account was logged in, so achievements were covered by the headless test only.

