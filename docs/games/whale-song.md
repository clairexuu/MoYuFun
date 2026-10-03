# 鲸歌 (`whale-song`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A call-and-response rhythm game. The lead whale sings a phrase on the five-tone scale 宫商角徵羽; you sing it back on the next bar, in the same rhythm and pitch, on five pads. Good answers carry the pod across six seas to 极光海, while misses cost the pod's 士气. Later seas bring longer phrases, faster tempos, syncopation and 洋流噪音 (decoy notes you must not repeat). Mouse, touch or keyboard, single-player, about 4½ minutes. Its main limit is that it needs sound: the visuals support listening but don't replace it.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/tile-stack/v1/index.html` (SDK block, `resize()` with `clientWidth`, audio helpers, repeated `ready`), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/whale-song/v1/index.html`, vanilla JS and canvas, no dependencies or assets. Copy from 摸了个鱼 only the SDK block, `resize()`/`view` and `ensureAudio`/`tone`. All voices are synthesized in WebAudio. | Same package contract. Glowing rings and swimming whales are canvas work. |
| D2 | Game time is read only through a **clock** object: `{ now(), at(perfMs), pause(), resume() }` in seconds. In the browser it is `makeAudioClock(AC)`, the *audible* `AudioContext` time. Without WebAudio it is `makePerfClock()`. The test swaps in a fake clock. `songT = clock.now() − songOrigin`. | Rhythm judged against `requestAnimationFrame` or `Date` drifts from what the ear hears. One seam keeps the browser path accurate and lets the test judge with exact times, without audio. |
| D3 | `makeAudioClock` maps an event to audio time with `AC.getOutputTimestamp()`: `contextTime + (perfMs − performanceTime) / 1000`. When `performanceTime` is 0 or the method is missing, it falls back to `AC.currentTime − (AC.outputLatency \|\| AC.baseLatency \|\| 0) + (perfMs − performance.now()) / 1000`. | It cancels output latency (Bluetooth headphones) on browsers that support it, and still works elsewhere. |
| D4 | Input is `pointerdown` on a pad or `keydown` (`e.repeat` ignored), timed with `e.timeStamp`, never with the handler's run time. The judged time is `clock.at(e.timeStamp) − songOrigin − inputOffsetMs / 1000`. | Handler time adds frame jitter. `inputOffsetMs` is the one calibration knob for everything the clock can't see (keyboard, touch, odd hardware). |
| D5 | The music sits on an 8th-note grid: 8 **slots** per 4/4 bar. A phrase cycle is **call** (L bars), **response** (L bars), then one **rest bar**. A heartbeat pulse plays on every beat throughout. | The rest bar shows the result and lets the player breathe before the next call. The pulse keeps the tempo audible during the response. |
| D6 | Phrases come from a per-round seed (`round.seed = floor(rng() × 2³²)`, generated with `mulberry32`). All 20 phrases are generated at `startRound()` by rejection sampling against `validPhrase` (rules below). | Listening, not memorizing, is the skill, so every journey differs. The rules keep phrases musical (they end on 宫) and keep the judging windows from overlapping. Pregenerating makes the test's expected totals computable. |
| D7 | The judging windows on `|dt|` are **perfect ≤ 45 ms**, **good ≤ 100 ms**, **miss ≤ 135 ms** (a press caught by the note but too far off). Beyond 135 ms the press is not caught by that note. The fastest gap between notes is one slot at 108 BPM = 278 ms > 2 × 135, so a press is never caught by two notes. | Standard rhythm-game tightness, a little lenient for touch. The grid and tempo cap make the matching unambiguous, and the test asserts it. |
| D8 | A **failed** phrase (accuracy < 60%) is sung again, with the same notes, until it passes or 士气 hits 0. A passed phrase moves the pod one leg (of 20). | The pod waits for you, which is kinder than skipping ahead, and failure has a real cost (士气) without ending the run at once. |
| D9 | **洋流噪音** decoys appear from stage 5. They are notes in the call with a different timbre (filtered square plus a bubble pop), drawn as dashed grey rings with 🫧. Pressing in a decoy's mirrored response slot is `噪音`: 士气 −6, combo reset. | The decoys are told apart by both sound and sight, so the rule is fair and accessible, and the listening skill still matters. |
| D10 | Pads unlock by stage: stage 1 uses 宫商角 (pads 1–3), stage 2 adds 徵, and stage 3 onward uses all five. The unused pads are drawn at 35% alpha but still play. Ghost rings of the call show on the response track in stages 1–2 only. | It's a tutorial without a tutorial screen. After stage 2 the answer is from memory. |
| D11 | The logical area is 540 × 900 portrait, scaled by `min(w/540, h/900)` and centred. | Five thumb-sized pads fit across a phone (radius 44 units is ≈ 60 px wide at 375 px), and a desktop iframe letterboxes it. |
| D12 | Pausing (Esc, the `暂停` button, or `visibilitychange` to hidden) calls `clock.pause()` (`AC.suspend()`), which freezes song time and scheduled notes. `继续` runs a 3-2-1 countdown on rAF `dt`, then `clock.resume()`. | Suspending the context keeps audio and judging in sync for free. |
| D13 | `ready` is sent on load and at 0.5, 2 and 5 s. `start` is sent in `startRound()`, which the `出发` / `再游一次` click calls; the same click unlocks audio. | This is the repo's lifecycle convention (升官记 D8). |

