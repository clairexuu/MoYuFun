# 夺鱼 (`fish-grab`)

**Unlisted 2026-10-05** with `pnpm game unlist fish-grab` (owner's call when the site moved to office camouflage, `docs/design/office-camouflage.md`). Its files, versions, achievements and stats are kept; `pnpm game publish` lists it again.

**Status:** Implemented locally 2026-09-30. Milestones: M1 ☑ · M2 ☑ · M3 ☑ (local; see notes). **Production publish pending** (`pnpm game publish fish-grab v1`, run by the owner).

A 3v3 capture game built on 乱刃's combat: you and 2 AI allies fight 3 AI enemies over a golden fish in the middle of the arena, and carry it home to score. First team to 5 wins. The six slashes and their numbers are reused unchanged, so this is a new mode, not new combat. Single-player only, keyboard and mouse only.

Read first: `docs/design/game-release.md` (package contract, `check`, `publish`), `docs/design/game-stats.md` → Protocol, `docs/design/accounts-achievements.md` → Game protocol, `games/slash/v4/index.html`, `games/slash/v4/test_headless.js`, `games/slash/game.json`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game is `games/fish-grab/v1/index.html`, one file, started as a copy of `games/slash/v4/index.html`. `SLASHES`, `tryCast`, `doStrike`, the projectile code, input, audio, effects and the loadout menu stay as they are. | Games cannot share files. Keeping 乱刃's combat means no new balance work. |
| D2 | Teams: 青鱼门 (blue `#4dd2ff`: the player plus 2 AI) against 赤鲤帮 (red `#ff5a5a`: 3 AI). Each fighter has a `team` field (`0` or `1`). Friendly fire is off: swings and projectiles skip teammates. Body pushing still applies. | Friendly fire with AI allies feels unfair and makes escorting impossible. |
| D3 | The fish is picked up by touching it (distance < fighter `r` + 14) while it is free and its `lockT` is 0. The carrier moves at 70% speed and cannot use the right slot. Any damage to the carrier drops the fish at the carrier's position with `lockT = 0.6`. | A slower, weaker carrier forces the team to protect them. The lock stops the carrier from grabbing it straight back. |
| D4 | The carrier scores by entering their own base: a circle of r 70 at (90, 350) for team 0 and (1010, 350) for team 1. The fish then resets to the centre after a 2 s `下一条鱼` countdown. A dropped fish left untouched for 10 s returns to the centre. | Standard capture-the-flag flow; the return timer prevents stalemates in corners. |
| D5 | First team to **5** wins. At 5:00 the leading team wins. If tied at 5:00, the round continues until the next score (`加时` banner). | Rounds stay under about 5 minutes; no draws. |
| D6 | Fighters have 100 HP, respawn after 3 s inside their own base, with 1.5 s invulnerability. | Respawning at base gives the defending team the advantage of its own half, as in the genre. |
| D7 | The obstacles are 乱刃's four bars plus two 60 × 60 blocks at (300, 320) and (740, 320). The central block is removed. | The centre must be free for the fish. The side blocks give cover on the carry lanes. |
| D8 | The AI moves in straight lines, with 乱刃's obstacle sliding. There is no pathfinding. | The obstacle layout (D7) leaves open lanes, so straight lines work. |
| D9 | Ally names are 阿青 and 小蓝. Enemy names are 赤瞳, 红鲤 and 丹砂. | Matches the team colours. |

## Out of scope

Multiplayer, touch controls, more than one map, team sizes other than 3v3, choosing allies' loadouts, cross-round achievements.

## Architecture

### Package

```text
games/fish-grab/
  game.json
  v1/index.html
  v1/test_headless.js
  v1/README.md
```

`game.json`:

```json
{
  "slug": "fish-grab",
  "name": "夺鱼",
  "shortDescription": "与两名 AI 队友联手，把金鱼抢回自家。",
  "description": "青鱼门与赤鲤帮三对三，争夺场地中央的金鱼。持鱼者移速变慢且无法使用右槽斩击，一旦受击就会掉鱼。把鱼带回己方阵地得一分，先得五分的一方获胜。",
  "tags": ["动作", "团队", "单人", "键鼠"],
  "controls": [
    { "input": "WASD / 方向键", "action": "移动" },
    { "input": "鼠标", "action": "瞄准" },
    { "input": "鼠标左键 / J", "action": "使用左槽斩击" },
    { "input": "鼠标右键 / K", "action": "使用右槽斩击（持鱼时不可用）" },
    { "input": "M", "action": "静音或恢复声音" },
    { "input": "R / B", "action": "再战 / 返回配装" }
  ],
  "cover": { "symbol": "夺", "eyebrow": "3V3 CAPTURE", "accent": "#ffd24d", "accentSecondary": "#4dd2ff" },
  "sortOrder": 40,
  "achievements": [
    { "key": "first_score", "name": "摸到鱼了", "description": "亲手把鱼送回己方。", "symbol": "鱼" },
    { "key": "first_win", "name": "满载而归", "description": "赢下一局。", "symbol": "归" },
    { "key": "steal", "name": "截胡", "description": "打掉敌方持鱼者的鱼，并在 3 秒内亲手捡起。", "symbol": "截" },
    { "key": "hat_trick", "name": "帽子戏法", "description": "单局亲手送回 3 条鱼。", "symbol": "帽" },
    { "key": "shutout", "name": "零封", "description": "对手一分未得赢下一局。", "symbol": "封" },
    { "key": "escort", "name": "护驾", "description": "队友持鱼时击倒 3 名敌人。", "symbol": "护" }
  ],
  "stats": [
    { "key": "rounds", "name": "对局", "maxPerRound": 1 },
    { "key": "wins", "name": "胜利", "maxPerRound": 1 },
    { "key": "scores", "name": "送鱼", "maxPerRound": 5 },
    { "key": "kills", "name": "击倒", "maxPerRound": 100 }
  ]
}
```

`scores` can never exceed 5 because the round ends when a team reaches 5, or at the first score in overtime (D5).

### State

- `fish = { x, y, carrier: null | entity, lockT, idleT, resetT }`
- `teamScore = [0, 0]`
- Per fighter: `team`, `scores`, `kills`, `deaths`, `escortKills`
- `stealUntil` (game time; 0 when inactive)

Functions:
- `pickUpFish(e)`
- `dropFish(byAttacker)`: `byAttacker` is the fighter whose hit caused the drop, or `null`.
- `score(carrier)`
- `resetFish()`
- `endRound(winningTeam)`

`applyDamage` calls `dropFish(src)` when the target is the carrier. `kill` credits `kills` and also drops the fish.

### HUD

- A top-centre score bar reads `青鱼门 N : M 赤鲤帮`, with a timer below it (`4:32`; `加时` in overtime).
- The carrier has a gold fish icon above their head.
- An off-screen arrow is not needed, since the whole arena is visible.
- Base circles are drawn in team colours at 25% opacity.
- The killfeed also lists `<name> 抢到了鱼`, `<name> 送鱼成功`, and `鱼回到了中央`.
- The scoreboard shows both teams, with columns 送鱼 / 击倒 / 阵亡.
- The end banner reads `青鱼门获胜！ 5 : 2` or `赤鲤帮获胜 2 : 5`.

### AI

The AI replaces 乱刃's target choice with a role, recomputed every 0.3 s per fighter:

1. **Fish is free.** The two members of each team nearest to the fish run to it (`goal = fish`). The third attacks the nearest enemy.
2. **Own team carries.** The carrier runs to its base and fights only enemies within 90 (left slot only). The others attack enemies within 250 of the carrier; if none, they move to a point 80 ahead of the carrier.
3. **Enemy team carries.** Everyone targets the carrier.

Casting uses 乱刃's range and angle checks against the current target. The player counts as a team-0 fighter for these rules; the AI never waits for the player.

### Achievements

Emitted through 乱刃's `unlockAchievement(key)`: once per round, before `stats`/`end`.

| key | Trigger |
| --- | --- |
| `first_score` | `score(player)`. |
| `hat_trick` | `player.scores` reaches 3. |
| `steal` | `dropFish(player)` sets `stealUntil = gameT + 3` when the carrier was on the enemy team. `pickUpFish(player)` while `gameT <= stealUntil` fires `steal`. |
| `escort` | `kill(player, enemy)` while `fish.carrier` is a team-0 AI (not the player) increments `player.escortKills`; fire at 3. |
| `first_win` | Team 0 wins. |
| `shutout` | Team 0 wins with `teamScore[1] === 0`. |

### Stats

At round end, after achievements and before `end`: `emitMoYuFunStats({ rounds: 1, wins: <team 0 won ? 1 : 0>, scores: player.scores, kills: Math.min(player.kills, 100) })`.

### Headless test

`v1/test_headless.js` keeps 乱刃 v4's stubs, simulation and SDK shape assertions:

- **Simulation** (8 minutes max): asserts the round ends, `teamScore` has a 5 or overtime ended it, no friendly-fire damage (wrap `applyDamage` to throw on same-team hits), no `NaN`, and that the fish was picked up at least 3 times.
- **Deterministic round:**
  1. `score(player)` with the player as carrier.
  2. Set an enemy as carrier, then `applyDamage(player, enemy, SLASHES.quick, 0)` and `pickUpFish(player)`.
  3. `score(player)`.
  4. Make an ally the carrier, then `kill(player, enemy)` ×3.
  5. `score(player)`.
  6. Two more `score(player)` calls.

  Expected sequence: `start, first_score, steal, escort, hat_trick, first_win, shutout, stats, end`. Expected stats: `{ rounds: 1, wins: 1, scores: 5, kills: 3 }`.
- **Lost round:** asserts `wins: 0`.
- **Overtime:** set `gameT = 300` with scores tied, then advance one frame. `phase` stays `'play'`, and the next score ends the round.
- `backToMenu()` mid-round sends nothing.

## Milestones

Each milestone ends with `node games/fish-grab/v1/test_headless.js` passing.

**M1 · Playable round.** Copy slash v4, then build teams, the fish, bases, scoring, overtime, the AI roles, the HUD, and menu copy (title `抢 鱼`, subtitle `3V3 夺鱼战 · 选两种斩击，与队友把金鱼抢回家`, help line mentioning `先得 5 分` and `持鱼时无法使用右槽`).
Done when: a browser round ends with a winning team, and the simulation part of the test passes.

**M2 · Achievements, stats, package.** `game.json`, emission, deterministic test, `README.md`.
Done when: `pnpm game check fish-grab v1` passes.

**M3 · Local release.** `pnpm game:local publish fish-grab v1 --yes`.
Done when: `/play/fish-grab` plays locally, and a logged-in round unlocks `first_score` and updates the board. The owner runs the production publish.

### M3 notes

- Local publish registered the game, all six achievements and four stats. A logged-in round played through `/play/fish-grab` wrote `rounds/wins/scores/kills` to `user_game_stats`.
- The in-site `first_score` unlock was not exercised by hand: the browser automation cannot hold movement keys. Emission order is covered by the deterministic headless round; the owner should confirm it with one real carry before or after the production publish.
- Gotcha: under `pnpm dev`, the first iframe load can lose the `ready` race against hydration and stay on "游戏加载中" (乱刃 does the same). Reloading the iframe fixes it; production is static and not affected.
- AI-only simulations end in about 35–75 s (5 scores). This is fast but within D5; tuning stays an open item.

## Open items

- AI difficulty of allies versus enemies is symmetric. If playtests show the player's team wins too easily or too rarely, the owner decides whether to add an enemy speed or reaction-time bonus.
