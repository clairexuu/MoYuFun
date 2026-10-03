# 折纸地图 (`paper-fold`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A folding puzzle. A tiny traveler is drawn on a paper map; his house is somewhere else on it, and the roads between them are broken. Fold the paper along crease lines: the flap flips over, so its *back* face, with its own roads, lands mirrored on the other half and can join roads edge to edge. When the visible roads connect traveler and house, he walks home. 12 hand-made levels in three chapters, star-rated by folds against par. Mouse, touch or keyboard, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/paper-fold/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, the `resize()`/`view` pattern (`document.documentElement.clientWidth/Height`) and the audio helpers `ensureAudio`/`tone`/`noiseHit`. Roads are canvas strokes; traveler, house and scenery are emoji via `fillText`. | Same package contract; nothing else is shared. |
| D2 | The paper is a grid of cells; each cell holds a **stack of layers**. A fold moves **every layer on one side** of a crease line (the whole bundle), never a single layer. | A folded bundle can always be folded again along a straight line, so the model stays physical without tracking paper topology. Per-layer folds would need hinge bookkeeping for little extra puzzle. |
| D3 | Creases are fixed lines of the board grid listed per level, drawn on the table, and stay put after folds. | Players read them as "the places you may fold"; no need to move crease marks with layers. |
| D4 | A folded layer shows its **other face**, mirrored across the crease. Back faces are stored **x-ray style**: as seen from above *through* the paper, in board orientation. Flipping a layer is `{u: mir(d), d: mir(u), um: dm, dm: um}`. | This is what real paper does, and it is the puzzle: the back carries different roads. X-ray storage makes a flip one swap plus one mirror and lets the renderer draw backs directly. |
| D5 | The paper is translucent: the top layer's down face is drawn faintly (dashed roads, marks at 25% alpha). | Players can plan folds without a "turn the sheet over" view, and the faint picture flips over like a page when folded. |
| D6 | A fold is legal only when both sides of the crease hold paper and every moved cell lands inside the level grid. Grids carry empty margin cells (`.`) where the designer wants room to land. | Forbids flipping the whole sheet (one side empty) and keeps the board a fixed size, so layout never rescales mid-level. |
| D7 | Only the top layer of each cell counts. Two neighbours connect when both top faces have a road on the shared edge. The traveler (`S`) and house (`H`) are marks on a face and count only when that face is a top face. Win = BFS finds a path from the `S` cell to the `H` cell. | One simple, checkable rule; covering or flipping the traveler or house is a real way to fail. |
| D8 | A **round is one chapter** (卷) of 4 levels. All three chapters are open from the menu. `start` is sent on the chapter's first legal fold; finishing level 4 wins the round; `☰ 目录` mid-chapter after a fold ends it as a loss. | A single level lasts 20–90 s, too short for a round; all 12 run past 10 minutes. With no saving, locking chapters would force replaying chapter 1 on every page load. |
| D9 | Stars per level: `folds` counts every legal fold on that level, including ones later undone or wiped by `重来`; illegal attempts and undo are free. 3★ if `folds <= par`, 2★ if `<= par + 2`, else 1★. Using `提示` caps the level at 1★. | Counting undone folds is what makes par meaningful; undo itself stays free so exploring a fold is cheap. |
| D10 | Every level stores its par solution. The headless test replays it to a win and runs a BFS that proves no shorter solution exists. | Hand-made fold puzzles break silently when one token changes; the test catches it. |
| D11 | Fold by dragging across a crease (Pointer Events); keyboard: digit selects a crease, arrow folds it. Undo is a button (`↶ 撤销`) or `Z`, not a tap on the paper. | A tap on paper is the start of a drag; a separate button keeps undo unambiguous on touch. |
| D12 | There is no randomness: levels are hand-made and cosmetic variation is a fixed hash of the cell index, so the game has no `rng()`. | Nothing to seed; the tests are deterministic by construction. |
| D13 | `ready` is sent on load and again at 0.5, 2 and 5 s (`setTimeout`); game logic never uses `setTimeout`, only `update(dt)`. | Same as 升官记 D8 (lost `ready`); the test stubs `setTimeout`. |

## Out of scope