## Out of scope

Saving calibration or progress between page loads, difficulty selection, free play or a song editor, microphone singing, hold or slide notes, a separate visual-offset knob, multiplayer, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/whale-song/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "whale-song",
  "name": "鲸歌",
  "shortDescription": "领头鲸唱一句，你跟着唱一句，带鲸群游到极光海。",
  "description": "五个音垫对应宫、商、角、徵、羽。领头鲸先唱出一句，你在下一小节用同样的节奏和音高唱回去。唱得准，鲸群就向前游；走调太多，鲸群的士气会散。越往深海乐句越长、节奏越快，还会混进灰色气泡里的洋流噪音，那些音千万别跟唱。请打开声音游玩。",
  "tags": ["节奏", "音乐", "单人"],
  "controls": [
    { "input": "鼠标 / 触摸", "action": "点击五个音垫唱歌" },
    { "input": "D F J K L 或 1–5", "action": "宫 商 角 徵 羽" },
    { "input": "Esc", "action": "暂停" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "鲸", "eyebrow": "CALL & RESPONSE", "accent": "#1d4f91", "accentSecondary": "#7fe3d6" },
  "sortOrder": 170,
  "achievements": [
    { "key": "first_song", "name": "初鸣", "description": "第一次唱对一句。", "symbol": "鸣" },
    { "key": "combo_30", "name": "余音绕梁", "description": "连续唱对 30 个音。", "symbol": "绕" },
    { "key": "in_tune", "name": "心有灵犀", "description": "在暗流或冰洋把一句唱得全部完美。", "symbol": "灵" },
    { "key": "arrive", "name": "抵达极光海", "description": "带领鲸群走完全程。", "symbol": "极" },
    { "key": "one_take", "name": "一遍就会", "description": "不重唱任何一句走完全程。", "symbol": "遍" },
    { "key": "clear_ear", "name": "不随波逐流", "description": "走完全程且没有跟唱任何洋流噪音。", "symbol": "浪" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "抵达", "maxPerRound": 1 },
    { "key": "notes", "name": "唱对", "maxPerRound": 1000 },
    { "key": "phrases", "name": "答句", "maxPerRound": 20 }
  ]
}
```

### Scale and voices

`PADS[i]` for i = 1…5: `{ name, key, alt, color, freq }`.

| pad | name | keys | color | lead Hz | 小鲸 Hz |
| --- | --- | --- | --- | --- | --- |
| 1 | 宫 | D, 1 | `#ff8a5b` | 261.63 | 523.25 |
| 2 | 商 | F, 2 | `#ffd166` | 293.66 | 587.33 |
| 3 | 角 | J, 3 | `#7fe3d6` | 329.63 | 659.26 |
| 4 | 徵 | K, 4 | `#5ab0ff` | 392.00 | 783.99 |
| 5 | 羽 | L, 5 | `#c58cff` | 440.00 | 880.00 |

Every sound is scheduled at AC time `songOrigin + t`. The voice helpers are:
- `whaleVoice(f, at, dur)`: a sine at `f` with a scoop (`setValueAtTime(f × 0.94, at)`, then an exponential ramp to `f` by `at + 0.06`). Vibrato is a 5 Hz LFO with depth `f × 0.008` Hz on the main oscillator. A second sine at `2f` has gain 0.25. The envelope rises 0 → 0.5 by `at + 0.03` and ramps linearly to 0 at `at + dur + 0.12`.
  - The lead sings at the lead pitch for `dur = 0.9 × min(gap to next real note, 1 beat)`.
  - The player's 小鲸 sings at the octave on each press, immediately, for `dur = 0.25`.
