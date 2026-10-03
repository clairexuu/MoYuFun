# 潮汐牌局 (`tide-cards`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A turn-based card duel on a beach. Five columns of sand run from the sea to the dunes, and every turn the tide covers some of them, following a visible forecast. Every card has two printed effects, 陆地 and 水下, and acts with whichever side its column is on when the turn resolves. A run is three duels (小章鱼, 海妖, 海妖女王); after each win you add one of three new cards to your deck. Mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/tide-cards/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, the `resize()`/`view` pattern (with `document.documentElement.clientWidth/Height`) and the audio helpers (`ensureAudio`, `tone`, `noiseHit`). Cards are drawn shapes plus emoji via `fillText`. | Same package contract; the water overlay and card flips are easier on one canvas than in DOM. |
| D2 | **One rule decides a card's side:** at resolution, a card in column `c` (0 = sea side … 4 = dunes) uses its 水下 effect if `c < level`, else its 陆地 effect, where `level` (0–5) is the tide for that resolution. | One sentence to learn; everything tactical follows from the forecast. |
| D3 | You place cards *before* the tide moves: the board shows the current water, and pressing 结束回合 moves the tide to the forecast's next level, then resolves. The forecast always shows 3 levels ahead. | Placement is a bet on where the water will be, which is the game. |
| D4 | Placed cards are **units** that stay on the board and act every resolution until destroyed, unless the card is 一次性 (acts once, then goes to the discard pile). | Persistent units make later tides matter too: a shark left behind by a falling tide beaches itself. |
| D5 | Resolution order: player cards columns 0→4, then enemy cards 0→4, then the enemy passive. Win/loss is checked after every hit and stops the resolution. | Fully deterministic and readable; acting first is the player's counterplay to the visible enemy intent. |
| D6 | Enemy intent is fully visible: the enemy places its cards at the start of each turn, every enemy card highlights the side it will use, and the HUD shows the exact predicted result (`preview()` runs `resolve()` on a clone). | Resolution uses no randomness, so the preview is exact and the player plans against facts, not guesses. |
| D7 | Tides are a seeded bounded random walk per duel (`genTides`). Tide cards shift one future level by ±n, clamped to 0–5. | Readable rhythm (rise, turn, fall) with variety; tide cards let a skilled player bend it. |
| D8 | A round is a whole run: `start` when 出海 is pressed, `end` when the run is won (duel 3) or lost. HP carries over between duels, with +8 healing after each win. | Stats and achievements stay one per run; the 3 duels take 5–9 minutes. |
| D9 | Randomness (shuffles, enemy draws, tides, reward offers) goes through `rng()` (default `Math.random`, `mulberry32` in tests). Logic functions take the state object `st` and never touch the canvas; animation is cosmetic, driven by `update(dt)`. | Headless tests and the bot balance gate run the real rules. |
| D10 | Input uses Pointer Events: tap a hand card, then tap a slot; or drag the card onto a slot. Hover (mouse) or long-press 400 ms (touch) shows a card's full text. | One code path for mouse and touch; long-press replaces hover on phones. |
| D11 | The headless test includes a **balance gate**: a tide-aware bot must win far more runs than a tide-blind bot (numbers in *Balance*). | "Ignoring the tide loses" becomes a checked fact, not a hope. |

## Out of scope

