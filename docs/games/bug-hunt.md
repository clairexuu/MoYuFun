# 代码找不同 (`bug-hunt`)

**Status:** Implemented and published to production 2026-10-05 (`pnpm game publish bug-hunt v1`; www.moyufuns.com/play/bug-hunt). Milestones: M1 ☑ · M2 ☑ · M3 ☑ (see notes).

Spot-the-difference disguised as a VS Code side-by-side compare view. The left pane is the original file, the right pane is a copy with a few subtle token-level changes, and, unlike a real diff, nothing is highlighted. The player clicks where they think a change is. A correct click marks that line on both panes like a real diff; a wrong click costs 3 seconds. One run is a single countdown: each level adds its time to the clock, unused time carries over, and the run ends when the clock hits zero. The score is the number of changes found. Mouse first, touch works, keyboard optional. This is game `bug-hunt` of M5 in `docs/design/office-camouflage.md`.

Read first: `docs/design/office-camouflage.md` (binding: D2 `disguise`, D6 conventions, D7 VS Code chrome, D8 colours, D9 no logos), `docs/design/game-release.md` (package contract, `check`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/prototype-skins/index.html` variant D (chrome and syntax colours), `games/tile-stack/v1/` (`resize()`, canvas test stub).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/bug-hunt/v1/index.html`, vanilla JS and canvas, no dependencies. The VS Code chrome is the prototype's variant D, refined: title bar with menus, activity bar, explorer, tabs, breadcrumbs, two editor panes, minimap, overview ruler, terminal panel and status bar. | The chrome has to fill the window like the real app, and the prototype is the approved look. One canvas makes hit-testing a token a matter of arithmetic. |
| D2 | The code is a corpus of 24 hand-written TypeScript snippets (utilities, React hooks, SQL builders, date math, a service, a class), 20–40 lines each, ASCII only, at most 66 characters per line. It lives in a `<script type="text/plain" id="corpus">` block, snippets separated by `%%` lines. | Real-looking code is the camouflage and the content. A text block keeps backticks and `${…}` in the code without escaping. ASCII keeps every character one monospace cell wide, so a column is `x / charWidth`. The line cap lets two panes fit side by side. |
| D3 | Differences come from 14 **mutation operators** applied with a seeded PRNG (`mulberry32`). A level is `generateLevel(n, seed)`, a pure function: the same `(n, seed)` always gives the same files and changes. A run picks a random `runSeed`; level `n` uses `(n, runSeed)`. | Reproducible levels for tests and bug reports, endless variety for players. |
| D4 | At most **one change per line**, and a change never spans lines. Every change must alter the text, may not differ only by lookalike characters (`0/O/o`, `1/l/I/i`), and never touches whitespace alone. | One per line rules out overlaps and makes the "which token" question fair. Lookalikes are unfair at normal zoom. |
| D5 | Operators are grouped in **tiers**. Tier 1 (obvious): `true`↔`false`, `null`↔`undefined`, `const`↔`let`, last digit of a short number, method swaps like `min`↔`max`, `floor`↔`ceil`, `some`↔`every`, `keys`↔`values`. Tier 2 (operators): `===`↔`==`, `!==`↔`!=`, `<`↔`<=`, `>`↔`>=`, `&&`↔`||`, `??`→`||`, `+`↔`-`, `*`↔`/`, `+=`↔`-=`, `++`↔`--`, a renamed identifier in one place (`items`↔`item`), long numbers, `push`→`unshift`, `filter`→`find`. Tier 3 (subtle): a removed or added `!`, two swapped call arguments, one letter changed in a string literal, `?.`↔`.`, `getDate`↔`getDay`, `slice`↔`splice`. | Difficulty should come from subtlety as well as count. Tiers make the ramp explicit. |
| D6 | Operator choice per change: pick an operator among those used least so far in this level, then one of its sites on an unused line. | Without it, the operators with many sites (renames, member access) would dominate every level. |
| D7 | **Binary-operator mutations need spaces on both sides** (` < `, ` + `). | The tokenizer is a regex, not a parser: this is what tells `a < b` from `Array<T>`, `a - 1` from `-1`, and `x / 2` from a regex literal. The corpus is formatted that way. |
| D8 | **Hit rule.** A click lands on a pane, a line and a fractional column. It is a find when it falls inside an unfound change's column span on that pane, widened by half a character on each side. Otherwise, if it lands on a non-whitespace token, it is a wrong click. Clicks on whitespace, past the end of a line, in the gutter or on an already-found change do nothing. | A single-character token like `-` is 7 px wide, so half a character of slack keeps it fair. Clicks on empty space should never cost time. |
| D9 | One run is one countdown. Each level adds `levelTime(n)` to the clock; unused time carries over (the "finish early" bonus). A wrong click costs 3 s, a hint 10 s. The clock only runs in `play`: not before the first click, not during the 1.2 s pause after a level, not in boss mode. | Carry-over rewards speed without a separate bonus formula, and a run naturally ends when the player falls behind the ramp. |
| D10 | Found changes are drawn with VS Code's diff colours: left line `rgba(255,0,0,.13)` with the span at `.33`, right line `rgba(155,185,85,.15)` with the span at `.33`, `−`/`+` in the gutter, and red/green marks in the overview ruler. A new find flashes brighter for 0.6 s. Wrong clicks get a red squiggle `#f14c4c` for 1 s; hints a yellow squiggle `#cca700` for 3 s. | These are exactly what a real compare view and a real linter draw (D8 of the camouflage doc), so feedback looks like normal editor state. |
| D11 | When the run ends, every unfound change is revealed with the same diff colours. | The end screen becomes an ordinary diff, and the player sees what they missed. |
| D12 | **Boss key (Esc)** freezes time and swaps in a fixed decoy compare (`generateLevel(1, 20261005)`, all changes highlighted, scrolled to the top), with zeroed problem counters, no game items in the status bar and a `git status` terminal. Clicks, wheel and Tab do nothing until Esc again. | Hiding only the markers would leave the current level on screen for free study with the clock stopped. The decoy is an ordinary diff a passer-by expects. |
| D13 | Status bar game items look like extension items: `⇄ found/total`, `⏱ m:ss` (red `#c72e0f` background under 10 s), a red `−3s` for 0.9 s after a wrong click, `✓ finds`. `⊗` counts wrong clicks and `⚠` hints in this level. Before the first click the bar shows `找出右侧 N 处改动，点击代码开始 · Tab 提示 · Esc 隐藏`. | D6 of the camouflage doc: no title screen, a short hint in the status bar. The problems counter is where real errors would show. |
| D14 | The terminal panel is the game's log: the `git difftool` command per level, then `✓ 第 N 行：from → to`, `✗ 第 N 行：token 没有改动 −3s`, `⚠ 第 N 行有改动 −10s`, level summaries and the run summary. | Text feedback that reads as tool output. |
| D15 | Layout: panes side by side, font scaled so the longest line fits (max 13 px). When that would be under 10 px and stacking the panes top and bottom gives a bigger font, they stack. Minimum 8 px (lines may clip on phones). Explorer only at ≥ 1180 px wide, activity bar at ≥ 560 px, panel 150 px at ≥ 680 px high, 100 px at ≥ 520 px, none below. | Any iframe size must work; at desk sizes both files stay fully visible side by side. VS Code itself switches to an inline layout when narrow. |
| D16 | Both panes share one vertical scroll (wheel, touch drag, arrows, PageUp/PageDown, Home/End). There is no horizontal scroll. | Mutations never add or remove lines, so line `i` is the same line on both sides, as in a real side-by-side diff. |
| D17 | `start` is sent on the first click that is a find or a wrong click, or on the first Tab hint. After the run ends, a click on the editor or Enter starts a new run, but only after 1 s. | Scrolling or clicking empty space is not playing yet. The delay stops the last frantic click from skipping the summary. |
| D18 | Best score (finds) is kept in `localStorage` key `moyufun:bug-hunt:best`, read and written in `try`/`catch`. | A reason to replay; storage failure must not break the game. |
| D19 | Sound is off until `M`. Three short tones: find (880→1320 Hz sine), wrong (220→140 Hz square), level clear (660→990 Hz). | D6 of the camouflage doc. |

## Out of scope

An inline (unified) diff layout, horizontal scrolling, a level select or daily seed, a leaderboard, cross-run achievements, changes that add or remove lines, real syntax parsing, real VS Code interactions (menus, tabs, explorer clicks), JSX in the corpus.

## Architecture

### Package

```text
games/bug-hunt/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "bug-hunt",
  "name": "代码找不同",
  "shortDescription": "左右两份代码，找出右边被悄悄改过的地方。",
  "description": "看起来是 VS Code 里的一次代码对比，其实是找不同：右边的文件被改了几处，比如 === 变成 ==、< 变成 <=、少了一个 !、两个参数换了位置。点中改动就会像真正的 diff 一样标出来，点错扣 3 秒。一局的时间用完之前，通过的轮数越多越好；剩下的时间带进下一轮，文件越来越长，改动越来越隐蔽。按 Esc 一键切回普通的对比视图。",
  "tags": ["益智", "找不同", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点击你认为被改过的代码（左右都可以）" },
    { "input": "滚轮 / 拖动 / 方向键", "action": "同时滚动两侧代码" },
    { "input": "Tab", "action": "提示一处改动（扣 10 秒）" },
    { "input": "Esc", "action": "老板键：切回普通对比视图并暂停" },
    { "input": "M", "action": "开启或关闭声音（默认关闭）" }
  ],
  "cover": { "symbol": "差", "eyebrow": "SPOT THE DIFF", "accent": "#007acc", "accentSecondary": "#89d185" },
  "sortOrder": 25,
  "achievements": [
    { "key": "quick_eye", "name": "眼疾手快", "description": "2 秒内连续找到两处改动。", "symbol": "快" },
    { "key": "perfect", "name": "零误报", "description": "第 3 轮起，一轮里不点错、不用提示。", "symbol": "准" },
    { "key": "level_5", "name": "代码审查", "description": "一局通过 5 轮。", "symbol": "审" },
    { "key": "finds_30", "name": "火眼金睛", "description": "一局找到 30 处改动。", "symbol": "眼" },
    { "key": "level_10", "name": "首席审查官", "description": "一局通过 10 轮。", "symbol": "首" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "levels", "name": "通过轮数", "maxPerRound": 500 },
    { "key": "finds", "name": "找到改动", "maxPerRound": 5000 }
  ]
}
```

### Disguise

`app` = `vscode`, `title` = `report.service.ts (工作树) ↔ report.service.ts - moyufun-admin - Visual Studio Code` (80 characters), also set as `document.title` and drawn centred in the title bar. `announce()` sends `ready` then `disguise` on load and at 0.5, 2 and 5 s. The title never changes, so no other `disguise` is sent.

### Corpus and tokenizer

- `CORPUS`: array of 24 line arrays, parsed from the text block.
- `tokenize(line)` → `[{ t, k, c }]`: text, kind (`com`, `str`, `num`, `id`, `ws`, `op`) and start column. One regex, `TOKEN_RE`, matches line comments, `'…'`, `"…"` and single-line template strings as one token each, numbers, identifiers, whitespace runs, the multi-character operators (`===`, `!==`, `...`, `=>`, `??`, `?.`, `&&`, `||`, `<=`, `>=`, `==`, `!=`, `+=`, `-=`, `++`, `--`, `**`) and any other single character. Joining the tokens gives back the line exactly.
- `paint(lines)` adds a Dark+ colour per token: control keywords `#c586c0`, other keywords and literals `#569cd6`, ALL_CAPS constants `#4fc1ff`, capitalised types `#4ec9b0`, calls `#dcdcaa`, variables `#9cdcfe`, strings `#ce9178`, numbers `#b5cea8`, comments `#6a9955`, punctuation `#d4d4d4`, and bracket-pair colours `#ffd700` / `#da70d6` / `#179fff` by depth.

### Mutation operators

`OPS[name](tokens, i, idCount, rnd)` returns `{ i, j, text, tier }` (replace tokens `i … j-1` with `text`) or nothing.

| op | tier | change |
| --- | --- | --- |
| `bool` | 1 | `true` ↔ `false` |
| `nullish` | 1 | `null` ↔ `undefined` |
| `decl` | 1 | `const` ↔ `let` (not after `as`) |
| `num` | 1 (2 if ≥ 4 digits) | last digit `d` → `d + 1` (`9` → `8`) |
| `method` | 1–3 by pair | member name after `.`/`?.` from `SWAPS` |
| `eq` | 2 | `===` ↔ `==`, `!==` ↔ `!=` (spaced) |
| `rel` | 2 | `<` ↔ `<=`, `>` ↔ `>=` (spaced) |
| `logic` | 2 | `&&` ↔ `||`, `??` → `||` (spaced) |
| `arith` | 2 | `+` ↔ `-`, `*` ↔ `/`, `+=` ↔ `-=` (spaced), `++` ↔ `--` |
| `rename` | 2 | an identifier used ≥ 2 times in the file, not after `.`, gains or loses a trailing `s` |
| `not` | 3 | `!x` → `x`, `!(` → `(`, or `if (x` → `if (!x` |
| `args` | 3 | `(a, b)` → `(b, a)` for two simple tokens |
| `str` | 3 | one lowercase letter outside `${…}` in a string with ≥ 3 letters becomes one of `aeuskdt` |
| `chain` | 3 | `?.` ↔ `.` between two identifiers |

### Levels

`generateLevel(n, seed)` → `{ n, seed, funcs, left, right, diffs, maxLen }`. It shuffles the corpus with `mulberry32` seeded from `(seed, n)`, takes `funcCount(n)` snippets joined by blank lines, enumerates every operator site, filters by `tiersFor(n)` (falling back to all tiers if fewer lines than needed have a site), then picks `diffCount(n)` changes per D6. Each diff is `{ line, op, tier, from, to, l: [a, b], r: [a, b'], found, flash }`, with column spans on the left and right line.

| level | changes | snippets | tiers | time added |
| --- | --- | --- | --- | --- |
| 1 | 3 | 1 | 1 | 36 s |
| 2 | 4 | 1 | 1–2 | 46 s |
| 3 | 5 | 2 | 1–3 | 55 s |
| 4 | 5 | 2 | 1–3 | 53 s |
| 5 | 6 | 2 | 2–3 | 60 s |
| 6 | 7 | 3 | 2–3 | 67 s |
| 7 | 8 | 3 | 2–3 | 72 s |
| 8 | 8 | 3 | 2–3 | 68 s |
| 9 | 9 | 3 | 2–3 | 72 s |
| 10 | 9 | 3 | 2–3 | 68 s |
| 11+ | 9 | 3 | 2–3 | 63 s |

Formulas: `diffCount(n) = min(9, 2 + ceil(0.75 n))`, `funcCount(n) = n ≤ 2 ? 1 : n ≤ 5 ? 2 : 3`, `levelTime(n) = round(diffCount(n) × max(7, 12 − 0.5 (n − 1)))`.

### State and rules

`state`: `ready` (level shown, clock frozen) → `play` → `clear` (1.2 s pause) → `play` … → `over`. `boss` is separate and freezes `update`.

- `newRun(seed?)`: new `runSeed` (random unless given), resets counters, `roundAchievements` and the log, loads level 1 in `ready`.
- `loadLevel(n)`: generates and paints the level, `clock += levelTime(n)`, resets per-level `wrongs`, `hints`, `lastFindT`, scroll.
- `clickCode(pane, line, col)` → `'find' | 'wrong' | 'none'` per D8; calls `begin()` (sends `start` once) before acting.
- `find(d)`: marks it, `finds++`, `quick_eye` if the previous find in this level was ≤ 2 s of `gameT` ago, `finds_30` at 30, then `clearLevel()` when the level is complete.
- `wrong(pane, line, token)`: `clock −= 3`, `wrongs++`, squiggle; ends the run if the clock reaches 0.
- `hint()` (Tab): next unfound change after the last hinted line, wrapping; `clock −= 10`, `hints++`, yellow squiggle, scrolls it into view.
- `clearLevel()`: `levelsCleared++`, then `perfect` (level ≥ 3, no wrong clicks, no hints), `level_5`, `level_10`; enters `clear`.
- `endRun()`: `over`, saves best, sends `stats` then `end`.
- `update(dt)`: animations, the clock in `play`, the pause in `clear`, `overT` in `over`; returns early in boss mode.
- `layout(view)`, `paneAt(L, x, y)`, `handleClick(x, y)`, `draw()`.

### Screens

There is only the editor. What changes:
- **Ready:** level 1 unmarked, the hint in the status bar.
- **Play:** found changes marked, squiggles, caret and current-line border where the player clicked, `行 N，列 M` in the status bar, log in the terminal.
- **Clear:** status `✓ 本轮比较完成` for 1.2 s, then the next level replaces both panes.
- **Over:** all changes revealed, status `时间到 · 找到 N 处 · 最佳 B · 点击编辑器重新开始` with a red `⏱ 0:00`, summary in the terminal.
- **Boss:** decoy diff (D12).

### Achievements

Sent through `unlockAchievement(key)`, once per run, always before `stats`/`end` (all are earned during play).

| key | Trigger |
| --- | --- |
| `quick_eye` | Two finds in the same level ≤ 2 s apart (`gameT`). |
| `perfect` | A level ≥ 3 cleared with no wrong clicks and no hints. |
| `level_5` | 5 levels cleared in the run. |
| `finds_30` | 30 changes found in the run. |
| `level_10` | 10 levels cleared in the run. |

### Stats

In `endRun()`, before `end`: `emitMoYuFunStats({ rounds: 1, levels: min(levelsCleared, 500), finds: min(finds, 5000) })`.

### Headless test

`v1/test_headless.js` stubs the canvas (`measureText` returns 7 px per character), `document.getElementById('corpus')`, `parent.postMessage` and the keydown listeners, then evals the main script. It checks:
- Load sends exactly `ready`, `disguise` (app, title, five keys); `document.title` is the disguise title.
- Corpus: 24 snippets, 20–40 lines, ASCII, ≤ 66 characters, tokenizer round-trips.
- Generator over levels 1–14 × seeds 1–40: deterministic, `diffCount(n)` changes, one per line, text changed only inside the spans, no lookalike-only changes, level 1 tier 1 with one snippet, every operator appears.
- Layout at 1280×800, 1920×1080, 900×600, 600×900, 375×667: panes inside the window and not overlapping; wide windows side by side with font ≥ 10.
- Whitespace click does nothing and does not start; a wrong click sends `start`, costs 3 s and squiggles; a click at real canvas coordinates through `handleClick` finds a change; re-clicking it costs nothing.
- Tab costs 10 s and targets an unfound change; Esc freezes the clock and ignores clicks; `M` toggles sound.
- Deterministic run (`newRun(42)`), clearing 10 levels alternately from either pane, then the clock running out: `quick_eye, perfect, level_5, finds_30, level_10, stats, end` with stats `{ rounds: 1, levels: 10, finds: 64 }`.
- Restart only after 1 s; no clock or messages in `ready`; running out of time by a wrong click sends `start, stats, end`; a level 3 with a wrong click gives no `perfect`; every message has exactly its keys.

## Milestones

Each milestone ends with `node games/bug-hunt/v1/test_headless.js` passing.

**M1 · Playable.** Corpus, tokenizer, painter, operators, generator, chrome, hit-testing, clock, hints, boss key, sound.
Done when: a run plays in a browser from level 1 until the time runs out, and the generator tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic tests, `README.md`.
Done when: `pnpm game check bug-hunt v1` passes.

**M3 · Release.** `pnpm game:local publish bug-hunt v1 --yes`, a browser check of `/play/bug-hunt` with 伪装 mode, then the production publish.
Done when: camouflage mode shows the VS Code title and icon, a logged-in run records `rounds`/`levels`/`finds`, and production `/play/bug-hunt` loads.

## Open items

- Time budget (`levelTime`, the 3 s / 10 s penalties) needs a human playtest; the headless test only checks the formulas' consequences. Owner, during M3.
- Whether tier-3 `str` changes inside long SQL strings feel fair at 10–11 px in a small iframe. Owner, during M3.

## Implementation notes

- The Write tool turned `̀` escapes in the corpus into real combining characters; the corpus avoids `\u` escapes altogether and the test enforces ASCII.
- Lookups in `FLIPS` and `SWAPS` check the token kind or use `Object.hasOwn`, and `idCount` is `Object.create(null)`, so identifiers like `constructor` never hit `Object.prototype`.
- `layout()` is recomputed for every draw, click and wheel event (no cached layout), so hit-testing always uses the current window size and level.
- Headless Chrome clamps `--window-size` to about 500 px wide; check phone widths through an iframe wrapper instead.
- At 375 px wide the panes stack at the 8 px minimum font and the longest lines clip. That is accepted for phones (the disguise targets desks).

### M3 notes

- Local publish registered the game. On `/play/bug-hunt` in 伪装 the tab read `report.service.ts (工作树) ↔ report.service.ts - moyufun-admin - Visual Studio Code`, and the first frame is an ordinary compare view with the terminal line `git difftool HEAD~1 -- src/services/report.service.ts`.
- Level 1 was cleared with three real clicks on the right pane (`0 → 1` on line 6, `0 → 1` on line 10, `const → let` on line 24): each find coloured both lines with diff red/green and logged a `✓` line in the terminal; the status bar went 0/3 → 2/3, and the level ended with `第 1 轮比较完成，剩余 36s 带入下一轮`. No console errors.