- `decoyVoice(f, at)`: a square wave at `f` through a 900 Hz lowpass, envelope 0 → 0.25 in 10 ms and an exponential ramp to 0.001 at 0.18 s, plus a bubble (sine 600 → 1400 Hz over 0.05 s, gain 0.1).
- `pulse(at, downbeat)`: a sine falling 70 → 45 Hz over 0.12 s, gain 0.5 on a downbeat and 0.3 otherwise.
- Feedback uses `tone`:
  - miss: `tone(140, 90, 0.15, 'triangle', 0.3)`
  - phrase passed: `tone(880, 1320, 0.25, 'sine', 0.3)`
  - phrase failed: `tone(330, 220, 0.4, 'sine', 0.3)`

Scheduling is a queue. `round.sched` holds sorted items `{ t, kind: 'pulse'|'lead'|'decoy', pad, dur, downbeat }` in song seconds. `pumpAudio(t)` plays every item with `t < item.t ≤ t + 0.25` that has not yet been played (tracked by an index). The test inspects the queue instead of hearing it.

### Journey and stages

`STAGES` (index 0–5). `L` is the number of bars in each half, so a half has `8L` slots. "Off" is the maximum number of real notes on odd slots.

| # | name | BPM | phrases | L | real notes | pads | off | syncopation | decoys | max leap | intro line |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 浅湾 | 72 | 3 | 1 | 3–4 | 1–3 | 0 | — | 0 | 2 | 跟着领头鲸，先学三个音 |
| 2 | 珊瑚海 | 80 | 3 | 1 | 4–5 | 1–4 | 1 | — | 0 | 2 | 新的音：徵 |
| 3 | 雾海 | 88 | 4 | 2 | 5–6 | 1–5 | 2 | — | 0 | 3 | 乐句变长了 |
| 4 | 深渊 | 96 | 3 | 2 | 6–7 | 1–5 | 3 | ≥ 1 | 0 | 3 | 注意切分：音落在拍子之间 |
| 5 | 暗流 | 100 | 3 | 2 | 5–6 | 1–5 | 2 | — | 1–2 | 3 | 洋流噪音来了：灰色气泡别跟唱 |
| 6 | 冰洋 | 108 | 4 | 2 | 6–7 | 1–5 | 3 | ≥ 1 | 2–3 | 3 | 最后一程，极光就在前方 |

**Timeline.**
- `beat = 60 / BPM` and `slotDur = beat / 2`.
- Each stage opens with a 2-bar **intro** at its tempo, showing the banner `第N程 · <name>` and the intro line. The pulse plays throughout the intro.
- The phrase cycles then follow back to back. A phrase starting at `t0` has:
  - call notes at `t0 + slot × slotDur`
  - response notes and decoy mirrors at `t0 + (slot + 8L) × slotDur`
  - `respEnd = t0 + 16L × slotDur + 0.135`
  - `endT = t0 + (16L + 8) × slotDur`
- The first intro starts at `songT = 0`, with `songOrigin = clock.now() + 0.6`.
- With no repeats, the stages last 36.7, 33.0, 60.0, 42.5, 40.8 and 48.9 s, about 4 min 22 s in all.

**Syncopation:** a real note on an odd slot `s` where `s + 1 < 8L` and slot `s + 1` has no real note.

**`generatePhrase(stage, rnd) → { notes: [{ slot, pad, decoy }] }`**, sorted by slot. Each attempt:
1. Draw `n` (real notes) and `d` (decoys) uniformly from the stage ranges, and `k = randint(0, min(off, n − 1))` offbeat notes.
2. Slot 0 is always real. Add `k` random odd slots and `n − 1 − k` random even slots ≥ 2. If there are not enough, retry.
3. Pads: the first is uniform in the stage's pad range. Each next pad is `prev + randint(−leap, leap)`. The last real note is pad 1 (宫).
4. Decoys go on `d` random empty slots ≥ 1, each with a uniform pad 1–5.
5. Return the attempt if `validPhrase` passes. After 500 failed attempts, throw `Error('phrase gen failed')`; the test proves this never happens.

