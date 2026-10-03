# 退休魔王 (`last-boss`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A reverse bullet hell. You are the final boss, sitting on your throne at the top of the arena on your last day before retirement. Five waves of AI heroes come up from the bottom, dodge your bullets and attack you. Aim with the pointer and fire bullet patterns from 4 skill slots. Arm two slots at once and they fire a combined 合击 pattern. Survive all 5 waves with HP above 0 to retire in glory. Mouse or touch, single-player, about 4–7 minutes a round.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html` (SDK block, `resize()`, audio helpers), `games/slash/v4/test_headless.js` (stub pattern).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | One file, `games/last-boss/v1/index.html`, vanilla JS and canvas, no dependencies. Copy from 乱刃 v4 / 摸了个鱼 only the SDK block, the `resize()`/`view` pattern (`document.documentElement.clientWidth/Height`) and the audio helpers. | Same package contract. Hundreds of bullets need canvas, not DOM. |
| D2 | The boss does not move. All of the player's skill is in aiming and in choosing patterns. | The core idea is the role reversal: the player makes the bullets, and the heroes do the dodging. Moving the boss would make it a normal shmup with the screen upside down. |
| D3 | Firing works by **arming**. One or two of the 4 slots are armed at a time. Holding fire casts the armed set every time all armed slots are off cooldown and there is enough mana. Two armed slots cast that pair's 合击 pattern instead of either base pattern. | It works with one pointer on touch (tap slot buttons, then hold on the arena), and with a mouse it lets "combining slots" happen without chords. |
| D4 | The hero AI is a sampled look-ahead (below). It calls `rng()` exactly 4 times per hero per think and nowhere else in the game. | It is deterministic under a seeded `rng`, cheap, and makes heroes visibly react to bullets and laser telegraphs. |
| D5 | `update(dt)` clamps `dt` to 0.05 s and splits it into equal substeps of at most 1/60 s. Heroes think on `gameT` multiples of 0.1 s. | It runs the same at any frame rate. Given the same `dt` sequence and seed, a test run is reproducible. |
| D6 | Randomness goes through `rng()` (default `Math.random`, `mulberry32(seed)` in tests). Wave contents are fixed tables, not random. | Deterministic tests. Every player faces the same waves. |
| D7 | Bullets have hard caps: 300 boss bullets (the oldest is dropped first), 12 beams and 80 hero projectiles. Each hero's think only looks at bullets within 200 units. | This holds a phone at 60 fps. The look-ahead cost is bounded by heroes × 12 × 6 × nearby bullets. |
| D8 | `ready` is sent on load and again at 0.5, 2 and 5 s. `start` is sent when the player presses `最后一天上班` or a replay button. That press is the round's first real action. | The same lifecycle fix as 升官记 D8. |
| D9 | After a wave has lasted 90 s, its heroes go **狂暴**: `pref` becomes 70 and their danger weight is halved. | A priest hiding at long range can't stall a round forever, and the round time stays bounded. |

## Out of scope

Boss movement, upgrades or a shop between waves, difficulty levels, endless mode, pausing, multiplayer, saving progress between page loads, leaderboards, cross-round achievements.

## Architecture

### Package

```text
games/last-boss/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "last-boss",
  "name": "退休魔王",
  "shortDescription": "反向弹幕：你是魔王，明天退休，今天勇者们来打你。",
  "description": "你是坐在王座上的最终魔王，明天就要退休了。五波勇者从下方涌来，会躲子弹、会奶、会闪现，最后还有会翻滚的勇者本人。移动鼠标瞄准，从四个技能里选一个或两个组合出弹幕，撑过五波就能光荣退休。",
  "tags": ["射击", "弹幕", "单人"],
  "controls": [
    { "input": "鼠标移动 / 点按场地", "action": "瞄准" },
    { "input": "按住左键 / 按住场地 / 空格", "action": "连续施放" },
    { "input": "1–4 / 技能按钮", "action": "选中技能，选中两个即为合击" },
    { "input": "M", "action": "静音或恢复声音" }
  ],
  "cover": { "symbol": "魔", "eyebrow": "REVERSE BULLET HELL", "accent": "#9b2fd6", "accentSecondary": "#ff4f8b" },
  "sortOrder": 160,
  "achievements": [
    { "key": "wave_3", "name": "熬过中场", "description": "撑过第 3 波。", "symbol": "熬" },
    { "key": "retire", "name": "光荣退休", "description": "撑过全部 5 波，光荣退休。", "symbol": "休" },
    { "key": "full_hp", "name": "老当益壮", "description": "退休时魔王血量不少于 200。", "symbol": "壮" },
    { "key": "untouched_wave", "name": "滴水不漏", "description": "从第 3 波起，有一整波魔王没掉一滴血。", "symbol": "漏" },
    { "key": "combo_all", "name": "融会贯通", "description": "一局内用出全部 6 种合击。", "symbol": "融" },
    { "key": "hero_laser", "name": "以光还光", "description": "用激光类技能击倒勇者。", "symbol": "光" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "退休", "maxPerRound": 1 },
    { "key": "kills", "name": "击退勇者", "maxPerRound": 44 },
    { "key": "waves", "name": "撑过波数", "maxPerRound": 5 }
  ]
}
```

