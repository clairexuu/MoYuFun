# Game release

**Status:** Implemented 2026-09-30 (M1–M4). Verified against local Supabase: `check`, `publish` (register, achievement sync and retirement, refusal of a re-publish), `switch` both ways. **Production acceptance pending:** the first real release through `pnpm game publish`, and a production `switch` to a previous version and back.

`pnpm game publish <slug> <version>` checks a game version, uploads it to R2, registers it and makes it current, then clears the catalog cache. `pnpm game switch` rolls back to an earlier version. Each game's catalog data lives in `games/<slug>/game.json`, synced by the script. All games are AI-made in-house, so there is no licence or third-party review step.

Read first: `DEV.md` §3–4 (deploy chain, local file ↔ R2 key mapping), `supabase/README.md` (roles, revalidate endpoint), `docs/design/accounts-achievements.md` → Game protocol, `scripts/game-package.mts`, `scripts/game-release.mts`, `games/slash/`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | `games/<slug>/game.json` is the source of truth for a game's catalog data and achievements. `publish` syncs it into the database. Releases no longer get SQL migrations; the existing publish migrations stay as history. | Game content is not schema. The `moyufun_publisher` role was built for this and was unused. |
| D2 | The script is `scripts/game-release.mts`, run with Node's `--experimental-strip-types` like the tests. Commands: `check`, `publish`, `switch`. | Same toolchain as the repo; no build step. |
| D3 | Upload uses R2's S3-compatible API, signed with `aws4fetch` (devDependency). | Tiny, zero-dependency, used in Cloudflare's R2 docs. Wrangler and the AWS SDK are large, and hand-written SigV4 is code we'd have to maintain. |
| D4 | A version registered in the database is immutable: `publish` refuses it and points to `switch`. Objects in R2 for an unregistered version may be overwritten, since nothing serves them. Nothing in R2 is ever deleted. | Keeps rollback safe; a failed publish can simply be re-run. |
| D5 | Every version must have a `test_headless.js` that exits 0, and `check` runs it. | AI-made games need an automated gate; every existing version already has one. |
| D6 | `publish` makes the game listed. There is no unlisted staging. | Unlisted games are invisible even by URL (RLS), so staging would have no way to be tested. |
| D7 | Uploading happens only when `GAMES_ORIGIN` is not localhost. With a localhost origin, `publish` skips R2 and verifies against the local static server. | The same command publishes to local Supabase for testing new games. |
| D8 | `switch` only changes `current_version_id`. It does not touch `game.json` data or achievements. | Rollback must be fast and must not undo catalog edits. Gotcha: after a rollback, the catalog text and active achievements still reflect the latest publish. |
| D9 | Production runs need `--yes` or an interactive `y`. | Agents can run it non-interactively; humans get a last look at the target. |
| D10 | Catalog cache is cleared with the existing `POST /api/revalidate/games`. If that fails after the DB commit, the script warns and exits non-zero; the 5-minute catalog refresh fixes it anyway. | No new endpoint. |
| D11 | *Added in M2.* `check` also requires every `game.json` achievement key to appear as a quoted string literal in the runtime files. | The forward rule (literals passed to `emitMoYuFunAchievement`) sees nothing in a game that wraps the SDK call, which 乱刃 v3 does. The reverse rule catches typos and unimplemented keys cheaply. |

## Out of scope

Deleting games or versions, unlisting, editing catalog data without a release, CI/CD automation, licence checks, the stats feature (`docs/design/game-stats.md`, which extends `game.json` later).

## Game package contract

This is what an AI author must produce and what `check` enforces.

```text
games/<slug>/
  game.json                 catalog data (below)
  <version>/                version key: ^v[0-9]+(?:[.-][a-z0-9]+)*$
    index.html              entry, required
    test_headless.js        required, not uploaded
    README.md               optional, not uploaded
    …                       other runtime files, any subfolders
```

**`game.json`** (field rules mirror the DB constraints; `games/slash/game.json` is the reference):