**`validPhrase(phrase, stage) → null | reason`** enforces:
- the counts are in range;
- slot 0 is real; all slots are distinct and `< 8L`; decoys are never on slot 0;
- the odd-slot real-note count is ≤ off, and stages 4 and 6 have ≥ 1 syncopation;
- real pads are within the stage range;
- adjacent real pads differ by ≤ the max leap, and no pad appears 3 times in a row;
- the last real pad is 1.

### Judging and 士气

`judgeOffset(dtMs) → 'perfect' | 'good' | 'miss' | null` uses `|dt|` ≤ 45 / ≤ 100 / ≤ 135, otherwise `null`.

`press(pad, t)` (t is the judged song time) always plays the 小鲸 voice, a ring and a pad flash. It is judged only inside the current phrase's response window, `[t0 + 8L × slotDur − 0.135, respEnd]`. Presses during the call, the rest bar or an intro are free humming.

Inside the window, the checks run in order:
1. **Real note.** Take the nearest unjudged response note with `judgeOffset ≠ null`. If its pad differs, the result is `错音`, judged `miss`. Otherwise the result is the judgement (`完美` / `不错` / `失误`).
2. **Decoy.** If there is an untriggered decoy mirror within 135 ms, the result is `噪音`.
3. **Stray.** Anything else is a stray: combo resets, nothing else changes.

`update` auto-judges any response note still unjudged at `songT > note.t + 0.135` as `miss`, with the popup `漏了`.

| event | 士气 | score | combo |
| --- | --- | --- | --- |
| perfect | +1 | 100 × mult | +1 |
| good | 0 | 50 × mult | +1 |
| miss / 错音 / 漏了 | −5 | 0 | reset |
| 噪音 (decoy sung) | −6 | 0 | reset |
| decoy left alone (counted at `respEnd`) | 0 | 50 | — |
| phrase passed | +2 | — | — |
| phrase failed | −8 | — | — |

Notes:
- `mult = 1 + min(combo, 20) × 0.05`, using the combo after the increment.
- 士气 starts at 100 and is clamped to 0–100. Reaching 0 calls `loseRound()` at once.
- `notesHit` counts perfect and good judgements.

At `respEnd`, `finishPhrase()` computes `acc = max(0, perfects + 0.6 × goods − 0.5 × decoysSung) / realNotes` for the phrase. If `acc ≥ 0.6` the phrase passes: `phrasesPassed++`. Otherwise it fails and `failedPhrases++`. Then it does one of three things:
- **Last phrase passed:** `winRound()`.
- **Stage complete:** queue the next stage's intro at `endT`, then its first phrase.
- **Otherwise:** queue the next phrase at `endT`. If this phrase failed, the next phrase is the same one again.

### State

```js
round = {
  seed, phrases: [[...20 phrase objects, stage-tagged]], idx, stage,
  cur: { stage, t0, L, slotDur, resp: [{ t, pad, result: null }], decoys: [{ t, pad, sung: false }], respEnd, endT, done: false },
  segment: 'intro' | 'phrase', morale, score, combo, maxCombo,
  counts: { perfect, good, miss }, notesHit, decoysSung, failedPhrases, phrasesPassed,
  sched: [], schedIdx,
};
```

`songOrigin`, `inputOffsetMs` (default 0, range −200…200), `paused`, `phase: 'menu' | 'calibrate' | 'play' | 'over'`.

### Calibration

From the menu, `校准` opens the calibration screen.
- It plays 8 `pulse` ticks at 100 BPM, starting 1 s later.
- The player taps any pad, key or Space on each tick.
- `calibrate(tapTimes, tickTimes) → ms | null` pairs each tap with the nearest tick within ±300 ms. With fewer than 4 pairs it returns `null`. Otherwise it returns the median of `(tap − tick)`, rounded to 10 ms and clamped to ±200.
- `−` / `+` buttons nudge the value by 10 ms.

The copy is:
- prompt: `跟着节拍敲任意音垫`
- result: `输入延迟 +40 ms`
- failure: `没有收到足够的敲击，再试一次`
- buttons: `重新校准`, `返回`

### Screens (logical 540 × 900)

