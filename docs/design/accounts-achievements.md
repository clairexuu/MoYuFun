# Accounts and achievements

**Status:** Design — settled, not yet implemented. Milestones: M1 ☑ · M2 ☑ · M3 ☑ · M4 ☐ · M5 ☐ · M6 ☐

Players create an account with email and password, and games report achievements that are saved to that account. Achievements are private to each user; there is no ranking or public profile.

Read first: `DEV.md` (architecture, roles, deployment), `supabase/README.md` (migration and permission conventions), `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (Next 16 auth patterns). User-facing copy is Chinese, matching the rest of the site.

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Supabase Auth** handles credentials, email verification, password reset and sessions. | Password hashing, token rotation, reset tokens and account-enumeration handling are security-critical code we should not own. |
| D2 | Supabase Auth only answers "who is this user". All app data goes through the existing `moyufun_web` Postgres role and `security definer` functions that take the verified user ID as a parameter. No RLS policies for `authenticated`, no PostgREST, no browser Supabase client. | Keeps the current trust model (the database trusts the web server, not the browser) and the existing least-privilege role setup. |
| D3 | Supabase is used from the server only, via `@supabase/ssr`. Auth cookies are forced `HttpOnly`, `Secure` (in production), `SameSite=Lax`, host-only on `www.moyufuns.com`. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are server-only env vars (no `NEXT_PUBLIC_`). | No browser client means no script needs to read the cookie. Host-only cookies never reach `games.moyufuns.com`. |
| D4 | Email verification is required before an account works; password reset is included. Emails go through **Resend** SMTP from `MoYuFun <noreply@moyufuns.com>`. | A forgotten password must not lose achievements; verification stops sign-ups with someone else's email. Supabase's built-in mailer only sends to team members, 2 per hour. |
| D5 | Email links land on a server route `/auth/confirm?token_hash=…&type=…&next=…` that calls `verifyOtp`. Both Supabase email templates are customised to use `{{ .TokenHash }}`. | Server-side verification without a browser client or PKCE code verifier in `localStorage`. |
| D6 | The **game decides** an unlock and sends a key; the site only checks the key exists and is active for that game. | Each game keeps its own rules; the protocol change is one message type. |
| D7 | Unlocks are **client-reported and forgeable**. Accepted because achievements are private. Must be revisited before any ranking or reward is built on them. | Games run in the player's browser; a trustworthy unlock would need server-side replay. |
| D8 | Every achievement must be **decidable within a single round**. No cross-round counters ("win 10 times", "win with every slash"). | The game has no trusted cross-session storage, and the site stores unlocks, not progress. |
| D9 | Logged-out players see the unlock popup with a "登录后可保存成就" hint. Nothing is stored or claimed later. | Simplest; avoids carrying unverified unlocks across a login. |
| D10 | Achievements belong to a **game**, not a version, keyed by `(game_id, key)`. They are retired with `is_active = false`, never deleted. Unlocks record the version they happened on. | Unlocks survive version switches; new versions can add keys. |
| D11 | Analytics stay anonymous. `events` gets no `user_id`, and there is no achievement analytics event in this feature. | Keeps the metrics protocol and privacy scope unchanged. |
| D12 | Profile is email only: no nickname, avatar or public page. The header shows the email's local part. | Nothing is public without ranking. |
| D13 | Pre-rendered pages (`/`, `/games/[slug]`, `/play/[slug]`) stay `force-static`. Anything that depends on the user loads in the browser from `/api/me*`. | Reading cookies in those pages would make every request dynamic. |
| D14 | Account deletion runs through a `security definer` function that deletes the `auth.users` row; unlocks cascade. Vercel never holds the Supabase service-role/secret key. The user must re-enter their password to delete. | Avoids adding the most powerful Supabase secret to the web runtime. Supabase recommends its admin API; verify the SQL path works in M4 before relying on it. |
| D15 | Passwords: minimum 8 characters, no character-class rules. No CAPTCHA for now; rely on Supabase's email rate limit (30/hour default with custom SMTP). Add Cloudflare Turnstile to sign-up and reset if abuse appears. | Low friction at current traffic. |
| D16 | `/privacy` and `/terms` ship with accounts, and sign-up requires ticking a consent checkbox. This completes TODO item 7. | Collecting accounts and emails requires a privacy policy before launch. |

## Out of scope

Ranking, leaderboards, public profiles, nicknames, social login, cross-round progress, achievement analytics, claiming logged-out unlocks, CAPTCHA, email change flow.

## Architecture

```text
games.moyufuns.com iframe
  └─ postMessage {source:"moyufun-game", version:1, type:"achievement", key}
       ▼
