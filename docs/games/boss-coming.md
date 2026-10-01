# 老板来了 (`boss-coming`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A reaction and nerve game about the site's own name. Hold Space to slack off at your desk and release to switch back to Excel before the boss looks. Footsteps, shadows and a coworker's cough warn you, but some are fake-outs. Survive 9:00–18:00 (3 minutes) with fewer than 3 strikes. Keyboard, mouse or touch, single-player.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers `tone`/`noiseHit`), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/boss-coming/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 only the SDK block, the `resize()`/`view` pattern and the audio helpers. All visuals are canvas shapes; the cues are synthesized sounds. | Same package contract; the gameplay shares nothing with 乱刃. |
| D2 | A day is 9:00–18:00 = 540 game minutes over 180 real seconds (3 game minutes per real second). `clock` is in game minutes from 9:00. | Three minutes is one 摸鱼 break. |
| D3 | Slacking is binary: held (Space, or the pointer held anywhere on the canvas) means slacking; released means working. Only slacking scores: 1 point per game minute. | One input keeps the whole game about timing and nerve. |
| D4 | The boss's visits are scheduled events, each in states `cue → look → leave`. While `look` lasts, slacking at any instant is a strike. | One rule to learn; the variety comes from the cues and the fake-outs. |
| D5 | The difficulty ramps with `clock`: shorter warnings, more frequent visits, and new event types unlocking at fixed times (table below). | The day gets harder the way a real afternoon does. The time unlocks are easy to test. |
| D6 | Strike 3 ends the round as a loss (`约谈`). Reaching 18:00 ends it as a win (`下班`). | Two clear outcomes, and every round is ≤ 3 minutes. |
| D7 | Randomness goes through `rng()` (default `Math.random`, seeded in tests). | Deterministic tests. |

## Out of scope

Multiple days or a career mode, upgrades, other mini-games on the slacking screen, coworkers you can interact with, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/boss-coming/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "boss-coming",
  "name": "老板来了",
  "shortDescription": "按住摸鱼，松开干活，别被老板抓到。",
  "description": "周五下午，按住空格摸鱼，松开立刻切回表格。留意脚步声、玻璃门上的影子和同事的咳嗽，但小心老板的假动作。撑到下午六点下班，被抓三次就要被约谈。",
  "tags": ["休闲", "反应", "单人"],
  "controls": [
    { "input": "按住空格 / 按住屏幕", "action": "摸鱼" },
    { "input": "松开", "action": "切回工作" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R", "action": "再来一天" }
  ],
  "cover": { "symbol": "摸", "eyebrow": "DON'T GET CAUGHT", "accent": "#5dffa0", "accentSecondary": "#ff5a5a" },
  "sortOrder": 70,
  "achievements": [
    { "key": "clock_out", "name": "带薪摸鱼", "description": "撑到 18:00 下班。", "symbol": "薪" },
    { "key": "spotless", "name": "深藏不露", "description": "一次都没被抓，完成一整天。", "symbol": "藏" },
    { "key": "close_call", "name": "千钧一发", "description": "在老板回头前 0.2 秒内切回工作。", "symbol": "险" },
    { "key": "steady", "name": "不为所动", "description": "老板路过未回头时仍坚持摸鱼，一局 5 次。", "symbol": "稳" },
    { "key": "marathon", "name": "摸满一小时", "description": "单次连续摸鱼达到游戏内 60 分钟。", "symbol": "时" },
    { "key": "slack_king", "name": "摸鱼之王", "description": "单局摸鱼总时长达到游戏内 6 小时。", "symbol": "王" }
  ],
  "stats": [
    { "key": "rounds", "name": "上班", "maxPerRound": 1 },
    { "key": "days", "name": "下班", "maxPerRound": 1 },
    { "key": "slack_minutes", "name": "摸鱼分钟", "maxPerRound": 540 }
  ]
}
```

### Scene

The canvas is 960 × 600 logical, scaled with `resize()`.

- **Background:** the office wall, with a frosted glass door on the left (x 40–200) and a side door on the right (x 820–920). The boss walks a corridor behind the glass from left to right.
- **Foreground:** your desk, a monitor (centre, 520 × 320), a plant, a mug, and your hands on the keyboard.
- **Monitor while slacking:** a looping slacking screen, i.e. a short-video feed of fish swimming across with bubbles and a fake like counter climbing.
- **Monitor while working:** an Excel-style grid with a green header row and numbers that change every second.
- **Switching** is instant, with a 60 ms flicker.
- **Wall clock** top right shows `HH:MM`. A strike counter `被抓 ●○○` and the score `摸鱼 N 分钟` are top left.

The boss is drawn as a silhouette: a big head, a tie and a coffee mug.
- **Looking:** eyes visible, facing you, plus a `👀` bubble.
- **Passing by:** profile view, walking.
- **Catching you:** an exclamation mark, the line `小王，来我办公室一下`, and a 1.2 s freeze before play resumes.

### Events

`scheduleNext()` sets `nextEventAt` (real seconds) to `now + rng(gapMin, gapMax)`. Each event chooses its type by weight from those unlocked:

| type | unlock (`clock`) | weight | cue | then |
| --- | --- | --- | --- | --- |
| `visit` | 9:00 | 60 | One of: footsteps (noise bursts every 0.25 s, getting louder), a shadow growing on the glass door, or a coworker's `咳咳` bubble plus a filtered noise cough. | The boss appears at the glass and **looks** for 1.5 s. |
| `pass` | 11:00 | 25 | Same cues as `visit`. | The boss walks past in profile for 1.2 s. **No look.** |
| `fake_cough` | 13:00 | 15 | The `咳咳` cough only. | Nothing happens. |
| `hr` | 16:00 | 15 | The right door handle turns, with a click sound. | HR appears in the right doorway and **looks** for 1.0 s. |

Timing:
- **Warning lead** (cue start to look start): `lead = lerp(1.2, 0.6, clock / 480)` s, clamped. For `hr` it is half that.
- **Gaps:** `gapMin, gapMax` = `6, 14` s before 15:00 (`clock < 360`), and `4, 9` s after.
- Only one event runs at a time. The next one is scheduled when the current one ends.

### State

- `slacking` (bool), `clock`, `slackMinutes` (float), `runMinutes` (the current unbroken slack, in game minutes)
- `strikes`, `passesHeld`
- `event`: `{ type, phase: 'cue' | 'look' | 'pass' | 'done', t, lookAt }`
- `lastReleaseT` (real seconds)

Functions:
- `setSlacking(b)`: on release, records `lastReleaseT`. On release or a strike, resets `runMinutes = 0`.
- `update(dt)`
- `startEvent(type)`
- `strike()`
- `endDay(won)`
- `startGame()`

### Rules in `update(dt)`

1. `clock += dt × 3`. If `slacking`, add `dt × 3` to both `slackMinutes` and `runMinutes`.
2. Advance the event:
   - During `look`, if `slacking`, call `strike()` and end the event.
   - At the instant `look` begins, if `!slacking && now − lastReleaseT <= 0.2`, fire `close_call`.
   - A `pass` during which `slacking` stayed true from start to end increments `passesHeld`.
3. Check the achievement thresholds.
4. At `clock >= 540`, call `endDay(true)`. At `strikes === 3`, call `endDay(false)`.

### Screens

- **Start:** title `老板来了`, subtitle `周五下午 · 按住摸鱼，松开干活`, three cue icons with labels (`脚步声` · `门上的影子` · `同事咳嗽`), and an `上班` button.
- **Win:** `下班！` showing `摸鱼 N 分钟 · 被抓 N 次`.
- **Loss:** `约谈！` with the line `下周一记得带上检讨`, showing the same numbers.
- Both show `R / 点击 再来一天`.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `marathon` | `runMinutes >= 60`. |
| `steady` | `passesHeld` reaches 5. |
| `close_call` | See rule 2. |
| `slack_king` | `slackMinutes >= 360`. |
| `clock_out` | `endDay(true)`. |
| `spotless` | `endDay(true)` with `strikes === 0`. |

### Stats

In `endDay`, before `end`: `emitMoYuFunStats({ rounds: 1, days: won ? 1 : 0, slack_minutes: Math.min(Math.floor(slackMinutes), 540) })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern, with `rng` seeded.

