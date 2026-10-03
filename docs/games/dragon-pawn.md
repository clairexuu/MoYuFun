# 龙的当铺 (`dragon-pawn`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A management and appraisal game. You are a dragon running a pawnshop at the mouth of a dungeon. Heroes pawn treasures for gold before they descend. Check each treasure against the 鉴定手册 to catch forgeries, then haggle over the loan. Survivors repay with interest, except forgers you failed to catch, who abscond. The dead forfeit their pledge to your hoard, and a fake is worth nothing. Fill the hoard to 1000 金 by the end of day 7. Mouse or touch, single-player, about 8 minutes.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/dragon-pawn/v1/index.html`, vanilla JS, no dependencies. The UI is DOM, with one `<canvas>` for the treasure drawing. Copy from 摸了个鱼 v1 only the SDK block, `resize()` (with `document.documentElement.clientWidth/Height`) and the audio helper `tone`. | The game is mostly text: the manual, the claim card, dialogue and buttons. DOM gives wrapping text, `<input type="range">` for the offer and native buttons. Only the treasure needs drawing. |
| D2 | The logical stage is a 540 × 960 portrait `#stage` div. `resize()` sets `transform: scale(s)` with `s = min(cw / 540, ch / 960)` and centres it. | One layout for phones and desktop iframes, as in 摸了个鱼. |
| D3 | Treasures come from fixed manual tables. `buildItem(spec)` computes `flaws = findFlaws(item)`, and `fake = flaws.length > 0`. The generator plants 1–2 flaws in a fake by breaking a table rule, and the test checks that `findFlaws` finds exactly the planted parts. | Forgery is defined by the manual, so every fake is provable from the manual and no genuine item has a flaw, by construction and by test. |
| D4 | The hero's claim (type, workshop, mine) is taken as true. Flaws are the four physical parts that can contradict it: 印记 (mark), 铭文 (inscription), 宝石 (gem colour) and 材质 (material). Weight is not used. | Each check is one table lookup, so it fits an 11-second customer. Weight would need arithmetic against a per-type table. Material colour stands in for "weight/colour". |
| D5 | Marking parts is private. `指出疑点` (once per hero) confronts the hero with the marks. If any mark hits a real flaw, the hero is 露馅: the ask and floor drop to 40%. If every mark is wrong, the hero is 冒犯: patience −1 and the ask goes up 10%. | Catching a fake is a negotiation weapon, not only a reason to refuse. A false accusation costs something, so guessing does not pay. |
| D6 | Negotiation: the hero has a hidden `ask`, a `floor = ask × 0.8` and `patience` 1–3, all set by mood. Offers below the ask either insult (< 50% of the ask, patience −2) or draw a counter (patience −1, the ask moves halfway to the offer, never below the floor). Patience ≤ 0 means the hero walks away. | Three moods give readable tells (dialogue and a face) for a hidden number, with just three rules. |
| D7 | Every loan resolves at the same day's night. A surviving hero with a genuine item, or with a fake you caught (露馅), repays `round(loan × 1.5)` and takes the item back. A surviving forger you did **not** catch absconds: no repayment, and the fake goes with them. A dead hero forfeits the item to the hoard at its `listValue` if genuine, or 0 if fake. | An uncaught fake loses the whole loan whatever happens, so skipping appraisal is ruinous. A caught forger knows the dragon knows and pays up, so 露馅's 40% ask makes a cheap loan to a strong forger a small, safe profit. That is the payoff for confronting rather than just refusing. |
| D8 | Survival is `p = clamp(0.30 + 0.06 × level + 0.07 × gear − 0.05 × (day − 1), 0.08, 0.92)`. The player sees only the level and gear icons, and the manual's rough table. | "Shown loosely". It also creates the dragon's grim strategy: lend big to the weak. |
| D9 | A day is 6 heroes or a 70 s candle, whichever ends first. When the candle burns out, the current hero still finishes and the queue goes home. Nights are click-to-continue and untimed. | 7 days × ≤ 70 s ≈ 8 minutes of play, with time pressure on reading the manual. |
| D10 | Start gold is 800. Rent is 30 per day, paid when the day opens; if gold < 30 then, the round is lost (`bust`). The round is won if the hoard is ≥ 1000 at the end of day 7. These were tuned with a throwaway simulation of the bots in *Headless test* (1000 seeds): the expert wins about 66% of rounds and the naive bot (never inspects) about 4%. | Gold is the budget that becomes hoard through deaths. With D7, every uncaught fake burns its whole loan, and fakes rise to half the customers by day 6, so a shop that never inspects goes bust in about 78% of rounds. Without the abscond rule the naive bot won 45%, which made appraisal optional. |
| D11 | Randomness goes through `rng()` (default `Math.random`, seeded `mulberry32` in tests). Logic functions never touch the DOM; `render()` reads state. Time moves only through `update(dt)`. | Headless tests drive the whole game. |
| D12 | `ready` is sent on load and again at 0.5, 2 and 5 s. `start` is sent when the player presses `开张` (the round's first real action). | The lost-`ready` fix from 升官记 D8. |
| D13 | Input is Pointer Events and buttons. The keyboard adds `1`–`4` to inspect a part, `X` to toggle the inspected part's mark, `←`/`→` to change the offer by 5 (`Shift` for 50), `Enter` to offer, `B` for the manual and `M` to mute. | Everything works by touch; keys speed up experienced players. |

## Out of scope

Buying or selling items outright, upgrading the shop, loans longer than one day, multiple target levels or endless mode, weight scales, saving between page loads, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/dragon-pawn/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "dragon-pawn",
  "name": "龙的当铺",
  "shortDescription": "开在地牢门口的龙之当铺：验宝、砍价、等勇者回不来。",
  "description": "勇者们下地牢前，会把宝物押给你换金币。对照鉴定手册查看印记、铭文、宝石和材质，揪出赝品，再跟勇者讨价还价。活着回来的连本带利赎回，没被识破的骗子却会卷款溜走，回不来的宝物就归你的宝库。七天后宝库价值达到 1000 金即可获胜。",
  "tags": ["经营", "鉴定", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点击宝物部位查看、标记疑点、出价" },
    { "input": "1–4 / X", "action": "查看部位 / 标记疑点" },
    { "input": "← → / Enter", "action": "调整出价 / 出价" },
    { "input": "B", "action": "打开或合上鉴定手册" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "当", "eyebrow": "PAWNSHOP", "accent": "#e0a020", "accentSecondary": "#c0392b" },
  "sortOrder": 110,
  "achievements": [
    { "key": "sharp_eye", "name": "火眼金睛", "description": "一局内当面识破 5 件赝品。", "symbol": "眼" },
    { "key": "first_hoard", "name": "第一件宝贝", "description": "第一件真品落入宝库。", "symbol": "库" },
    { "key": "big_haul", "name": "稀世珍宝", "description": "一件价值 300 金以上的真品入库。", "symbol": "珍" },
    { "key": "loan_shark", "name": "龙息高利", "description": "一局内累计收取利息 500 金。", "symbol": "利" },
    { "key": "win", "name": "富可敌国", "description": "第七天结束时宝库价值达到 1000 金。", "symbol": "富" },
    { "key": "clean_win", "name": "明察秋毫", "description": "获胜，且从未冤枉好人、宝库里没有赝品。", "symbol": "察" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "获胜", "maxPerRound": 1 },
    { "key": "fakes", "name": "识破赝品", "maxPerRound": 42 },
    { "key": "hoard", "name": "宝库价值", "maxPerRound": 20000 }
  ]
}
```

### The manual (鉴定手册)

`WORKSHOPS` (6). A genuine item from a workshop has its mark, its exact motto and one of its materials.

| workshop | mark | lookalike mark | motto | motto typos (one per fake) | materials |
| --- | --- | --- | --- | --- | --- |
| 炉心 | 炎 | 焱 | 百炼成锋 | 炼→练, 锋→峰 | 黑铁, 金 |
| 霜语 | 霜 | 雷 | 寒光映雪 | 光→先, 映→英 | 银, 秘银 |
| 月匠 | 月 | 丹 | 清辉满庭 | 辉→挥, 庭→延 | 银, 金 |
| 山根 | 山 | 出 | 稳如磐石 | 磐→盘, 石→右 | 黑铁, 青铜 |
| 星斗 | 斗 | 斤 | 斗转星移 | 转→专, 移→侈 | 秘银, 金 |
| 龟甲 | 龟 | 黾 | 万古长存 | 古→吉, 存→在 | 青铜, 银 |

`MINES` (5). A genuine gem has one of its mine's colours.

| mine | colours |
| --- | --- |
| 熔喉 | 赤, 琥 |
| 霜岭 | 苍, 素 |
| 幽林 | 碧, 苍 |
| 暮渊 | 紫, 赤 |
| 晨崖 | 琥, 素 |

`GEMS`: 赤 `#d23c3c`, 琥 `#e0a020`, 苍 `#3a6fd8`, 碧 `#2fa86a`, 紫 `#8e44ad`, 素 `#eceef4`. The loupe always names the colour (`宝石：苍色`), so the check does not depend on colour vision.

`MATERIALS`: 青铜 ×0.6 `#b08d57`, 银 ×1.0 `#c0c6cc`, 黑铁 ×1.2 `#4a4e57`, 金 ×1.5 `#e8c04a`, 秘银 ×2.0 `#9fe3ee`.

`TYPES` (base value): 戒指 80, 护符 100, 酒杯 120, 长剑 160, 圆盾 180, 王冠 240. `listValue = round(base × multiplier / 10) × 10`, so 50–480 金.

### Items

`buildItem({ type, workshop, mine, material, gem, mark, motto })` returns the spec plus `listValue`, `flaws` and `fake`. `findFlaws(item)` returns, in the order `['mark', 'motto', 'gem', 'material']`, every part where:
- `mark`: `mark !== WORKSHOPS[workshop].mark`
- `motto`: `motto !== WORKSHOPS[workshop].motto`
- `gem`: `gem` is not in `MINES[mine].colours`
- `material`: `material` is not in `WORKSHOPS[workshop].materials`

`makeItem(day)`:
1. Pick the type, workshop and mine uniformly, then a genuine material, gem, mark and motto.
2. The item is fake with probability `FAKE_RATE[day − 1]`, where `FAKE_RATE = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.50]`. A fake has 2 flaws with probability 0.4 on days 1–3 and 0.2 on days 4–7, otherwise 1. The flawed parts are picked uniformly from the four.
3. Plant each flaw:
   - **mark:** the lookalike (50%) or another workshop's mark (50%).
   - **motto:** one of the workshop's two typos.
   - **gem:** a colour not in the mine's list.
   - **material:** a material not in the workshop's list.
4. Return `buildItem(…)` with `planted` (the parts chosen in step 2) attached.

### Heroes

`makeHero(day)` returns `{ name, avatar, level, gear, mood, item, ask, floor, patience, p, line }`:
- `name` comes from 艾琳 阿岗 小葵 铁头 莫老三 白鸦 菲奥 大熊 青禾 罗兰 小满 石锤, and `avatar` from 🧝 🧙 🤺 🥷 🧔 🧚.
- `level` is 1–10 and `gear` is 0–3, both uniform. Gear shows as that many of ⚔️ 🛡️ 🧪.
- `mood` depends on the item. A fake's hero is 急 50%, 稳 30%, 傲 20%. A genuine item's hero is 急 25%, 稳 45%, 傲 30%. This is a soft tell, not proof.

| mood | face | ask / listValue | patience |
| --- | --- | --- | --- |
| 急 | 😰 | uniform 0.45–0.60 | 3 |
| 稳 | 🙂 | uniform 0.60–0.75 | 2 |
| 傲 | 😤 | uniform 0.75–0.90 | 1 |

`ask` is rounded to 5, and `floor = round5(ask × 0.8)`.

The claim card reads `{type} · {workshop}工坊 · {mine}宝石 · 行情 {listValue} 金`. The opening line is `这是{workshop}工坊打的{type}，镶的是{mine}的宝石。` followed by the first mood line.

Dialogue (`{A}` is the current ask; pick between `/` options with `rng`):

| event | 急 | 稳 | 傲 |
| --- | --- | --- | --- |
| open | 求求你，我急着下去救人！ / 随便给点就行，地牢里等不了。 | 按行情来，公道就好。 / 这件东西跟了我好些年。 | 这可是传家宝，你最好识货。 / 别跟我讨价还价，龙。 |
| counter | 再加点吧，{A} 金，就 {A}！ | {A} 金，不能再少了。 | {A} 金，看你面子。 |
| insulted | 这……也太少了吧！ | 你这是在开玩笑。 | 你在侮辱我的家族！ |
| deal | 成交！你是好龙！ | 合作愉快。 | 哼，算你有眼光。 |
| walk | 算了，我去别处想办法…… | 看来谈不拢，告辞。 | 不识货的蜥蜴！ |

These lines are the same for every mood:
- 露馅: `呃……被你看出来了。{A} 金你要不要？`
- 冒犯: `你说我的宝贝是假的？！`
- refused by the player: `哼，不收拉倒。`

### Rules and numbers

| constant | value |
| --- | --- |
| `START_GOLD` | 800 |
| `RENT` | 30 per day |
| `INTEREST` | 0.5 (repay `round(loan × 1.5)`) |
| `HEROES_PER_DAY` | 6 |
| `DAY_SECONDS` | 70 |
| `HOARD_TARGET` | 1000 |
| `DAYS` | 7 |
| offer range | 5 to `min(gold, listValue)`, step 5 |

`offer(amount)`, with `A = hero.ask`:
1. If `amount ≥ A`: a deal at `amount`.
2. Else if `amount < 0.5 × A`: `patience −= 2` and the result is `insulted` (the ask is unchanged).
3. Else: `patience −= 1`, `A = max(floor, round5((A + amount) / 2))`, and the result is `counter`.
4. If `patience ≤ 0` after step 2 or 3, the result is `walked` instead.

`acceptCounter()` makes a deal at the current ask, after any counter or insult. A deal subtracts the loan from gold and adds `{ hero, loan, caught }` to `loans`, where `caught` is true if this hero was 露馅.

`confront()` requires at least one mark and works once per hero:
- **露馅 (`caught`):** some mark is in `item.flaws`. The ask and floor become `round5(x × 0.4)`, the item shows a red `赝品` stamp, and `fakesCaught++`. False marks alongside a real hit are ignored.
- **冒犯 (`offended`):** no mark is a real flaw. `falseAccusations++`, `patience −= 1` (it may walk), and the ask becomes `min(listValue, round5(ask × 1.1))`.

`endDay()`: for each loan, if `rng() < p` the hero survives. A survivor whose item is genuine or `caught` repays: `gold += round(loan × 1.5)` and `interest += round(loan × 0.5)`. An uncaught fake's survivor absconds and pays nothing. Otherwise the item goes to `hoard` with value `fake ? 0 : listValue`, and a fake sets `fakeInHoard = true`.

### Treasure drawing

The canvas is 360 × 360 logical, at 70–430 × 230–590 on the stage. Each type is a filled silhouette in its material colour, with a darker outline and a white gradient sheen. The gem is a faceted circle (r 16) in its colour. The mark is the character at 14 px in a small square seal. The motto is its four characters at 8 px, so it is unreadable without the loupe. Hotspots are circles of r 30:

| type | silhouette | gem | motto | mark |
| --- | --- | --- | --- | --- |
| 戒指 | ring, centre (180,200), R 90, band 26 | (180,105) | (180,288) | (100,200) |
| 护符 | teardrop pendant on a chain from the top | (180,190) | (180,280) | (180,120) |
| 酒杯 | bowl, stem, foot | (180,150) | (180,95) | (180,320) |
| 长剑 | vertical blade, guard at y 262, pommel at y 335 | (180,262) | (180,150) | (180,335) |
| 圆盾 | disc, centre (180,180), R 140 | (180,180) | (180,300) | (180,70) |
| 王冠 | band y 230–290, five spikes up to y 110 | (180,200) | (180,265) | (100,265) |

Clicking a hotspot, or one of the four part buttons under the canvas (`印记` `铭文` `宝石` `材质`), calls `inspect(part)`. A clicked hotspot shows a 160 px loupe: the region drawn at 2.5× with `drawImage` from the item canvas. Under it is a label: `印记：「焱」`, `铭文：百炼成峰`, `宝石：苍色` or `材质：青铜` (with a swatch). The label has a `标为疑点` / `取消疑点` toggle. A marked part's button and hotspot get a red ring.

### Screens

- **Start:** the title `龙的当铺`, the subtitle `地牢门口，只收宝贝，不问来路`, and three rule lines:
  - `对照鉴定手册，找出赝品的破绽`
  - `出价放贷，勇者活着回来连本带利还钱，没识破的骗子一去不回`
  - `回不来的，宝物归你。七天内宝库攒满 1000 金`

  Then a `开张` button.
- **Top bar (0–60):** `第 N / 7 天`, a candle bar for the time left, `💰 gold`, `💎 hoard / 1000`, `📖 手册` and `🔊`.
- **Hero (60–220):** avatar at 72 px, `name Lv.N`, gear icons, mood face, and a speech bubble. The claim card is under the bubble. A hero walks in 1 s after the previous one leaves, with a bell sound.
- **Treasure (230–640):** the canvas, the part buttons, and the loupe label.
- **Deal (650–940):** the offer slider with `出价 N 金`. Buttons: `出价`, `接受 A 金` (only after a counter or insult), `指出疑点（n）` (disabled with no marks, or after use), `拒绝`. Under them: `今日已押 k 件 · 剩余顾客 m`.
- **Manual drawer:** covers the stage, with tabs `工坊` (the workshop table: mark, motto, materials), `矿脉` (mines with colour swatches and names), `材质` (colours and multipliers, plus type base values) and `冒险者`. The last tab reads: `Lv1–3：多半回不来` / `Lv4–7：五五开` / `Lv8–10：大多能回来` / `每件装备多一分把握` / `地牢一天比一天深` / `没被识破的骗子，活着也不会回来还钱`. Close with `合上`. The candle keeps burning while it is open.
- **Night:** `第 N 天 · 夜`, one row per loan, then `💰 gold · 💎 hoard` and a `天亮了` button (`结算` after day 7). Rows:
  - `{avatar} {name} 回来了，还款 {repay} 金（利息 {int}）`
  - `🏃 {name} 活着出来了，却带着赝品溜了！{loan} 金打了水漂`
  - `💀 {name} 没能回来。{type}入库，价值 {listValue} 金`
  - `💀 {name} 没能回来。{type}入库……是赝品，一文不值`
  - With no loans: `今晚没有放出去的贷款。`
- **End:** each has a `再开一家` button.
  - Win: `富可敌国`, then `七天里收下 N 件宝物，总值 V 金。`
  - `bust`: `关门大吉`, then `金币付不起地牢管理费（30 金），当铺开不下去了。`
  - Short: `龙心不足`, then `宝库只有 V / 1000 金。`

Sounds through `tone`: a bell when a hero enters, a two-note coin clink on a deal, a low thud on a refusal or walk-away, a rising sting on 露馅, a gong at night, and an arpeggio on a win.

### Functions

- `mulberry32(seed)`, `rng`, `round5(x)`
- `buildItem(spec)`, `findFlaws(item)`, `makeItem(day)`, `makeHero(day)`
- `startRound()`: resets the state and `roundAchievements`, sends `start`, then calls `startDay(1)`.
- `startDay(n)`: if `gold < RENT`, calls `finishRound('bust')`. Otherwise pays the rent, makes 6 heroes, sets `candle = DAY_SECONDS` and calls `nextHero()`.
- `inspect(part)`, `toggleMark(part)`
- `confront()` → `'caught' | 'offended' | 'walked'`
- `offer(amount)` → `'deal' | 'counter' | 'insulted' | 'walked'`. Throws on an amount outside the range.
- `acceptCounter()`, `refuse()`
- `heroDone()`: after a deal, walk-away or refusal. Calls `nextHero()`, or `endDay()` if the queue is empty or the candle is out.
- `update(dt)`: during `phase === 'day'`, `candle = max(0, candle − dt)`. Also advances animation timers.
- `endDay()` → the night report. Sets `phase = 'night'`.
- `nextDay()`: calls `finishRound(hoardValue() >= HOARD_TARGET ? 'win' : 'short')` after day 7, else `startDay(day + 1)`.
- `finishRound(reason)`: achievements, then `stats`, then `end`. Sets `phase = 'over'`.
- `hoardValue()`, `render()`

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `sharp_eye` | In `confront()`, when `fakesCaught` reaches 5. |
| `first_hoard` | In `endDay()`, when a genuine item enters the hoard. |
| `big_haul` | In `endDay()`, when a genuine item with `listValue ≥ 300` enters the hoard. |
| `loan_shark` | In `endDay()`, after repayments, when `interest ≥ 500`. |
| `win` | In `finishRound('win')`. |
| `clean_win` | In `finishRound('win')`, with `falseAccusations === 0` and `!fakeInHoard`. |

In `endDay()`, forfeits are processed before repayments, in loan order, and send `first_hoard` before `big_haul`.

### Stats

In `finishRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: reason === 'win' ? 1 : 0, fakes: fakesCaught, hoard: Math.min(hoardValue(), 20000) })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern. It adds a stub for the item canvas's `getContext`, and a `transform` field on `style`. `rng` is seeded unless stated otherwise.

**Load.** Only `ready` is sent until `startRound()`.

**Generator.**
- 10,000 `makeItem(d)` for d = 1–7. A genuine item has `findFlaws` equal to `[]`. A fake has 1–2 flaws, and `findFlaws` equals `planted` (sorted in part order).
- Every planted value differs from the genuine one:
  - a fake mark is not the workshop's mark;
  - a fake motto differs from the real one in exactly one character;
  - a fake gem is not in the mine's list;
  - a fake material is not in the workshop's list.
- `listValue` is between 50 and 480.

**Negotiation.** Use a hero with `ask 100, floor 80, patience 2` and an item with `listValue ≥ 120`:
- `offer(100)` → `deal`, and gold drops by 100.
- `offer(70)` → `counter` with ask 85. Then `acceptCounter()` is a deal at 85.
- `offer(70)`, then `offer(80)` → `walked`.
- `offer(45)` → `walked`. With patience 3, it is `insulted` and the ask stays 100.
- `confront()` with a real flaw marked → `caught`, ask 40, floor 30.
- `confront()` on a genuine item → `offended`, ask 110, patience 1.
- Offers above `min(gold, listValue)` throw.

**Night.**
- A loan of 100 with `p = 1` repays 150 and adds 50 interest. The same holds for a caught fake.
- An uncaught fake with `p = 1` repays nothing and adds nothing to the hoard.
- With `p = 0`, a genuine item enters the hoard.
- With `p = 0`, a fake enters at 0 and sets `fakeInHoard`.

**Candle.** `update(70)` while a hero is present keeps that hero. `refuse()` then goes to night, even with heroes still queued.

**Deterministic round.** Use `rng = mulberry32(7)`, then `startRound()`.
1. Day 1, heroes 1–5: set `hero.item = buildItem(<a genuine 山根 spec with mark '出'>)`. Then `toggleMark('mark')`, `confront()` (→ `caught`) and `refuse()`.
2. Hero 6: set `hero.item = buildItem({ type: '王冠', workshop: '星斗', mine: '霜岭', material: '秘银', gem: '苍', mark: '斗', motto: '斗转星移' })` (listValue 480). Set `ask = 300` and `p = 0`, then `offer(300)`. The night has 1 forfeit. Gold is 470.
3. `nextDay()` (day 2, gold 440). Set `interest = 490`. Hero 1 gets a genuine 戒指, `ask = 40`, `p = 1`, then `offer(40)`. Refuse the rest. The night repays 60, and interest is 510.
4. Days 3–7: `nextDay()`, refuse every hero. Before the last `nextDay()`, push the step 2 crown into `hoard` twice more (hoard 1440).

Expected sequence: `start, sharp_eye, first_hoard, big_haul, loan_shark, win, clean_win, stats, end`. Expected stats: `{ rounds: 1, wins: 1, fakes: 5, hoard: 1440 }`.

**Bust.** `startRound()`, set `gold = 20`, refuse all six, then `nextDay()`. The sequence after `start` is `stats, end`, with stats `{ rounds: 1, wins: 0, fakes: 0, hoard: 0 }`. The end screen is `关门大吉`.

**Balance.** 200 rounds with seeds 1–200 for each bot, playing through the real functions with no candle:
- **naive:** never inspects or confronts. Every item gets the genuine terms: open `0.6`, cap `0.85`.
- **expert:** a perfect appraiser that reads `item.flaws` and `hero.p`. On a fake it marks `flaws[0]` and calls `confront()`. Then, if `p ≥ 0.7`, it lends with open `0.2` and cap `0.4`; otherwise it refuses. On a genuine item it uses open `0.55` and cap `0.85`.

Both bots follow the same loop:
1. Offer `round5(open × listValue)`, capped at `min(gold, listValue)`. A deal ends the loop.
2. After a `counter` or `insulted`, call `acceptCounter()` if `ask ≤ cap × listValue` and `ask ≤ gold`.
3. Otherwise offer again, `round5(0.1 × listValue)` higher.
4. Stop on `walked`, or when the offer would be below 5.

In the simulation, the expert won 66% and the naive bot 4%. An expert that refuses caught fakes instead of lending won 63%. Assert the expert wins ≥ 60% and the naive bot ≤ 15%. If this fails, tune `START_GOLD`, `HOARD_TARGET` and `FAKE_RATE` in the doc and the code, not the bots or the thresholds.

## Milestones

Each milestone ends with `node games/dragon-pawn/v1/test_headless.js` passing.

**M1 · Playable shop.** Manual tables, generator, heroes, inspection and loupe, marks, confrontation, negotiation, candle, nights, end screens, manual drawer, sounds.
Done when: a full 7-day round plays in a browser by touch and keyboard, and the generator, negotiation, night, candle and balance tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the deterministic round and bust tests, `README.md`.
Done when: `pnpm game check dragon-pawn v1` passes.

**M3 · Local release.** `pnpm game:local publish dragon-pawn v1 --yes`.
Done when: `/play/dragon-pawn` plays locally, and a logged-in round unlocks `first_hoard` and updates the stats board. The owner runs the production publish.

## Open items

- The balance numbers (D10) come from a simulation of the two bots, not from people. Real players fall between the bots, since they miss some flaws and make some false accusations. Owner: playtest in M1. If 70 s per day is too short to read the manual, raise `DAY_SECONDS` to 80 (that is still under 10 minutes).
- The lookalike characters (雷/霜, 斤/斗 and the motto typos) are chosen to be readable at loupe size in common CJK fonts. Owner: check on iOS and Android in M1, and swap any pair that renders as identical.