Diagonal or free-angle folds, folding single layers out of a stack, turning the whole sheet over, a level editor, more than 12 levels, daily levels, saving progress or best stars between page loads, chapter locks, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/paper-fold/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "paper-fold",
  "name": "折纸地图",
  "shortDescription": "把地图折起来，让小路接上，送旅人回家。",
  "description": "旅人站在一张纸地图上，家却在断掉的路那头。沿着折痕把纸翻过去，画在背面的路就会翻到上面，和这边的路首尾相接。纸很薄，背面的路会隐约透出来。三卷十二关，用最少的折数拿三星。",
  "tags": ["解谜", "益智", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "拖过折痕，把这一边折过去" },
    { "input": "数字键 + 方向键", "action": "选折痕，朝一个方向折" },
    { "input": "Z / 撤销按钮", "action": "撤销上一折" },
    { "input": "R", "action": "本关重来" },
    { "input": "H", "action": "提示（本关最多一星）" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "折", "eyebrow": "FOLD PUZZLE", "accent": "#e8dcc0", "accentSecondary": "#d0573a" },
  "sortOrder": 130,
  "achievements": [
    { "key": "ch1", "name": "初展地图", "description": "通过第一卷。", "symbol": "初" },
    { "key": "ch2", "name": "翻山越岭", "description": "通过第二卷。", "symbol": "山" },
    { "key": "ch3", "name": "千里一折", "description": "通过第三卷。", "symbol": "千" },
    { "key": "perfect", "name": "分毫不差", "description": "一卷四关全部拿到三星。", "symbol": "毫" },
    { "key": "no_hint", "name": "不问路", "description": "不用提示通过第二卷或第三卷。", "symbol": "路" },
    { "key": "swift", "name": "健步如飞", "description": "5 分钟内通过第三卷。", "symbol": "飞" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "走完一卷", "maxPerRound": 1 },
    { "key": "folds", "name": "折纸", "maxPerRound": 1000 },
    { "key": "stars", "name": "星星", "maxPerRound": 12 }
  ]
}
```

### Level data

`LEVELS` is an array of 12; `CHAPTERS = [[0,1,2,3],[4,5,6,7],[8,9,10,11]]`, named `初展`, `翻山`, `千里`.

```js
{
  name: '对折',            // 2–4 characters, shown in the HUD
  par: 1,                  // === solution.length
  tip: '…',                // ≤ 40 characters, shown above the board
  creases: ['v3'],         // 'v<k>': vertical grid line x = k (between columns k-1 and k), 1 ≤ k ≤ w-1; 'h<k>': horizontal line y = k
  solution: ['v3L'],       // crease + the direction the flap travels: L/R for 'v', U/D for 'h'
  front: ['…'],            // h rows, top first, each w space-separated tokens
  back:  ['…'],            // same shape, x-ray orientation (D4), '.' in exactly the same cells
}
```

**Token:** `.` = no paper (margin or hole). Otherwise one hex digit, the road mask (`N=1, E=2, S=4, W=8`; `a` = W–E, `5` = N–S, `3` = N–E, `6` = E–S, `c` = S–W, `9` = N–W), optionally followed by one mark: `S` traveler 🚶, `H` house 🏠, or cosmetic `T` 🌲, `~` 🌊, `^` ⛰️. Grids are 3–8 wide and 3–7 tall.

**Fold semantics.** `v<k>L` moves every cell with `x >= k` to `x' = 2k−1−x`; `v<k>R` moves `x < k` the same way; `h<k>U` moves `y >= k` to `y' = 2k−1−y`; `h<k>D` moves `y < k`. Each moved stack is reversed, every layer flipped (`mir` = `mirH`, swap E/W bits, for `v`; `mirV`, swap N/S bits, for `h`), and appended on top of the stack already at the landing cell: `stacks[t] = stacks[t].concat(moved.slice().reverse().map(flip))`.

**Authoring the back (x-ray).** If after one `v` fold a landing cell should read mask `m`, store `mirH(m)` on the source cell's back. Level 1: the house must land at (2,1) with a road to the W (`8`); its source is (3,1), so the back token there is `2H`.

### Levels 1–4 (chapter 初展), verbatim

Coordinates are `(x, y)` from the top-left. Each was checked with a prototype of the model: the solution wins, nothing shorter does, and the initial state is not won.

**1 · 对折** — par 1, creases `v3`, solution `v3L`. Tip `纸很薄，背面的路会透出来。拖过折痕，把右边翻过来。` Only one legal fold; the house shows faintly through (3,1).

```text
front                 back
0T 0  6  a  c         0  0  0  0  0
2S 0  5  0  5         0  0  0  2H a
0  0  3  a  9         0  0  0  0  0
```

**2 · 横折** — par 1, creases `v3 h3`, solution `h3U`. Tip `折痕也有横的。小心，翻过去的那一半会把画在正面的东西盖到底下。` The tempting `v3L` fills the gap at (2,1) but flips the house face down.

```text
front                 back
4S 0  0  0  4H        0  0  0  0  0
3  a  0  a  9         0  0  0  0  0
0T 0  0  0  0~        0  0  0  0  0
0  6  a  c  0         0  0  0  0  0
0  3  a  9  0         6  a  a  a  c
```

**3 · 对开门** — par 2, creases `v1 v2 v5 v6`, solution `v1R v6L`. Tip `旅人画在纸的背面。左右两边都要折进来。` Legal first folds: `v1R v2R v5L v6L`.

```text
front                       back
5  0  6  a  a  c  5         0  0  0  0  0  0  0
5  0  a  c  0  5  5         8S 0  0  0  0  0  0
5  0  0  3  a  9  5         0  0  0  0  0  0  2H
5  0T 0  0  0^ 0  5         0  0  0  0  0  0  0
```

**4 · 先后** — par 2, creases `v1 v3 h1 h3`, solution `h3U v3L`. Tip `同样两道折痕，先折哪一道，结果不一样。` `v3L` alone shows the house but leaves (0,2) a dead end; `v3L` then `h3U` buries the house.

```text
front                 back
4S 0  6  a  c         0  0  0  0  0
5  0  5  0  5         0  0  0  0  0
1  0  3  a  9         0  0  0  2H a
0  0T 0  0^ 0         6  0  0  0  0
0  0  0  0  0         5  0  0  0  0
```

### Levels 5–12: design rules

The implementer authors these in M1, using the test (below) as the checker. Pars are fixed so the chapter totals are fixed (翻山 9, 千里 16).

| # | name | grid ≤ | par | creases ≥ | New idea it must introduce |
| --- | --- | --- | --- | --- | --- |
| 5 | 缺角 | 6×5 | 2 | 4 | The paper has holes (`.` inside the sheet); a flap lands on a hole and is the only layer there, so the road crosses where there was no paper. |
| 6 | 太长了 | 7×5 | 2 | 4 | The obvious fold is illegal at first (`折过去会超出桌面`); folding a short edge in first makes it legal. |
| 7 | 折回来 | 7×5 | 2 | 4 | Accordion: a flap is folded over and then folded back along a second crease, so its **front** shows again, unmirrored. The needed road is on that front. |
| 8 | 三折 | 7×6 | 3 | 5 | Mixes `v` and `h`; at least one wrong legal first fold makes the house visible but unreachable. |
| 9 | 夹层 | 7×6 | 3 | 5 | The winning top face lies on a cell stacked three layers deep, and it is a layer flipped twice. |
| 10 | 四面合围 | 8×6 | 4 | 6 | Fold all four edges in; corner cells take whichever fold came last, so order matters at the corners. |
| 11 | 迷途 | 8×7 | 4 | 8 | At least two legal first folds put the house on top (both wrong). |
| 12 | 千里一折 | 8×7 | 5 | 8 | Combines at least three of: traveler on a back, house on a back, a hole, an accordion, an order dependence. |

Rules for every level, all enforced by the test: parses as above; front and back have the same `.` cells; the paper cells are 4-connected; exactly one `S` and one `H` across all faces of all cells; creases valid and unique; the initial state is not won; `solution.length === par`, every step legal, final state won; no win at fewer folds (BFS); from level 3 on, at least 3 legal first folds; tips ≤ 40 characters.

### Logic (pure, no canvas)

- `parseLevel(L) → { w, h, stacks }`: `stacks[y*w+x]` is an array bottom→top of `{ u, d, um, dm }` (up/down masks, up/down marks); the initial layer is `{ u: front, d: back }`.
- `mirH(m)`, `mirV(m)`.
- `fold(state, crease, dir) → state | 'empty' | 'outside'`: pure, returns a new state or the reason it is illegal (D6). A `v` crease with `U`/`D` (or `h` with `L`/`R`) returns `'axis'`.
- `findPath(state) → [cellIndex…] | null`: BFS over top faces (D7), path from `S` to `H`.

### Game state and functions

`game = { screen: 'menu'|'play'|'card'|'chapterWin', chapter, slot (0..3), level, state, initial, history: [{ state, move }], folds, hintUsed, stars: [per slot], roundFolds, roundHints, started, gameT, anim, walk, selected, toast }`.

- `startChapter(c)`: resets round fields and `roundAchievements`, `startLevel(0)`. Sends nothing.
- `startLevel(slot)`: loads `LEVELS[CHAPTERS[chapter][slot]]`, clears history, `folds = 0`, `hintUsed = false`.
- `tryFold(crease, dir) → boolean`: false while `anim` or `walk` is active, or when `fold` returns a reason (toast `这边没有纸可以折` / `折过去会超出桌面` / `这道折痕要用 ←/→` or `↑/↓`, crease flashes red, low tone). Otherwise: sends `start` if `!started`, pushes history, `folds++`, `roundFolds++`, starts `anim` (0.35 s); if `findPath` wins, sets `walk = { path, t: -0.35 }`.
- `undo()`, `restartLevel()` (back to `initial`, history cleared, `folds` kept).
- `hint()`: rewinds history to its longest common prefix with `solution` (no fold cost), then highlights `solution[prefix]` (crease glows with an arrow for 3 s, toast `试试折这里`); sets `hintUsed`, `roundHints++`.
- `levelDone()`: called by `update` when the walk ends; stores stars (D9); slot 3 calls `winChapter()`, else shows the card.
- `nextLevel()`: from the card, `startLevel(slot + 1)`.
- `winChapter()`: achievements, stats, `end`, then the chapter screen.
- `quitChapter()`: if `started`, stats with `wins: 0` and `end`; back to menu.
- `update(dt)`: advances `anim`, `walk` (0.18 s per path cell), toasts, and `gameT` while `started` and the round has not ended.

### Screens and layout

Logical area 480 × 800, letterboxed with `view.s = min(view.w/480, view.h/800)` as in 摸了个鱼. Table background `#3b2f2a`.