More than 3 duels, branching maps, card upgrades or removal, shops, relics, multiple heroes, saving a run between page loads, undo, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/tide-cards/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "tide-cards",
  "name": "潮汐牌局",
  "shortDescription": "看准潮水出牌：每张牌都有陆地和水下两种效果。",
  "description": "在海滩上和海怪对决。沙滩分成五列，潮水每回合涨落，被淹没的列里所有卡牌翻到水下一面。照着潮汐预报出牌，连续击败小章鱼、海妖和海妖女王，每赢一场挑一张新牌加入牌组。",
  "tags": ["卡牌", "策略", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点选手牌再点沙滩格出牌，也可直接拖动" },
    { "input": "悬停 / 长按", "action": "查看卡牌两面的完整效果" },
    { "input": "1–8 然后 1–5", "action": "选手牌，再选列" },
    { "input": "空格 / 回车", "action": "结束回合" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "潮", "eyebrow": "TIDE DUEL", "accent": "#2a9dd6", "accentSecondary": "#f2d49b" },
  "sortOrder": 150,
  "achievements": [
    { "key": "first_duel", "name": "赶海人", "description": "击败小章鱼。", "symbol": "赶" },
    { "key": "siren", "name": "斗海妖", "description": "击败海妖。", "symbol": "妖" },
    { "key": "queen", "name": "潮汐之主", "description": "击败海妖女王，赢下整趟出海。", "symbol": "冠" },
    { "key": "tide_turner", "name": "呼风唤潮", "description": "一趟出海中用卡牌改写潮位 3 次。", "symbol": "螺" },
    { "key": "big_wave", "name": "一浪千斤", "description": "一次结算对敌方主将造成至少 15 点伤害。", "symbol": "浪" },
    { "key": "iron_shell", "name": "滴水不漏", "description": "一场对决中一点生命都没掉就获胜。", "symbol": "壳" }
  ],
  "stats": [
    { "key": "rounds", "name": "出海", "maxPerRound": 1 },
    { "key": "wins", "name": "通关", "maxPerRound": 1 },
    { "key": "duels", "name": "对决胜场", "maxPerRound": 3 },
    { "key": "damage", "name": "造成伤害", "maxPerRound": 1000 }
  ]
}
```

### Rules

- **Board:** 5 columns, `c = 0` (礁边, next to the sea) to `c = 4` (沙丘). Each has one enemy slot and one player slot. Slots hold `{ id, hp }` or `null`.
- **Turn `t`** (1-based): `beginTurn` → player phase → `endTurn` (resolution). The water shown during the player phase is `tides[t−1]`; the resolution uses `tides[t]`.
- **`beginTurn(st, rnd)`:** both armors reset to 0; `shells = SHELLS[duel] + pendShell`; draw `5 + pendDraw` cards (hand max 8; reshuffle the discard pile into the draw pile with `rnd` when empty); reset `pendShell`/`pendDraw`; then `enemyPlace(st, rnd)`.
- **Player phase:** `play(st, handIdx, col)` costs the card's 贝壳 and puts it in the player slot `col`. Placing on an occupied own slot replaces that card (the old one goes to the discard pile). Returns `false` if 贝壳 are short or the phase is not `play`.
- **`endTurn()`:** the hand goes to the discard pile, then `resolve(st)`. If no one died and `t` was 20, the duel is lost (`潮水退去，<敌人>溜走了`). Otherwise `t++` and `beginTurn`.
- **`resolve(st) → events[]`:** pure (no `rnd`, no SDK). 1) `level = tides[t]`. 2) Each player card, columns 0→4, applies its active side's effects in order; 一次性 cards then go to the discard pile. 3) The same for enemy cards, with targets mirrored. 4) Enemy passive. A card at `hp ≤ 0` is removed at once (owner's discard pile) and does not act later. After every hit on a hero, `hp ≤ 0` ends the resolution with `result = 'win' | 'lose'`.
- **Damage to a hero** is absorbed by armor first. **一次性 cards can't be targeted**: attacks into their column go past them.
- **Resources:** 贝壳 per turn `SHELLS = [3, 4, 4]` by duel; unspent 贝壳 are lost. Player HP 30 (max 30); after duel 1 and 2 wins, heal 8. Starting deck below (10 cards); every duel starts by shuffling all owned cards into the draw pile with an empty board.

### Effects

Effects are `[kind, n]`. Text in brackets is the short label printed on the card; the long text is the detail popover.

| kind | label | long text (detail popover) |
| --- | --- | --- |
| `atk` | 攻 n | 攻击对面同一列的卡，没有就打敌方主将 n 点。 |
| `pierce` | 穿 n | 直接对敌方主将造成 n 点伤害。 |
| `adj` | 溅 n | 对相邻两列对面的卡各造成 n 点伤害。 |
| `zap` | 电 n | 对所有处在水下的对面卡各造成 n 点伤害。 |
| `armor` | 甲 n | 己方主将获得 n 点护甲（到下回合开始清零）。 |
| `heal` | 愈 n | 己方主将回复 n 点生命（不超过上限）。 |
| `shell` | 贝 +n | 下回合多 n 个贝壳（敌方无效果）。 |
| `draw` | 抽 +n | 下回合多抽 n 张牌（敌方无效果）。 |
| `tide` | 涨潮 n / 退潮 n | 把下一次结算的潮位（`tides[t+1]`）改 ±n，限制在 0–5。 |
| `self` | 损 n / 冲垮 (n = 99) | 这张卡自己失去 n 点耐久。 |
| `none` | — | 没有效果。 |

### Player cards

`hp` 0 means 一次性. Pool: **S** = starting deck count, **R** = reward pool.

| id | name | emoji | cost | hp | 陆地 | 水下 | pool |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hermit` | 寄居蟹 | 🦀 | 1 | 3 | 攻 2 | 甲 3 | S×3 |
| `castle` | 沙堡 | 🏰 | 1 | 5 | 甲 3 | 冲垮 | S×2 |
| `clown` | 小丑鱼 | 🐠 | 1 | 2 | 损 1 | 攻 3 | S×2 |
| `kelp` | 海带 | 🌿 | 1 | 3 | 贝 +1 | 愈 2 | S×2 |
| `conch` | 海螺号角 | 🐚 | 0 | 0 | 退潮 1 | 涨潮 1 | S×1 |
| `lobster` | 龙虾 | 🦞 | 2 | 4 | 攻 4 | 攻 1 | R |
| `turtle` | 海龟 | 🐢 | 3 | 6 | 甲 3 | 攻 3 | R |
| `pelican` | 鹈鹕 | 🐦 | 2 | 3 | 穿 3 | 损 1 | R |
| `puffer` | 河豚 | 🐡 | 2 | 3 | 损 2 | 攻 2, 溅 2 | R |
| `eel` | 电鳗 | ⚡ | 3 | 4 | 损 1 | 电 3 | R |
| `coconut` | 椰子 | 🥥 | 1 | 0 | 攻 4 | 愈 3 | R |
| `wave` | 浪花 | 🌊 | 1 | 0 | — | 攻 3, 溅 2 | R |
| `moon` | 月光贝 | 🌙 | 1 | 0 | 退潮 2 | 涨潮 2 | R |
| `pearl` | 珍珠蚌 | 🦪 | 2 | 4 | 甲 1 | 贝 +2 | R |
| `gull` | 海鸥 | 🕊️ | 1 | 2 | 攻 1, 抽 +1 | — | R |
| `parasol` | 遮阳伞 | ⛱️ | 2 | 5 | 甲 4 | 冲垮 | R |
| `bottle` | 漂流瓶 | 🍾 | 0 | 0 | 抽 +1 | 抽 +2 | R |
| `dolphin` | 海豚 | 🐬 | 3 | 5 | 损 2 | 攻 4, 穿 2 | R |
| `starfish` | 海星 | ⭐ | 1 | 4 | 愈 1 | 愈 2, 甲 1 | R |
| `net` | 渔网 | 🎣 | 2 | 0 | 攻 3, 溅 3 | 攻 1 | R |