/play/[slug] GamePlayer (client)
  ├─ readGameMessage(): origin + window + shape checks
  ├─ lifecycle: only while a round is in progress (play_id set); dedupe per page load
  ├─ logged out → popup + login hint
  └─ logged in  → POST /api/achievements  (cookie)
                    ├─ Origin check → Supabase getClaims() → user id
                    ├─ consume_event_rate_limit(HMAC "achievement-rate-limit:<user id>")
                    └─ unlock_achievement(user, game, version, key)  [moyufun_web]

/signup /login /forgot-password /reset-password   Server Actions → Supabase Auth
/auth/confirm                                      route handler → verifyOtp → redirect
/me                                                server component → get_user_achievements
Header / detail page                               client fetch /api/me, /api/me/achievements
```

### Session handling

- `src/lib/auth.ts` (server-only) creates the Supabase server client with `createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll, setAll } })`. `setAll` forces `httpOnly: true`, `sameSite: "lax"`, `secure` in production, and no `domain`. It exports `getCurrentUser(): Promise<{ id: string; email: string } | undefined>`, which uses `auth.getClaims()` (verifies the JWT) and never `getSession()`.
- `src/proxy.ts` is the single Next proxy. It keeps the `/stats` Basic Auth branch unchanged and adds a Supabase session-refresh branch for `/me`, `/login`, `/signup`, `/forgot-password`, `/reset-password` and `/auth/:path*`. Route handlers and Server Actions refresh sessions themselves through `auth.ts`, so `/api/*` is not in the matcher.
- All auth responses and `/api/me*` responses send `Cache-Control: private, no-store`.

### Auth flows (all copy Chinese)

| Route | Behaviour |
| --- | --- |
| `/signup` | Email, password (≥ 8), consent checkbox linking `/privacy` and `/terms`. `signUp({ email, password })`; no `emailRedirectTo`, because the confirmation template builds its link from `{{ .SiteURL }}` (changed in M1: the option was dead weight). Always shows "请查收验证邮件" whether or not the email already exists. |
| `/login` | `signInWithPassword`. Wrong email or password → one generic error. Unconfirmed email → prompt plus a "重新发送验证邮件" action (`auth.resend({ type: "signup" })`). Honours a same-site relative `next` param (reject anything not starting with a single `/`); default `/me`. |
| `/forgot-password` | `resetPasswordForEmail(email)`; the recovery template carries the `/auth/confirm?…&next=/reset-password` link. Always shows the same success message. |
| `/auth/confirm` | GET route handler: validates `type ∈ {email, recovery}` and `next`, calls `verifyOtp({ type, token_hash })`, redirects to `next`; on failure redirects to `/login?error=link`. |
| `/reset-password` | Requires a session (the recovery link created one); `updateUser({ password })`, then redirect `/me`. |
| Log out | Server Action on `/me` and in the header menu: `signOut({ scope: "local" })`, redirect `/`. |

Site origin for email links comes from a server env var `SITE_URL` (`https://www.moyufuns.com` in production, `http://localhost:3000` locally), never from the request `Host` header.

### Supabase Auth configuration

Keep `supabase/config.toml` (local) and the production Dashboard in sync; the repo is the source of truth for values and templates.

- `site_url`: `https://www.moyufuns.com`; `additional_redirect_urls`: `https://www.moyufuns.com/auth/confirm`, `http://localhost:3000/auth/confirm`.
- `[auth.email] enable_confirmations = true`, `secure_password_change = true`; `[auth] minimum_password_length = 8`.
- Templates in `supabase/templates/confirmation.html` and `recovery.html` (Chinese), wired in `config.toml` under `[auth.email.template.confirmation]` / `[auth.email.template.recovery]`, pasted into the Dashboard for production. Link format: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/me` and `…&type=recovery&next=/reset-password`.
- Production SMTP: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key (sending-only permission, stored only in the Supabase Dashboard). Sender `noreply@moyufuns.com`; the domain is verified in Resend with its SPF/DKIM records added in Cloudflare DNS, plus a DMARC record (`p=none` to start). Locally, Supabase's Mailpit (`http://127.0.0.1:54324`) catches mail.
- Resend free tier is 100 emails/day, 3,000/month. Keep Supabase's email rate limit at or below that.
- Local development: `pnpm supabase start`, then `.env.local` sets `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_PUBLISHABLE_KEY` from `supabase status`, `SITE_URL=http://localhost:3000`. `database.ts` requires the pooler username format `moyufun_web.<x>`, so create a local login role once: `create role "moyufun_web.local" login password '…' in role moyufun_web;` and use it in `MOYUFUN_WEB_DATABASE_URL` (port 54322). Auth forms are Server Actions rendered by one client `AuthForm` (`useActionState`); the email input is controlled so React's post-action form reset keeps it after an error.

### Data model (migration `supabase/migrations/20260930120000_add_achievements.sql`)

```sql
achievements (
  id uuid pk default gen_random_uuid(),
  game_id uuid not null references games(id) on delete restrict,
  key text not null check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' and length(key) <= 40),
  name text not null,            -- Chinese, ≤ 20 chars
  description text not null,     -- Chinese, ≤ 60 chars
  symbol text not null,          -- 1–2 characters, drawn like the game cover glyph
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (game_id, key),
  unique (game_id, id)
)

user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null,
  game_id uuid not null,
  game_version_id uuid not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id),
  foreign key (game_id, achievement_id) references achievements(game_id, id),
  foreign key (game_id, game_version_id) references game_versions(game_id, id)
)
```

Achievement colour comes from the game's `cover.accent`; there is no per-achievement colour.

Functions (all `security definer`, `set search_path = pg_catalog, public`, execute revoked from `public, anon, authenticated, moyufun_publisher`, granted to `moyufun_web`):

| Function | Contract |
| --- | --- |
| `unlock_achievement(p_user_id uuid, p_game_id uuid, p_game_version_id uuid, p_key text) returns text` | `'unknown'` if the version does not belong to the game, or no active achievement has that key. Otherwise inserts `on conflict do nothing`; returns `'unlocked'` or `'already_unlocked'`. Any version of the game is accepted (a tab may outlive a version switch). |
| `get_user_achievements(p_user_id uuid, p_game_id uuid default null) returns table (game_id uuid, key text, unlocked_at timestamptz)` | The user's unlocks, optionally for one game, including retired achievements. |
| `delete_user_account(p_user_id uuid) returns void` | `delete from auth.users where id = p_user_id`. Owner must be able to delete from `auth.users` (verify in M4). |

Grants and RLS:
- `achievements`: RLS on. `moyufun_web` gets `select` with a policy limited to active achievements of listed games (same shape as `games_web_select`). `moyufun_publisher` gets `select, insert, update` (no delete).
- `user_achievements`: RLS on, no grants to any app role; reached only through the functions.
- The migration ends with a `do $$ … $$` block asserting these privileges, like `verify_core_database`.
- `supabase/tests/achievements.sql` (wrapped in `begin; … rollback;`) covers: unknown key, inactive key, wrong game/version pair, double unlock, per-game filter, retired unlocks still listed, `delete_user_account` removing the auth user with cascade, and the privilege matrix. Run locally with `docker exec -i supabase_db_MoYuFun psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/achievements.sql` after `pnpm supabase migration up --local`; verified in M2 that the `postgres` owner can delete from `auth.users`.

### Catalog

`src/lib/games.ts`: `Game` gains `achievements: readonly GameAchievement[]` (`key`, `name`, `description`, `symbol`, in `sort_order`), loaded in the same cached `readGames()` call and validated like other catalog fields. It stays under the `game-catalog` tag, so publishing achievements needs the existing revalidate call.

### Game protocol

The game message gains one type:

```js
{ source: "moyufun-game", version: 1, type: "achievement", key: "first_win" }
```

- `readGameMessage` (`src/lib/game-events.ts`) accepts exactly these four keys for `achievement`, with `key` matching the DB key regex. It returns a discriminated value: `{ type: "ready" | "start" | "end" }` or `{ type: "achievement", key }`. The three existing messages keep their exact three-key shape.
- The lifecycle forwards an achievement only while a round is in progress (`play_id` set) and at most once per key per lifecycle instance (one per iframe load; a manual "重新加载" starts a new one, and the API answers `already_unlocked`). Unknown keys (not in the catalog definitions) are dropped by the player without a request.
- **Ordering rule for games:** send any achievements earned at round end **before** `end`, because the site ignores achievements once the round has ended.
- SDK helper added to games: `emitMoYuFunAchievement(key)`, next to `emitMoYuFunEvent`, with the same fixed parent origin.

### HTTP API

| Endpoint | Contract |
| --- | --- |
| `GET /api/me` | `200 { user: { email } \| null }`. |
| `GET /api/me/achievements?game_id=<uuid>` | `401` when logged out; `200 { unlocked: [{ key, unlocked_at }] }`. `game_id` optional. |
| `POST /api/achievements` | JSON body exactly `{ game_id, game_version_id, key }`, ≤ 1 KiB, `Content-Type: application/json`, `Origin` must equal `SITE_URL`'s origin. `400` bad body or unknown key, `401` logged out, `403` bad origin, `429` rate-limited, `200 { status: "unlocked" \| "already_unlocked" }`. Database errors → generic `500`. |

Structure it like the events endpoint: a pure request module `src/lib/achievement-request.ts` (parsing, status mapping; dependencies injected, unit-testable) and a server-only `src/lib/achievements.ts` (rate limit + DB calls). The rate limit reuses `consume_event_rate_limit` through the shared `consumeRateLimit(bucket)` in `events.ts` with bucket `"achievement-rate-limit:" + user_id`, i.e. 120 per minute per user. A wrong `Content-Type` is a `400`.

### UI

- **Header** (`site-header.tsx`): client island `AccountMenu` fetching `/api/me`: "登录" link when logged out; email local part linking to `/me` when logged in.
- **Play page**: `GamePlayer` receives the game's achievement definitions as props. Unlock popup inside the player container (so it shows in fullscreen), top-right, ~4 s, queued if several arrive together. Logged out: same popup plus "登录后可保存成就" linking `/login?next=/play/<slug>`. The player fetches `/api/me` once on mount to know which case applies.
- **Detail page**: static "成就" section listing the game's achievements from the catalog; a client component marks unlocked ones via `/api/me/achievements?game_id=`. Logged out: a single "登录后记录成就" line. Omit the section when the game has no achievements.
- **`/me`**: dynamic server page; redirect to `/login?next=/me` when logged out. Shows email, achievements grouped by listed game with `unlocked / total` (active achievements only; retired unlocks still listed), log-out, and a "删除账号" section requiring the current password.
- **Footer**: links to `/privacy` and `/terms`.

### 乱刃 v3 achievements

New immutable version `games/slash/v3/` (copy of v2 plus achievements). Seeded by migration `<ts>_publish_slash_v3.sql` that inserts the version, the achievements, and switches `current_version_id` (same pattern as `publish_slash_v2`).

| key | name | Rule (single round) | symbol |
| --- | --- | --- | --- |
| `first_blood` | 初见血 | Player gets a kill. | 血 |
| `first_win` | 首胜 | Player wins the round. | 胜 |
| `flawless` | 无伤 | Player wins with 0 deaths. | 完 |
| `rampage` | 连斩 | Player gets 5 kills without dying in between. | 连 |
| `swift` | 速战 | Player wins with `gameT` < 120 s. | 速 |
| `ranged` | 远斩 | Player wins with loadout exactly 剑气 + 穿刺. | 远 |

Each unlock is emitted at most once per round. Win-time achievements are emitted in `kill()` before `emitMoYuFunEvent('end')`. `test_headless.js` for v3 asserts the emitted messages and their order.

## Environment variables

Add to `.env.example` and Vercel (server-only):

| Var | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` (local: `http://127.0.0.1:54321`) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` from the project's API keys |
| `SITE_URL` | `https://www.moyufuns.com` (local: `http://localhost:3000`) |

The Resend API key lives only in the Supabase Dashboard SMTP settings.

## Milestones

Each milestone ends with `pnpm test`, `pnpm lint`, `pnpm build --webpack` passing on Node 24, and is shippable alone.

**M1 · Accounts.**
Add `@supabase/ssr` and `@supabase/supabase-js`; `auth.ts`; proxy branch; the auth routes and log-out; `/api/me`; header `AccountMenu`; `/privacy`, `/terms` and footer links; config.toml auth settings and email templates; env vars.
Done when: locally, sign-up → Mailpit link → `/me`, log-out, log-in, forgot → reset → log-in with the new password, and unconfirmed-login resend all work; auth cookies are `HttpOnly` and host-only; `/stats` Basic Auth tests still pass; unit tests cover `next` param validation and proxy routing. Privacy and terms copy reviewed by the owner before production.

**M2 · Achievement data.**
Migration, functions, grants and assertions; `supabase/tests/achievements.sql`; `games.ts` achievements field.
Done when: the SQL test passes on a migrated local database, `db lint` is clean, and the catalog returns `achievements: []` for 乱刃.

**M3 · Unlock path.**
Protocol change in `game-events.ts`; `achievement-request.ts`, `achievements.ts`, `POST /api/achievements`; player forwarding, dedupe and popup. Also done here: the `games/slash/v3/` game changes and headless test from M5, so the protocol had a real producer. End-to-end was verified with a throwaway local fixture game (not committed): a static game that posts `ready` immediately races hydration on the static play page, so the fixture delayed `ready` by 1.5 s.
Done when: unit tests cover message validation (four-key shape, bad keys, old messages unchanged), in-round-only forwarding, per-page dedupe, and every API status code; a local fixture game or v3 draft unlocks an achievement end-to-end.

**M4 · Surfaces.**
`/me` achievements and deletion; detail-page section; `/api/me/achievements`.
Done when: deletion is verified on a local database (auth user and unlocks gone, session cleared); logged-in and logged-out states render correctly on detail, play and `/me`.

**M5 · 乱刃 v3.**
Game changes, headless test, publish migration, R2 upload, production Supabase Auth config and Resend DNS, Vercel env vars, deploy, revalidate.
Done when: in production a new account can verify its email, reset its password, earn all six achievements, and see them on `/me` and the detail page; v2 remains in R2 for rollback.

**M6 · Docs.**
Convert this file into the feature's dev doc (see the `design-doc` skill); update `DEV.md` (code map, env vars, deploy notes), `supabase/README.md` (migrations, functions, privilege checks, auth config), `README.md` checks, and tick TODO item 7.

## Open items

- Create the Resend account, verify `moyufuns.com`, and add its DNS records in Cloudflare — owner, before M5.
- Review the `/privacy` and `/terms` copy drafted in M1 — owner, before M5 goes to production.
