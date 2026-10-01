# 一夫当关 · 守关 (`hold-gate`)

**Status:** Design — settled, not yet implemented. Milestones: M1 ☐ · M2 ☐ · M3 ☐

A wave-survival game built on 乱刃's slashes. A lone swordsman holds a mountain pass against 10 waves of bandits, picking one upgrade between waves. The gate falls if the player dies or 3 bandits slip past. Single-player only, keyboard and mouse only.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html`, `games/slash/v4/test_headless.js`, `games/slash/game.json`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game is `games/hold-gate/v1/index.html`, one file, started as a copy of `games/slash/v4/index.html`. `SLASHES`, `tryCast`, `doStrike`, projectiles, player control, audio, effects and the loadout menu stay. The entity list, AI, HUD and win logic are replaced. | Games cannot share files. The slashes are already balanced for crowds (旋斩, 剑气). |
| D2 | The arena is a horizontal pass: cliffs cover `y < 120` and `y > 580` (drawn as rock, and blocking like 乱刃's obstacles), so the playable band is 1100 × 460. The gate line is `x = 80`, and enemies spawn at `x = 1080` at a random `y` in the band. | One lane with one direction makes "hold the gate" readable at a glance. |
| D3 | The player has 150 HP and no respawn: death ends the round. An enemy whose centre crosses `x < 80` is a leak and disappears. 3 leaks end the round. A boss leak counts as 3. | Two clear ways to lose, both shown on the HUD. |
| D4 | There are 10 fixed waves (table below), 182 enemies in total. Within a wave, enemies spawn one every 0.6 s, with the boss first. A wave is cleared when all its enemies are dead or leaked. | Fixed waves make `hundred` reachable and difficulty predictable; random waves would need balancing per seed. |
| D5 | Between waves the game pauses on an upgrade screen offering 3 distinct random upgrades that aren't maxed, plus `跳过`. Keys `1`, `2`, `3` or a click pick one; `0` or a click on 跳过 skips it. The player also heals 30 HP. | Choosing an upgrade is the roguelite hook. Skipping must exist for `no_upgrade`. |
| D6 | Hits on enemies use the slash's `dmg` × the damage multiplier. Knockback applies at full strength to 喽啰, 50% to 刀盾手 and 弓手, and 20% to bosses. | Keeps 重斩 and 旋斩 satisfying without letting the player juggle bosses. |
| D7 | Enemies only fight the player; they never hurt each other. They push each other with 乱刃's all-pairs loop. | At most about 40 enemies are alive at once, so the O(n²) push stays cheap. Add a grid only if waves grow. |

## Out of scope

Multiplayer, touch controls, endless mode, saving a run, more than one map, allies, a difficulty setting, cross-round achievements.

## Architecture

### Package

```text
games/hold-gate/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "hold-gate",
  "name": "一夫当关 · 守关",
  "shortDescription": "孤身一人，挡住十波山贼。",
  "description": "选两种斩击，独守山间关口，抵挡喽啰、刀盾手、弓手与寨主的十波进攻。每波之间挑选一项强化。阵亡或漏过三名敌人即告失守。",
  "tags": ["动作", "生存", "单人", "键鼠"],
  "controls": [
    { "input": "WASD / 方向键", "action": "移动" },
    { "input": "鼠标", "action": "瞄准" },
    { "input": "鼠标左键 / J", "action": "使用左槽斩击" },
    { "input": "鼠标右键 / K", "action": "使用右槽斩击" },
    { "input": "1 / 2 / 3 / 0", "action": "选择强化 / 跳过" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R / B", "action": "再战 / 返回配装" }
  ],
  "cover": { "symbol": "关", "eyebrow": "WAVE DEFENSE", "accent": "#8dff5a", "accentSecondary": "#ffb020" },
  "sortOrder": 50,
  "achievements": [
    { "key": "wave_5", "name": "初守", "description": "撑过第 5 波，击败首个寨主。", "symbol": "守" },
    { "key": "hold", "name": "一夫当关", "description": "撑过全部 10 波。", "symbol": "关" },
    { "key": "no_leak", "name": "滴水不漏", "description": "无一人漏过关口，撑过全部 10 波。", "symbol": "漏" },
    { "key": "hundred", "name": "百人斩", "description": "单局击倒 100 名敌人。", "symbol": "百" },
    { "key": "sweep_5", "name": "横扫千军", "description": "一次旋斩击倒 5 名敌人。", "symbol": "扫" },
    { "key": "no_upgrade", "name": "返璞归真", "description": "不选任何强化撑过全部 10 波。", "symbol": "璞" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "守住", "maxPerRound": 1 },
    { "key": "waves", "name": "波次", "maxPerRound": 10 },
    { "key": "kills", "name": "击倒", "maxPerRound": 200 }
  ]
}
```

### Enemies

`ENEMY_TYPES`:

| key | name | hp | r | speed | colour | behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| `grunt` | 喽啰 | 20 | 13 | 120 | `#c9a27a` | Walks to the gate. If the player is within 120, it attacks instead: melee range 40, 6 dmg, 1.0 s cooldown, 0.25 s wind-up. |
| `shield` | 刀盾手 | 45 | 16 | 90 | `#8a93a8` | Like the grunt, with 10 dmg. It faces the player when within 250, otherwise the gate. Takes 20% damage from hits whose angle is within ±60° of its facing, and a spark sound on block. |
| `archer` | 弓手 | 25 | 14 | 100 | `#ffd24d` | Walks to a random `x` in [650, 850] and stops. It shoots an arrow at the player every 2 s (speed 420, r 5, 8 dmg; blocked by cliffs). After 25 s alive it walks to the gate like a grunt. |
| `boss` | 寨主 | 400 (wave 5) / 600 (wave 10) | 26 | 80 | `#ff5a5a` | Walks to the gate. Every 3 s, when the player is within 160, it slams: a 0.6 s telegraph circle of r 110, then 20 dmg. Wave 10 only: every 7 s it charges at the player at 520 speed for 0.5 s, dealing 15 dmg on contact. Named 黑风 in wave 5 and 独眼龙 in wave 10, with an HP bar across the top of the screen. |

The player gets 0.5 s invulnerability after each hit taken, so a swarm can't land all its hits in one frame.

### Waves

| wave | grunt | shield | archer | boss |
| --- | --- | --- | --- | --- |
| 1 | 8 | | | |
| 2 | 12 | | | |
| 3 | 10 | 3 | | |
| 4 | 10 | 3 | 3 | |
| 5 | 8 | | | 黑风 |
| 6 | 14 | 4 | 3 | |
| 7 | 12 | 6 | 4 | |
| 8 | 18 | 5 | 5 | |
| 9 | 20 | 6 | 6 | |
| 10 | 12 | 4 | 4 | 独眼龙 |

Spawn order within a wave: the boss first, then the other enemies shuffled.

### Upgrades

`UPGRADES`. Each can stack up to 3 times; `player.upgrades` is `{ [key]: level }` and `player.picks` is the total number picked.

| key | name | per level |
| --- | --- | --- |
| `edge` | 利刃 | +25% damage |
| `haste` | 疾风 | −15% cooldowns (multiplicative) |
| `reach` | 大开大合 | +20% melee range and arc (arc capped at 360) |
| `leech` | 吸血 | heal 2 HP per enemy hit |
| `iron` | 铁骨 | +30 max HP and heal 30 |
| `swift` | 轻功 | +12% move speed |

The upgrade screen is a DOM overlay styled like 乱刃's cards: title `第 N 波已守住`, three cards showing `名称 · Lv.x→x+1` with the effect, and a `跳过（返璞归真）` button. Wave 10's clear goes straight to the win banner with no upgrade screen.

### HUD

- Top left: `第 N / 10 波`, `剩余 X`, and the leak count `漏 ●●○`.
- Bottom centre: 乱刃's HP bar and slot icons, with upgrade pips under the HP bar.
- A red flash on the left edge on a leak.
- End banners: `关口守住了！` with `击倒 N · 漏 N · 强化 N`, or `关口失守 · 第 N 波`.

### Functions

- `startWave(n)`
- `spawnEnemy(typeKey)`
- `enemyThink(e, dt)`
- `hitEnemy(src, e, def, angle, castId)`
- `killEnemy(e, castId, defKey)`
- `leak(e)`
- `waveCleared()`
- `openUpgrades()`
- `pickUpgrade(key | null)`
- `endRound(won)`

`waveCleared()` on wave 10 calls `endRound(true)`. `wavesCleared` is the number of waves fully cleared (0–10).

### Achievements

Emitted through 乱刃's `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `hundred` | `player.kills` reaches 100 in `killEnemy`. |
| `sweep_5` | `killEnemy` counts kills per `castId` where `defKey === 'spin'`; fire when a count reaches 5. |
| `wave_5` | Wave 5 is cleared (`waveCleared` with `wave === 5`). |
| `hold` | `endRound(true)`. |
| `no_leak` | `endRound(true)` with `leaks === 0`. |
| `no_upgrade` | `endRound(true)` with `player.picks === 0`. |

### Stats

In `endRound`, after achievements and before `end`: `emitMoYuFunStats({ rounds: 1, wins: <0|1>, waves: wavesCleared, kills: Math.min(player.kills, 200) })`.

### Headless test

`v1/test_headless.js` keeps 乱刃 v4's stubs and SDK shape assertions.

**Simulation.** Up to 6 minutes, with random input as in 乱刃. When the upgrade screen opens, call `pickUpgrade` with the first offer. Assert:
- at least 1 wave cleared or the round over
- no `NaN`
- no enemy outside the band
- enemy count never above 60

**Deterministic round** (loadout `spin` + `wave`):
1. Set `player.kills = 99`, then `killEnemy(grunt, 1, 'quick')` → `hundred`.
2. Five `killEnemy(…, 2, 'spin')` calls → `sweep_5`.
3. Set `wave = 5`, then `waveCleared()` → `wave_5`, and `pickUpgrade(null)`.
4. Set `wave = 10`, then `waveCleared()`.

Expected sequence: `start, hundred, sweep_5, wave_5, hold, no_leak, no_upgrade, stats, end`. Stats must have `wins: 1`, `waves: 10` and `kills: player.kills`.

**Other cases:**
- A loss by 3 leaks sends `wins: 0` and no win achievements.
- A loss by death does the same.
- One `pickUpgrade('edge')` before the win suppresses `no_upgrade`.
- `backToMenu()` mid-round sends nothing.

## Milestones

Each milestone ends with `node games/hold-gate/v1/test_headless.js` passing.

**M1 · Playable round.** Copy slash v4, then build the pass, enemies, waves, leaks, upgrades, the HUD, and menu copy (title `一夫当关`, subtitle `守关 · 选两种斩击，独挡十波山贼`, help line mentioning `漏过 3 人即失守` and `波间选择强化`).
Done when: a browser run can clear all 10 waves with some loadout, and can be lost by leaks and by death.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check hold-gate v1` passes.

**M3 · Local release.** `pnpm game:local publish hold-gate v1 --yes`.
Done when: `/play/hold-gate` plays locally, and a logged-in round updates the board with `waves`. The owner runs the production publish.

## Open items

- Wave sizes and enemy numbers are a first pass. The owner accepts the difficulty curve after M1 playtests; a skilled player should clear 10 waves in about 6–8 minutes.