### Arena, view and input

- **Logical area:** 480 × 860. The arena is `y 0–760`, and the control strip is `y 760–860`. `resize()` scales it uniformly with `s = min(vw/480, vh/860)`, centred, letterboxed with `#140a1f`. Pointer coordinates are mapped back as `(px − ox)/s`.
- **Boss:** centre `(240, 90)`, hit radius 40, drawn as 😈 at 72 px on a purple throne, with a sign `明天退休` beside it.
- **HUD** (top of the arena): the boss HP bar `魔王 300/300`, `第 3/5 波` and `剩余勇者 N`.
- **Control strip:** a mana bar (full width, 8 px tall) at `y 764`, then 4 slot buttons of 108 × 80 with 8 px gaps. Each button shows its icon, name and cost. Cooldown is drawn as a dark sweep, a cost above current mana shows in red, and armed buttons get a glowing `#ff4f8b` border. The current pattern name (`扇形弹`, or `合击 · 花雨`) is written above the strip.
- **Aim:** `aim` is the last pointer position inside the arena, clamped to `y ≥ 150`. Mouse movement updates it without a press. Pointer moves in the strip do not change it. A crosshair is drawn at `aim`.
- **Fire:** `firing` is true while the pointer is held down in the arena (mouse or finger) or Space is held. Each substep while `firing`, `fire()` is tried.
- **Arming:** `toggleSlot(i)` is bound to a slot button `pointerdown` and to keys `1`–`4`.
  - Tapping an unarmed slot arms it. If 2 slots are already armed, the earlier-armed one is disarmed first.
  - Tapping an armed slot disarms it, unless it is the only armed slot.
  - Slot 1 is armed when a round starts.
- Keyboard adds slot keys, Space to fire and `M` to mute. Everything is playable with the pointer alone.

### Boss, mana, damage

- **Boss HP:** 300. The boss loses when HP ≤ 0. Between waves it heals `+30` (capped at 300), shown as `领取养老金 +30`.
- **Mana:** max 100, regenerates 20/s, starts full and refills to full between waves.
- **Spawning:** boss bullets spawn at boss centre + 44 × the direction to `aim`. All damage is an integer.
- **Hitting heroes:** a boss bullet (`bullet`, `orb` or `homing`) overlapping a hero's circle calls `hitHero(h, dmg, 'bullet')` and is consumed (an orb bursts where it hit). Each bullet hits at most one hero. An active beam hits each hero at most once per cast (`beam.hit` Set, shared by every beam of the same cast) with `hitHero(h, dmg, 'laser')`. A hero with `rollT > 0` takes no damage and doesn't consume bullets.
- **Hitting the boss:** a hero projectile reaching `dist ≤ 40 + r` from the boss centre calls `hurtBoss(dmg)`. Melee is described in the hero table.
- **Interception:** a boss bullet overlapping an arrow destroys both (an orb bursts). Active beams destroy arrows and 圣剑波. Bullets do not stop 圣剑波.
- **Cleanup:** bullets more than 20 units outside the arena are removed. When a cap (D7) is exceeded, the oldest entries are removed.

### Patterns

Angles are measured from the direction boss → `aim`. A **beam** is a segment with width `w`. It telegraphs as a 2 px dashed line for `tele` seconds, then is active for 0.35 s, drawn as a thick glowing bar. Its direction is fixed when it is cast, except for 锁定光. An **orb** flies to the aim point and bursts when it has travelled the distance to `aim` measured at cast time, when it hits a hero or an arrow, or when it leaves the arena. A **homing** bullet turns toward its target at `turn` rad/s. Its target is the live hero nearest to `aim` at cast time. If that target dies, it retargets the hero nearest to itself. With no heroes, it flies straight.