- **Menu.** Title `鲸歌`, subtitle `领头鲸唱一句，你跟着唱一句`. Three lines: `听：领头鲸先唱一句`, `唱：下一小节用同样的节奏唱回去`, `避：灰色气泡里的洋流噪音别跟唱`. Buttons `出发` and `校准`, plus the line `输入延迟 +0 ms`.
- **HUD (y 0–70).**
  - Left: `第三程 · 雾海`.
  - Centre: the 航程 bar, 20 ticks with a small whale at `phrasesPassed / 20`.
  - Right: `士气` with a bar (`#7fe3d6`, red `#ff5a5a` below 30), and `得分 12,350` and `连击 12` under it.
  - Top-right corner: a `暂停` button.
- **Sea (y 70–600).**
  - A vertical gradient per stage: 浅湾 `#4fb3d9→#1d4f91`, 珊瑚海 `#2a8fbf→#173f73` with coral blobs, 雾海 `#5d7c99→#1f3550` with fog bands, 深渊 `#0d2340→#03070f` with glowing particles, 暗流 `#123a5a→#061a2b` with streaks, 冰洋 `#1b3f6b→#0a1630` with aurora bands in `#7fe3d6` at 25% alpha.
  - Background shapes scroll in parallax toward `phrasesPassed × 300` units, eased.
  - The whales are ellipse bodies (`#2c5d8f`, belly `#a9d6e5`) with a two-curve fluke and an eye:
    - lead: 140 × 56 at (380, 250)
    - 小鲸: 80 × 32 at (170, 380)
    - two pod members: 100 × 40 at (90, 230) and (250, 470)
  - All whales bob ±6 units on a 2-beat sine.
  - Each sung note emits a ring from the singer's head, radius 10 → 60 over 0.6 s and fading, in its pad colour with `shadowBlur 16`. Decoy rings are dashed `#8a7fb8` with 🫧.
  - Below 30 士气 the pod members fade to 50% and drift 30 units back.
- **Track (y 610–700).**
  - Slots across x 30–510, with `x = 30 + (slot + 0.5) × 480 / 8L` and pad rows at `y = 690 − (pad − 1) × 18`. Beat ticks are drawn on even slots, and a playhead line sweeps across.
  - The banner above the track reads `听` during the call and `唱！` during the response.
  - **Call:** each ring appears as it is sung.
  - **Response:** judged rings recolour by result: perfect in the pad colour, good in white, miss with a red ✕. Ghost rings show at 35% alpha in stages 1–2 only.
  - **Rest bar:** `答得好 · 92%` or `走调了 · 再听一遍`.
- **Pads (y 720–880).** Circles of radius 44 at x = 70, 170, 270, 370, 470, y = 800 (hit radius 50), labelled with the pad name and the key under it. A press flashes for 120 ms. Judgement popups (`完美` `不错` `失误` `错音` `漏了` `噪音`) float up 20 units over 0.5 s at y 712.
- **Pause.** `暂停`, with `继续` (3-2-1 countdown) and `放弃本程` (calls `loseRound()`).
- **Win.** `抵达极光海！` showing 得分, 完美 / 不错 / 失误, 最高连击, `重唱 N 句`, and the button `再游一次`.
- **Loss.** `鲸群走散了` showing `航程 N%` and 得分, and the button `再游一次`.

### Functions

- `mulberry32(seed)`
- `rng()`
- `generatePhrase(stage, rnd)`
- `validPhrase(phrase, stage)`
- `judgeOffset(dtMs)`
- `calibrate(tapTimes, tickTimes)`
- `makeAudioClock(ac)`
- `makePerfClock()`: `now()` is `performance.now() / 1000` minus paused time.
- `startRound()`:
  1. Resets state and `roundAchievements`.
  2. `clock = clockOverride || (AC ? makeAudioClock(AC) : makePerfClock())`.
  3. Generates all 20 phrases.
  4. Queues the stage 1 intro and sends `start`.
- `press(pad, t)`
- `onPadDown(pad, perfMs)`: calls `press(pad, clock.at(perfMs) − songOrigin − inputOffsetMs / 1000)`.
- `update(dt)`: animations; if playing and not paused, `t = songT()`, then `pumpAudio(t)`, auto-miss, `finishPhrase` at `respEnd`, and segment changes.
- `finishPhrase()`
- `winRound()`
- `loseRound()`
- `pause()`
- `resumeGame()`
- `render()`

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `first_song` | `finishPhrase()` passes a phrase for the first time. |
| `combo_30` | `combo` reaches 30 in `press`. |
| `in_tune` | `finishPhrase()` in stage 5 or 6 with every real note perfect and `decoysSung` for that phrase 0. |
| `arrive` | `winRound()`. |
| `one_take` | `winRound()` with `failedPhrases === 0`. |
| `clear_ear` | `winRound()` with `decoysSung === 0`. |