**Simulation.** Five full days with a bot that slacks whenever no event is in `cue`/`look`, and releases with a random reaction delay of 0–0.5 s after a cue starts. Every day ends with win or loss within 181 s, with no `NaN`, `clock` monotonic, and at most one event at a time.

**Deterministic day.** `startGame()`, with `nextEventAt = Infinity` so no random events fire.
1. `setSlacking(true)`, then `update` for 20.5 s → `marathon`.
2. Five times: `startEvent('pass')` and `update` through its end while slacking → `steady`.
3. `startEvent('visit')`. Release 0.1 s before the look starts, then `update` through the look → `close_call` and no strike.
4. Set `slackMinutes = 359`, `setSlacking(true)`, then `update` 1 s → `slack_king`.
5. Release, set `clock = 539`, then `update` 1 s.

Expected sequence: `start, marathon, steady, close_call, slack_king, clock_out, spotless, stats, end`. Expected stats: `days: 1`.

**Loss.** Three visits with slacking held through each look give `strikes === 3`, then `stats` with `days: 0`, then `end`.

**Fake cough.** `startEvent('fake_cough')` while slacking causes no strike.

## Milestones

Each milestone ends with `node games/boss-coming/v1/test_headless.js` passing.

**M1 · Playable day.** Scene, both monitor screens, events and cues with sounds, the ramp, strikes, screens.
Done when: a browser day is winnable by paying attention, each cue is distinguishable with sound on and with sound off, and the simulation passes.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check boss-coming v1` passes.

**M3 · Local release.** `pnpm game:local publish boss-coming v1 --yes`.
Done when: `/play/boss-coming` plays locally, and a logged-in day updates the board. The owner runs the production publish.

## Open items

- The warning leads (1.2 → 0.6 s) and event gaps are first guesses. The owner accepts the tension curve after M1.