| slot | name | icon | cost | cd | pattern |
| --- | --- | --- | --- | --- | --- |
| 1 | 扇形弹 | 🪭 | 10 | 0.5 s | 7 bullets at −30°…+30° in 10° steps, speed 240, r 6, dmg 2 |
| 2 | 环形弹 | ⭕ | 25 | 1.8 s | 1 orb (speed 320, r 9, dmg 2) that bursts into 16 bullets every 22.5° from 0°, speed 170, r 6, dmg 2 |
| 3 | 追踪弹 | 🎯 | 20 | 1.4 s | 3 homing at −15°, 0°, +15°, speed 200, r 6, dmg 3, turn 3.0, life 3.5 s |
| 4 | 激光 | ⚡ | 40 | 4.0 s | 1 beam from the boss along the aim direction, length 900, w 22, tele 0.5 s, dmg 12 |

**合击.** Cost is `round(0.8 × (costA + costB))`. Casting starts both slots' own cooldowns.

| pair | name | cost | pattern |
| --- | --- | --- | --- |
| 1+2 | 花雨 | 28 | 5 orbs at 0°, ±15°, ±30°. Each bursts after 0.55 s of flight into 8 bullets (every 45°, speed 170, r 6, dmg 2) |
| 1+3 | 群蜂 | 24 | 7 homing at −30°…+30° in 10° steps, speed 200, r 5, dmg 2, turn 2.4, life 3.5 s |
| 1+4 | 扇光 | 40 | 3 beams from the boss at 0°, ±18°, length 900, w 16, tele 0.5 s, dmg 8 |
| 2+3 | 星爆 | 36 | 1 orb that bursts into 8 homing (every 45°, speed 180, r 5, dmg 2, turn 3.0, life 3.0 s). Targets are assigned round-robin over live heroes sorted by distance to the burst point |
| 2+4 | 十字光 | 52 | 4 beams centred on `aim` at 0°, 45°, 90°, 135° absolute, each 360 long, w 18, tele 0.6 s, dmg 10 |
| 3+4 | 锁定光 | 48 | 1 beam from the boss, w 20, tele 0.6 s, dmg 16. For the first 0.4 s of the telegraph it re-aims at the live hero nearest to `aim` at cast time (or at `aim` if there is none), then it locks |

`castPattern(key, aim)` takes `key` in `'1' '2' '3' '4' '1+2' '1+3' '1+4' '2+3' '2+4' '3+4'` (lower slot first). Every cast plays a slot-coloured sound. Bullet colours: slot 1 `#ff4f8b`, slot 2 `#c86bff`, slot 3 `#ffd24d`, slot 4 `#7af0ff`. Combo bullets use the colour of the pair's lower slot.

### Heroes

Each hero is `{ id, type, x, y, vx, vy, hp, maxHp, r, spd, pref, W, atkCd, auxCd, rollT, rollCd, entering, berserk }`. It is drawn as an emoji at 28 px (勇者 36 px) with a 24 × 3 HP bar above it. A defeated hero floats the text `回城了` and fades over 0.6 s. `atkCd` starts at 1.0 s for every hero.

| type | emoji | HP | spd | r | pref | W | behaviour |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 剑士 | 🤺 | 14 | 150 | 12 | 70 | 2 | Melee: 4 dmg every 1.0 s while `dist(boss) ≤ 40 + r + 30` |
| 弓手 | 🧝 | 10 | 110 | 12 | 320 | 4 | Arrow every 2.2 s while `dist ≤ 400`: aimed at the boss centre, speed 260, r 4, dmg 3 |
| 牧师 | 😇 | 16 | 100 | 12 | 420 | 5 | Every 3.0 s, heals 6 to the ally (self included) with the lowest `hp/maxHp` below 1 within 220. Ties go to the lowest id. If no ally needs it, the cooldown waits. A green ring flashes |
| 盗贼 | 🥷 | 10 | 170 | 11 | 70 | 3 | Melee: 3 dmg every 0.7 s. **Blink**, `auxCd` 4.0 s (starts at 2.0) |
| 勇者 | 🦸 | 120 | 140 | 14 | 80 | 3 | Melee: 6 dmg every 0.9 s. **圣剑波** every 4.0 s while `dist > 160`: speed 220, r 12, dmg 8. **Dodge roll**, `rollCd` 2.5 s |