The win achievements are sent in the order `arrive, one_take, clear_ear`. A flawless run always produces `first_song` (stage 1), then `combo_30` (stages 1–2 hold at most 27 notes and stages 1–3 at least 41), then `in_tune` (stage 5).

### Stats

In `winRound()`/`loseRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, notes: Math.min(notesHit, 1000), phrases: phrasesPassed })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern. It also stubs `document.documentElement = { clientWidth: 540, clientHeight: 900 }` and `document.addEventListener`. The driver code is appended to the game script, so it can set `rng = mulberry32(7)` and `clockOverride = fake`, where `fake = { t: 0, now() { return this.t }, at(ms) { return ms / 1000 }, pause() {}, resume() {} }`. `step(dt)` does `fake.t += dt; update(dt)` in 1/60 s steps.

**Pure functions:**
- **Generator.** For each stage, 500 seeds:
  - `generatePhrase` doesn't throw and `validPhrase` returns `null`;
  - the same seed gives the same phrase;
  - every pair of response and decoy times is at least 0.27 s apart at the stage's tempo.
- **Judging.** `judgeOffset` returns `perfect` for 0 and ±45, `good` for ±46 and ±100, `miss` for ±101 and ±135, and `null` for ±136.
- **Calibration.** `calibrate` returns 30 for taps at tick + 0.03 s, 40 when every tap is tick + 0.04 except one outlier tap at tick + 0.25 among 8, and `null` for 3 taps.

**Load.** Only `ready` is sent before `startRound()`.

**Autoplay helper.** Each step, every response note with `note.t ≤ fake.t` and `result === null` gets `press(note.pad, note.t)`.

**Flawless run.** `startRound()`, then autoplay to the end.
- Expected sequence: `start, first_song, combo_30, in_tune, arrive, one_take, clear_ear, stats, end`.
- Expected stats: `{ rounds: 1, wins: 1, notes: <sum of real notes over round.phrases>, phrases: 20 }`.
- 士气 stays 100.

**Offset.** With `inputOffsetMs = 80`, `onPadDown(pad, (songOrigin + note.t + 0.08) × 1000)` is judged `perfect`. With 0, the same press is `good`.

**Repeat.** Autoplay, but skip every press in the first phrase's response.
- The phrase fails and is replayed with identical notes, and `phrasesPassed` is 0 after it.
- Expected sequence: `start, first_song, combo_30, in_tune, arrive, clear_ear, stats, end` (no `one_take`).

**Decoys.** Autoplay, and also press each decoy's pad at its mirrored time.
- Every phrase still passes (the minimum `acc` is 0.75), and `decoysSung` equals the total decoy count.
- Expected sequence: `start, first_song, combo_30, arrive, one_take, stats, end`.

**Silence.** Never press.
- 士气 reaches 0 within 60 simulated seconds.
- Expected sequence: `start, stats, end`, with stats `{ rounds: 1, wins: 0, notes: 0, phrases: 0 }`.

**Random play.** 20 rounds pressing random pads at random times (seeded).
- Each ends within 1200 simulated seconds with `…, stats, end`.
- 士气 always stays in 0–100.
- No achievement is sent twice in a round.

## Milestones

Each milestone ends with `node games/whale-song/v1/test_headless.js` passing.

**M1 · Playable journey.** The clock, scheduler, generator, judging, 士气, repeats, decoys, calibration, pause, all screens and voices.
Done when: a full journey plays in a browser in time with the audio on desktop and phone, and the generator, judging, calibration and offset tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the deterministic scenarios, `README.md` (controls, the clock seam, how to calibrate).
Done when: `pnpm game check whale-song v1` passes.

**M3 · Local release.** `pnpm game:local publish whale-song v1 --yes`.
Done when: `/play/whale-song` plays locally, and a logged-in round unlocks `first_song` and updates the stats board. The owner runs the production publish.

## Open items

- **Audio timing (implementer, M1).** `getOutputTimestamp` support varies, especially iOS Safari. If notes feel early or late with offset 0 on a device, the implementer checks whether the D3 fallback path is the better default there, and records the result in the implementation notes.
- **Balance (owner, M1 playtest).** The 士气 costs, the 60% pass line and the stage tempos may need tuning. The tests read those constants, so they follow any change.