```json
{
  "slug": "slash",
  "name": "乱刃",
  "shortDescription": "…",
  "description": "…",
  "tags": ["动作"],
  "controls": [{ "input": "WASD", "action": "移动" }],
  "cover": { "symbol": "刃", "eyebrow": "…", "accent": "#…", "accentSecondary": "#…" },
  "sortOrder": 0,
  "achievements": [
    { "key": "first_blood", "name": "初见血", "description": "取得一次击杀。", "symbol": "血" }
  ]
}
```

- `slug` equals the folder name and matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- `name`, `shortDescription`, `description` and every `cover` field are non-empty strings. `tags` is an array of strings. `controls` is an array of `{input, action}`. `sortOrder` is an integer.
- Achievements: `key` matches `^[a-z0-9]+(?:_[a-z0-9]+)*$` and is at most 40 characters; keys are unique; `name` is 1–20 characters, `description` 1–60, `symbol` 1–2. Array order becomes `sort_order` (1-based). An achievement removed from the array is retired (`is_active = false`), never deleted.
- No other top-level keys.

**Runtime files** are every file in the version folder except `test_headless.js`, `README.md` and dotfiles (`.DS_Store` and the like, silently skipped). Rules:
- Symlinks fail.
- Allowed extensions and the Content-Type they upload with: `html` text/html; `js`, `mjs` text/javascript; `css` text/css; `json` application/json; `png`, `jpg`/`jpeg`, `webp`, `gif`, `svg` (image/svg+xml), `ico` (image/x-icon); `mp3` audio/mpeg, `ogg` audio/ogg, `wav` audio/wav, `m4a` audio/mp4; `woff2` font/woff2; `wasm` application/wasm; `txt` text/plain. Text types get `; charset=utf-8`. Any other extension fails.
- At most 500 files and 31,457,280 bytes in total (the DB limit).

**SDK checks** (run over the text runtime files):
- They contain the production parent origin `https://www.moyufuns.com`. Without it, a game posts to the wrong origin in production and every event is silently lost.
- Every string literal passed to `emitMoYuFunAchievement('…')` or `emitMoYuFunAchievement("…")` is a key in `game.json`.
- Every key in `game.json` appears as a quoted string literal somewhere (D11).
- The headless test must assert the SDK message sequence, as `games/slash/v3/test_headless.js` does. Message shapes and ordering rules are in `accounts-achievements.md` → Game protocol.

## Commands

```bash
pnpm game check <slug> <version>
pnpm game publish <slug> <version> [--notes "<release notes>"] [--yes]
pnpm game switch <slug> <version> [--yes]
pnpm game:local <same arguments>          # uses .env.publish.local
```

`pnpm game` reads `.env.publish`; `pnpm game:local` reads `.env.publish.local`. Node 24 is required (`import.meta.dirname`, `--env-file-if-exists`).

**`check`** runs every rule in the package contract, then `node games/<slug>/<version>/test_headless.js`. It prints the runtime file list, total size and pass/fail. No env vars, no network. Exit 0 only if everything passes.

**`publish`**:

1. Runs `check`.
2. Reads env; the DB URL user must start with `moyufun_publisher.`. Prints the target (DB host, `GAMES_ORIGIN`, `SITE_URL`), slug, version, file count and size. Confirms (D9).
3. If the version already exists for this slug, stops with "already published; use switch".
4. **Upload** (skipped when `GAMES_ORIGIN` is localhost): `PUT https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET>/games/<slug>/<version>/<path>` per runtime file, with its Content-Type and `Cache-Control: public, max-age=31536000, immutable`, signed by `AwsClient({ service: "s3", region: "auto" })`. Any non-2xx aborts before touching the DB.
5. **Verify**: `GET ${GAMES_ORIGIN}/games/<slug>/<version>/<path>` for every file must return 200 with the local file's SHA-256. The entry is fetched with `Origin: <SITE_URL origin>` and must answer `Access-Control-Allow-Origin` equal to that origin or `*`.
6. **Register in one transaction** (publisher role): upsert `games` by slug from `game.json` (new games start unlisted with no current version); insert `game_versions` (`entry_path = /games/<slug>/<version>/index.html`, `file_size_bytes` = total runtime bytes, `release_notes` = `--notes` or null); upsert `achievements` on `(game_id, key)` with `sort_order` = array index + 1 and `is_active = true`, then set `is_active = false` for this game's keys missing from `game.json`; finally set `current_version_id`, `is_listed = true`, `updated_at = now()`.
7. **Revalidate**: `POST ${SITE_URL}/api/revalidate/games` with the bearer secret must return 200 (D10).
8. **Smoke test**: `GET ${SITE_URL}/play/<slug>` must return 200 and contain the new `entry_path`, retried 5 times 3 s apart. On failure it says the DB is already committed and exits non-zero.