- **Entering:** a hero spawns at `(x, 780)` with `entering = true`. It moves straight up at `spd` until `y ≤ 720`, and does not think or attack meanwhile, but it can be hit.
- **Bounds:** after entering, positions are clamped to `[r, 480 − r] × [r, 760 − r]`. A hero closer than `40 + r + 4` to the boss is pushed out radially. Heroes may overlap each other.

### Hero AI

`thinkHero(h)` runs for every non-entering hero, in id order, each time `gameT` crosses a multiple of 0.1 s. The hero then keeps the chosen velocity until its next think.

1. **Candidates.** `θ0 = rng() · π/4`. There are 12 candidates:
   - index 0 is standing still;
   - indices 1–8 are `dir(θ0 + k·π/4)` for k = 0–7;
   - indices 9–11 are `dir(rng() · 2π)`.

   Each velocity is `dir × spd`. That is exactly 4 `rng()` calls per think.
2. **Threats.** Boss bullets within 200 of `h` at think time, plus every beam.
3. **`predictDanger(h, vx, vy)`.** Take 6 steps, `τ = 0.05k` for k = 1–6. At each step the hero is at `clamp(h + v·τ)` and each bullet at `b + bv·τ` (straight line, homing included). Each step adds `dmg × f(c)` per threat, where:
   - `c` is the centre distance − `(rb + r)` for a bullet, or the point-to-segment distance − `(w/2 + r)` for a beam;
   - `f(c) = 1` for `c ≤ 0`, `0.3·(1 − c/16)` for `0 < c < 16`, and 0 otherwise;
   - a beam counts at a step only if it is active at `beam.t + τ`.
4. **Score.** `W × danger + |dist(clamp(h + v·0.3), boss) − pref| / 100`. The lowest score wins, and ties go to the lower index.
5. **盗贼 blink.** If `auxCd ≤ 0` and either the best candidate's danger is ≥ 1 or `dist(boss) > 220`, score the 8 points `clamp(h + 120·dir(k·π/4))` with the same formula, using `v = 0` at that point. Teleport to the best one, set `v = 0` and `auxCd = 4`. It leaves a purple puff.
6. **勇者 roll.** If `rollCd ≤ 0` and the best candidate's danger is ≥ 1, roll toward the lowest-danger non-stay candidate (ties go to the lower index) at `2.2 × spd`, with `rollT = 0.4` (invulnerable, drawn at 50% alpha) and `rollCd = 2.5`. The hero does not think again until `rollT` ends.
7. **狂暴** (D9). Once `waveT > 90`, every hero of the wave uses `pref = 70` and `W / 2`, and gets a red tint.

### Waves

Each wave lists `t (s after the wave starts): type @ x`. Wave 1 starts 1.5 s after `startRound()`. A wave is cleared when its spawn queue is empty and no heroes are alive. Each wave opens with a 2 s banner showing its name and line.

| # | name | line | spawns | heroes |
| --- | --- | --- | --- | --- |
| 1 | 新手村 | 一群刚出新手村的勇者，连装备都没换。 | 0: 剑士@160, 剑士@320 · 3: 剑士@100, 剑士@380 · 6: 弓手@200, 弓手@280 | 6 |
| 2 | 冒险者公会 | 公会接了悬赏，来的人多了点。 | 0: 剑士@120, 剑士@360 · 2: 弓手@240 · 5: 牧师@240, 剑士@160, 剑士@320 · 8: 弓手@100, 弓手@380 | 8 |
| 3 | 精英小队 | 有牧师奶着，有盗贼绕后。 | 0: 盗贼@140, 盗贼@340 · 2: 弓手@80, 弓手@400 · 4: 牧师@240, 剑士@180, 剑士@300 · 8: 盗贼@240, 牧师@120, 弓手@360 | 10 |
| 4 | 王国骑士团 | 国王说今天必须拿下。 | 0: 剑士@100, 剑士@200, 剑士@280, 剑士@380 · 3: 弓手@60, 弓手@420, 牧师@240 · 6: 盗贼@160, 盗贼@320, 弓手@240 · 10: 剑士@140, 剑士@340, 牧师@100, 盗贼@380 | 14 |
| 5 | 勇者降临 | 传说中的勇者来了，他会翻滚。 | 0: 勇者@240, 牧师@120, 牧师@360 · 8: 剑士@160, 剑士@320 · 14: 弓手@240 | 6 |