- **Menu:** title `折纸地图`, subtitle `沿着折痕把地图折起来，让小路接上，送旅人回家。`, three cards `第一卷 · 初展` (`第 1–4 关`), `第二卷 · 翻山` (`第 5–8 关`), `第三卷 · 千里` (`第 9–12 关`). Tap or keys `1`/`2`/`3`.
- **HUD** (y 0–90): `第一卷 · 2/4 · 横折` left, `折 3 · 标准 2` right, four small markers under it showing each chapter level's earned stars. Tip text at y 96–140.
- **Board** (440 × 440 at x 20, y 150): cell size `min(72, floor(440 / max(w, h)))`, centred. Paper `#e8dcc0` with a 1 px `#c9b892` cell grid; each extra layer adds a 2 px offset shadow (at most 3). Roads `#7a5532`, width 0.28 × cell, centre to edge midpoints with a round centre joint. X-ray backs dashed `rgba(122,85,50,0.25)`. Creases: dashed `#d0573a` at 50% across the whole board, labelled `1…n` in small circles outside the top edge (`v`) or left edge (`h`); the selected or hovered crease is solid. Marks are emoji at 0.6 × cell.
- **Drag:** pointerdown on the board starts a drag; when the dominant-axis displacement reaches 0.6 cell and a crease of that axis lies strictly between start and current point, the crease nearest the start is previewed (solid red, moving side tinted `rgba(208,87,58,0.12)`); pointerup folds it. Releasing short of that does nothing.
- **Fold animation:** 0.35 s. For `t < 0.5` the old top faces of the moving side shrink toward the crease (scale `1 − 2t` on the fold axis); for `t ≥ 0.5` the new flipped faces grow out from it (`2t − 1`).
- **Buttons** (y 640–700, 100 × 52): `↶ 撤销`, `⟲ 重来`, `💡 提示`, `☰ 目录`. `☰ 目录` mid-round needs a second tap within 2 s (toast `再点一次放弃本卷`).
- **Level card:** `到家了！`, `★★☆`, `折了 3 次 · 标准 2 次`, `用了提示` when hinted, button `下一关`.
- **Chapter screen:** `第一卷 走完了！`, `共 ★ 10 / 12 · 用时 3:24`, buttons `下一卷` (`再走一遍` after chapter 3) and `回目录`.
- **Keys:** `1`–`9` select crease, arrows fold it, `Z` undo, `R` restart level, `H` hint, `M` mute, `Enter` presses the card's main button.