Data shape: `CARDS[id] = { name, emoji, cost, hp, land: [[kind, n]…], water: [[kind, n]…] }`; `STARTER` lists the 10 starting ids; `POOL` lists the 15 reward ids in table order. The tide card in the test is `conch`.

### Enemies

Enemy cards (cost unused):

| id | name | emoji | hp | 陆地 | 水下 |
| --- | --- | --- | --- | --- | --- |
| `e_shrimp` | 小虾 | 🦐 | 2 | 攻 1 | 攻 2 |
| `e_tentacle` | 触手 | 🐙 | 4 | 攻 1 | 攻 3 |
| `e_ink` | 墨汁 | 💧 | 0 | 穿 1 | 穿 3 |
| `e_reef` | 礁石 | 🪨 | 8 | 甲 2 | 甲 1 |
| `e_squid` | 鱿鱼 | 🦑 | 4 | 损 1 | 攻 2, 溅 2 |
| `e_shark` | 鲨鱼 | 🦈 | 5 | 损 2 | 攻 5 |
| `e_song` | 海妖之歌 | 🎶 | 0 | 愈 3 | 穿 4 |
| `e_whirl` | 漩涡 | 🌀 | 0 | — | 电 3 |
| `e_tsunami` | 巨浪 | 🌊 | 0 | 攻 2 | 攻 4, 溅 3 |
| `e_guard` | 蟹卫兵 | 🦀 | 6 | 攻 2 | 甲 2 |