There are 44 heroes in total. When a wave is cleared, `waveCleared(n)` runs. For waves 1–4, it shows `领取养老金 +30` for 4 s, heals, refills mana and starts the next wave.

### Screens

- **Start:** title `退休魔王`, subtitle `明天就退休了，今天还得上最后一天班`, three rule lines (`移动鼠标或点按场地瞄准，按住施放`, `点技能按钮切换技能，选中两个就是合击`, `撑过五波勇者，光荣退休`), and the button `最后一天上班`.
- **Win:** `光荣退休！`, subline `勇者们再也找不到你了`, then `剩余血量 N`, `击退勇者 44`, `用时 m:ss`, and the button `再上一天班`.
- **Loss:** `倒在了退休前一天`, subline `第 N 波 · 勇者们开香槟了`, then `击退勇者 N`, and the button `再来一次`.
- **Sounds:**
  - a cast sound per slot: fan chirp, orb thump, homing whistle, a laser charge rise plus a buzz;
  - hero hit tick, hero down pop, boss hurt thud;
  - wave banner gong;
  - win and loss jingles.

### Functions

All game logic is in top-level functions over module state (`phase`, `boss`, `heroes`, `bullets`, `beams`, `shots`, `spawnQueue`, `armed`, `cd[4]`, `aim`, `gameT`, `wave`, `waveT`, `waveDamage`, `kills`, `wavesCleared`, `combosUsed`). Rendering only reads that state.

- `startRound()`: resets all state and `roundAchievements`, arms slot 1, sets `aim = (240, 500)` and `phase = 'play'`, sends `start`, and queues wave 1.
- `setAim(x, y)`
- `toggleSlot(i)`: `i` is 0–3.
- `fire()`: returns the cast key, or `null` if a cooldown or the mana blocks it. For a pair, it adds the key to `combosUsed`, and when the size reaches 6 it unlocks `combo_all`.
- `castPattern(key, aim)`
- `thinkHero(h)`
- `predictDanger(h, vx, vy)`: pure over the current threats.
- `hitHero(h, dmg, src)`:
  1. Returns `false` if `rollT > 0`.
  2. Otherwise applies the damage. On death it removes the hero, does `kills++`, and unlocks `hero_laser` if the hero is the 勇者 and `src === 'laser'`.
  3. If that was the wave's last hero, it calls `waveCleared(wave)`.
- `hurtBoss(dmg)`: adds to `waveDamage`, and calls `loseRound()` at HP ≤ 0.
- `waveCleared(n)`:
  1. Sets `wavesCleared = n`.
  2. Unlocks `untouched_wave` if `n ≥ 3 && waveDamage === 0`, then `wave_3` if `n === 3`.
  3. Calls `winRound()` if `n === 5`, otherwise starts the intermission.
- `winRound()`: unlocks `retire`, then `full_hp` if `boss.hp ≥ 200`, then sends stats and `end`.
- `loseRound()`: sends stats and `end`.
- `update(dt)`: D5 substeps. Each substep handles timers, spawns, thinks, movement, homing, orb bursts, beams, collisions, hero attacks, wave progression and 狂暴. It returns nothing.

### Achievements

Emitted through `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `combo_all` | The 6th distinct pair is cast in `fire()`. |
| `hero_laser` | The 勇者 dies from `hitHero(…, 'laser')`. |
| `untouched_wave` | `waveCleared(n)` with `n ≥ 3` and `waveDamage === 0`. |
| `wave_3` | `waveCleared(3)`. |
| `retire` | `winRound()`. |
| `full_hp` | `winRound()` with `boss.hp ≥ 200`. |

At the final kill, the order is `hero_laser` (if earned), then `untouched_wave`, then `retire, full_hp`.

### Stats

In `winRound()`/`loseRound()`, before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, kills, waves: wavesCleared })`.

### Headless test

`v1/test_headless.js` uses 乱刃 v4's stub pattern. The driver reassigns `rng = mulberry32(seed)`. Sequences below ignore `ready`.

**Load.** The first message is `ready`, and nothing else is sent before `startRound()`.