Sounds: fold `noiseHit(0.12, 0.25, 1800)`; illegal `tone(160, 120, 0.15, 'square', 0.15)`; undo `tone(500, 350, 0.08)`; each walk step `tone(900, 900, 0.03)`; arrive `tone(523, 784, 0.25, 'triangle')`; chapter win three `tone` notes 523/659/784 at 0.12 s spacing via `update`.

### Achievements

Emitted through `unlockAchievement(key)` in `winChapter()`, in this order, before `stats`/`end`:

| key | Trigger |
| --- | --- |
| `ch1` / `ch2` / `ch3` | The chapter with that number is won. |
| `perfect` | All four `stars` of the chapter are 3. |
| `no_hint` | Chapter 2 or 3 won with `roundHints === 0`. |
| `swift` | Chapter 3 won with `gameT <= 300`. |

### Stats

Before `end` in `winChapter()` and `quitChapter()`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, folds: Math.min(roundFolds, 1000), stars: <sum of stars of levels finished this round> })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `setTimeout` stubbed. It holds its own BFS `minFolds(level, maxDepth)` (dedup by `JSON.stringify(stacks)`); the game ships none.

**Load.** Only `ready` is sent; `startChapter(0)` alone sends nothing.

**Model.** `mirH(0b1010) === 0b1010`, `mirH(2) === 8`, `mirV(1) === 4`. On level 1: `fold(s,'v3','R') === 'outside'`; after `v3L`, `fold(s,'v3','L') === 'empty'`; `fold(s,'v3','U') === 'axis'`; the `v3L` result puts `{u: 8, um: 'H'}` on top of (2,1) and stacks 2 layers on columns 1–2. Undo after a fold restores a state deep-equal to `initial` and leaves `folds === 1`.

