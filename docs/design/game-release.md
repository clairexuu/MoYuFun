# Game release

**Status:** Design — settled, not yet implemented. Milestones: M1 ☑ · M2 ☐ · M3 ☐ · M4 ☐

One command checks a game version, uploads it to R2, registers it and makes it current, then clears the catalog cache. A second command rolls back to an earlier version. Each game's catalog data lives in `games/<slug>/game.json`, synced by the script. All games are AI-made in-house, so there is no licence or third-party review step.

Read first: `DEV.md` §3–4 (deploy chain, local file ↔ R2 key mapping), `supabase/README.md` (roles, revalidate endpoint), `docs/design/accounts-achievements.md` (achievements, game protocol), `supabase/migrations/20260930130000_publish_slash_v3.sql` (what a release did by hand), `games/slash/v3/`.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | `games/<slug>/game.json` is the source of truth for a game's catalog data and achievements. `publish` syncs it into the database. Releases no longer get SQL migrations; the existing publish migrations stay as history. | Game content is not schema. The `moyufun_publisher` role was built for this and is unused. |
| D2 | The script is `scripts/game-release.mts`, run with Node's `--experimental-strip-types` like the tests. Commands: `check`, `publish`, `switch`. | Same toolchain as the repo; no build step. |
| D3 | Upload uses R2's S3-compatible API, signed with `aws4fetch` (new devDependency). | Tiny, zero-dependency, used in Cloudflare's R2 docs. Wrangler and the AWS SDK are large, and hand-written SigV4 is code we'd have to maintain. |
| D4 | A version registered in the database is immutable: `publish` refuses it and points to `switch`. Objects in R2 for an unregistered version may be overwritten, since nothing serves them. Nothing in R2 is ever deleted. | Keeps rollback safe; a failed publish can simply be re-run. |
| D5 | Every version must have a `test_headless.js` that exits 0, and `check` runs it. | AI-made games need an automated gate; every existing version already has one. |
| D6 | `publish` makes the game listed. There is no unlisted staging. | Unlisted games are invisible even by URL (RLS), so staging would have no way to be tested. |
| D7 | Uploading happens only when `GAMES_ORIGIN` is not localhost. With a localhost origin, `publish` skips R2 and verifies against the local static server. | The same command publishes to local Supabase for testing new games. |
| D8 | `switch` only changes `current_version_id`. It does not touch `game.json` data or achievements. | Rollback must be fast and must not undo catalog edits. Gotcha: after a rollback, the catalog text and active achievements still reflect the latest publish. |
| D9 | Production runs need `--yes` or an interactive `y`. | Agents can run it non-interactively; humans get a last look at the target. |
| D10 | Catalog cache is cleared with the existing `POST /api/revalidate/games`. If that fails after the DB commit, the script warns and exits non-zero; the 5-minute catalog refresh fixes it anyway. | No new endpoint. |

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

**`game.json`** (field rules mirror the DB constraints):

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

**SDK checks:**
- The runtime files contain the production parent origin `https://www.moyufuns.com`. Without it, a game posts to the wrong origin in production and every event is silently lost.
- Every string literal passed to `emitMoYuFunAchievement('…')` or `emitMoYuFunAchievement("…")` in runtime files is a key in `game.json`.
- The headless test must assert the SDK message sequence, as `games/slash/v3/test_headless.js` does. Message shapes and ordering rules are in `accounts-achievements.md` → Game protocol.

## Commands

```bash
pnpm game check <slug> <version>
pnpm game publish <slug> <version> [--notes "<release notes>"] [--yes]
pnpm game switch <slug> <version> [--yes]
pnpm game:local <same arguments>          # uses .env.publish.local
```

`package.json` scripts:
- `"game": "node --env-file-if-exists=.env.publish --experimental-strip-types scripts/game-release.mts"`
- `"game:local"`: the same with `.env.publish.local`.

Node 24 is required.

### `check`

It runs every rule in the package contract, then runs `node games/<slug>/<version>/test_headless.js`. It prints the runtime file list, total size and pass/fail. It needs no env vars and no network. Exit 0 only if everything passes.

### `publish`

