# 升官记 (`promotion-2048`)

**Status:** Implemented and published to production 2026-09-30 (`pnpm game publish promotion-2048 v1`; the play page loads at www.moyufuns.com/play/promotion-2048). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

2048 with job titles. Slide tiles on a 4 × 4 board; two equal titles merge into the next one up, from 实习生 to 财务自由 (2048). Keyboard or swipe, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/promotion-2048/v1/index.html`, vanilla JS, no dependencies. The board is DOM (a CSS grid of absolutely positioned tiles moved with `transform` transitions), not canvas. Copy from 乱刃 v4 only the SDK block and the audio helpers. | CSS transitions give the slide and pop animations for free, and text renders crisply. |
| D2 | The board stores levels (`0` = empty, `1` = 实习生 … `11` = 财务自由), not values. The score adds `2^level` for each tile created by a merge, as in the original. | Levels index the title table directly; the score stays comparable to normal 2048. |
| D3 | The rules are pure functions: `slide(board, dir) → { board, moved, merged: [level…], gain }`, a tile merges at most once per move, and the merge goes toward the move direction. | The classic 2048 edge cases (`[1,1,1,1]`, `[1,1,2,0]`) are the bug magnets; pure functions make them unit-testable. |
| D4 | A new tile spawns after every move that changes the board: 90% level 1, 10% level 2, in a random empty cell. Randomness goes through `rng()` (default `Math.random`, seeded in tests). | Same as the original. |
| D5 | One undo per round (button `背锅侠` or `Z`), one move deep. It restores the board and the score but does not take back achievements already sent. | Gives a safety net without making the game trivial, and keeps achievements simple. |
| D6 | Creating 财务自由 opens an overlay with `继续卷` (keep playing) and `退休` (end the round now). Either way the round counts as a win. A round otherwise ends when no move is possible. | The original's "keep going" choice, with a themed name. |
| D7 | Input: arrow keys or WASD; swipes via Pointer Events (a drag over 30 px picks the dominant axis). | Covers keyboard, mouse drag and touch. |
| D8 | *Changed in M3.* `ready` is sent on load and again at 0.5, 2 and 5 s; a round's `start` is sent on its first move, not on load. Replaces "`start` on page load and on restart". | The site only listens after hydration, and this tiny game loaded first: the single `ready` was lost and the play page stuck on 游戏加载中. Duplicate `ready` messages are ignored by the lifecycle; by the first move the site is listening. |

## Out of scope

Board sizes other than 4 × 4, more than one undo, saving the board between page loads, a best-score display (stats are totals only), leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/promotion-2048/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "promotion-2048",
  "name": "升官记",
  "shortDescription": "2048 职场版：从实习生一路合成到财务自由。",
  "description": "方向键滑动棋盘，两个相同的职位合并成更高一级。从实习生、专员、经理、总监一路升到 CEO 和董事长，最终实现财务自由。每局可以让背锅侠帮你撤回一步。",
  "tags": ["益智", "2048", "单人"],
  "controls": [
    { "input": "方向键 / WASD", "action": "滑动" },
    { "input": "拖动 / 滑动屏幕", "action": "滑动" },
    { "input": "Z", "action": "撤回一步（每局一次）" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R", "action": "重新开始" }
  ],
  "cover": { "symbol": "升", "eyebrow": "2048", "accent": "#ffb020", "accentSecondary": "#ff5a5a" },
  "sortOrder": 60,
  "achievements": [
    { "key": "manager", "name": "升任经理", "description": "合成经理。", "symbol": "经" },
    { "key": "ceo", "name": "走上巅峰", "description": "合成 CEO。", "symbol": "巅" },
    { "key": "freedom", "name": "财务自由", "description": "合成财务自由。", "symbol": "由" },
    { "key": "double", "name": "双喜临门", "description": "一步之内合成两个总监或更高职位。", "symbol": "喜" },
    { "key": "no_undo", "name": "不背锅", "description": "不用撤回合成 CEO。", "symbol": "锅" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "财务自由", "maxPerRound": 1 },
    { "key": "merges", "name": "升职", "maxPerRound": 20000 }
  ]
}
```

### Titles

`TITLES[level]`: `{ name, value, bg, fg, line }`. The `line` is the toast shown the first time that level is created in a round, as `升任 <name>！<line>`.

| level | name | value | bg | line |
| --- | --- | --- | --- | --- |
| 1 | 实习生 | 2 | `#eee4da` | — |
| 2 | 专员 | 4 | `#ede0c8` | 终于转正了 |
| 3 | 组长 | 8 | `#f2b179` | 手下有两个实习生 |
| 4 | 主管 | 16 | `#f59563` | 开始写周报的周报 |
| 5 | 经理 | 32 | `#f67c5f` | 会议多到没空摸鱼 |
| 6 | 总监 | 64 | `#f65e3b` | PPT 越做越大 |
| 7 | 副总 | 128 | `#edcf72` | 司机比你先到公司 |
| 8 | 总经理 | 256 | `#edcc61` | 年会坐第一排 |
| 9 | CEO | 512 | `#edc850` | 开始讲情怀 |
| 10 | 董事长 | 1024 | `#edc53f` | 只需要敲钟 |
| 11 | 财务自由 | 2048 | `#3c3a32` | 终于可以光明正大地摸鱼 |

