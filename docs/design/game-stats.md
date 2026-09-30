# Game stats

**Status:** Implemented 2026-09-30 (M1–M5), verified locally. Production rollout pending: `supabase db push --linked`, deploy the site, then `pnpm game publish slash v4` and verify a logged-in round on a test account.

At the end of each round, a game reports named counters such as rounds +1, wins +1 or kills +7. For logged-in players the site adds them to per-game all-time totals and shows them as an **all-time board** at the top of the game's detail page, for example 乱刃: 对局 42 · 胜利 17 · 击杀 305. Achievements are unchanged: every achievement is still decided by the game within a single round (accounts D8 stays in force).

Read first: `docs/design/accounts-achievements.md` (achievement data, protocol, API patterns), `docs/design/game-release.md` (`game.json` and the publish sync this extends).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Stats are totals only, separate from achievements. No threshold achievements, no progress bars, no changes to the `achievements` table or to `unlock_achievement`. | Keeps achievements as simple as they are today. Cross-round achievements can be layered on the totals later without redoing this. |
| D2 | Games declare their stats in `game.json`, each with a display `name` and a `maxPerRound` cap. The server rejects the whole report if any key is undeclared or retired, or any value is outside `0..maxPerRound`. | Caps bound how far a buggy or forged report can move a total. The name lives in the manifest so the board needs no site-side copy per game. |
| D3 | One `stats` message per round, sent after any achievement messages and before `end`. The site forwards only the first `stats` message of each round (per `play_id`). | Same ordering rule as achievements; one report per round keeps totals meaningful. |
| D4 | Totals are kept only for logged-in players. Logged-out reports are dropped, with no popup and no claiming later. | Same as accounts D9. |
| D5 | Reports are client-reported and forgeable, as in accounts D7. Rate limit: the shared function at 120 per minute per user. Totals are private to the user. | There is no ranking. Revisit with any leaderboard. |
| D6 | No idempotency key. A report is sent once and never retried. | A lost request only loses one round's counts. A dedupe table isn't worth that. |
| D7 | Totals are not analytics. `events` is unchanged and stats are not shown in `/stats`. | Keeps the anonymous metrics scope (accounts D11). |
| D8 | The board is the first block of the detail page's `战绩与成就` section, above the achievement grid, rendered only when logged in. Logged out, the existing login hint covers both. | The user asked for it to be obvious; one section keeps one fetch and one login hint. |
| D9 | Retiring a stat (removing it from `game.json`) sets `is_active = false`. Reports that include it are rejected, existing totals are kept, and the board no longer shows it. | Same retire-never-delete rule as achievements. |

## Out of scope

Threshold or progress achievements, leaderboards, public totals, cross-game totals, "best score" (maximum) stats, stats on `/me`, stats analytics, backfill of rounds played before this shipped.

## Protocol

```js
{ source: "moyufun-game", version: 1, type: "stats", stats: { rounds: 1, wins: 1, kills: 7 } }
```

- `parseGameMessage` in `src/lib/game-events.ts` accepts exactly these four top-level keys. `isStatsReport` checks the shape: a plain object with 1–10 entries, keys matching the achievement key regex (≤ 40 characters), integer values from 0 to 1,000,000.
- The per-game caps are checked on the server, not in the browser.
- Round end order: `achievement…` → `stats` → `end`. `createGameLifecycle` forwards a `stats` message through its `report` option only while `playId` is set, and only once per `playId` (`statsReportedFor`).

SDK helper for games, next to `emitMoYuFunAchievement`:

```js
function emitMoYuFunStats(stats) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: 'moyufun-game', version: 1, type: 'stats', stats }, MOYUFUN_PARENT_ORIGIN);
}
```

## Data

Migration `supabase/migrations/20260930140000_add_game_stats.sql`:

- `game_stats (game_id, key, name, max_per_round, sort_order, is_active)`, primary key `(game_id, key)`. RLS on; `moyufun_web` selects active stats of listed games, `moyufun_publisher` selects, inserts and updates.
- `user_game_stats (user_id, game_id, stat_key, value bigint, updated_at)`, primary key `(user_id, game_id, stat_key)`, foreign key to `game_stats`, cascade on user delete. RLS on, no grants to any app role.
- Functions (`security definer`, execute only for `moyufun_web`):
  - `record_round_stats(p_user_id, p_game_id, p_game_version_id, p_stats jsonb) returns void`. Raises `check_violation` when the version does not belong to the game, `p_stats` is not an object of 1–10 entries, a key is not an active stat, or a value is not an integer in `0..max_per_round`. Otherwise adds each delta to the total in one transaction.
  - `get_user_stats(p_user_id, p_game_id) returns table (stat_key, value)`: the user's totals for one game, active stats only, in `sort_order`.