| duel | name | emoji | HP | cards / turn | tide min–max | p2 | placement | passive | deck |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 小章鱼 | 🐙 | 22 | 2 | 1–3 | 0.15 | random | — | shrimp×3, tentacle×2, ink×2, reef×1 |
| 2 | 海妖 | 🧜 | 34 | 2, and 3 when `t % 3 == 0` | 0–4 | 0.20 | greedy | 海妖之歌: if `level ≥ 4`, 穿 2 | tentacle×2, squid×2, shark×2, song×2, ink×2 |
| 3 | 海妖女王 | 🧜 + 👑 | 48 | 3 | 0–5 | 0.30 | greedy | 海啸: if `level == 5`, every player card loses 2 hp | shark×2, tentacle×2, whirl×2, tsunami×2, song×1, guard×2, reef×1 |

- The enemy deck is shuffled with `rnd` at duel start; it draws its cards each turn, reshuffling its discard pile when empty. A drawn card with no empty enemy slot goes straight to the enemy discard pile.
- **random:** each card goes to a uniformly random empty slot. **greedy:** each card goes to the empty slot with the highest `sideValue(st, 'e', id, col, tides[t])`, ties to the lowest column.
- `sideValue(st, owner, id, col, level)` scores the side the card would use: `atk` n, `pierce` n, `adj` n × opposing cards in `col ± 1`, `zap` n × opposing units in wet columns, `armor` 0.8n, `heal` 0.8n (0 at full HP), `shell`/`draw` 1.5n, `tide` 1, `self` −1.5 × min(n, card hp), `none` 0. It is exported for the bots.

### Tides

`genTides(seed, min, max, p2) → number[24]` (pure):

```js
const r = mulberry32(seed); let lvl = min + 1, dir = 1; const out = [lvl];
while (out.length < 24) {
  const x = r(), step = x < 0.15 ? 0 : x < 0.15 + p2 ? 2 : 1;
  lvl += dir * step;
  if (lvl >= max) { lvl = max; dir = -1; } else if (lvl <= min) { lvl = min; dir = 1; }
  out.push(lvl);
}
```

`startRun()` draws `runSeed = Math.floor(rng() * 2 ** 32)`; duel `i` uses `genTides(runSeed + i, …)`. Tide effects edit `st.tides[t+1]` in place; later forecast entries are unchanged.

### Screens and layout

- **Logical area:** 480 × 800 portrait, scaled by `min(w/480, h/800)` and centred; the margin is filled with sand `#f2d49b`. The sea background is `#2a9dd6`.
- **Enemy panel (y 0–90):** emoji at 48 px, name, HP bar `22/22`, `🛡 n`, passive text, and the intent line `本回合预计：你 −N ❤ · 敌 −M ❤` from `preview()`, refreshed after every play.
- **Tide forecast (y 96–144):** `潮汐预报` and four mini gauges (5 cells, blue = wet): `现在` `tides[t−1]`, `结算` `tides[t]`, `下回合` `tides[t+1]`, `再下回合` `tides[t+2]`, each with ↑/↓/→.
- **Board (y 150–520):** column `c` at `x = 12 + 92c`, 84 wide. Enemy cards y 160–290, labels y 300–340 (`礁边` `浅滩` `沙滩` `高滩` `沙丘`), player cards y 350–480 (all cards 84 × 130). Water: `rgba(42,157,214,0.35)` over columns `< level` with an animated wavy edge; a white dashed line marks the `结算` level. Cards whose side will change at this resolution show a `↻` badge.
- **Card face:** cost bubble `🐚 n` top-left (hand only), emoji 30 px, name, then a sand-coloured 陆地 strip and a blue 水下 strip with the labels. The side that will act at this resolution is bright with `▶`; the other is at 40% opacity. Units show `耐久 n` bottom-right; 一次性 cards show `一次`.
- **Player panel (y 528–592):** HP bar `❤ 30/30`, `🛡 n`, `🐚 3/3`, `牌堆 n · 弃牌 n`, `第 t / 20 回合`.
- **Hand (y 600–740):** up to 8 cards, overlapping when more than 5; a selected card rises 16 px. While a card is selected or dragged, valid slots glow and show a ghost `落在这里：陆地 · 攻 2` (or `替换 寄居蟹`). **结束回合** button at x 340–468, y 748–792; a hint line on its left (`选一张牌` / `贝壳不够`).
- **Resolution animation:** the water tweens to the new level over 0.6 s while cards flip (scaleX 1→0→1); then each event plays 0.3 s apart (acting card pulses, floating numbers `−3` red / `+3🛡` grey / `+2❤` green, dying cards fade). Input is ignored until it finishes; then the enemy's new cards slide in.
- **Start:** `潮汐牌局`, `看准潮水，把牌放在对的沙滩上`, three rule lines (`被淹没的列，卡牌翻到水下一面` / `结束回合时潮水才会移动，照着预报出牌` / `连胜三只海怪，每胜一场挑一张新牌`), button `出海`.
- **Duel banner:** `第 1 战 · 小章鱼` for 1.2 s.
- **Reward:** `击败了小章鱼！` `生命回复 8` `选一张新牌加入牌组`, three offered cards (3 distinct `POOL` ids drawn with `rnd`) and `跳过`.
- **Won:** `潮汐之主！` `你击败了海妖女王`, with total turns, damage dealt and deck size; button `再出海一次`.
- **Lost:** `被潮水卷走了` / `倒在第 N 战 · <敌人>`, or `潮水退去，<敌人>溜走了` on the turn cap; button `再出海一次`.
- **Sounds** (`tone`/`noiseHit`): card placed (short pluck), water moving (low filtered noise 0.6 s), hit, armor clink, card destroyed, duel won (rising arpeggio), run lost (falling tone).
- **Keyboard:** with no card selected, `1`–`8` selects a hand card; with one selected, `1`–`5` plays it into that column; `Esc` deselects; Space/Enter ends the turn; `M` mutes.