The text colour is `#776e65` for levels 1–2 and `#f9f6f2` above. Each tile shows the title large and the value small in a corner. Merged tiles pop (scale 1.15 → 1, 120 ms); new tiles grow from 0. Slides take 100 ms, and the next input is accepted after them.

### Layout and screens

- **Header:** title `升官记`, a `分数` box, the button `背锅侠 ×1` (`背锅侠 ×0` when used, then disabled), and `重新开始`.
- **Board:** 4 × 4 with 12 px gaps, square, sized to `min(90vw, 90vh − header, 480px)`.
- **Toast** line under the header, lasting 2 s.
- There is no separate start screen: the board is dealt on page load and on `重新开始` or `R`; `start` goes out on the round's first move (D8).
- **Game over** overlay: `没有位置了` showing the score and the highest title, plus `再来一局`.
- **财务自由** overlay: `财务自由了！` with `继续卷` and `退休`. `退休` shows the end overlay titled `光荣退休`.

### Functions

- `slide(board, dir)`: pure. `dir` is `'left' | 'right' | 'up' | 'down'`.
- `canMove(board)`: pure.
- `move(dir)`:
  1. Calls `slide`. If nothing moved, it does nothing.
  2. Sends `start` if this is the round's first move, and saves `{ board, score }` for undo.
  3. Applies the result, `merges += merged.length`, spawns a tile, and runs the achievement checks.
  4. If no move is possible, calls `endRound()`.
- `undo()`
- `retire()`: ends the round as a win.
- `continueWork()`: closes the overlay.
- `endRound()`
- `startGame()`

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`. These are checked in `move` after the merge.

| key | Trigger |
| --- | --- |
| `manager` | `merged` contains level 5. |
| `double` | `merged` has ≥ 2 entries at level ≥ 6. |
| `ceo` | `merged` contains level 9. |
| `no_undo` | `merged` contains level 9 and the undo has not been used. |
| `freedom` | `merged` contains level 11. Sets `won = true` and opens the overlay. |

### Stats

In `endRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: won ? 1 : 0, merges: Math.min(merges, 20000) })`. `endRound()` runs on no-moves, on `retire()`, and when `重新开始` is pressed mid-round after at least one move. A restart before any move sends nothing.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `rng` seeded.

**`slide` cases** (rows shown for `left`):

| input | output | merged |
| --- | --- | --- |
| `[1,1,1,1]` | `[2,2,0,0]` | `[2,2]` |
| `[1,1,2,0]` | `[2,2,0,0]` | `[2]` |
| `[2,0,0,2]` | `[3,0,0,0]` | `[3]` |
| `[1,2,1,2]` | unchanged | `[]`, `moved` false |

The same rows are also tested through `right`, `up` and `down` by transposing the board.

**Load.** Only `ready` is sent until the first move.

**Simulation.** 20 rounds of random moves until `!canMove`. Assert no level above 11 and that the empty count plus the filled count equals 16. Every round ends with `…, stats, end`.

**Deterministic round.** `startGame()`, then set `board` directly before each move. Stub spawning to fill a fixed corner so it can't merge.
1. Row `[4,4,0,0]`, move `left` → `manager`.
2. Rows `[5,5,0,0]` and `[5,5,0,0]`, move `left` → `double`.
3. Row `[8,8,0,0]`, move `left` → `ceo`, `no_undo`.
4. Row `[10,10,0,0]`, move `left` → `freedom`.
5. `retire()`.

Expected sequence: `start, manager, double, ceo, no_undo, freedom, stats, end`. Expected stats: `wins: 1`, `merges: 5`.

Note that step 2 creates two 总监 (level 6), and `manager` (level 5) is not sent again in step 2.

**Undo.** `undo()` restores the board and score exactly. A CEO created after an undo sends `ceo` without `no_undo`.

**Restart.** Mid-round after a move sends `stats, end`; before any move sends nothing, and the next move sends `start`.

## Milestones

Each milestone ends with `node games/promotion-2048/v1/test_headless.js` passing.

**M1 · Playable board.** `slide`, `move`, spawn, undo, animations, toasts, swipe, overlays.
Done when: a browser round plays smoothly with keys and swipes, and the `slide` table passes.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check promotion-2048 v1` passes.

**M3 · Local release.** `pnpm game:local publish promotion-2048 v1 --yes`.
Done when: `/play/promotion-2048` plays locally, and a logged-in round unlocks `manager` and updates the board. The owner runs the production publish.

### M3 notes

- Local publish registered the game, five achievements and three stats. A logged-in round on `/play/promotion-2048` unlocked `manager` and wrote `rounds 1, wins 0, merges 38` to `user_game_stats`.
- The first local load stuck on 游戏加载中 (lost `ready`), which led to D8. The fix was made after v1 was registered locally; the local static server serves the file from disk, so it was verified anyway. Production gets the fixed file.
- Gotcha for testing in the browser pane: keys pressed faster than the 100 ms slide are dropped by design, so automated play needs ~150 ms between keys.