1. Run `check`.
2. Read env (see below). Validate that the DB URL user starts with `moyufun_publisher.`. Print the target (DB host, `GAMES_ORIGIN`, `SITE_URL`), slug, version, file count and size. Confirm (D9).
3. If the version already exists for this slug in the DB, stop with "already published; use switch".
4. **Upload** (skipped when `GAMES_ORIGIN` is localhost). `PUT https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET>/games/<slug>/<version>/<relative path>` for each runtime file. Send its Content-Type and `Cache-Control: public, max-age=31536000, immutable`, signed with `AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" })`. Any non-2xx aborts before touching the DB.
5. **Verify.** `GET ${GAMES_ORIGIN}/games/<slug>/<version>/<path>` for every runtime file: it must return 200 with the same SHA-256 as the local file. The entry is fetched with `Origin: <SITE_URL origin>` and must return `Access-Control-Allow-Origin` equal to that origin or `*` (the player's probe needs it).
6. **Register in one transaction** (`sql.begin`, publisher role):
   1. Upsert `games` by `slug`, setting every `game.json` field and `updated_at = now()`. New games are inserted with `is_listed = false` and no current version.
   2. Insert `game_versions` with `version_key`, `entry_path = /games/<slug>/<version>/index.html`, `file_size_bytes` = total runtime bytes, and `release_notes` = `--notes` or null.
   3. Upsert `achievements` on `(game_id, key)`, setting name, description, symbol, `sort_order` and `is_active = true`. Then set `is_active = false` for this game's keys that are not in `game.json`.
   4. Update `games` to set `current_version_id` to the new version, `is_listed = true` and `updated_at = now()`.
7. **Revalidate.** `POST ${SITE_URL}/api/revalidate/games` with `Authorization: Bearer ${MOYUFUN_REVALIDATE_SECRET}` must return 200 (D10).
8. **Smoke test.** `GET ${SITE_URL}/play/<slug>` must return 200 and contain the new `entry_path`. Retry 5 times, 3 s apart; revalidation can serve one stale response first. On failure, say the DB is already committed and exit non-zero.

### `switch`

1. Confirm the version exists for the slug.
2. `GET` its entry from `GAMES_ORIGIN` and require 200.
3. Confirm (D9), then update `current_version_id` and `updated_at`.
4. Revalidate and smoke test as in `publish`.

It uploads nothing and syncs nothing (D8).

## Code layout

| File | Role |
| --- | --- |
| `scripts/game-package.mts` | Pure and unit-testable. `readManifest(dir)`, `validateManifest(json): Manifest` (throws a list of errors), `listRuntimeFiles(versionDir): { path, bytes, contentType }[]` (throws on symlink or unknown extension), `checkLimits(files)`, `findAchievementKeys(text): string[]`, `hasParentOrigin(texts)`. |
| `scripts/game-release.mts` | CLI: argument parsing, env, confirm prompt (`node:readline/promises`), upload (`aws4fetch`), verify (`fetch`, `node:crypto`), DB (`postgres`, the existing dependency), revalidate, smoke. |
| `tests/game-package.test.mts` | Unit tests for every rule in `game-package.mts`, using temporary folders from `node:fs/promises` `mkdtemp`. Picked up by `pnpm test`. |
| `games/slash/game.json` | Created in M1 from the current production row, so the first sync changes nothing. |

The Postgres client uses `max: 1` and `prepare: false`, the same settings as `src/lib/database.ts`, so it works on either pooler.

## Environment

`.env.publish` (production) and `.env.publish.local` (local) are gitignored by the existing `.env*` rule. Document them in `.env.example` under a "Publishing environment only" heading.

| Var | Production | Local |
| --- | --- | --- |
| `MOYUFUN_PUBLISH_DATABASE_URL` | Session Pooler URL, user `moyufun_publisher.<project-ref>` | `postgresql://moyufun_publisher.local:<pw>@127.0.0.1:54322/postgres` |
| `GAMES_ORIGIN` | `https://games.moyufuns.com` | `http://localhost:4000` |
| `SITE_URL` | `https://www.moyufuns.com` | `http://localhost:3000` |
| `MOYUFUN_REVALIDATE_SECRET` | same as Vercel | same as `.env.local` |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | an R2 API token with **Object Read & Write** on the games bucket only | unset |

Local publisher role, created once (like `moyufun_web.local` in the accounts doc):

```sql
create role "moyufun_publisher.local" login password '<pw>' in role moyufun_publisher;
```

## Milestones

Each milestone ends with `pnpm test`, `pnpm lint` and `pnpm build --webpack` passing on Node 24.

**M1 · Package check.**
- Add `aws4fetch` and the `game`/`game:local` scripts.
- Write `game-package.mts` and `tests/game-package.test.mts`, plus the `check` command.
- Create `games/slash/game.json` from production data. Read it with the publisher role (or ask the owner for a `select` export).

Done when:
- `pnpm game check slash v3` passes.
- Unit tests cover every contract rule failing: bad slug, wrong folder, extra key, bad achievement fields, duplicate keys, unknown extension, symlink, over-limit size and count, missing entry, missing test, missing parent origin, and an unknown emitted key.

**M2 · Local publish and switch.**
- Implement `publish` and `switch`, including the DB transaction, verify, revalidate and smoke steps. Upload is still skipped on localhost.

Done when, against local Supabase with `pnpm dev` and `pnpm dev:games` running:
- `pnpm game:local switch slash v2`, then `switch slash v3`, each updates the local play page.
- Publishing a throwaway `games/slash/v3-rc1` (copy of v3, not committed) registers it and makes it current. A second `publish` of the same version is refused.
- Removing one achievement from a local copy of `game.json` and publishing retires it.
- Delete the throwaway folder afterwards. Its local DB rows can stay.

**M3 · Production upload.**
- Implement the R2 upload.
- The owner creates the R2 token and `.env.publish` (see Open items).

Done when:
- The next real release (a new game, or 乱刃 v4 from `game-stats.md`) goes to production through `pnpm game publish`.
- Every file verifies by hash through `games.moyufuns.com`.
- `pnpm game switch <slug> <previous>` followed by switching back both work in production.

**M4 · Docs.**
- Convert this file to the dev doc (see the `design-doc` skill).
- Replace the manual release text in `DEV.md` §4 with a pointer here.
- Update `supabase/README.md`: the publisher role now in use, and the local publisher role.
- Add `pnpm game check` for the current version to the README checks.
- Add a line to `AGENTS.md`: new games follow the package contract in this doc.
- Tick TODO item 8.

## Open items

- **Owner, before M3:** in Cloudflare → R2 → Manage API tokens, create a token with **Object Read & Write** limited to the games bucket. Put the account ID, bucket name, access key ID and secret in `.env.publish` together with the other production values. Never paste them into chat.