### Functions

State `S = { phase: 'title'|'play'|'anim'|'reward'|'won'|'lost', duel, t, tides, hp, armor, shells, pendShell, pendDraw, owned, draw, discard, hand, pBoard, eBoard, enemy: { hp, armor, draw, discard }, offer, run: { tideShifts, damage, duelsWon, hpLostDuel, resDmg } }`.

- `genTides(seed, min, max, p2)`, `resolve(st)`, `play(st, handIdx, col)`, `beginTurn(st, rnd)`, `enemyPlace(st, rnd)`, `sideValue(…)`, `preview(st) → { pLoss, eLoss }`: pure on `st` as described.
- `startRun()`: resets `S` and `roundAchievements`, sends `start`, calls `startDuel(0)`.
- `startDuel(i)`: enemy, tides, shuffled deck, `t = 1`, `hpLostDuel = 0`, `beginTurn`.
- `playCard(handIdx, col)`: `play(S, …)` plus sound and preview refresh.
- `endTurn()`: runs the resolution, then walks the events: each hit on the enemy hero adds to `run.damage` and `run.resDmg` (absorbed + HP lost, no overkill; `resDmg` resets per resolution); each hit on the player hero adds HP lost to `hpLostDuel`; each tide effect does `tideShifts++`. Then `winDuel()`, `loseRun()` or the next turn.
- `winDuel()`: `duelsWon++`, achievements, then `winRun()` on duel 3, else heal 8, `offer`, phase `reward`.
- `pickReward(i)`: `i` in 0–2 adds `offer[i]` to `owned`, `-1` skips; then `startDuel(duel + 1)`.
- `winRun()` / `loseRun()`: stats, `end`.
- `update(dt)`: advances animations; `update(10)` finishes any animation.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `big_wave` | In `endTurn`, when `run.resDmg` reaches ≥ 15 (sent before the win check). |
| `tide_turner` | In `endTurn`, when `run.tideShifts` reaches 3 (a clamped shift still counts). |
| `first_duel` | `winDuel()` on duel 1. |
| `siren` | `winDuel()` on duel 2. |
| `queen` | `winDuel()` on duel 3. |
| `iron_shell` | `winDuel()` with `hpLostDuel == 0`, sent after the duel's key. |

### Stats

In `winRun()`/`loseRun()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, duels: run.duelsWon, damage: Math.min(run.damage, 1000) })`.

### Balance

The test file holds two bots (not shipped in `index.html`). Each turn a bot repeatedly plays the affordable (card, empty column) pair with the best score while that score is > 0, then ends the turn.
- **smart:** score = `sideValue` at `tides[t]` + 0.5 × `sideValue` at `tides[t+1]` (units only). Rewards: the first offered card in the order `dolphin, turtle, lobster, eel, puffer, net, moon, pelican, coconut, wave, pearl, parasol, starfish, gull, bottle`.
- **blind:** scores every card as if the column were dry (level 0) and puts it in a random empty column. Rewards: `offer[0]`.