**Levels.** Every rule in *Levels 5–12: design rules* for all 12 levels, pars exactly `[1,1,2,2, 2,2,2,3, 3,4,4,5]`, and `minFolds` equals `par` for each.

**Deterministic chapter 1 at par.** `startChapter(0)`; for each level, each solution fold through `tryFold` followed by `update(1)`, then `update(5)` and `nextLevel()`. Expected: `start, ch1, perfect, stats, end`, stats `{ rounds: 1, wins: 1, folds: 6, stars: 12 }`.

**Chapter 1 with mistakes.** Levels 1–2 at par; level 3: `v2R`, `update(1)`, `undo()`, then the solution; level 4: `hint()` (highlights `h3U`), then the solution. Expected: `start, ch1, stats, end`, stats `{ rounds: 1, wins: 1, folds: 7, stars: 9 }`.

**Hint rewind.** On level 4 after `v3L`: `hint()` rewinds history to empty and highlights `h3U`.

**Chapters 2 and 3 at par.** Chapter 2: `start, ch2, perfect, no_hint, stats, end`, `{ rounds: 1, wins: 1, folds: 9, stars: 12 }`. Chapter 3: `start, ch3, perfect, no_hint, swift, stats, end`, `{ rounds: 1, wins: 1, folds: 16, stars: 12 }`. Again with `gameT = 301` set before level 12's last fold: no `swift`.

**Quit.** `startChapter(1)`, `quitChapter()` sends nothing. `startChapter(1)`, `tryFold` of level 5's first solution fold, `update(1)`, `quitChapter()`: `start, stats, end`, `{ rounds: 1, wins: 0, folds: 1, stars: 0 }`.

## Milestones

Each milestone ends with `node games/paper-fold/v1/test_headless.js` passing.

**M1 · Playable folding.** Logic functions, levels 1–4 verbatim, levels 5–12 authored to the rules, drag and keyboard folding, animation, x-ray, walk, undo/restart/hint, stars, all screens, sounds.
Done when: all 12 levels play in a browser at desktop and 375 px phone width, and the *Model* and *Levels* tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the deterministic tests, `README.md`.
Done when: `pnpm game check paper-fold v1` passes.

**M3 · Local release.** `pnpm game:local publish paper-fold v1 --yes`.
Done when: `/play/paper-fold` plays locally, and a logged-in chapter 1 win unlocks `ch1` and updates the stats board. The owner runs the production publish.

## Open items

- Difficulty of levels 5–12 is the implementer's authoring within the rules; the owner playtests chapter 3 in M1 and may raise or lower pars there (the test's fixed par list and the chapter totals 9/16 change with it).