**Determinism.** Run `rng = mulberry32(42); startRound()`, aim at `(240, 500)`, hold fire with slot 1, then `update(1/60)` for 3600 frames. Record every hero's `(x, y, hp)`, `boss.hp` and `kills`. A second identical run must match exactly.

**Dodge:**
1. Run `rng = mulberry32(1); startRound()`, clear `spawnQueue`, and add one non-entering 弓手 at `(240, 500)`.
2. Push the bullet `{ x: 240, y: 430, vx: 0, vy: 240, r: 6, dmg: 2, kind: 'bullet' }`.
3. `thinkHero(h)` must choose a non-zero velocity, with `predictDanger(h, h.vx, h.vy) === 0`.
4. After `update(1/60)` × 30, `h.hp === 10`.

**Roll:**
1. Set up a 勇者 at `(240, 400)` with `rollCd = 0`.
2. Add 16 bullets on a radius-60 circle around it, each moving inward at 240.
3. `thinkHero(h)` gives `rollT === 0.4`.
4. Separately, with `rollT = 0.3`, `hitHero(h, 50, 'laser')` returns `false` and HP stays 120.

**Patterns:**
- With `mana = 100` and cooldowns cleared, each of the 10 keys spawns the counts in the tables: fan 7 bullets, ring 1 orb that bursts into 16, homing 3, laser 1 beam, 花雨 5 orbs, 群蜂 7, 扇光 3 beams, 星爆 1 orb that bursts into 8 homing, 十字光 4 beams, 锁定光 1 beam.
- Mana drops by the listed cost.
- `fire()` returns `null` when mana < cost or any armed slot is cooling down.

**Priest.** A 牧师 and a 剑士 at `hp = 4`, 100 apart, with `atkCd = 0`. After one `update(1/60)` the 剑士 has `hp === 10`.

**Cap.** 60 fan casts in a row (mana and cooldowns reset each time) leave `bullets.length === 300`.

**Deterministic win:**
1. `rng = mulberry32(7); startRound()`.
2. Before wave 1 spawns, cast the 6 pairs in table order. For each: set `mana = 100`, `cd.fill(0)` and `armed = [a, b]`, then call `fire()`.
3. Loop `update(0.1)`. After each step, call `hitHero(h, h.hp, 'bullet')` on every live hero except the 勇者. When the 勇者 spawns, set its `spd = 0`, `atkCd = 1e9` and `auxCd = 1e9`.
4. Once wave 5's queue is empty and only the 勇者 is alive, call `hitHero(勇者, 120, 'laser')`.

Expected sequence: `start, combo_all, untouched_wave, wave_3, hero_laser, retire, full_hp, stats, end`. Expected stats: `{ rounds: 1, wins: 1, kills: 44, waves: 5 }`.

**Loss.** `startRound(); hurtBoss(999)` gives `start, stats, end` with `{ rounds: 1, wins: 0, kills: 0, waves: 0 }`.

**Bot simulation.** 10 rounds with seeds 1–10. Every 0.1 s, a bot aims at the nearest hero and holds fire with slot 1, and every 6 s it fires slot 4 once.
- Run `update(1/30)` until `phase === 'over'`. That must happen before `gameT` 900.
- Throughout, `bullets.length ≤ 300`, `beams.length ≤ 12`, `shots.length ≤ 80`, and every non-entering hero stays inside the bounds.
- Each round ends `…, stats, end`.

## Milestones

Each milestone ends with `node games/last-boss/v1/test_headless.js` passing.

**M1 · Playable arena.** View and input, boss, mana, the 10 patterns, the 5 hero types with AI, waves, intermissions, screens, sounds.
Done when: a full round plays in a browser with mouse and on a phone-sized touch viewport, and the determinism, dodge, roll, pattern, priest, cap and bot tests pass.

**M2 · Achievements, stats, package.** `game.json`, emission, the deterministic win and loss tests, `README.md`.
Done when: `pnpm game check last-boss v1` passes.

**M3 · Local release.** `pnpm game:local publish last-boss v1 --yes`.
Done when: `/play/last-boss` plays locally, and a logged-in round that clears wave 3 unlocks `wave_3` and updates the stats board. The owner runs the production publish.

## Open items

- **Balance** (owner, during M1 playtests). This covers boss HP 300, the hero numbers and the wave table. The target is that a first-time player usually reaches wave 3 and a practised one retires, in 4–7 minutes. Changing the hero counts means updating `kills.maxPerRound` (44) and the deterministic test.