Gate, over full runs with `rng = mulberry32(seed)` for seeds 1–100: smart wins ≥ 35 runs and ≥ 85 first duels; blind wins ≤ 5 runs and ≤ 60 first duels. If it fails, tune in this order and update the tables here: enemy HP, enemy cards per turn, enemy card numbers, then player card numbers.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern (`setTimeout` stubbed to a no-op), with `rng = mulberry32(…)`.

**Load.** Only `ready` is sent until `startRun()`.

**Tides.** `genTides` is deterministic; every value is in `[min, max]`; consecutive values differ by 0–2.

**Rules** (each on a fresh `startRun()` with both boards and the hand cleared and `tides` set to a constant array):
- `castle` at level 5 is destroyed; `clown` on land loses 1 hp per resolution and dies on the second.
- Armor absorbs before HP; armor is 0 after `beginTurn`.
- `adj` from column 0 hits only column 1; `zap` hits only wet columns.
- A `conch` on land at turn `t` sets `tides[t+1]` one lower, clamped at 0.
- A player `atk` that kills an enemy unit stops that unit from acting this resolution.
- `preview()` predicts exactly what `endTurn()` then does, over 50 random turns.
- After `startRun()`, 3 offers from a seeded run are distinct `POOL` ids.

**Balance gate** as above.

**Deterministic run.** `rng = mulberry32(1)`; message log cleared after load.
1. `startRun()`.
2. Duel 1: tides all 1; enemy board empty, enemy HP 2; hand `[hermit]`; `playCard(0, 4)`; `endTurn()` → `first_duel, iron_shell`.
3. `pickReward(0)`. Duel 2: tides all 0; both boards empty, then `pBoard[0..3]` = four `lobster`; enemy HP 15, armor 0; `endTurn()` → `big_wave, siren`.
4. `pickReward(-1)`. Duel 3: tides all 1; both boards empty; hand `[conch, conch, conch]`; play them into columns 1, 2, 3; `endTurn()` → `tide_turner`.
5. Clear the enemy board again; enemy HP 1; `pBoard[4]` = `lobster`; `endTurn()` → `queen`, then the run ends.

Expected sequence: `start, first_duel, iron_shell, big_wave, siren, tide_turner, queen, stats, end`. Expected stats: `{ rounds: 1, wins: 1, duels: 3, damage: 18 }` (2 + 15 + 1).

**Loss.** `startRun()`; HP 1, armor 0; boards and hand cleared; `eBoard[0] = { id: 'e_shrimp', hp: 2 }`; tides all 3; `endTurn()`. Expected: `start, stats { rounds: 1, wins: 0, duels: 0, damage: 0 }, end`.

**Turn cap.** `startRun()`; clear boards and hand before each of 20 `endTurn()` calls; the 20th sends `stats` with `wins: 0`, then `end`, and the phase is `lost`.

## Milestones

Each milestone ends with `node games/tide-cards/v1/test_headless.js` passing.

**M1 · Playable run.** Rules, tides, all cards and enemies, enemy placement, preview, screens, tap and drag input, keyboard, animations, sounds, the rules tests and the balance gate.
Done when: a full run plays in a browser with mouse and with touch emulation, and the rules tests and balance gate pass.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic run, loss and turn-cap tests, `README.md`.
Done when: `pnpm game check tide-cards v1` passes.

**M3 · Local release.** `pnpm game:local publish tide-cards v1 --yes`.
Done when: `/play/tide-cards` plays locally, and a logged-in run that beats 小章鱼 unlocks `first_duel` and, when it ends, updates the stats board. The owner runs the production publish.

## Open items

- Balance numbers are designed, not measured. The implementer tunes them in M1 until the gate passes (order in *Balance*) and records the final tables here; a human playtest in M3 confirms that a run takes 5–9 minutes. Owner: implementer (M1), owner playtest (M3).
- 🪨 (Unicode 13), 🦪 (12) and 🧜 (10) may not render on old Android. If the M3 playtest shows tofu, the implementer swaps in older emoji. Owner: implementer (M3).