- The migration ends with a privilege assertion block.

`supabase/tests/game_stats.sql` (`begin; … rollback;`) covers every rejection case, accumulation across reports, retired stats being kept but not listed, cascade on user delete and the privilege matrix. Run it on a migrated local database:

```bash
docker exec -i supabase_db_MoYuFun psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/game_stats.sql
```

## `game.json` and release sync

`game.json` has an optional `stats` array (default `[]`):

```json
"stats": [
  { "key": "rounds", "name": "对局", "maxPerRound": 1 },
  { "key": "wins", "name": "胜利", "maxPerRound": 1 },
  { "key": "kills", "name": "击杀", "maxPerRound": 10 }
]
```

`validateManifest` (`scripts/game-package.mts`): keys follow the key regex and are unique, `name` is 1–20 characters, `maxPerRound` is an integer from 1 to 1,000,000, no other keys. Covered by `tests/game-package.test.mts`.

`pnpm game publish` (`scripts/game-release.mts`) upserts `game_stats` on `(game_id, key)` after the achievements upsert, setting `name`, `max_per_round`, `sort_order` (array index + 1) and `is_active = true`, then retires this game's keys missing from `game.json`.

## API and catalog

| Endpoint | Contract |
| --- | --- |
| `POST /api/stats` | Body exactly `{ game_id, game_version_id, stats }`, ≤ 2 KiB. Same checks as `POST /api/achievements`: Origin, content type, logged in, rate limit bucket `"stats-rate-limit:" + user_id`. `204` on success; `400` for a bad body or a `check_violation` from the function; `401`, `403`, `429` (`Retry-After: 60`) and `500` as for achievements. |
| `GET /api/me/achievements?game_id=` | With `game_id`, adds `stats: { [stat_key]: value }` next to `unlocked`. A declared stat with no row is absent (the board treats missing as 0). Without `game_id` the response is unchanged. |

Code:
- `src/lib/stats-request.ts`: pure `handleStatsRequest`, dependencies injected, tested in `tests/stats-request.test.mts`.
- `recordRoundStats()` and `getUserStats()` in `src/lib/achievements.ts`. `recordRoundStats` maps Postgres error code `23514` (`check_violation`) to `"invalid"`.
- `src/lib/games.ts`: `Game.stats` (`{ key, name }[]`, active, in `sort_order`) from a second `json_agg` in the cached catalog query.

## UI

- **Play page:** `GamePlayer` passes `report` to the lifecycle. When logged in, it posts to `/api/stats` and ignores the response. When logged out, it does nothing.
- **Detail page:** the `战绩与成就` section renders when the game has achievements or stats. `GameAchievements` takes `stats` and, when logged in and the game declares stats, renders the board first: one tile per stat in a three-column row, the total as a large accent-coloured number over the stat name, then the achievement grid. Logged out, the hint reads `登录后记录战绩与成就`.

## 乱刃 v4

`games/slash/v4/` is v3 plus stats. `game.json` declares `rounds` (对局, cap 1), `wins` (胜利, cap 1) and `kills` (击杀, cap 10). `kill()` calls `emitMoYuFunStats({ rounds: 1, wins: <player won>, kills: player.kills })` at round end, after the round's achievement messages and before `emitMoYuFunEvent('end')`. A round abandoned through the menu reports nothing. `test_headless.js` asserts a won round ends `…, stats, end` with `{ rounds: 1, wins: 1, kills: 10 }`, a lost round reports `wins: 0` and the player's kills, and returning to the menu sends nothing.

## Operating

- Check and publish: `pnpm game check slash v4`, then `pnpm game:local publish slash v4` locally or `pnpm game publish slash v4` in production. Production order: push the migration, deploy the site (the API route must exist before games report), then publish.
- Verify: log in, play a round of 乱刃, reopen the detail page. The board shows the new totals; `user_game_stats` has one row per stat for that user.
- Retire a stat by removing it from `game.json` and publishing a new version. Totals stay in the table but leave the board and the report contract.

## Gotchas found while building

- Local dev with React strict mode occasionally misses the game's `ready` message on the first iframe load (the loading overlay stays until "重新加载"). Pre-existing, not caused by stats.
- `game.json` is hand-formatted; do not round-trip it through a JSON pretty-printer, which expands every one-line object.