**`switch`**: confirms the version exists for the slug, `GET`s its entry from `GAMES_ORIGIN` (must be 200), confirms (D9), updates `current_version_id` and `updated_at`, then revalidates and smoke-tests as above. Uploads nothing, syncs nothing (D8).

## Code map

| File | Role |
| --- | --- |
| `scripts/game-package.mts` | Pure, unit-tested contract rules: `validateManifest`, `readManifest`, `listRuntimeFiles`, `checkLimits`, `findAchievementKeys`, `hasParentOrigin`, and `checkPackage(gamesRoot, slug, version)` which runs them all except the headless test. |
| `scripts/game-release.mts` | CLI: `parseArgs`, env, confirm prompt (`node:readline/promises`), upload (`aws4fetch`), verify (`fetch` + `node:crypto`), DB (`postgres`, `max: 1`, `prepare: false`, same as `src/lib/database.ts`), revalidate, smoke. |
| `tests/game-package.test.mts` | One test per rule group, on `mkdtemp` fixtures. Part of `pnpm test`. |
| `games/<slug>/game.json` | Catalog source of truth (D1). `games/slash/game.json` mirrors the row the migrations created. |
| `games/serve.json` | Local static server rewrite `/games/:slug/:version/:path*` → `/:slug/:version/:path*`, so local verify sees the same URLs as R2. |

## Environment

`.env.publish` (production) and `.env.publish.local` (local) are gitignored by the `.env*` rule and documented in `.env.example` under "Publishing environment only".

| Var | Production | Local |
| --- | --- | --- |
| `MOYUFUN_PUBLISH_DATABASE_URL` | Session Pooler URL, user `moyufun_publisher.<project-ref>` | `postgresql://moyufun_publisher.local:<pw>@127.0.0.1:54322/postgres` |
| `GAMES_ORIGIN` | `https://games.moyufuns.com` | `http://localhost:4000` |
| `SITE_URL` | `https://www.moyufuns.com` | `http://localhost:3000` |
| `MOYUFUN_REVALIDATE_SECRET` | same as Vercel | same as `.env.local` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | an R2 API token with **Object Read & Write** on the games bucket only | unset (only required when `GAMES_ORIGIN` is not localhost) |

Local publisher role, created once in the local database (Docker container `supabase_db_MoYuFun`):

```sql
create role "moyufun_publisher.local" login password '<pw>' in role moyufun_publisher;
```

## Releasing

1. Put the version in `games/<slug>/<version>/` and update `games/<slug>/game.json`.
2. `pnpm game check <slug> <version>`.
3. With `pnpm dev`, `pnpm dev:games` and local Supabase running: `pnpm game:local publish <slug> <version> --yes`, then play it at `http://localhost:3000/play/<slug>`.
4. `pnpm game publish <slug> <version> --notes "…"`; answer `y`.
5. Rollback: `pnpm game switch <slug> <previous>`. Forward again with `switch <slug> <version>`.

## Gotchas found while building

- 乱刃 v3 calls `unlockAchievement('ranged')`, not `emitMoYuFunAchievement('ranged')`, so the forward key check is blind for it; D11 and the headless test's sequence assertion are the real gate. Prefer passing literals straight to `emitMoYuFunAchievement` in new games.
- `games/slash/game.json` was built from the local database (same migrations as production) because the production read was not available during implementation. If production catalog text was ever edited by hand, the first `publish` overwrites it with `game.json`; diff the row first.
- After `switch` to an older version the site still shows the latest `game.json` text and achievements (D8). A game whose achievements changed between versions should be rolled back with that in mind.
- Non-interactive runs need `--yes`; anything but a bare `y` on the prompt aborts. `echo n | pnpm game …` is a cheap way to see the target summary without acting.
- Throwaway versions (`v3-rc1` …) published locally stay in the local DB; that is fine, D4 only forbids re-publishing them.
